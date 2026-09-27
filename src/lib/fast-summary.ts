import type { FileKind, StorageQuota } from '../types';

const KEY = 'hangdoi-clean-drive-fast-summary-v1';

export type FastDriveSummary = {
  email: string;
  displayName?: string;
  lastSyncedAt?: string;
  quota: StorageQuota;
  fileCount: number;
  recoverableBytes: string;
  recoverableCount: number;
  activeProjectBytes: string;
  activeProjectCount: number;
  assetFootprint: { kind: FileKind; bytes: string; count: number }[];
};

export function loadFastDriveSummary(): FastDriveSummary | undefined {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as FastDriveSummary;
    if (!parsed?.email || !Array.isArray(parsed.assetFootprint)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function saveFastDriveSummary(summary: FastDriveSummary): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(summary));
  } catch {
    // Optimization only.
  }
}

export function clearFastDriveSummary(): void {
  window.localStorage.removeItem(KEY);
}
