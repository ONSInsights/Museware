/** Existing openui theme_mode values remain untouched until the author chooses. */
export type ProjectAppearance = 'light' | 'dark' | 'auto';
export function projectAppearance(value: unknown): ProjectAppearance {
  if (typeof value !== 'string') return 'auto';
  const mode = value.trim().toLowerCase();
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return 'auto';
}
export function storedAppearance(mode: ProjectAppearance): string {
  return mode === 'auto' ? 'DayNight' : mode === 'light' ? 'Light' : 'Dark';
}
