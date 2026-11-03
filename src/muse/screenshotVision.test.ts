// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recreateFromScreenshot } from './screenshot';
import { useAgent } from '../store/useAgent';
import { useProject } from '../store/useProject';

const shot = () => new File(['pixels'], 'shot.jpg', { type: 'image/jpeg' });
function reset() {
  const doc = useProject.getState().doc;
  useProject.getState().replaceDoc({ ...doc, screens: [], opLog: [], rail: [], blueprint: undefined });
  useAgent.setState({ busy: false, demoMode: false, models: null, keySource: 'none' } as never);
}
beforeEach(reset);
afterEach(() => { vi.unstubAllGlobals(); reset(); });
function stubResponse(text: string, finish = 'stop') {
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`,
    { headers: { 'Content-Type': 'text/event-stream' } },
  ));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('direct screenshot vision', () => {
  it('sends the image to vision and presents the text blueprint for approval', async () => {
    const fetcher = stubResponse('RULES: Recreate\nSCREEN: Home\n- title (heading) Welcome\nLOOK: pad 16\nSTATE: none\nWIRING: none');
    await recreateFromScreenshot(shot(), 'Use the reference and keep its dark colours.');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/muse/chat');
    const request = JSON.parse((fetcher.mock.calls[0][1] as RequestInit).body as string);
    expect(request.max_tokens).toBe(4096);
    expect(request.messages[1].content[0].text).toContain('Use the reference and keep its dark colours.');
    expect(request.messages[1].content.some((part: {type: string; image_url?: {url: string}}) =>
      part.type === 'image_url' && part.image_url?.url.startsWith('data:image/jpeg;base64,'))).toBe(true);
    expect(useProject.getState().doc.blueprint?.decided).toBe(false);
    expect(useProject.getState().doc.screens).toHaveLength(0);
    expect(useProject.getState().doc.rail.some((r) => r.card?.kind === 'blueprint')).toBe(true);
  });
  it.each([['', 'stop'], ['partial', 'length'], ['I cannot process this image.', 'stop']])(
    'does not create a blueprint for empty, truncated, or non-blueprint output', async (text, finish) => {
      stubResponse(text, finish);
      await recreateFromScreenshot(shot());
      expect(useProject.getState().doc.blueprint).toBeUndefined();
      expect(useProject.getState().doc.rail.some((r) => r.card?.kind === 'blueprint')).toBe(false);
      expect(useProject.getState().doc.rail.map((r) => r.text).join(' ')).not.toContain('image clearly');
    },
  );
});
