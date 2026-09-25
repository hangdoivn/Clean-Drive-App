import type { ActivityLogEntry } from '../types';

const KEY = 'hangdoi-clean-drive-activity-v1';
const MAX_ENTRIES = 200;

export function loadActivityLog(): ActivityLogEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityLogEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function appendActivityLog(
  entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>,
): ActivityLogEntry[] {
  const current = loadActivityLog();
  const nextEntry: ActivityLogEntry = {
    ...entry,
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [nextEntry, ...current].slice(0, MAX_ENTRIES);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
