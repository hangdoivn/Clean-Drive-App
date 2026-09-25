import type { DriveFile, DrivePermission, DriveSnapshot, StorageQuota } from '../types';

const READ_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/drive';
const API_ROOT = 'https://www.googleapis.com/drive/v3';
const DEFAULT_GOOGLE_CLIENT_ID = '896234921104-0804kgr66honmum9b4n88ujs8njknc51.apps.googleusercontent.com';

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (config?: { prompt?: string; scope?: string }) => void;
};

class DriveApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const consentedScopes = new Set<string>();

function getClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || DEFAULT_GOOGLE_CLIENT_ID;
}

async function waitForGoogleIdentity(): Promise<NonNullable<Window['google']>> {
  const started = Date.now();
  while (!window.google?.accounts?.oauth2) {
    if (Date.now() - started > 8000) throw new Error('Không tải được Google Identity Services.');
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return window.google;
}

export async function requestAccessToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const google = await waitForGoogleIdentity();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Phiên cấp quyền đã hết thời gian. Hãy thử kết nối lại.'));
    }, 60_000);

    const client = google.accounts.oauth2.initTokenClient({
      client_id: getClientId(),
      scope,
      callback: (response) => {
        window.clearTimeout(timeoutId);
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Không nhận được access token.'));
          return;
        }

        const expiresIn = Math.max(60, response.expires_in ?? 3600);
        tokenCache.set(scope, {
          token: response.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
        });
        consentedScopes.add(scope);
        resolve(response.access_token);
      },
    });

    client.requestAccessToken({ prompt: consentedScopes.has(scope) ? '' : 'consent' });
  });
}

async function driveFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    } | null;
    throw new DriveApiError(
      detail?.error?.message || `Google Drive trả về lỗi ${response.status}.`,
      response.status,
      detail?.error?.errors?.[0]?.reason,
    );
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const FILE_FIELDS = [
  'id', 'name', 'mimeType', 'size', 'quotaBytesUsed', 'md5Checksum',
  'createdTime', 'modifiedTime', 'viewedByMeTime', 'parents', 'ownedByMe',
  'starred', 'trashed', 'capabilities/canTrash', 'webViewLink', 'appProperties',
  'owners(displayName,emailAddress)', 'shared',
].join(',');

type DriveAbout = {
  storageQuota?: StorageQuota;
  user?: { displayName?: string; emailAddress?: string };
};

export type DriveSyncResult = {
  snapshot: DriveSnapshot;
  mode: 'full' | 'incremental';
  changesApplied: number;
};

async function getAbout(token: string): Promise<DriveAbout> {
  const aboutFields = 'storageQuota(limit,usage,usageInDrive,usageInDriveTrash),user(displayName,emailAddress)';
  return driveFetch<DriveAbout>(`/about?fields=${encodeURIComponent(aboutFields)}`, token);
}

async function getStartPageToken(token: string): Promise<string> {
  const response = await driveFetch<{ startPageToken: string }>(
    '/changes/startPageToken?supportsAllDrives=true',
    token,
  );
  return response.startPageToken;
}

