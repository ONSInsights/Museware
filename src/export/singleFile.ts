import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import motionSource from '../canvas/motion.js?raw';
import revealSource from '../canvas/reveal.js?raw';
import { NodeBody, StaticExportContext } from '../canvas/NodeBody';
import { generateFullCss } from '../canvas/cssGen';
import { materializeCss, screenLookVariables } from '../design/materialize';
import { defaultPropsFor } from '../types/library';
import type { ProjectDoc } from '../types/tree';
import { clone, walk } from '../ops/treeUtils';
import { auditFlattenedDom } from './auditCodegen';
import { startSite } from './siteRuntime';
import { decodeData, extractAssets } from './assets';

/* Every emitted local path is relative; absolute /paths are forbidden for subpath hosting.
 * Local media import remains forbidden while validation permits only HTTPS/data.
 * If local video import is ever supported, it must ship as a relative zip-folder
 * asset, never a giant base64 video inside the single-file export. */
const esc = (text: unknown) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const safeScriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** The HTML contains the actual canvas tree rendered with the existing NodeBody. */
export function buildSingleHtml(input: ProjectDoc): string {
  const doc = clone(input);
  for (const screen of doc.screens)
    walk(screen.root, (node) => {
      for (const key of ['src', 'image', 'poster']) {
        const value = node.props[key];
        if (typeof value !== 'string' || !value) continue;
        const allowed =
          /^https:\/\//i.test(value) ||
          (/^data:image\//i.test(value) && !(node.type === 'video' && key === 'src')) ||
          /^__MUSEWARE_ASSET_\d+__$/.test(value);
        if (!allowed) node.props[key] = '';
      }
    });
  const entry = doc.screens.find((s) => s.entry) || doc.screens[0];
  const nodes: Array<Record<string, unknown>> = [];
  for (const screen of doc.screens)
    walk(screen.root, (node) =>
      nodes.push({
        id: node.id,
        type: node.type,
        props: Object.fromEntries(
          Object.entries({ ...defaultPropsFor(node.type), ...node.props }).filter(([key]) =>
            [
              'bindKey',
              'cta',
              'ctaTo',
              'to',
              'value',
              'preset',
              'speed',
              'interactive',
            ].includes(key),
          ),
        ),
        visibleWhen: node.visibleWhen,
        events: node.events,
      }),
    );
  const screens = doc.screens.map((s) => ({ id: s.id, name: s.name }));
  const content = doc.screens
    .map((screen) => {
      const child = createElement(
        StaticExportContext.Provider,
        { value: true },
        createElement(NodeBody, {
          node: screen.root,
          doc,
          mode: 'run',
          screenId: screen.id,
        }),
      );
      const vars = Object.entries(screenLookVariables(screen.root.props))
        .map(([k, v]) => `${k}:${v}`)
        .join(';');
      return `<section data-screen="${esc(screen.id)}"${screen.id === entry?.id ? '' : ' hidden'}><div class="mw-css-root"><div class="mw-app" style="${esc(vars)}">${renderToStaticMarkup(child)}</div></div></section>`;
    })
    .join('\n');
  auditFlattenedDom(content);
  const css =
    `${materializeCss(doc.tokens)}\n${generateFullCss(doc, { scrollModel: 'web' })}\nhtml,body{margin:0;min-height:100%;background:var(--openui-bg)}[hidden]{display:none!important}.mw-css-root{min-height:100vh}.mw-app{min-height:100vh;max-width:${doc.kind === 'web' ? '1280px' : '480px'};margin:auto}#site-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:12px;background:var(--openui-elevated);color:var(--openui-text-primary);z-index:100}`.replace(
      /<\/style/gi,
      '<\\/style',
    );
  const motion = motionSource.replace(
    'export function mountMotion',
    'function mountMotion',
  );
  const reveal = revealSource.replaceAll('export function ', 'function ');
  const metadata = safeScriptJson({ nodes, screens, entry: entry?.id || '' });
  const script =
    `document.documentElement.dataset.theme=typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';\n${motion}\n${reveal}\n(${startSite.toString()})(${metadata},mountMotion,armReveals,enterPanel);`.replace(
      /<\/script/gi,
      '<\\/script',
    );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.name)}</title><meta name="description" content="${esc(doc.name)}"><style>${css}</style></head><body>${content}<div id="site-toast" role="status" hidden></div><script>${script}</script></body></html>`;
}

/** Folder form reuses the same page and runtime with all images as files. */
export function buildHtmlFolder(doc: ProjectDoc): Record<string, string | Uint8Array> {
  const extracted = extractAssets(doc);
  let html = buildSingleHtml(extracted.doc);
  for (const asset of extracted.mappings)
    html = html.replaceAll(asset.sentinel, `./${asset.path}`);
  // NodeBody generates SVG placeholders for missing images; keep them swappable too.
  const placeholders = new Map<string, string>();
  html = html.replace(/src="(data:image\/[^"<>]+)"/gi, (attribute, data: string) => {
    const decoded = decodeData(data.replace(/&amp;/g, '&'));
    if (!decoded) throw new Error('An embedded image could not be extracted.');
    let path = placeholders.get(data);
    if (!path) {
      path = `assets/placeholder-${placeholders.size + 1}.${decoded.ext}`;
      placeholders.set(data, path);
      extracted.files[path] = decoded.bytes;
    }
    return attribute.replace(data, `./${path}`);
  });
  const readme = `# Publish on GitHub Pages

1. Create a repository at https://github.com/new and upload the extracted contents, including index.html and the assets folder if present, to the repository root.
2. In the repository, open Settings → Pages.
3. Under Source choose Deploy from a branch, select main and / (root), then Save. GitHub will show the site URL when it is ready.

HTTPS media still needs internet.
`;
  return { 'index.html': html, 'README.md': readme, ...extracted.files };
}
