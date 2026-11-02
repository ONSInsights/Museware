import JSZip from 'jszip';
import type { ProjectDoc } from '../types/tree';
import { generateProjectFiles } from './reactCodegen';
import { manifestFor, serviceWorkerTemplate } from './pwa';
import { extractAssets } from './assets';
import { buildHtmlFolder } from './singleFile';

export async function buildExportFiles(
  doc: ProjectDoc,
): Promise<Record<string, string | Uint8Array>> {
  const extracted = extractAssets(doc);
  const generated = generateProjectFiles(extracted.doc);
  for (const [path, source] of Object.entries(generated)) {
    if (!path.startsWith('src/screens/') || !path.endsWith('.tsx')) continue;
    let updated = source;
    const imports: string[] = [];
    for (let i = 0; i < extracted.mappings.length; i++) {
      const { sentinel, path: assetPath } = extracted.mappings[i];
      if (!updated.includes(sentinel)) continue;
      const variable = `img${i + 1}`;
      updated = updated
        .replaceAll(`{"${sentinel}"}`, `{${variable}}`)
        .replaceAll(`="${sentinel}"`, `={${variable}}`);
      const isKnownImage = /\.(png|jpg|jpeg|gif|svg|webp|avif|ico|bmp)$/i.test(assetPath);
      imports.push(
        `import ${variable} from '../${assetPath}${isKnownImage ? '' : '?url'}';`,
      );
    }
    generated[path] = `${imports.join('\n')}\n${updated}`;
  }
  const files: Record<string, string | Uint8Array> = { ...generated };
  if (extracted.mappings.length)
    files['src/vite-env.d.ts'] = '/// <reference types="vite/client" />\n';
  for (const [path, bytes] of Object.entries(extracted.files)) files[`src/${path}`] = bytes;
  files['manifest.webmanifest'] = manifestFor(doc);
  files['sw.js'] = serviceWorkerTemplate();
  files['public/manifest.webmanifest'] = manifestFor(doc);
  files['public/sw.js'] = serviceWorkerTemplate();
  files['public/icon.svg'] = generated['icon.svg'];
  return files;
}

function safeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'museware-project'
  );
}

async function downloadFileZip(
  files: Record<string, string | Uint8Array>,
  name: string,
): Promise<void> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export async function downloadZip(doc: ProjectDoc): Promise<void> {
  return downloadFileZip(await buildExportFiles(doc), `${safeName(doc.name)}.zip`);
}
export async function downloadHtmlFolder(doc: ProjectDoc): Promise<void> {
  return downloadFileZip(buildHtmlFolder(doc), `${safeName(doc.name)}-html.zip`);
}

export function downloadTextFile(name: string, content: string, type = 'text/plain'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadFilesAsText(files: Record<string, string>): void {
  const bundle = Object.entries(files)
    .map(([path, content]) => `/* ===== ${path} ===== */\n\n${content}`)
    .join('\n\n');
  downloadTextFile('museware-export.txt', bundle, 'text/plain');
}
