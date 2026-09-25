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

  const duplicateIds = new Map<string, number>();
  for (const bucket of duplicateBuckets.values()) {
    if (bucket.length > 1) {
      for (const file of bucket) duplicateIds.set(file.id, bucket.length);
    }
  }

  const oldThreshold = Date.now() - OLD_FILE_DAYS * 24 * 60 * 60 * 1000;

  return files.map((file) => {
    const categories: ClassifiedFile['categories'] = [];
    const bytes = fileBytes(file);

    if (bytes >= LARGE_FILE_BYTES && file.mimeType !== FOLDER_MIME) categories.push('large');
    if (duplicateIds.has(file.id)) categories.push('duplicate');
    if (file.modifiedTime && new Date(file.modifiedTime).getTime() < oldThreshold) categories.push('old');
    if (file.mimeType === FOLDER_MIME && !childCountByFolder.has(file.id)) categories.push('empty');

    return {
      ...file,
      bytes,
      categories,
      protectedReason: getProtectedReason(file),
      duplicateCount: duplicateIds.get(file.id),
    };
  });
}

export function filterByCategory(files: ClassifiedFile[], category: CategoryId): ClassifiedFile[] {
  if (category === 'overview') return files.filter((file) => file.categories.length > 0);
  return files.filter((file) => file.categories.includes(category));
}

export function totalBytes(files: ClassifiedFile[]): bigint {
  return files.reduce((sum, file) => sum + file.bytes, 0n);
}
