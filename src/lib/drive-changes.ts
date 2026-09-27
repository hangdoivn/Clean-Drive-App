import type { DriveFile } from '../types';

export type DriveChange = {
  fileId?: string;
  removed?: boolean;
  file?: DriveFile;
};

export function applyDriveChangesToMap(
  filesById: Map<string, DriveFile>,
  changes: DriveChange[],
): number {
  let applied = 0;

  for (const change of changes) {
    const id = change.fileId || change.file?.id;
    if (!id) continue;

    if (change.removed || change.file?.trashed) {
      filesById.delete(id);
    } else if (change.file) {
      filesById.set(id, change.file);
    } else {
      continue;
    }

    applied += 1;
  }

  return applied;
}

export function applyDriveChanges(
  currentFiles: DriveFile[],
  changes: DriveChange[],
): { files: DriveFile[]; applied: number } {
  const filesById = new Map(currentFiles.map((file) => [file.id, file]));
  const applied = applyDriveChangesToMap(filesById, changes);
  return { files: [...filesById.values()], applied };
}
