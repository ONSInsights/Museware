import type { ProjectDoc } from '../types/tree';
import { clone, walk } from '../ops/treeUtils';

export interface AssetCensus {
  inline: number;
  remote: number;
  missing: number;
  remoteVideo: boolean;
}
/** Count media slots, including empty image and video slots; never fetch remote assets. */
export function assetCensus(doc: ProjectDoc): AssetCensus {
  const out: AssetCensus = { inline: 0, remote: 0, missing: 0, remoteVideo: false };
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
        if (/^data:image\//i.test(value)) out.inline++;
        else if (/^https:\/\//i.test(value)) {
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
function decodeData(value: string): { bytes: Uint8Array; ext: string } | null {
  const m =
    /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml)(?:;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(
      value,
    );
  if (!m) return null;
  try {
    const bytes = m[2]
      ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(m[3]));
    return {
      bytes,
      ext: m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg'),
    };
  } catch {
    return null;
  }
}
/** Only embedded images larger than 100 KiB become relative folder assets. */
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
        if (typeof value !== 'string' || !value.startsWith('data:image/')) continue;
        const decoded = decodeData(value);
        if (!decoded || decoded.bytes.length <= 100 * 1024) continue;
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
