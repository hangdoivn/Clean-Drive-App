import type { DriveSnapshot } from '../types';

const DB_NAME = 'hangdoi-clean-drive';
const DB_VERSION = 1;
const STORE_NAME = 'drive-snapshots';
const LAST_EMAIL_KEY = 'hangdoi-clean-drive-last-email';

type StoredSnapshot = DriveSnapshot & { email: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'email' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Không mở được metadata cache.'));
  });
}

export async function saveDriveIndex(snapshot: DriveSnapshot): Promise<void> {
  if (!snapshot.email || !window.indexedDB) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(snapshot as StoredSnapshot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Không lưu được metadata cache.'));
    tx.onabort = () => reject(tx.error ?? new Error('Metadata cache bị hủy.'));
  });
  db.close();
  window.localStorage.setItem(LAST_EMAIL_KEY, snapshot.email);
}

export async function loadLastDriveIndex(): Promise<DriveSnapshot | undefined> {
  if (!window.indexedDB) return undefined;
  const email = window.localStorage.getItem(LAST_EMAIL_KEY);
  if (!email) return undefined;

  const db = await openDb();
  const snapshot = await new Promise<DriveSnapshot | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result as DriveSnapshot | undefined);
    request.onerror = () => reject(request.error ?? new Error('Không đọc được metadata cache.'));
  });
  db.close();
  return snapshot;
}
