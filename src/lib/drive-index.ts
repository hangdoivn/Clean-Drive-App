import type { DriveFile, DriveSnapshot } from '../types';

const DB_NAME = 'hangdoi-clean-drive';
const DB_VERSION = 2;
const LEGACY_STORE_NAME = 'drive-snapshots';
const META_STORE_NAME = 'drive-meta';
const FILE_STORE_NAME = 'drive-files';
const EMAIL_INDEX = 'email';
const LAST_EMAIL_KEY = 'hangdoi-clean-drive-last-email';
const LEGACY_MOCK_EMAIL = 'ban@example.com';

type StoredSnapshot = DriveSnapshot & { email: string };
type StoredMeta = Omit<DriveSnapshot, 'files'> & { email: string };
type StoredFile = { key: string; email: string; file: DriveFile };

function fileKey(email: string, id: string): string {
  return `${email}:${id}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Metadata cache phản hồi quá chậm.'));
    }, 1200);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      fn();
    };

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
        db.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'email' });
      }
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME, { keyPath: 'email' });
      }
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        const store = db.createObjectStore(FILE_STORE_NAME, { keyPath: 'key' });
        store.createIndex(EMAIL_INDEX, EMAIL_INDEX, { unique: false });
      }
    };
    request.onsuccess = () => finish(() => resolve(request.result));
    request.onerror = () => finish(() => reject(request.error ?? new Error('Không mở được metadata cache.')));
    request.onblocked = () => finish(() => reject(new Error('Metadata cache đang bị tab khác khóa.')));
  });
}

function snapshotMeta(snapshot: DriveSnapshot & { email: string }): StoredMeta {
  const { files: _files, ...meta } = snapshot;
  return meta;
}

function transactionDone(tx: IDBTransaction, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(message));
    tx.onabort = () => reject(tx.error ?? new Error(message));
  });
}

export async function saveDriveIndex(snapshot: DriveSnapshot): Promise<void> {
  if (!snapshot.email || !window.indexedDB) return;
  const email = snapshot.email;
  const db = await openDb();
  const tx = db.transaction([META_STORE_NAME, FILE_STORE_NAME], 'readwrite');
  const metaStore = tx.objectStore(META_STORE_NAME);
  const fileStore = tx.objectStore(FILE_STORE_NAME);

  metaStore.put(snapshotMeta(snapshot as DriveSnapshot & { email: string }));

  const keysRequest = fileStore.index(EMAIL_INDEX).getAllKeys(email);
  keysRequest.onsuccess = () => {
    for (const key of keysRequest.result) fileStore.delete(key);
    for (const file of snapshot.files) {
      const stored: StoredFile = { key: fileKey(email, file.id), email, file };
      fileStore.put(stored);
    }
  };

  await transactionDone(tx, 'Không lưu được metadata index.');
  db.close();
  window.localStorage.setItem(LAST_EMAIL_KEY, email);
}

export async function patchDriveIndex(
  snapshot: DriveSnapshot,
  upsertFiles: DriveFile[],
  removedIds: string[],
): Promise<void> {
  if (!snapshot.email || !window.indexedDB) return;
  const email = snapshot.email;
  const db = await openDb();
  const tx = db.transaction([META_STORE_NAME, FILE_STORE_NAME], 'readwrite');
  const metaStore = tx.objectStore(META_STORE_NAME);
  const fileStore = tx.objectStore(FILE_STORE_NAME);

  metaStore.put(snapshotMeta(snapshot as DriveSnapshot & { email: string }));
  for (const id of removedIds) fileStore.delete(fileKey(email, id));
  for (const file of upsertFiles) {
    fileStore.put({ key: fileKey(email, file.id), email, file } satisfies StoredFile);
  }

  await transactionDone(tx, 'Không cập nhật được metadata index.');
  db.close();
  window.localStorage.setItem(LAST_EMAIL_KEY, email);
}

async function loadV2Snapshot(db: IDBDatabase, email: string): Promise<DriveSnapshot | undefined> {
  const meta = await new Promise<StoredMeta | undefined>((resolve, reject) => {
    const tx = db.transaction(META_STORE_NAME, 'readonly');
    const request = tx.objectStore(META_STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result as StoredMeta | undefined);
    request.onerror = () => reject(request.error ?? new Error('Không đọc được metadata index.'));
  });
  if (!meta) return undefined;

  const files = await new Promise<StoredFile[]>((resolve, reject) => {
    const tx = db.transaction(FILE_STORE_NAME, 'readonly');
    const request = tx.objectStore(FILE_STORE_NAME).index(EMAIL_INDEX).getAll(email);
    request.onsuccess = () => resolve((request.result ?? []) as StoredFile[]);
    request.onerror = () => reject(request.error ?? new Error('Không đọc được file index.'));
  });

  return { ...meta, files: files.map((item) => item.file) };
}

async function loadLegacySnapshot(db: IDBDatabase, email: string): Promise<DriveSnapshot | undefined> {
  if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) return undefined;
  return new Promise<DriveSnapshot | undefined>((resolve, reject) => {
    const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
    const request = tx.objectStore(LEGACY_STORE_NAME).get(email);
    request.onsuccess = () => resolve(request.result as DriveSnapshot | undefined);
    request.onerror = () => reject(request.error ?? new Error('Không đọc được metadata cache cũ.'));
  });
}

export async function loadLastDriveIndex(): Promise<DriveSnapshot | undefined> {
  if (!window.indexedDB) return undefined;
  const email = window.localStorage.getItem(LAST_EMAIL_KEY);
  if (!email) return undefined;

  if (email === LEGACY_MOCK_EMAIL) {
    window.localStorage.removeItem(LAST_EMAIL_KEY);
    return undefined;
  }

  const db = await openDb();
  const v2 = await loadV2Snapshot(db, email);
  if (v2) {
    db.close();
    return v2;
  }

  const legacy = await loadLegacySnapshot(db, email);
  db.close();

  if (legacy?.email === LEGACY_MOCK_EMAIL) {
    window.localStorage.removeItem(LAST_EMAIL_KEY);
    return undefined;
  }

  if (legacy?.email) {
    saveDriveIndex(legacy).catch(() => undefined);
    return legacy;
  }

  return undefined;
}

export async function clearDriveIndex(): Promise<void> {
  window.localStorage.removeItem(LAST_EMAIL_KEY);
  if (!window.indexedDB) return;

  await new Promise<void>((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Không xóa được metadata cache.'));
    request.onblocked = () => reject(new Error('Metadata cache đang được tab khác sử dụng.'));
  });
}
