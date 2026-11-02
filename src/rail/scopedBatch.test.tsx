// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RailMessage } from './AgentRail';
import { runScopedAction } from '../muse/loop';

vi.mock('../muse/loop', async (original) => ({
  ...(await original<typeof import('../muse/loop')>()),
  runScopedAction: vi.fn(),
}));
afterEach(cleanup);
it('runs the original instruction from the batch chip', () => {
  render(
    <RailMessage
      fresh={false}
      entry={{
        id: 'r',
        at: 1,
        role: 'system',
        text: '1 change applied',
        scopedBatch: {
          nodeId: 'buy',
          screenId: 'shop',
          type: 'button',
          instruction: 'Make it blue',
          count: 3,
        },
      }}
    />,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Apply to all 3 buttons on this screen' }),
  );
  expect(runScopedAction).toHaveBeenCalledWith('buy', 'Make it blue', true, {
    screenId: 'shop',
    type: 'button',
    count: 3,
  });
});
