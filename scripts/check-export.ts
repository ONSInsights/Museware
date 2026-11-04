/**
 * End-to-end proof that the export is real code, not a promise:
 *   demo doc → generateProjectFiles → temp dir → `tsc --noEmit` → `vite build`.
 * Run with `npx vite-node scripts/check-export.ts` (part of `npm run check:export`).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createProject } from '../src/store/useProject';
import { applyOps } from '../src/ops/apply';
import { TEMPLATES, buildScreensFor } from '../src/muse/demo/build';
import { buildExportFiles } from '../src/export/zip';
import { buildSingleHtml } from '../src/export/singleFile';
import { manifestFor, serviceWorkerTemplate } from '../src/export/pwa';
import type { ProjectDoc } from '../src/types/tree';

const OUT = '/tmp/museware-export-check';
const repo = process.cwd();

function demoDoc(): ProjectDoc {
  const template = TEMPLATES[0];
  let doc: ProjectDoc = { ...createProject(template.projectName), kind: template.kind };
  const screens = buildScreensFor(template, doc.tokens);
  for (let i = 0; i < screens.length; i += 1) {
    const res = applyOps(
      [{ op: 'addScreen', screen: { ...screens[i], ...(i === 0 ? { entry: true } : {}) } }],
      doc,
      { source: 'user' },
    );
    if (res.errors.length) throw new Error(res.errors[0].message);
    doc = res.doc;
  }
  doc.screens[0].root.children.push(
    {
      id: 'large_image',
      type: 'image',
      props: { src: `data:image/png;base64,${Buffer.alloc(103000).toString('base64')}` },
      styles: {},
      children: [],
    },
    {
      id: 'data_list',
      type: 'list',
      props: { dataKey: 'tea_picks' },
      styles: {},
      children: [],
    },
    {
      id: 'data_table',
      type: 'table',
      props: { dataKey: 'tea_picks', columns: ['Name', 'Price'] },
      styles: {},
      children: [],
    },
    {
      id: 'data_chart',
      type: 'chart',
      props: { dataKey: 'tea_picks' },
      styles: {},
      children: [],
    },
    { id: 'empty_list', type: 'list', props: {}, styles: {}, children: [] },
    {
      id: 'motion_scene',
      type: 'scene3d',
      props: { preset: 'globe', title: 'Tea' },
      styles: {},
      children: [],
    },
    {
      id: 'motion_video',
      type: 'video',
      props: { src: '', caption: 'Reel' },
      styles: {},
      children: [],
    },
    {
      id: 'pr_a_marquee',
      type: 'marquee',
      props: { items: 'Tea, Coffee, Cocoa, Spice', variant: 'pills', speed: 30 },
      styles: {},
      children: [],
    },
    {
      id: 'pr_a_faq',
      type: 'accordion',
      props: { items: 'Why tea? | It tastes good.' },
      styles: {},
      children: [],
    },
    {
      id: 'pr_a_section',
      type: 'section',
      props: { eyebrow: 'Hello', title: 'Tea', subtitle: 'For you', surface: 'glow' },
      styles: {},
      children: [],
    },
  );
  const data = applyOps(
    [
      {
        op: 'setMockData',
        screenId: doc.screens[0].id,
        key: 'tea_picks',
        rows: [{ name: 'Hojicha', price: 12, available: true }],
      },
    ],
    doc,
    { source: 'agent' },
  );
  if (data.errors.length) throw new Error(data.errors[0].message);
  return data.doc;
}

const doc = demoDoc();
const files = {
  ...(await buildExportFiles(doc)),
  'public/manifest.webmanifest': manifestFor(doc),
  'public/sw.js': serviceWorkerTemplate(),
  'standalone.html': buildSingleHtml(doc),
};

rmSync(OUT, { recursive: true, force: true });
for (const [path, content] of Object.entries(files)) {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}
symlinkSync(
  join(repo, 'node_modules'),
  join(OUT, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
writeFileSync(join(OUT, '.gitignore'), 'node_modules\ndist\n');

const count = Object.keys(files).length;
console.log(`· wrote ${count} files to ${OUT}`);

function run(label: string, bin: string, args: string[]) {
  process.stdout.write(`· ${label}… `);
  const executable = process.platform === 'win32' && !bin.endsWith('.cmd') ? `${bin}.cmd` : bin;
  try {
    execFileSync(executable, args, { cwd: OUT, stdio: 'pipe', shell: true });
    console.log('ok');
  } catch (err) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
    console.log('FAILED');
    console.error(error.stdout?.toString().slice(-4000) || '');
    console.error(error.stderr?.toString().slice(-4000) || '');
    if (error.message) console.error(error.message);
    process.exit(1);
  }
}

run('typecheck the standalone runtime', join(repo, 'node_modules/.bin/tsc'), [
  '--noEmit',
  '--target',
  'ES2022',
  '--module',
  'ESNext',
  '--moduleResolution',
  'bundler',
  '--lib',
  'ES2022,DOM,DOM.Iterable',
  '--skipLibCheck',
  join(repo, 'src/export/siteRuntime.ts'),
]);
run('typecheck the export', join(repo, 'node_modules/.bin/tsc'), ['--noEmit', '-p', '.']);
run('build the export', join(repo, 'node_modules/.bin/vite'), ['build']);
console.log('✓ export: the generated project typechecks and builds');
