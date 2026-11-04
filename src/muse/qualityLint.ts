import { SCAFFOLD_STRINGS } from '../types/library';
import { marqueeItems } from '../types/editorial';
import type { DesignTokens } from '../types/tokens';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';
import { findNodeInDoc, findParent, walk } from '../ops/treeUtils';

export interface LintFinding {
  severity: 'block' | 'warn';
  code:
    | 'scaffold'
    | 'imagery'
    | 'markup'
    | 'cramped'
    | 'button'
    | 'token'
    | 'spacing'
    | 'responsive'
    | 'navbar'
    | 'brand'
    | 'hero'
    | 'composition';
  nodeId: string;
  message: string;
  /** Visible guidance only: never use it to scope an automatic repair. */
  advisory?: boolean;
  protectMotion?: boolean;
}

/** Bounded, actionable composition checks; these never add or remove nodes. */
export function lintComposition(screen: ScreenDoc): LintFinding[] {
  const hints: LintFinding[] = [];
  const add = (node: ComponentNode, message: string) => {
    hints.push({ severity: 'warn', code: 'composition', nodeId: node.id, message });
  };
  const visit = (node: ComponentNode) => {
    if (node.type === 'grid') {
      const cols = Math.max(
        1,
        Math.min(
          6,
          Number(
            node.styles.responsive?.expanded?.columns ??
              node.props.columns ??
              node.styles.columns,
          ) || 2,
        ),
      );
      const last = node.children.at(-1);
      if (
        last &&
        cols > 1 &&
        node.children.length > cols &&
        node.children.length % cols === 1 &&
        last.styles.colSpan !== 'full' &&
        last.styles.colSpan !== undefined
      )
        add(
          last,
          'Orphan row risk: setStyles colSpan to full on this last card if its explicit span defeats row-closing defaults.',
        );
    }
    if (node.type === 'hero') {
      const layout = String(node.props.layout || 'split');
      const media = Boolean(
        node.props.image ||
          node.props.src ||
          node.children.some((child) => child.type === 'image'),
      );
      const copy = `${node.props.title || ''} ${node.props.subtitle || ''}`.trim();
      if (
        layout === 'split' &&
        media &&
        copy.length < 30 &&
        Number.parseInt(String(node.styles.minHeight || '0'), 10) > 500
      )
        add(
          node,
          'Split hero may have a dead void: setStyles minHeight to hug so the media and copy balance.',
        );
    }
    node.children.forEach(visit);
  };
  visit(screen.root);
  const motion = lintMotion(screen);
  return [
    ...motion.filter((item) => item.severity === 'block'),
    ...hints,
    ...motion.filter((item) => item.severity !== 'block'),
  ].slice(0, 4);
}

