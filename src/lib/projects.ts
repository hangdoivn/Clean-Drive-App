import type { DriveFile, ProjectMetadataInput, ProjectStatus, ProjectStorageEntry } from '../types';

export const PROJECT_PROP = 'hangdoiProject';
export const PROJECT_NAME_PROP = 'hangdoiProjectName';
export const PROJECT_CLIENT_PROP = 'hangdoiClient';
export const PROJECT_STATUS_PROP = 'hangdoiStatus';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function bytesOf(file: DriveFile): bigint {
  return BigInt(file.quotaBytesUsed || file.size || '0');
}

export function readProjectStatus(file: DriveFile): ProjectStatus | undefined {
  const value = file.appProperties?.[PROJECT_STATUS_PROP];
  return value === 'active' || value === 'delivered' || value === 'archive' ? value : undefined;
}

export function isProjectFolder(file: DriveFile): boolean {
  return file.mimeType === FOLDER_MIME && file.appProperties?.[PROJECT_PROP] === '1';
}

export function projectMetadataFromFolder(file: DriveFile) {
  return {
    tagged: isProjectFolder(file),
    name: file.appProperties?.[PROJECT_NAME_PROP] || file.name,
    client: file.appProperties?.[PROJECT_CLIENT_PROP],
    status: readProjectStatus(file),
  };
}

function topKnownFolder(file: DriveFile, byId: Map<string, DriveFile>): DriveFile | undefined {
  let current: DriveFile | undefined = file.mimeType === FOLDER_MIME ? file : undefined;
  let parentId = file.parents?.[0];
  const visited = new Set<string>([file.id]);

  while (parentId && byId.has(parentId) && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (parent.mimeType === FOLDER_MIME) current = parent;
    parentId = parent.parents?.[0];
  }

  return current;
}

export function buildProjectStorage(files: DriveFile[]): {
  projects: ProjectStorageEntry[];
  unclassifiedBytes: bigint;
  unclassifiedCount: number;
} {
  const byId = new Map(files.map((file) => [file.id, file]));
  const aggregates = new Map<string, { bytes: bigint; fileCount: number; folderCount: number }>();
  let unclassifiedBytes = 0n;
  let unclassifiedCount = 0;

  for (const file of files) {
    const top = topKnownFolder(file, byId);
    if (!top) {
      if (file.mimeType !== FOLDER_MIME) {
        unclassifiedBytes += bytesOf(file);
        unclassifiedCount += 1;
      }
      continue;
    }

    const current = aggregates.get(top.id) ?? { bytes: 0n, fileCount: 0, folderCount: 0 };
    if (file.mimeType === FOLDER_MIME) current.folderCount += 1;
    else {
      current.bytes += bytesOf(file);
      current.fileCount += 1;
    }
    aggregates.set(top.id, current);
  }

  const entries: ProjectStorageEntry[] = [];
  for (const [folderId, aggregate] of aggregates.entries()) {
    const folder = byId.get(folderId);
    if (!folder) continue;
    const meta = projectMetadataFromFolder(folder);
    entries.push({
      folder,
      bytes: aggregate.bytes,
      fileCount: aggregate.fileCount,
      folderCount: aggregate.folderCount,
      tagged: meta.tagged,
      name: meta.name,
      client: meta.client,
      status: meta.status,
    });
  }

  entries.sort((a, b) => {
    if (a.tagged !== b.tagged) return a.tagged ? -1 : 1;
    return b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0;
  });

  return { projects: entries, unclassifiedBytes, unclassifiedCount };
}

export function findProjectContext(file: DriveFile, byId: Map<string, DriveFile>) {
  let current: DriveFile | undefined = file;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (isProjectFolder(current)) {
      return {
        folderId: current.id,
        name: current.appProperties?.[PROJECT_NAME_PROP] || current.name,
        client: current.appProperties?.[PROJECT_CLIENT_PROP],
        status: readProjectStatus(current) ?? 'active',
      };
    }
    const parentId: string | undefined = current.parents?.[0];
    current = parentId ? byId.get(parentId) : undefined;
  }

  return undefined;
}

export function projectAppProperties(input: ProjectMetadataInput): Record<string, string> {
  return {
    [PROJECT_PROP]: '1',
    [PROJECT_NAME_PROP]: input.name.trim(),
    [PROJECT_CLIENT_PROP]: input.client.trim(),
    [PROJECT_STATUS_PROP]: input.status,
  };
}
