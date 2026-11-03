// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { startSite } from './siteRuntime';

describe('standalone HTML form submission', () => {
  it('warns when no submit action exists, rather than claiming a reservation', () => {
    document.body.innerHTML =
      '<div class="mw-app"><form class="n-form_a"><button type="submit">Reserve</button></form></div><div id="site-toast" hidden></div>';
    startSite(
      {
        nodes: [{ id: 'form_a', type: 'form', props: {} }],
        screens: [{ id: 'home', name: 'Home' }],
        entry: 'home',
      },
      vi.fn(),
    );
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.getElementById('site-toast')?.textContent).toBe(
      'This form has no submit action yet.',
    );
  });
});
