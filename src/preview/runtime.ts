import { createContext, useContext } from 'react';
import type { Action, ScreenDoc } from '../types/tree';

export interface RuntimeApi {
  screenId: string;
  state: Record<string, unknown>;
  screens: ScreenDoc[];
  setKey: (key: string, value: unknown) => void;
  clearKeys?: (keys: string[]) => void;
  toast: (text: string) => void;
  navigate: (to: string) => void;
  openUrl: (url: string, target?: '_blank' | '_self') => void;
}

export const RuntimeContext = createContext<RuntimeApi | null>(null);

export function useRuntime(): RuntimeApi | null {
  return useContext(RuntimeContext);
}

/** Interpolates `{key}` tokens using the current state dictionary. URL-encodes interpolated values. */
export function interpolateTokens(template: string, state: Record<string, unknown>): string {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, key) => {
    const val = state[key];
    if (val === undefined || val === null) return '';
    return encodeURIComponent(String(val));
  });
}

export function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected === true || expected === 'true') return Boolean(actual);
  if (expected === false || expected === 'false') return !actual;
  const numeric = (v: unknown) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  if (numeric(actual) && numeric(expected)) return Number(actual) === Number(expected);
  return String(actual ?? '') === String(expected ?? '');
}

/** The whole no-code verb set, interpreted in order. Nested `when` is ≤2 deep. */
export function runActions(
  actions: Action[] | undefined,
  api: RuntimeApi,
  depth = 1,
): void {
  if (!actions || depth > 3) return;
  for (const action of actions) {
    switch (action.type) {
      case 'navigate':
        api.navigate(action.to);
        break;
      case 'setState':
        api.setKey(action.key, action.value);
        break;
      case 'toggle':
        api.setKey(action.key, !api.state[action.key]);
        break;
      case 'toast':
        api.toast(interpolateTokens(action.text, api.state));
        break;
      case 'openUrl': {
        const url = interpolateTokens(action.url, api.state);
        api.openUrl(url, action.target);
        break;
      }
      case 'submitWebhook': {
        const method = action.method || 'POST';
        const url = interpolateTokens(action.url, api.state);
        const isGoogleScript = /script\.google\.com/i.test(url);
        const mode = action.mode || (isGoogleScript ? 'no-cors' : 'cors');

        const headers: Record<string, string> = {
          ...(action.headers || {}),
        };

        let body: BodyInit | undefined = undefined;
        if (method === 'POST') {
          if (mode === 'no-cors' || isGoogleScript) {
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(api.state)) {
              if (v !== undefined && v !== null) {
                params.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
              }
            }
            body = params.toString();
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
          } else {
            body = JSON.stringify(api.state);
            if (!headers['Content-Type']) {
              headers['Content-Type'] = 'application/json';
            }
          }
        }

        try {
          fetch(url, {
            method,
            mode,
            headers: Object.keys(headers).length ? headers : undefined,
            body,
          })
            .then((res) => {
              if (mode === 'no-cors' || res.ok || res.type === 'opaque') {
                if (action.successToast) api.toast(interpolateTokens(action.successToast, api.state));
                else api.toast('Submitted successfully!');

                if (action.clearOnSuccess !== false && api.clearKeys) {
                  api.clearKeys(Object.keys(api.state));
                }
                if (action.navigateOnSuccess) {
                  api.navigate(action.navigateOnSuccess);
                }
              } else {
                if (action.errorToast) api.toast(interpolateTokens(action.errorToast, api.state));
                else api.toast(`Submission failed (${res.status})`);
              }
            })
            .catch((err) => {
              console.warn('Webhook dispatch failed:', err);
              if (action.errorToast) api.toast(interpolateTokens(action.errorToast, api.state));
              else api.toast('Submission failed. Check network connection.');
            });
        } catch (err) {
          console.warn('Webhook dispatch exception:', err);
          if (action.errorToast) api.toast(interpolateTokens(action.errorToast, api.state));
          else api.toast('Submission failed.');
        }
        break;
      }
      case 'when': {
        const current = api.state[action.key];
        const matches =
          action.equals === undefined
            ? Boolean(current)
            : matchesValue(current, action.equals);
        if (matches) runActions(action.then, api, depth + 1);
        break;
      }
      default:
        break;
    }
  }
}

export function isVisible(
  node: { visibleWhen?: { key: string; equals?: string | number | boolean } },
  state: Record<string, unknown> | null,
): boolean {
  if (!node.visibleWhen) return true;
  if (!state) return true;
  const value = state[node.visibleWhen.key];
  if (node.visibleWhen.equals === undefined) return Boolean(value);
  return matchesValue(value, node.visibleWhen.equals);
}

export function screenSlugForLabel(screens: ScreenDoc[], label: string): string | null {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const hit = screens.find(
    (s) =>
      s.id === slug || s.id.includes(slug) || s.name.toLowerCase() === label.toLowerCase(),
  );
  return hit ? hit.id : null;
}
