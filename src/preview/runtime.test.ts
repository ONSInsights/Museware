import { describe, expect, it, vi } from 'vitest';
import {
  interpolateTokens,
  isVisible,
  matchesValue,
  runActions,
  type RuntimeApi,
} from './runtime';

describe('state comparisons', () => {
  it('handles boolean values and initial unset state', () => {
    expect(matchesValue(true, 'true')).toBe(true);
    expect(matchesValue(undefined, 'false')).toBe(true);
    expect(isVisible({ visibleWhen: { key: 'on', equals: false } }, {})).toBe(true);
    expect(isVisible({ visibleWhen: { key: 'on', equals: false } }, { on: true })).toBe(
      false,
    );
  });
  it('compares numeric values without treating blank or undefined as zero', () => {
    expect(matchesValue(50, '50')).toBe(true);
    expect(matchesValue(undefined, 0)).toBe(false);
    expect(matchesValue('', 0)).toBe(false);
  });
  it('uses the same comparison for conditional actions', () => {
    const messages: string[] = [];
    const api: RuntimeApi = {
      screenId: 'home',
      state: {},
      screens: [],
      setKey: () => {},
      toast: (s) => messages.push(s),
      navigate: () => {},
      openUrl: () => {},
    };
    runActions(
      [{ type: 'when', key: 'on', equals: false, then: [{ type: 'toast', text: 'off' }] }],
      api,
    );
    expect(messages).toEqual(['off']);
  });
});

describe('token interpolation & event wiring', () => {
  it('interpolates tokens from state with URL encoding', () => {
    const state = { name: 'Alice & Bob', query: 'web design + code' };
    const result = interpolateTokens('https://wa.me/12345?text=Hello%20{name}&q={query}', state);
    expect(result).toBe('https://wa.me/12345?text=Hello%20Alice%20%26%20Bob&q=web%20design%20%2B%20code');
  });

  it('handles missing or undefined state keys gracefully', () => {
    const result = interpolateTokens('Hello {name}, your note: {missing}', { name: 'Dan' });
    expect(result).toBe('Hello Dan, your note: ');
  });

  it('dispatches openUrl with interpolated tokens', () => {
    let openedUrl = '';
    let targetTab: string | undefined;
    const api: RuntimeApi = {
      screenId: 'home',
      state: { user_name: 'Dev', topic: 'API build' },
      screens: [],
      setKey: () => {},
      toast: () => {},
      navigate: () => {},
      openUrl: (url, target) => {
        openedUrl = url;
        targetTab = target;
      },
    };

    runActions(
      [
        {
          type: 'openUrl',
          url: 'https://wa.me/1234567890?text=Hi%20from%20{user_name}:%20{topic}',
          target: '_blank',
        },
      ],
      api,
    );

    expect(openedUrl).toBe('https://wa.me/1234567890?text=Hi%20from%20Dev:%20API%20build');
    expect(targetTab).toBe('_blank');
  });

  it('dispatches submitWebhook and clears keys on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, type: 'basic' });
    vi.stubGlobal('fetch', mockFetch);

    const toasts: string[] = [];
    const cleared: string[][] = [];
    let navigatedTo = '';

    const api: RuntimeApi = {
      screenId: 'contact',
      state: { name: 'John Doe', email: 'john@example.com', message: 'Hello' },
      screens: [],
      setKey: () => {},
      clearKeys: (keys) => cleared.push(keys),
      toast: (msg) => toasts.push(msg),
      navigate: (screen) => { navigatedTo = screen; },
      openUrl: () => {},
    };

    runActions(
      [
        {
          type: 'submitWebhook',
          url: 'https://script.google.com/macros/s/AKfycbx.../exec',
          successToast: 'Thanks {name}, received!',
          navigateOnSuccess: 'thank_you',
          clearOnSuccess: true,
        },
      ],
      api,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [callUrl, callOptions] = mockFetch.mock.calls[0];
    expect(callUrl).toContain('script.google.com');
    expect(callOptions.mode).toBe('no-cors');
    expect(callOptions.method).toBe('POST');

    // Wait for the promise resolution
    await Promise.resolve();
    await Promise.resolve();

    expect(toasts).toContain('Thanks John%20Doe, received!');
    expect(navigatedTo).toBe('thank_you');
    expect(cleared.length).toBe(1);
    expect(cleared[0]).toEqual(['name', 'email', 'message']);

    vi.unstubAllGlobals();
  });
});
