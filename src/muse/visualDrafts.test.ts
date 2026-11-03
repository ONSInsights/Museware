import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../store/useProject';
import type { ChatOptions, ChatResult } from './client';
import { generateVisualDrafts } from './visualDrafts';

const blueprint = 'RULES: An editorial bakery.\nSCREEN: Home\n- title_home (heading) Bread';
const response = (name: string, args: unknown): ChatResult => ({
  text: '',
  toolCalls: [{ id: name, name, arguments: JSON.stringify(args) }],
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
  model: 'test',
  latencyMs: 1,
  finishReason: 'tool_calls',
});
const options = () => ({
  project: createProject('Bakery'),
  blueprint,
  signal: new AbortController().signal,
  tools: [],
  model: 'test',
});

describe('isolated visual draft generator', () => {
  it('produces three different editable screens without changing the original project and passes the reference', async () => {
    const input = options();
    const before = structuredClone(input.project);
    const received: string[] = [];
    let n = 0;
    const request = vi.fn(async (opts: ChatOptions) => {
      received.push(JSON.stringify(opts.messages));
      n += 1;
      const direction = Math.ceil(n / 2);
      return n % 2
        ? response('edit_canvas', {
            ops: [
              {
                op: 'add',
                parentId: 'home_root',
                node: {
                  type: 'heading',
                  id: 'draft_title',
                  props: { text: `Direction ${direction}` },
                  styles: { fontSize: `${direction * 10 + 20}px` },
                },
              },
            ],
          })
        : response('finish', { summary: 'Draft ready.' });
    });
    const drafts = await generateVisualDrafts({
      ...input,
      reference: 'data:image/png;base64,c2hvdA==',
      request,
    });
    expect(drafts).toHaveLength(3);
    expect(new Set(drafts.map((d) => d.screen.root.children[0].styles.fontSize)).size).toBe(
      3,
    );
    expect(input.project).toEqual(before);
    expect(
      received.every((message) => message.includes('data:image/png;base64,c2hvdA==')),
    ).toBe(true);
    expect(JSON.stringify(drafts)).not.toContain('data:image/png;base64,c2hvdA==');
  });
  it('rejects duplicate directions rather than claiming three distinct choices', async () => {
    let n = 0;
    const request = vi.fn(async () =>
      ++n % 2
        ? response('edit_canvas', {
            ops: [
              {
                op: 'add',
                parentId: 'home_root',
                node: { id: 'draft_title', type: 'heading', props: { text: 'Same' } },
              },
            ],
          })
        : response('finish', { summary: 'Done.' }),
    );
    await expect(generateVisualDrafts({ ...options(), request })).rejects.toThrow(
      /duplicate/i,
    );
  });
  it('never accepts model-provided links, assets or events', async () => {
    let n = 0;
    const request = vi.fn(async () =>
      ++n === 1
        ? response('edit_canvas', {
            ops: [
              {
                op: 'add',
                parentId: 'home_root',
                node: {
                  id: 'img_draft',
                  type: 'image',
                  props: { src: 'https://example.com/guess.png' },
                },
              },
            ],
          })
        : response('finish', { summary: 'Done.' }),
    );
    await expect(generateVisualDrafts({ ...options(), request })).rejects.toThrow(
      /did not finish/i,
    );
    expect(request).toHaveBeenCalledTimes(8);
  });
  it('drops a late response after cancellation', async () => {
    const abort = new AbortController();
    const request = vi.fn(async () => {
      abort.abort();
      return response('edit_canvas', {
        ops: [
          {
            op: 'add',
            parentId: 'home_root',
            node: { id: 'draft_title', type: 'heading', props: { text: 'Late' } },
          },
        ],
      });
    });
    await expect(
      generateVisualDrafts({ ...options(), signal: abort.signal, request }),
    ).rejects.toThrow(/stopped/i);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
