import { MUSEWARE_DEFAULT_THEME } from './starter';
import type { ColorMap } from '../types/tokens';
import type { Op, ProjectDoc } from '../types/tree';

// Only create a new system on the untouched starting sheet. Custom/imported
// systems, existing screens and explicit earlier token decisions remain intact.
export function canCreateBrandDirection(doc: ProjectDoc): boolean {
  return (
    doc.screens.length === 0 &&
    JSON.stringify(doc.tokens) === JSON.stringify(MUSEWARE_DEFAULT_THEME) &&
    !doc.themeLibrary?.length &&
    !doc.opLog.some((entry) => entry.batch.some((op) => op.op === 'setTokens')) &&
    !doc.rail.some(
      (entry) =>
        entry.role === 'user' &&
        /\b(?:(?:my|our|existing|provided|supplied|imported|custom|attached)\s+(?:own\s+)?design[ -]system|design[ -]system\s+(?:provided|supplied|imported|attached))\b/i.test(
          entry.text,
        ),
    )
  );
}

type RGB = [number, number, number];
const rgb = (hex: string): RGB =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const hex = (color: RGB): string =>
  `#${color
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
const blend = (a: RGB, b: RGB, amount: number): RGB =>
  a.map((v, i) => v * (1 - amount) + b[i] * amount) as RGB;
const black: RGB = [0, 0, 0];
const white: RGB = [255, 255, 255];
function luminance(color: RGB): number {
  const [r, g, b] = color.map((v) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
export function contrastRatio(a: string, b: string): number {
  const [low, high] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}
function inkOn(color: string): string {
  const light = hex(white);
  const dark = hex(black);
  return contrastRatio(light, color) >= contrastRatio(dark, color) ? light : dark;
}
function brandInk(brand: RGB, backgrounds: string[], toward: RGB): string {
  for (let i = 0; i <= 100; i += 1) {
    const candidate = hex(blend(brand, toward, i / 100));
    if (backgrounds.every((bg) => contrastRatio(candidate, bg) >= 4.5)) return candidate;
  }
  return hex(toward);
}

/** The danger button shares on-accent ink with primary buttons, while the
 * same danger colour is used as status text. Keep both usages legible by
 * adjusting only this new project's danger pair as little as possible. */
function dangerPair(dark: boolean, onAccent: string): { bg: string; text: string } {
  const colors = MUSEWARE_DEFAULT_THEME.openuiTheme[dark ? 'dark_colors' : 'light_colors'];
  const originalBg = rgb(colors.openui_danger_bg);
  const originalText = rgb(colors.openui_danger_text);
  const ink = rgb(onAccent);
  const inkIsDark = luminance(ink) < 0.5;
  const bgTarget = inkIsDark ? white : black;
  const textTarget = inkIsDark ? white : black;
  for (let b = 0; b <= 100; b += 1) {
    const bg = hex(blend(originalBg, bgTarget, b / 100));
    for (let t = 0; t <= 100; t += 1) {
      const text = hex(blend(originalText, textTarget, t / 100));
      if (contrastRatio(onAccent, text) >= 4.5 && contrastRatio(text, bg) >= 4.5)
        return { bg, text };
    }
  }
  // Black or white always has adequate contrast against mid-grey, and the
  // opposite extreme provides the matching status background.
  return { bg: hex(bgTarget), text: hex([117, 117, 117]) };
}

/** New-project colour roles only; unrelated fields remain intact. */
export function directionColors(
  brandHex: string,
  secondaryHex: string,
  dark: boolean,
): ColorMap {
  const brand = rgb(brandHex);
  const base = dark ? black : white;
  const surface = (amount: number) => hex(blend(base, brand, amount));
  const bg = surface(dark ? 0.045 : 0.035);
  const fg = surface(dark ? 0.075 : 0.015);
  const elevated = surface(dark ? 0.11 : 0.01);
  const sunk = surface(dark ? 0.08 : 0.07);
  const subtle = surface(dark ? 0.2 : 0.13);
  const ink = dark ? white : black;
  const textBrand = brandInk(brand, [bg, fg, elevated, sunk, subtle], ink);
  const onAccent = inkOn(brandHex);
  const danger = dangerPair(dark, onAccent);
  return {
    openui_bg: bg,
    openui_fg: fg,
    openui_sunk: sunk,
    openui_elevated: elevated,
    openui_highlight: surface(dark ? 0.16 : 0.09),
    openui_accent: brandHex,
    openui_accent_pressed: hex(blend(brand, onAccent === hex(black) ? white : black, 0.16)),
    openui_accent_subtle: subtle,
    openui_text_on_accent: onAccent,
    openui_secondary: secondaryHex,
    openui_text_on_secondary: inkOn(secondaryHex),
    openui_text_primary: hex(blend(ink, brand, dark ? 0.06 : 0.12)),
    openui_text_secondary: hex(blend(ink, brand, dark ? 0.28 : 0.36)),
    openui_text_tertiary: hex(blend(ink, brand, dark ? 0.38 : 0.45)),
    openui_text_brand: textBrand,
    openui_border_default: surface(dark ? 0.3 : 0.2),
    openui_border_interactive: textBrand,
    openui_border_accent: textBrand,
    openui_danger_bg: danger.bg,
    openui_danger_text: danger.text,
  };
}

/** Two ops in one atomic undo group: shared setTokens derives five fields after
 * merging, so explicit maps must be applied in a second op. */
export function brandDirectionOps(brand: string, secondary: string): Op[] {
  return [
    { op: 'setTokens', patch: { brand_color: brand, secondary_color: secondary } },
    {
      op: 'setTokens',
      patch: {
        light_colors: directionColors(brand, secondary, false),
        dark_colors: directionColors(brand, secondary, true),
      },
    },
  ];
}

/** Exact brand colours may blend into a surface. Report rather than silently
 * replacing the user's colour or pretending every combination is accessible. */
export function brandContrastWarning(doc: ProjectDoc): string | null {
  const modes = (['light_colors', 'dark_colors'] as const).filter((mode) => {
    const c = doc.tokens.openuiTheme[mode];
    const pairs = [
      [c.openui_accent, c.openui_bg, 3],
      [c.openui_accent, c.openui_elevated, 3],
      [c.openui_text_on_accent, c.openui_accent, 4.5],
      [c.openui_text_on_accent, c.openui_accent_pressed, 4.5],
      // Gradient heroes share this foreground across both end colours.
      [c.openui_text_on_accent, c.openui_secondary, 4.5],
      [c.openui_text_on_accent, c.openui_danger_text, 4.5],
      [c.openui_text_on_secondary, c.openui_secondary, 4.5],
    ] as Array<[string | undefined, string | undefined, number]>;
    return pairs.some(
      ([a, b, min]) =>
        !a ||
        !b ||
        !/^#[0-9a-f]{6}$/i.test(a) ||
        !/^#[0-9a-f]{6}$/i.test(b) ||
        contrastRatio(a, b) < min,
    );
  });
  return modes.length
    ? `Contrast needs review in ${modes.map((mode) => (mode === 'light_colors' ? 'light' : 'dark')).join(' and ')} mode: some controls may blend into their surface or have hard-to-read text. The chosen brand colour was kept.`
    : null;
}