/** Concrete motion guidance. No names are guessed: page roles are declared props. */
export function lintMotion(screen: ScreenDoc): LintFinding[] {
  const findings: LintFinding[] = [];
  let ambient = 0;
  const push = (
    node: ComponentNode,
    message: string,
    severity: LintFinding['severity'] = 'warn',
    advisory = false,
  ) =>
    findings.push({
      nodeId: node.id,
      severity,
      code: 'composition',
      message,
      ...(advisory ? { advisory: true } : {}),
    });
  const darkEnough = (value: unknown) => {
    const m = /brightness\(\s*(\d*\.?\d+)\s*(%)?\s*\)/i.exec(String(value || ''));
    return !!m && Number(m[1]) / (m[2] ? 100 : 1) <= 0.65;
  };
  walk(screen.root, (node) => {
    const animated = ['rise', 'fade', 'slide', 'scale'].includes(String(node.props.motion));
    const isAmbient =
      node.type === 'marquee' ||
      node.type === 'scene3d' ||
      (node.type === 'video' && (!node.props.src || node.props.autoplayMuted === true));
    if (isAmbient && ++ambient > 1) {
      if (node.type === 'video' && node.props.src && node.props.autoplayMuted === true)
        push(
          node,
          'Multiple ambient widgets: setProps autoplayMuted to false on this video to demote it.',
        );
      else
        push(
          node,
          'Multiple ambient widgets: consider demoting one to still content with the user’s approval.',
          'warn',
          true,
        );
    }
    if (node.type === 'section' && animated && node.children.length > 8) {
      push(
        node,
        "This section staggers more children than the cascade expresses (8+) — the rest enter together, which is fine. If it's really two ideas, ask for a split and it'll be rebuilt as two sections.",
        'warn',
        true,
      );
      findings[findings.length - 1].protectMotion = true;
    }
    if (
      animated &&
      (node.type === 'navbar' ||
        node.type === 'bottomnav' ||
        ((node.type === 'section' || node.type === 'col') &&
          ['footer', 'nav'].includes(String(node.props.role))))
    )
      push(
        node,
        'Navigation or footer has entrance motion: setProps motion to none to keep it steady.',
      );
    if (node.type === 'hero' && node.props.layout === 'immersive') {
      // Prop images already receive the house scrim in CSS; a child image uses
      // a different class and must be darkened on that existing image widget.
      for (const child of node.children)
        if (child.type === 'image' && !darkEnough(child.styles.filter))
          push(
            child,
            'Immersive text on an unscrimmed image: setStyles filter to brightness(0.55) on this image.',
            'block',
          );
    }
  });
  return findings;
}

/** Only a picture removed in this turn can identify the newly opened hole. */
export function lintRemovedImageVoids(
  before: ProjectDoc,
  after: ProjectDoc,
): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const screen of before.screens)
    walk(screen.root, (node) => {
      if (node.type !== 'image' || findNodeInDoc(after, node.id)) return;
      const parent = findParent(screen.root, node.id)?.parent;
      if (!parent || parent.type !== 'hero') return;
      const current = findNodeInDoc(after, parent.id)?.node;
      if (
        !current ||
        String(current.props.layout || 'split') !== 'split' ||
        current.props.image ||
        current.props.src ||
        current.children.some((child) => child.type === 'image' || child.type === 'card')
      )
        return;
      findings.push({
        severity: 'warn',
        code: 'composition',
        nodeId: current.id,
        message:
          'A removed image left a split hero without media: setProps layout to centered to mend the hole.',
      });
    });
  return findings.slice(0, 4);
}

