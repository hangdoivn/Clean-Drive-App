import type { CategoryId, ClassifiedFile, DriveFile } from '../types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const LARGE_FILE_BYTES = 500_000_000n;
const OLD_FILE_DAYS = 365 * 2;

function fileBytes(file: DriveFile): bigint {
  return BigInt(file.quotaBytesUsed || file.size || '0');
}

function getProtectedReason(file: DriveFile): string | undefined {
  if (!file.ownedByMe) return 'Không thuộc sở hữu của bạn';
  if (!file.capabilities?.canTrash) return 'Không có quyền đưa vào thùng rác';
  if (file.starred) return 'Đã gắn dấu sao';

  const modifiedAt = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
  if (modifiedAt > Date.now() - 30 * 24 * 60 * 60 * 1000) return 'Mới chỉnh sửa gần đây';
  return undefined;
}

function lastActivityAt(file: DriveFile): number {
  const viewed = file.viewedByMeTime ? new Date(file.viewedByMeTime).getTime() : 0;
  const modified = file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0;
  return Math.max(viewed, modified);
}

function chooseDuplicateKeeper(bucket: DriveFile[]): DriveFile {
  return [...bucket].sort((a, b) => {
    const aProtected = Boolean(getProtectedReason(a));
    const bProtected = Boolean(getProtectedReason(b));
    if (aProtected !== bProtected) return aProtected ? -1 : 1;

    const aActivity = lastActivityAt(a);
    const bActivity = lastActivityAt(b);
    if (aActivity !== bActivity) return bActivity - aActivity;

    const aCreated = a.createdTime ? new Date(a.createdTime).getTime() : 0;
    const bCreated = b.createdTime ? new Date(b.createdTime).getTime() : 0;
    if (aCreated !== bCreated) return aCreated - bCreated;

    return a.id.localeCompare(b.id);
  })[0];
}

export function classifyFiles(files: DriveFile[]): ClassifiedFile[] {
  const childCountByFolder = new Map<string, number>();
  const duplicateBuckets = new Map<string, DriveFile[]>();

  for (const file of files) {
    for (const parentId of file.parents ?? []) {
      childCountByFolder.set(parentId, (childCountByFolder.get(parentId) ?? 0) + 1);
    }
    if (file.md5Checksum && file.mimeType !== FOLDER_MIME) {
      const key = `${file.md5Checksum}:${file.size ?? file.quotaBytesUsed ?? '0'}`;
      const bucket = duplicateBuckets.get(key) ?? [];
      bucket.push(file);
      duplicateBuckets.set(key, bucket);
    }
  }

  const duplicateMeta = new Map<string, { count: number; groupId: string; role: 'keep' | 'remove' }>();
  for (const [groupId, bucket] of duplicateBuckets.entries()) {
    if (bucket.length <= 1) continue;
    const keeper = chooseDuplicateKeeper(bucket);
    for (const file of bucket) {
      duplicateMeta.set(file.id, {
        count: bucket.length,
        groupId,
        role: file.id === keeper.id ? 'keep' : 'remove',
      });
    }
  }

  const oldThreshold = Date.now() - OLD_FILE_DAYS * 24 * 60 * 60 * 1000;

  return files.map((file) => {
    const categories: ClassifiedFile['categories'] = [];
    const bytes = fileBytes(file);
    const duplicate = duplicateMeta.get(file.id);

    if (bytes >= LARGE_FILE_BYTES && file.mimeType !== FOLDER_MIME) categories.push('large');
    if (duplicate) categories.push('duplicate');
    if (lastActivityAt(file) > 0 && lastActivityAt(file) < oldThreshold) categories.push('old');
    if (file.mimeType === FOLDER_MIME && !childCountByFolder.has(file.id)) categories.push('empty');

    return {
      ...file,
      bytes,
      categories,
      protectedReason: getProtectedReason(file),
      duplicateCount: duplicate?.count,
      duplicateGroupId: duplicate?.groupId,
      duplicateRole: duplicate?.role,
    };
  });
}

export function isCleanupCandidate(file: ClassifiedFile): boolean {
  if (file.categories.length === 0 || file.protectedReason) return false;
  if (file.duplicateRole === 'keep') return false;
  return true;
}

export function filterByCategory(files: ClassifiedFile[], category: CategoryId): ClassifiedFile[] {
  if (category === 'overview') return files.filter((file) => file.categories.length > 0);
  return files.filter((file) => file.categories.includes(category));
}

export function totalBytes(files: ClassifiedFile[]): bigint {
  return files.reduce((sum, file) => sum + file.bytes, 0n);
}
