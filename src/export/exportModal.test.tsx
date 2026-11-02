// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExportModal } from '../shell/modals/ExportModal';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { downloadDisabled, loadExportFormat, recommendedFormat } from './exportFormat';
import { assetCensus } from './assets';
import * as exportsZip from './zip';

beforeEach(() => {
  localStorage.removeItem('museware/exportFormat');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(id: string, bytes = 0, video = false) {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  if (bytes)
    page.root.children.push({
      id: 'img_tea',
      type: 'image',
      props: { src: `data:image/png;base64,${btoa('x'.repeat(bytes))}` },
      styles: {},
      children: [],
    });
  if (video)
    page.root.children.push({
      id: 'vid_tea',
      type: 'video',
      props: { src: 'https://example.com/tea.mp4' },
      styles: {},
      children: [],
    });
  useProject.getState().hydrate({ ...createProject('KOYO'), screens: [page] }, id);
}
describe('export format choice', () => {
  it('defaults light, missing, remote-video-only, and exactly 256 KiB to one file', () => {
    setup('light', 0, true);
    expect(recommendedFormat(assetCensus(useProject.getState().doc))).toBe('single');
    render(<ExportModal onClose={() => {}} />);
    expect(
      (screen.getByRole('radio', { name: /Website — one file/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByText(/needs internet for video/i)).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: /Download index.html — a whole website in one file/,
      }),
    ).toBeTruthy();
    cleanup();
    setup('borderline', 256 * 1024);
    expect(recommendedFormat(assetCensus(useProject.getState().doc))).toBe('single');
  });
  it('uses the total decoded size, including several individually small images', () => {
    setup('sum', 128 * 1024);
    const doc = useProject.getState().doc;
    doc.screens[0].root.children.push({
      id: 'second',
      type: 'image',
      props: { src: `data:image/png;base64,${btoa('y'.repeat(128 * 1024 + 1))}` },
      styles: {},
      children: [],
    });
    expect(assetCensus(doc).embeddedBytes).toBe(256 * 1024 + 1);
    expect(recommendedFormat(assetCensus(doc))).toBe('folder');
  });
  it('describes images according to the chosen export shape', () => {
    setup('census', 3000);
    render(<ExportModal onClose={() => {}} />);
    expect(screen.getByText(/1 images embedded/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Website — folder/ }));
    expect(screen.getByText(/1 images in assets\//)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /React project/ }));
    expect(screen.getByText(/1 images in assets\//)).toBeTruthy();
  });
  it('ignores missing and invalid media for the recommendation', () => {
    setup('missing');
    const doc = useProject.getState().doc;
    doc.screens[0].root.children.push(
      { id: 'missing_image', type: 'image', props: { src: '' }, styles: {}, children: [] },
      {
        id: 'bad_image',
        type: 'image',
        props: { src: 'data:image/png;base64,not-valid!!!!' },
        styles: {},
        children: [],
      },
    );
    expect(recommendedFormat(assetCensus(doc))).toBe('single');
  });
  it('recovers storage after malformed saved data', () => {
    localStorage.setItem('museware/exportFormat', '{broken');
    setup('broken');
    render(<ExportModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: /React project/ }));
    expect(loadExportFormat('broken', 0)).toBe('react');
  });
  it('defaults a larger embedded image to folder, never React', () => {
    setup('heavy', 256 * 1024 + 1, true);
    render(<ExportModal onClose={() => {}} />);
    expect(
      (screen.getByRole('radio', { name: /Website — folder/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: /React project/ }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(screen.getByRole('button', { name: /Download site folder/ })).toBeTruthy();
    expect(screen.getByText(/needs internet for video/i)).toBeTruthy();
  });
  it('updates the one download button, retains index.html and saves each project choice', () => {
    setup('first');
    const download = vi.spyOn(exportsZip, 'downloadTextFile').mockImplementation(() => {});
    const view = render(<ExportModal onClose={() => {}} />);
    expect(screen.getByText(/Rename index.html only if you add other pages/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Download index.html — a whole website/ }),
    );
    expect(download).toHaveBeenCalledWith(
      'index.html',
      expect.stringContaining('<title>KOYO</title>'),
      'text/html',
    );
    fireEvent.click(screen.getByRole('radio', { name: /React project/ }));
    expect(
      screen.getByRole('button', { name: 'Download React project (.zip)' }),
    ).toBeTruthy();
    expect(loadExportFormat('first', 0)).toBe('react');
    view.unmount();
    setup('second');
    const second = render(<ExportModal onClose={() => {}} />);
    expect(
      (screen.getByRole('radio', { name: /Website — one file/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Website — folder/ }));
    expect(
      screen.getByRole('button', { name: 'Download site folder (.zip)' }),
    ).toBeTruthy();
    second.unmount();
    setup('first');
    render(<ExportModal onClose={() => {}} />);
    expect(
      (screen.getByRole('radio', { name: /React project/ }) as HTMLInputElement).checked,
    ).toBe(true);
  });
  it('requires a selection, and continues to respect the existing export gates', () => {
    expect(downloadDisabled(null, false, false, false)).toBe(true);
    expect(downloadDisabled('single', false, false, false)).toBe(false);
    expect(downloadDisabled('single', true, false, false)).toBe(true);
    expect(downloadDisabled('single', false, true, false)).toBe(true);
  });
});
