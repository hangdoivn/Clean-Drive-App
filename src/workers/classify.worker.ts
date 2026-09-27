import { classifyFiles } from '../lib/classify';
import type { CleanupRules, DriveFile } from '../types';

type Request = {
  id: number;
  files: DriveFile[];
  rules: CleanupRules;
  duplicateKeeperOverrides: Record<string, string>;
};

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, files, rules, duplicateKeeperOverrides } = event.data;
  try {
    self.postMessage({ id, result: classifyFiles(files, rules, duplicateKeeperOverrides) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Không thể phân loại metadata.',
    });
  }
};
