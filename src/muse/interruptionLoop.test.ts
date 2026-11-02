import { beforeEach, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { runAgentTurn } from './loop';
import { chatStream } from './client';
vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
}));
beforeEach(() => {
  useProject.getState().replaceDoc(createProject());
  useAgent.setState({ demoMode: false, busy: false, interruptionCard: null, models: null });
  vi.mocked(chatStream).mockReset();
});
it('turn call cap creates an in-memory pause card', async () => {
  vi.mocked(chatStream).mockResolvedValue({
    text: '',
    toolCalls: Array.from({ length: 24 }, (_, i) => ({
      id: `call_${i}`,
      name: 'read_canvas',
      arguments: '{}',
    })),
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
    latencyMs: 0,
    model: 'test',
    finishReason: 'tool_calls',
  });
  await runAgentTurn('Build the tea page', { skipVerify: true });
  expect(useAgent.getState().interruptionCard?.reason).toBe('cap');
  expect(useAgent.getState().interruptionCard?.kind).toBe('interrupted');
  expect(
    useProject.getState().doc.rail.some((e) => String(e.card?.kind) === 'interrupted'),
  ).toBe(false);
});
it('an API failure ends in an error card', async () => {
  vi.mocked(chatStream).mockRejectedValue(new Error('offline'));
  await runAgentTurn('Build the tea page', { skipVerify: true });
  expect(useAgent.getState().interruptionCard).toBeNull();
  expect(
    useProject
      .getState()
      .doc.rail.some((e) => e.card?.kind === 'error' && e.card.data.message === 'offline'),
  ).toBe(true);
});
