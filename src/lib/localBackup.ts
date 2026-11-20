// Automatic copies of the user's data kept on this device (IndexedDB), so a
// problem with the online database never means starting over.
import { backupCounts, exportBackup, type Backup, type BackupDb } from "@/lib/backup";

const DB_NAME = "xue-backups";
const STORE = "snapshots";
const KEEP = 7;
const EVERY_MS = 20 * 60 * 60 * 1000;

export type Snapshot = { id: string; created_at: string; counts: ReturnType<typeof backupCounts>; backup: Backup };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = work(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export function localBackupAvailable() {
  return typeof indexedDB !== "undefined";
}

/** Newest first. */
export async function listSnapshots(): Promise<Snapshot[]> {
  if (!localBackupAvailable()) return [];
  const all = await run<Snapshot[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function saveSnapshot(backup: Backup): Promise<Snapshot> {
  const snapshot: Snapshot = { id: backup.exported_at, created_at: backup.exported_at, counts: backupCounts(backup), backup };
  await run("readwrite", (store) => store.put(snapshot));
  const old = (await listSnapshots()).slice(KEEP);
  for (const s of old) await run("readwrite", (store) => store.delete(s.id));
  return snapshot;
}

/** Takes a copy if the last one is more than ~a day old. Silent: never blocks the app. */
export async function autoSnapshot(db: BackupDb): Promise<Snapshot | null> {
  try {
    if (!localBackupAvailable()) return null;
    // Ask the browser not to evict our data when space runs low.
    await navigator.storage?.persist?.().catch(() => false);
    const [latest] = await listSnapshots();
    if (latest && Date.now() - new Date(latest.created_at).getTime() < EVERY_MS) return null;
    const backup = await exportBackup(db);
    if (!backup.data.words.length && !backup.data.characters.length && !backup.data.grammar_sections.length) return null;
    return await saveSnapshot(backup);
  } catch {
    return null;
  }
}

export function backupFileName(backup: Backup) {
  return `xue-sauvegarde-${backup.exported_at.slice(0, 16).replace("T", "_").replace(":", "h")}.json`;
}

/**
 * Hands the file to the user. Phones get the share sheet ("Enregistrer dans
 * Fichiers", Drive, mail…); computers get a normal download.
 */
export async function saveBackupFile(backup: Backup) {
  const name = backupFileName(backup);
  const file = new File([JSON.stringify(backup)], name, { type: "application/json" });
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Sauvegarde Xué" });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const LAST_EXPORT_KEY = "backup.lastFileExport";

export function markFileExported() {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  } catch {
    // private mode: only the reminder is lost
  }
}

export function lastFileExport(): Date | null {
  try {
    const value = localStorage.getItem(LAST_EXPORT_KEY);
    return value ? new Date(value) : null;
  } catch {
    return null;
  }
}
