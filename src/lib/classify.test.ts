import { describe, expect, it } from 'vitest';
import { classifyFiles, filterByCategory, isCleanupCandidate, totalBytes } from './classify';
import type { DriveFile } from '../types';

const base: DriveFile = {
  id: 'a',
  name: 'a.zip',
  mimeType: 'application/zip',
  size: '600000000',
  quotaBytesUsed: '600000000',
  md5Checksum: 'same',
  createdTime: '2019-01-01T00:00:00.000Z',
  modifiedTime: '2020-01-01T00:00:00.000Z',
  ownedByMe: true,
  capabilities: { canTrash: true },
};

describe('classifyFiles', () => {
  it('marks large exact duplicate binary files', () => {
    const files = classifyFiles([base, { ...base, id: 'b', name: 'b.zip' }]);
    expect(files[0].categories).toEqual(expect.arrayContaining(['large', 'duplicate', 'old']));
    expect(files[0].duplicateCount).toBe(2);
  });

  it('keeps exactly one file protected from cleanup in every duplicate group', () => {
    const files = classifyFiles([
      base,
      { ...base, id: 'b', name: 'b.zip', modifiedTime: '2021-01-01T00:00:00.000Z' },
      { ...base, id: 'c', name: 'c.zip', modifiedTime: '2022-01-01T00:00:00.000Z' },
    ]);
    expect(files.filter((file) => file.duplicateRole === 'keep')).toHaveLength(1);
    expect(files.filter(isCleanupCandidate)).toHaveLength(2);
    expect(files.find((file) => file.id === 'c')?.duplicateRole).toBe('keep');
  });

  it('prefers a protected duplicate as the keeper', () => {
    const files = classifyFiles([
      base,
      { ...base, id: 'b', starred: true, modifiedTime: '2018-01-01T00:00:00.000Z' },
    ]);
    expect(files.find((file) => file.id === 'b')?.duplicateRole).toBe('keep');
    expect(files.find((file) => file.id === 'a')?.duplicateRole).toBe('remove');
  });

  it('does not call native Google files exact duplicates without a checksum', () => {
    const nativeFiles: DriveFile[] = [
      { ...base, id: 'doc-1', mimeType: 'application/vnd.google-apps.document', md5Checksum: undefined },
      { ...base, id: 'doc-2', mimeType: 'application/vnd.google-apps.document', md5Checksum: undefined },
    ];
    expect(filterByCategory(classifyFiles(nativeFiles), 'duplicate')).toHaveLength(0);
  });

  it('protects starred and unowned files', () => {
    const [starred, unowned] = classifyFiles([
      { ...base, starred: true },
      { ...base, id: 'b', ownedByMe: false },
    ]);
    expect(starred.protectedReason).toBe('Đã gắn dấu sao');
    expect(unowned.protectedReason).toBe('Không thuộc sở hữu của bạn');
  });

  it('uses the latest view/modify activity when deciding if a file is old', () => {
    const recentView = new Date().toISOString();
    const [file] = classifyFiles([{ ...base, viewedByMeTime: recentView }]);
    expect(file.categories).not.toContain('old');
  });

  it('sums int64 byte values using bigint', () => {
    const files = classifyFiles([base, { ...base, id: 'b' }]);
    expect(totalBytes(files)).toBe(1_200_000_000n);
  });
});
