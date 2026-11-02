import { PRESETS } from './presets';
import { MUSEWARE_DEFAULT_THEME } from './starter';
import type { OpenUiTheme } from '../types/tokens';
import type { ProjectDoc } from '../types/tree';
import { clone } from '../ops/treeUtils';

export const BUILTIN_THEMES = [
  { id: 'default', name: 'MUSEWARE DEFAULT', theme: MUSEWARE_DEFAULT_THEME.openuiTheme },
  ...PRESETS.map((p) => ({ id: p.id, name: p.name, theme: p.tokens.openuiTheme })),
];

/** Identity deliberately uses the three palette fields specified by the handoff. */
export function samePalette(a: OpenUiTheme, b: OpenUiTheme): boolean {
  const norm = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '');
  return (
    norm(a.brand_color) === norm(b.brand_color) &&
    norm(a.secondary_color) === norm(b.secondary_color) &&
    norm(a.light_colors?.openui_bg) === norm(b.light_colors?.openui_bg)
  );
}

/** One project-owned slot, updated only for an unmatched custom look. */
export function seedProjectTheme(doc: ProjectDoc): ProjectDoc {
  const theme = doc.tokens.openuiTheme;
  const library = doc.themeLibrary || [];
  if (
    BUILTIN_THEMES.some((p) => samePalette(theme, p.theme)) ||
    library.some((p) => samePalette(theme, p.theme))
  )
    return doc;
  return {
    ...doc,
    themeLibrary: [
      { name: doc.name, theme: clone(theme), updatedAt: Date.now() },
      ...library.slice(1),
    ],
    updatedAt: Date.now(),
  };
}
