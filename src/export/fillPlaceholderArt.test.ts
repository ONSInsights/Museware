import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { buildExportFiles } from './zip';
import { fillPlaceholderArt } from './fillPlaceholderArt';
import { assetCensus } from './assets';

it('fills a copy with distinct canvas-seeded art before React asset extraction', async () => {
  const doc = createProject();
  const screen = emptyScreen('Art', { id: 'art', entry: true });
  screen.root.children = ['first', 'second'].map((id) => ({
    id,
    type: 'image',
    props: {},
    styles: {},
    children: [],
  }));
  doc.screens = [screen];
  const before = JSON.stringify(doc);
  const filled = fillPlaceholderArt(doc);
  const [first, second] = filled.screens[0].root.children;
  expect(first.props.src).toMatch(/^data:image\/svg\+xml/);
  expect(first.props.src).not.toBe(second.props.src);
  expect(assetCensus(filled).inline).toBe(2);
  const files = await buildExportFiles(doc);
  expect(files['src/assets/1.svg']).toBeInstanceOf(Uint8Array);
  expect(files['src/assets/2.svg']).toBeInstanceOf(Uint8Array);
  const source = String(files['src/screens/Art.tsx']);
  expect(source).toContain('src={img1}');
  expect(source).toContain('src={img2}');
  expect(source).not.toContain('data:image');
  expect(JSON.stringify(doc)).toBe(before);
});
it('does not create image assets for an image-free project', async () => {
  const doc = createProject();
  doc.screens = [emptyScreen('Plain', { id: 'plain', entry: true })];
  const files = await buildExportFiles(doc);
  expect(Object.keys(files).filter((path) => path.startsWith('src/assets/'))).toEqual([]);
});
