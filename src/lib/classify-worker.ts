import { classifyFiles } from './classify';
import type { ClassifiedFile, CleanupRules, DriveFile } from '../types';

type WorkerResponse = {
  id: number;
  result?: ClassifiedFile[];
  error?: string;
};

let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, {
  resolve: (files: ClassifiedFile[]) => void;
  reject: (error: Error) => void;
}>();

function ensureWorker(): Worker | undefined {
  if (typeof Worker === 'undefined') return undefined;
  if (worker) return worker;

  try {
    worker = new Worker(new URL('../workers/classify.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      if (event.data.error) task.reject(new Error(event.data.error));
      else task.resolve(event.data.result ?? []);
    };
    worker.onerror = () => {
      for (const task of pending.values()) task.reject(new Error('Classification worker bị lỗi.'));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
    return worker;
  } catch {
    worker = undefined;
    return undefined;
  }
}

export async function classifyFilesAsync(
  files: DriveFile[],
  rules: CleanupRules,
  duplicateKeeperOverrides: Record<string, string>,
): Promise<ClassifiedFile[]> {
  const activeWorker = ensureWorker();
  if (!activeWorker) return classifyFiles(files, rules, duplicateKeeperOverrides);

  const id = ++sequence;
  try {
    return await new Promise<ClassifiedFile[]>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      activeWorker.postMessage({ id, files, rules, duplicateKeeperOverrides });
    });
  } catch {
    return classifyFiles(files, rules, duplicateKeeperOverrides);
  }
}
