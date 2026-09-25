import type { DriveFile, DriveSnapshot, StorageQuota } from '../types';

const READ_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/drive';
const API_ROOT = 'https://www.googleapis.com/drive/v3';

type TokenResponse = {
  access_token?: string;
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

function getClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) throw new Error('Chưa cấu hình VITE_GOOGLE_CLIENT_ID.');
  return clientId;
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
        resolve(response.access_token);
      },
    });
    client.requestAccessToken({ prompt: 'consent' });
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

export async function scanGoogleDrive(onProgress: (filesFound: number) => void): Promise<DriveSnapshot> {
  const token = await requestAccessToken(READ_SCOPE);
  const aboutFields = 'storageQuota(limit,usage,usageInDrive,usageInDriveTrash),user(displayName,emailAddress)';
  const fileFields = [
    'id', 'name', 'mimeType', 'size', 'quotaBytesUsed', 'md5Checksum',
    'createdTime', 'modifiedTime', 'viewedByMeTime', 'parents', 'ownedByMe',
    'starred', 'trashed', 'capabilities/canTrash', 'webViewLink',
  ].join(',');

  const aboutPromise = driveFetch<{
    storageQuota?: StorageQuota;
    user?: { displayName?: string; emailAddress?: string };
  }>(`/about?fields=${encodeURIComponent(aboutFields)}`, token);

  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  let incompleteSearch = false;

  do {
    const params = new URLSearchParams({
      q: 'trashed=false',
      spaces: 'drive',
      corpora: 'user',
      pageSize: '1000',
      fields: `nextPageToken,incompleteSearch,files(${fileFields})`,
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

  const about = await aboutPromise;
  return {
    files,
    quota: about.storageQuota ?? {},
    displayName: about.user?.displayName,
    email: about.user?.emailAddress,
    incompleteSearch,
  };
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

export async function moveFilesToTrash(
  files: DriveFile[],
  onProgress: (completed: number) => void,
): Promise<{ succeeded: string[]; failed: { id: string; message: string }[] }> {
  const token = await requestAccessToken(WRITE_SCOPE);
  const succeeded: string[] = [];
  const failed: { id: string; message: string }[] = [];

  for (const file of files) {
    try {
      await withBackoff(() => driveFetch(`/files/${encodeURIComponent(file.id)}?fields=id,trashed`, token, {
        method: 'PATCH',
        body: JSON.stringify({ trashed: true }),
      }));
      succeeded.push(file.id);
    } catch (error) {
      failed.push({ id: file.id, message: error instanceof Error ? error.message : 'Lỗi không xác định' });
    }
    onProgress(succeeded.length + failed.length);
  }

  return { succeeded, failed };
}
