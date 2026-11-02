import type { DesignTokens } from '../types/tokens';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const v =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const n = Number.parseInt(v.slice(0, 6) || '6d5cff', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const to = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[to(r1, r2), to(g1, g2), to(b1, b2)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

function palette(tokens: DesignTokens): { a: string; b: string; bg: string; ink: string } {
  const light = tokens.openuiTheme.light_colors || {};
  const dark = tokens.openuiTheme.dark_colors || {};
  const a = String(
    dark.openui_accent ||
      light.openui_accent ||
      tokens.openuiTheme.brand_color ||
      '#6D5CFF',
  );
  const b = String(
    dark.openui_secondary ||
      light.openui_secondary ||
      tokens.openuiTheme.secondary_color ||
      '#A855F7',
  );
  const bg = String(dark.openui_elevated || light.openui_elevated || '#ffffff');
  const ink = String(dark.openui_text_tertiary || light.openui_text_tertiary || '#8892a6');
  return { a, b, bg, ink };
}

/**
 * The house placeholder: an inline SVG data-URI from the token palette, so a
 * project with no real asset still looks designed (never a 404).
 */
export function placeholderImage(
  tokens: DesignTokens,
  opts: {
    seed?: string;
    width?: number;
    height?: number;
    variant?: 'hero' | 'card' | 'wide';
  } = {},
): string {
  const { a, b, bg } = palette(tokens);
  const w = opts.width || 960;
  const h = opts.height || 600;
  const seed = opts.seed || 'muse';
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  const variant = opts.variant || 'wide';
  const c1 = mix(a, bg, 0.12);
  const c2 = mix(b, bg, 0.1);
  const c3 = mix(a, b, 0.5);
  const c4 = mix(bg, a, 0.48);
  const family = ['horizon', 'orbital', 'dune', 'pane'][hash % 4];
  const angle = (hash % 35) - 17;
  const focusX = w * (0.35 + (hash % 30) / 100);
  const focusY = h * (0.28 + (hash % 23) / 100);
  const familyArt =
    family === 'orbital'
      ? `<ellipse cx="${focusX}" cy="${focusY}" rx="${w * 0.28}" ry="${h * 0.22}" fill="${c3}" opacity=".38"/><ellipse cx="${focusX}" cy="${focusY}" rx="${w * 0.35}" ry="${h * 0.3}" fill="none" stroke="${bg}" stroke-opacity=".42" stroke-width="2"/>`
      : family === 'dune'
        ? `<path d="M0 ${h * 0.62} Q ${w * 0.35} ${h * 0.26} ${w * 0.65} ${h * 0.61} T ${w} ${h * 0.44} V${h} H0Z" fill="${c3}" opacity=".48"/>`
        : family === 'pane'
          ? `<rect x="${w * 0.12}" y="${h * 0.12}" width="${w * 0.38}" height="${h * 0.7}" rx="${Math.min(w, h) * 0.08}" fill="${c3}" opacity=".3"/><rect x="${w * 0.52}" y="${h * 0.2}" width="${w * 0.32}" height="${h * 0.58}" rx="${Math.min(w, h) * 0.08}" fill="${bg}" opacity=".13"/>`
          : `<circle cx="${focusX}" cy="${focusY}" r="${Math.min(w, h) * 0.24}" fill="${c3}" opacity=".36"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" data-family="${family}" data-variant="${variant}">
  <defs>
    <linearGradient id="mesh" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="35%" stop-color="${c4}"/><stop offset="68%" stop-color="${c3}"/><stop offset="100%" stop-color="${c2}"/></linearGradient>
    <radialGradient id="light"><stop offset="0%" stop-color="${bg}" stop-opacity=".55"/><stop offset="100%" stop-color="${bg}" stop-opacity="0"/></radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" seed="${hash % 97}" stitchTiles="stitch"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#mesh)"/>
  <ellipse cx="${focusX}" cy="${focusY}" rx="${w * 0.65}" ry="${h * 0.7}" fill="url(#light)"/>
  <g transform="rotate(${angle} ${w / 2} ${h / 2})">${familyArt}<path d="M ${-w * 0.1} ${h * 0.83} Q ${w * 0.45} ${h * 0.49} ${w * 1.1} ${h * 0.72}" fill="none" stroke="${bg}" stroke-opacity=".42" stroke-width="${Math.max(2, h * 0.012)}"/></g>
  <path d="M0 ${h * 0.82} Q ${w * 0.5} ${h * 0.68} ${w} ${h * 0.8} V${h} H0Z" fill="${c2}" opacity=".46"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" opacity=".07"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function avatarPlaceholder(tokens: DesignTokens, initials: string): string {
  const { a, b } = palette(tokens);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient></defs>
  <rect width="96" height="96" rx="48" fill="url(#a)"/>
  <text x="48" y="60" font-family="system-ui, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">${initials
    .slice(0, 2)
    .toUpperCase()}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
