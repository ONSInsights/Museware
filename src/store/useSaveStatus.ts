import { create } from 'zustand';

export type WriteResult = {
  projectId: string;
  at: number;
  ok: boolean;
  errorName?: string;
  bytes: number;
};
export const SAVE_LOG_KEY = 'museware/save-results';
type SaveState = {
  byProject: Record<string, WriteResult>;
  lastSuccess: Record<string, number>;
  record: (result: WriteResult) => void;
};

export function readWriteResults(): WriteResult[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SAVE_LOG_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row): row is WriteResult =>
          row &&
          typeof row === 'object' &&
          typeof row.projectId === 'string' &&
          typeof row.at === 'number' &&
          typeof row.ok === 'boolean' &&
          typeof row.bytes === 'number',
      )
      .slice(-20);
  } catch {
    return [];
  }
}
export const useSaveStatus = create<SaveState>((set) => ({
  byProject: {},
  lastSuccess: {},
  record: (result) => {
    try {
      localStorage.setItem(
        SAVE_LOG_KEY,
        JSON.stringify([...readWriteResults(), result].slice(-20)),
      );
    } catch {
      /* Diagnostics are best effort; saving the project is independent. */
    }
    set((state) => ({
      byProject: { ...state.byProject, [result.projectId]: result },
      lastSuccess: result.ok
        ? { ...state.lastSuccess, [result.projectId]: result.at }
        : state.lastSuccess,
    }));
  },
}));
export function writeFailureLabel(name?: string): string {
  if (name === 'QuotaExceededError') return 'device storage is full';
  if (name === 'ProjectRemovedError') return 'project was removed';
  return 'device storage error';
}
export function emptyProjectLabel(projectId: string | null): string {
  const failures = readWriteResults().filter(
    (result) => result.projectId === projectId && !result.ok,
  );
  const failure = failures.at(-1);
  if (failure?.errorName === 'QuotaExceededError')
    return 'No content was stored — saves were failing (device storage was full)';
  if (failure?.errorName === 'ProjectRemovedError')
    return 'No content was stored — the project was removed from this device';
  if (failure) return 'No content was stored — saves were failing (device storage error)';
  return 'This project is empty — ask muse to build something.';
}