/** Deterministic facts, independent of the reviewer and safe on old documents. */
export function lintScreen(
  screen: ScreenDoc,
  tokens?: DesignTokens,
  queuedIds: ReadonlySet<string> = new Set(),
  _kind: 'app' | 'web' = 'app',
): LintFinding[] {
  const findings: LintFinding[] = [];
  const colors = new Map<string, string>();
  if (tokens) {
    for (const [key, hex] of Object.entries(tokens.openuiTheme.light_colors || {})) {
      if (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex))
        colors.set(hex.toLowerCase(), `var(--${key.replaceAll('_', '-')})`);
    }
  }
  const add = (
    node: ComponentNode,
    severity: LintFinding['severity'],
    code: LintFinding['code'],
    message: string,
  ) => findings.push({ nodeId: node.id, severity, code, message });
  let heroCount = 0;
  let sceneCount = 0;
  let marqueeCount = 0;
  let accentSections = 0;
  let glowSections = 0;
  const visit = (node: ComponentNode) => {
    // Report missing behavior as advisory only. A repair must never invent an
    // intended destination or make a real-world booking/order promise.
    if (node.type === 'button' && !node.props.disabled && !node.events?.tap?.length) {
      findings.push({
        nodeId: node.id,
        severity: 'warn',
        code: 'button',
        advisory: true,
        message: 'This button has no tap action; check its intended behavior.',
      });
    }
    if (node.type === 'form' && !node.events?.submit?.length) {
      findings.push({
        nodeId: node.id,
        severity: 'warn',
        code: 'button',
        advisory: true,
        message: 'This form has no submit action; it does not send a booking or message.',
      });
    }
    if (node.type === 'navbar') {
      if (
        ['brand', 'text'].some(
          (key) =>
            typeof node.props[key] === 'string' &&
            (node.props[key] as string).trim().toLowerCase() === 'museware',
        )
      )
        add(
          node,
          'warn',
          'brand',
          'Navbar uses the tool name as its brand; use the product name from the user’s brief.',
        );
    }
    if (node.type === 'scene3d' && ++sceneCount > 1)
      add(node, 'block', 'markup', 'More than one scene3d on this screen.');
    if (node.type === 'section') {
      const title = String(node.props.title || '')
        .trim()
        .toLowerCase();
      const first = node.children[0];
      if (
        title &&
        first?.type === 'heading' &&
        String(first.props.text || '')
          .trim()
          .toLowerCase() === title
      )
        add(node, 'block', 'markup', 'Section title duplicates its first child heading.');
      if (node.props.surface === 'accent' && ++accentSections > 1)
        add(node, 'warn', 'token', 'More than one accent section on this screen.');
      if (node.props.surface === 'glow' && ++glowSections > 2)
        add(node, 'warn', 'token', 'More than two glow sections on this screen.');
    }
    if (node.type === 'marquee') {
      if (++marqueeCount > 2)
        add(node, 'block', 'markup', 'More than two marquees on this screen.');
      if (marqueeItems(node.props.items).length < 4)
        add(node, 'warn', 'cramped', 'Marquee has fewer than four items.');
    }
    if (node.type === 'accordion') {
      const key = String(node.props.dataKey || node.props.bindKey || '');
      const rows = screen.mockData?.[key];
      const lines =
        typeof node.props.items === 'string'
          ? node.props.items.split(/\r?\n/).filter((line) => line.trim())
          : [];
      if (!rows?.length && (!lines.length || lines.some((line) => !line.includes('|'))))
        add(
          node,
          'block',
          'markup',
          'Accordion requires Question | Answer lines or mock data rows.',
        );
    }
    if (
      (node.styles.aspectRatio ||
        node.styles.responsive?.medium?.aspectRatio ||
        node.styles.responsive?.expanded?.aspectRatio) &&
      !['image', 'hero', 'card', 'video'].includes(node.type)
    )
      add(
        node,
        'warn',
        'responsive',
        'Aspect ratio is only applied to media blocks, not text containers.',
      );
    if (node.type === 'grid' && node.children.length) {
      const cols = Math.max(
        1,
        Math.min(
          6,
          Number(
            node.styles.responsive?.expanded?.columns ??
              node.props.columns ??
              node.styles.columns,
          ) || 2,
        ),
      );
      const total = node.children.reduce(
        (sum, child) =>
          sum +
          (child.styles.colSpan === 'full'
            ? cols
            : Math.max(1, Math.min(cols, Number(child.styles.colSpan) || 1))),
        0,
      );
      if (cols > 1 && total > cols && total % cols === 1)
        add(node, 'warn', 'responsive', 'Grid has an orphan cell in the final row.');
    }
    if (node.type === 'hero') {
      heroCount++;
      if (heroCount > 1)
        add(node, 'warn', 'responsive', 'More than one hero on this screen.');
      if (
        ['glow', 'sunk'].includes(String(node.props.surface)) &&
        String(node.styles.color || '').includes('openui-text-on-accent')
      )
        add(
          node,
          'warn',
          'token',
          'Glow or sunk hero uses on-accent text; check contrast.',
        );
    }
    if (
      node.type === 'grid' &&
      node.children.filter(
        (child) =>
          child.type === 'card' &&
          ['spotlight', 'accent'].includes(String(child.props.variant)),
      ).length > 1
    )
      add(node, 'warn', 'responsive', 'Grid has more than one spotlight or accent card.');
    for (const key of ['text', 'title', 'subtitle', 'label', 'placeholder']) {
      const value = node.props[key];
      if (typeof value !== 'string' || !value.trim()) continue;
      if (
        SCAFFOLD_STRINGS.has(value.trim()) ||
        /says something useful|A hero headline|One line about why|Type here|Say more/i.test(
          value,
        )
      )
        add(
          node,
          'block',
          'scaffold',
          `${key} contains scaffold copy: ${value.slice(0, 120)}`,
        );
      if (/\b(?:undefined|null|NaN)\b|\{\{/i.test(value))
        add(
          node,
          'block',
          'markup',
          `${key} contains an unresolved value: ${value.slice(0, 120)}`,
        );
    }
    const hasImage =
      (typeof node.props.src === 'string' && Boolean(node.props.src.trim())) ||
      (typeof node.props.image === 'string' && Boolean(node.props.image.trim()));
    if (node.type === 'image' && !hasImage && !queuedIds.has(node.id))
      add(node, 'warn', 'imagery', 'Image is empty; a palette placeholder is shown.');
    if (
      node.type === 'hero' &&
      !hasImage &&
      !queuedIds.has(node.id) &&
      !node.children.length &&
      !(typeof node.props.subtitle === 'string' && node.props.subtitle.trim())
    )
      add(
        node,
        'warn',
        'imagery',
        'Hero has no image, children, or subtitle; consider adding content.',
      );
    if (
      (node.type === 'row' || node.type === 'col') &&
      node.children.length > 6 &&
      !node.styles.gap
    )
      add(
        node,
        'warn',
        'cramped',
        `${node.type} has ${node.children.length} children and no gap`,
      );
    if (
      node.type === 'button' &&
      typeof node.props.text === 'string' &&
      node.props.text.trim().length < 3
    )
      add(node, 'warn', 'button', 'Button text is shorter than 3 characters');
    // Inspect shorthands, side-specific values, and responsive overrides. Only
    // literal pixels/unitless values are measured; percentages and tokens are
    // not pixel values and must not be mistaken for them.
    const excessiveSpacing = (value: unknown): boolean => {
      if (typeof value === 'number') return Math.abs(value) > 96;
      if (value && typeof value === 'object')
        return Object.values(value).some(excessiveSpacing);
      if (typeof value !== 'string') return false;
      return [...value.matchAll(/(?<![\w.%#-])-?\d+(?:\.\d+)?(?:px|dp)?(?![\w.%])/gi)].some(
        (match) => Math.abs(Number.parseFloat(match[0])) > 96,
      );
    };
    const checkSpacing = (styles: Record<string, unknown>, prefix = '') => {
      for (const [key, value] of Object.entries(styles)) {
        if (key === 'responsive' && value && typeof value === 'object') {
          for (const [breakpoint, override] of Object.entries(value))
            if (override && typeof override === 'object')
              checkSpacing(override as Record<string, unknown>, `${breakpoint}.`);
        } else if (
          /^(?:padding|margin|gap|rowGap|columnGap)(?:$|[A-Z-])/i.test(key) &&
          excessiveSpacing(value)
        ) {
          add(
            node,
            'block',
            'spacing',
            `${prefix}${key} exceeds 96px, likely a misread viewport width.`,
          );
        }
      }
    };
    checkSpacing(node.styles);
    const checkStyles = (styles: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(styles)) {
        if (value && typeof value === 'object')
          checkStyles(value as Record<string, unknown>);
        else if (typeof value === 'string') {
          for (const hex of value.match(/#[0-9a-f]{6}\b/gi) || []) {
            const token = colors.get(hex.toLowerCase());
            if (token) add(node, 'warn', 'token', `${key} uses ${hex}; ${token} exists`);
          }
          if (/rgba?\s*\(/i.test(value))
            add(node, 'warn', 'token', `raw color in ${key} — use a token`);
        }
      }
    };
    checkStyles(node.styles);
    node.children.forEach(visit);
  };
  visit(screen.root);
  return [...findings, ...lintComposition(screen)];
}
