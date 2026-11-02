import type { ProjectDoc } from '../types/tree';
import { clone, walk } from '../ops/treeUtils';

export interface AssetCensus {
  inline: number;
  remote: number;
  missing: number;
  remoteVideo: boolean;
  embeddedBytes: number;
}
/** Count media slots, including empty image and video slots; never fetch remote assets. */
export function assetCensus(doc: ProjectDoc): AssetCensus {
  const out: AssetCensus = {
    inline: 0,
    remote: 0,
    missing: 0,
    remoteVideo: false,
    embeddedBytes: 0,
  };
  for (const screen of doc.screens)
    walk(screen.root, (node) => {
      const p = node.props;
      const keys = ['src', 'poster', 'image'].filter(
        (key) => typeof p[key] === 'string' && p[key] !== '',
      );
      if (!keys.length && ['image', 'video', 'hero', 'card'].includes(node.type))
        out.missing++;
      for (const key of keys) {
        const value = String(p[key]);
        if (/^data:image\//i.test(value)) {
          const decoded = !(node.type === 'video' && key === 'src')
            ? decodeData(value)
            : null;
          if (decoded) {
            out.inline++;
            out.embeddedBytes += decoded.bytes.length;
          } else out.missing++;
        } else if (/^https:\/\//i.test(value)) {
          out.remote++;
          if (node.type === 'video' && key === 'src') out.remoteVideo = true;
        } else out.missing++;
      }
    });
  return out;
}

export interface ExtractedAssets {
  doc: ProjectDoc;
  files: Record<string, Uint8Array>;
  mappings: Array<{ sentinel: string; path: string }>;
}
export function decodeData(value: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:image\/([a-z0-9.+-]+)(?:;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(value);
  if (!m) return null;
  try {
    const bytes = m[2]
      ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(m[3]));
    return {
      bytes,
      ext: m[1]
        .toLowerCase()
        .replace('jpeg', 'jpg')
        .replace('svg+xml', 'svg')
        .replace('vnd.microsoft.icon', 'ico')
        .replace('x-icon', 'ico'),
    };
  } catch {
    return null;
  }
}
/** The folder is for people — every image is a visible, swappable file; no mixed base64 surprises. */
export function extractAssets(input: ProjectDoc): ExtractedAssets {
  const doc = clone(input);
  const files: Record<string, Uint8Array> = {};
  const mappings: ExtractedAssets['mappings'] = [];
  const seen = new Map<string, { sentinel: string; path: string }>();
  for (const screen of doc.screens)
    walk(screen.root, (node) => {
      for (const key of ['src', 'poster', 'image']) {
        if (node.type === 'video' && key === 'src') continue;
        const value = node.props[key];
        if (typeof value !== 'string' || !/^data:image\//i.test(value)) continue;
        const decoded = decodeData(value);
        if (!decoded)
          throw new Error(
            'An embedded image is invalid. Replace it before exporting a folder or React project.',
          );
        let entry = seen.get(value);
        if (!entry) {
          const num = mappings.length + 1;
          entry = {
            sentinel: `__MUSEWARE_ASSET_${num}__`,
            path: `assets/${num}.${decoded.ext}`,
          };
          seen.set(value, entry);
          mappings.push(entry);
          files[entry.path] = decoded.bytes;
        }
        node.props[key] = entry.sentinel;
      }
    });
  return { doc, files, mappings };
}
