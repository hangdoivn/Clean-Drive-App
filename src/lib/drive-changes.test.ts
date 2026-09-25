import { describe, expect, it } from 'vitest';
import { applyDriveChanges } from './drive-changes';
import type { DriveFile } from '../types';

const base: DriveFile = {
  id: 'a',
  name: 'A.mov',
  mimeType: 'video/quicktime',
  size: '100',
  ownedByMe: true,
  capabilities: { canTrash: true },
};

describe('applyDriveChanges', () => {
  it('updates one file without dropping unrelated metadata', () => {
    const result = applyDriveChanges(
      [base, { ...base, id: 'b', name: 'B.mov' }],
      [{ fileId: 'a', file: { ...base, name: 'A-renamed.mov', modifiedTime: '2026-09-25T10:00:00.000Z' } }],
    );

    expect(result.applied).toBe(1);
    expect(result.files).toHaveLength(2);
    expect(result.files.find((file) => file.id === 'a')?.name).toBe('A-renamed.mov');
    expect(result.files.find((file) => file.id === 'b')?.name).toBe('B.mov');
  });

  it('adds newly created files', () => {
    const result = applyDriveChanges(
      [base],
      [{ fileId: 'b', file: { ...base, id: 'b', name: 'B.mov' } }],
    );

    expect(result.applied).toBe(1);
    expect(result.files.map((file) => file.id)).toEqual(['a', 'b']);
  });

  it('removes files marked removed by Changes API', () => {
    const result = applyDriveChanges(
      [base, { ...base, id: 'b' }],
      [{ fileId: 'a', removed: true }],
    );

    expect(result.applied).toBe(1);
    expect(result.files.map((file) => file.id)).toEqual(['b']);
  });

  it('removes files that became trashed', () => {
    const result = applyDriveChanges(
      [base],
      [{ fileId: 'a', file: { ...base, trashed: true } }],
    );

    expect(result.applied).toBe(1);
    expect(result.files).toHaveLength(0);
  });

  it('ignores malformed change records instead of corrupting cache', () => {
    const result = applyDriveChanges(
      [base],
      [{}, { fileId: 'ghost' }],
    );

    expect(result.applied).toBe(0);
    expect(result.files).toEqual([base]);
  });

  it('uses the final state when the same file changes multiple times', () => {
    const result = applyDriveChanges(
      [base],
      [
        { fileId: 'a', removed: true },
        { fileId: 'a', file: { ...base, name: 'A-restored.mov' } },
      ],
    );

    expect(result.applied).toBe(2);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe('A-restored.mov');
  });
});
