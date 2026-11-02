// Shared by Run and generated sites. Nothing is hidden unless an observer exists.
export function armReveals(root, options = {}) {
  if (
    !root ||
    options.noArm ||
    typeof IntersectionObserver !== 'function' ||
    (typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
    return () => {};
  const targets = root.querySelectorAll('[data-motion-reveal]');
  if (!targets.length) return () => {};
  let observer;
  try {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.15 },
    );
    root.setAttribute('data-motion-armed', '');
    targets.forEach((target) => observer.observe(target));
  } catch {
    observer?.disconnect();
    root.removeAttribute('data-motion-armed');
    return () => {};
  }
  return () => {
    observer.disconnect();
    root.removeAttribute('data-motion-armed');
    targets.forEach((target) => target.classList.remove('is-in'));
  };
}

// One arrival move, shared by screen and tab switches; reduced motion stays instant.
export function enterPanel(element) {
  if (
    !element ||
    (typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
    return;
  element.classList.remove('mw-enter');
  void element.offsetWidth;
  element.classList.add('mw-enter');
  const done = (event) => {
    if (event.target !== element) return;
    element.classList.remove('mw-enter');
    element.removeEventListener('animationend', done);
  };
  element.addEventListener('animationend', done);
}