async function fullScan(
  token: string,
  about: DriveAbout,
  onProgress: (itemsFound: number) => void,
): Promise<DriveSyncResult> {
  const startToken = await getStartPageToken(token);
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  let incompleteSearch = false;

  do {
    const params = new URLSearchParams({
      q: 'trashed=false',
      spaces: 'drive',
      corpora: 'user',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      fields: `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const page = await driveFetch<{
      files?: DriveFile[];
      nextPageToken?: string;
      incompleteSearch?: boolean;
    }>(`/files?${params.toString()}`, token);

    files.push(...(page.files ?? []));
    incompleteSearch ||= Boolean(page.incompleteSearch);
    pageToken = page.nextPageToken;
    onProgress(files.length);
  } while (pageToken);

  return {
    mode: 'full',
    changesApplied: files.length,
    snapshot: {
      files,
      quota: about.storageQuota ?? {},
      displayName: about.user?.displayName,
      email: about.user?.emailAddress,
      incompleteSearch,
      changePageToken: startToken,
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

async function incrementalSync(
  token: string,
  about: DriveAbout,
  cached: DriveSnapshot,
  onProgress: (itemsFound: number) => void,
): Promise<DriveSyncResult> {
  const filesById = new Map(cached.files.map((file) => [file.id, file]));
  let pageToken = cached.changePageToken!;
  let newStartPageToken = pageToken;
  let applied = 0;

  do {
    const params = new URLSearchParams({
      pageToken,
      pageSize: '1000',
      spaces: 'drive',
      includeRemoved: 'true',
      restrictToMyDrive: 'false',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`,
    });

    const page = await driveFetch<{
      nextPageToken?: string;
      newStartPageToken?: string;
      changes?: { fileId?: string; removed?: boolean; file?: DriveFile }[];
    }>(`/changes?${params.toString()}`, token);

    for (const change of page.changes ?? []) {
      const id = change.fileId || change.file?.id;
      if (!id) continue;

      if (change.removed || change.file?.trashed) {
        filesById.delete(id);
      } else if (change.file) {
        filesById.set(id, change.file);
      }
      applied += 1;
    }

    onProgress(applied);
    if (page.newStartPageToken) newStartPageToken = page.newStartPageToken;
    pageToken = page.nextPageToken ?? '';
  } while (pageToken);

  return {
    mode: 'incremental',
    changesApplied: applied,
    snapshot: {
      files: [...filesById.values()],
      quota: about.storageQuota ?? {},
      displayName: about.user?.displayName,
      email: about.user?.emailAddress,
      incompleteSearch: false,
      changePageToken: newStartPageToken,
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

export async function syncGoogleDrive(
  cached: DriveSnapshot | undefined,
  onProgress: (itemsFound: number) => void,
): Promise<DriveSyncResult> {
  const token = await requestAccessToken(READ_SCOPE);
  const about = await getAbout(token);
  const email = about.user?.emailAddress;

  if (cached?.changePageToken && cached.email && email === cached.email) {
    try {
      return await incrementalSync(token, about, cached, onProgress);
    } catch (error) {
      if (!(error instanceof DriveApiError) || ![400, 404, 410].includes(error.status)) throw error;
    }
  }

  return fullScan(token, about, onProgress);
}

export async function scanGoogleDrive(onProgress: (itemsFound: number) => void): Promise<DriveSnapshot> {
  return (await syncGoogleDrive(undefined, onProgress)).snapshot;
}

async function withBackoff<T>(operation: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof DriveApiError) {
        const rateLimited = error.status === 429 || (
          error.status === 403 && ['rateLimitExceeded', 'userRateLimitExceeded'].includes(error.reason ?? '')
        );
        if (!rateLimited && error.status < 500) throw error;
      }
      if (attempt === maxAttempts - 1) break;
      const delay = 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function setTrashState(
  files: DriveFile[],
  trashed: boolean,
  onProgress: (completed: number) => void,
): Promise<{ succeeded: string[]; failed: { id: string; message: string }[] }> {
  const token = await requestAccessToken(WRITE_SCOPE);
  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];

  for (const file of files) {
    try {
      await withBackoff(() => driveFetch(`/files/${encodeURIComponent(file.id)}?fields=id,trashed`, token, {
        method: 'PATCH',
        body: JSON.stringify({ trashed }),
      }));
      succeeded.push(file.id);
    } catch (error) {
      failed.push({ id: file.id, message: error instanceof Error ? error.message : 'Lỗi không xác định' });
    }
    onProgress(succeeded.length + failed.length);
  }

  return { succeeded, failed };
}

export function moveFilesToTrash(
  files: DriveFile[],
  onProgress: (completed: number) => void,
) {
  return setTrashState(files, true, onProgress);
}

export function restoreFilesFromTrash(
  files: DriveFile[],
  onProgress: (completed: number) => void,
) {
  return setTrashState(files, false, onProgress);
}


export async function updateProjectFolderMetadata(
  folderId: string,
  appProperties: Record<string, string>,
): Promise<void> {
  const token = await requestAccessToken(WRITE_SCOPE);
  await withBackoff(() => driveFetch(`/files/${encodeURIComponent(folderId)}?fields=id,appProperties`, token, {
    method: 'PATCH',
    body: JSON.stringify({ appProperties }),
  }));
}


export async function listFilePermissions(fileId: string): Promise<DrivePermission[]> {
  const token = await requestAccessToken(READ_SCOPE);
  const permissions: DrivePermission[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      pageSize: '100',
      supportsAllDrives: 'true',
      fields: 'nextPageToken,permissions(id,type,role,emailAddress,domain,displayName,allowFileDiscovery,deleted)',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const page = await driveFetch<{
      nextPageToken?: string;
      permissions?: DrivePermission[];
    }>(`/files/${encodeURIComponent(fileId)}/permissions?${params.toString()}`, token);

    permissions.push(...(page.permissions ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return permissions;
}

export async function removeFilePermission(fileId: string, permissionId: string): Promise<void> {
  const token = await requestAccessToken(WRITE_SCOPE);
  await withBackoff(() => driveFetch<void>(
    `/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`,
    token,
    { method: 'DELETE' },
  ));
}
