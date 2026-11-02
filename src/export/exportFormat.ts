import type { AssetCensus } from './assets';
export type ExportFormat = 'single' | 'folder' | 'react';
const STORAGE_KEY = 'museware/exportFormat';
const transient = new Map<number, ExportFormat>();
export const isExportFormat = (value: unknown): value is ExportFormat =>
  value === 'single' || value === 'folder' || value === 'react';
/** The folder exists to carry embedded weight; links don't weigh anything. */
export function recommendedFormat(census: AssetCensus): ExportFormat {
  return census.embeddedBytes > 256 * 1024 ? 'folder' : 'single';
}
export function loadExportFormat(
  projectId: string | null,
  epoch: number,
): ExportFormat | null {
  if (!projectId) return transient.get(epoch) || null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<
      string,
      unknown
    >;
    return isExportFormat(saved[projectId]) ? saved[projectId] : null;
  } catch {
    return null;
  }
}
export function saveExportFormat(
  projectId: string | null,
  epoch: number,
  value: ExportFormat,
): void {
  if (!projectId) {
    transient.set(epoch, value);
    return;
  }
  try {
    let saved: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        saved = parsed as Record<string, unknown>;
    } catch {
      /* Replace malformed data. */
    }
    saved[projectId] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    /* The choice still works when storage is unavailable. */
  }
}
export function downloadDisabled(
  value: ExportFormat | null,
  blocked: boolean,
  noScreens: boolean,
  busy: boolean,
): boolean {
  return !value || blocked || noScreens || busy;
}
export function downloadLabel(value: ExportFormat | null): string {
  if (value === 'single') return 'Download index.html — a whole website in one file';
  if (value === 'folder') return 'Download site folder (.zip)';
  if (value === 'react') return 'Download React project (.zip)';
  return 'Download';
}
