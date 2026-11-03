import { findNodeInDoc, findParent } from '../ops/treeUtils';
import { buildTimeline } from './buildPresenter';
import { SCAFFOLD_STRINGS } from '../types/library';
import { useAgent, type AssetJob } from '../store/useAgent';
import { useProject } from '../store/useProject';
import type { ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';
import { generateImage, MuseError } from './client';
import { blueprintGlobalContext, blueprintScreenSections } from './blueprintParse';

export type ImageTarget = { id: string; prompt?: string };
export type ImageOutcome = {
  id: string;
  ok: boolean;
  message: string;
  stop?: boolean;
  attempts?: number;
};
const rail = (text: string) => {
  if (!buildTimeline(text)) useProject.getState().addRail({ role: 'system', text });
};

/** Nearby meaningful copy and the blueprint section describe the actual subject. */
export function imageSubject(
  doc: ProjectDoc,
  screen: ScreenDoc,
  node: ComponentNode,
  _brief?: string,
  context?: string,
): string {
  const parts: string[] = [];
  const add = (text: unknown) => {
    if (typeof text !== 'string') return;
    const clean = text.trim().replace(/\s+/g, ' ');
    if (
      clean &&
      clean.length <= 240 &&
      !SCAFFOLD_STRINGS.has(clean) &&
      !/^(image|hero|picture|photo)$/i.test(clean) &&
      !parts.includes(clean)
    )
      parts.push(clean);
  };
  add(node.props.alt);
  add(node.props.title);
  add(node.name);
  let current = node;
  for (let level = 0; level < 2; level += 1) {
    const parent = findParent(screen.root, current.id)?.parent;
    if (!parent || parent.type === 'screen') break;
    const collect = (child: ComponentNode, depth: number) => {
      if (child.id === node.id || parts.length >= 4 || depth > 3) return;
      add(child.props.title);
      add(child.props.text);
      add(child.props.subtitle);
      child.children.forEach((item) => collect(item, depth + 1));
    };
    collect(parent, 0);
    current = parent;
    if (parts.length >= 2) break;
  }
  const blueprint = doc.blueprint?.text || context || '';
  const related = blueprint
    .split(/\r?\n/)
    .find((line) => line.toLowerCase().includes(node.id.toLowerCase()));
  if (related) add(related.replace(/^\s*[-*]\s*/, '').slice(0, 220));
  if (!parts.length) add(screen.name);
  if (!parts.length) add(doc.name);
  // Include the screen's headline as broad brand context, after local product copy.
  const headline = (branch: ComponentNode): string | undefined => {
    if (branch.type === 'heading' && typeof branch.props.text === 'string')
      return branch.props.text;
    for (const child of branch.children) {
      const text = headline(child);
      if (text) return text;
    }
    return undefined;
  };
  add(headline(screen.root));
  return parts.slice(0, 6).join('; ') || 'the featured product or scene';
}

// Image calls are limited to 1,200 characters by the proxy. Carry explicit
// target direction first, followed by applicable plan context and local copy.
const IMAGE_WORDS =
  /\b(?:images?|imagery|photos?|photograph\w*|illustrat\w*|vectors?|artwork|art direction|draw\w*|paint\w*|watercolou?r|lighting|light|palette|mood|style|no text|text-free|lettering)\b/i;
function relevantImageContext(
  context: string,
  screen: ScreenDoc,
  node: ComponentNode,
): string {
  if (!context.trim()) return '';
  const sections = blueprintScreenSections(context);
  if (!sections.length) {
    if (context.length <= 300) return context.trim();
    return context
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((line) => IMAGE_WORDS.test(line))
      .join(' ');
  }
  const shared = blueprintGlobalContext(context);
  const section =
    sections.find((part) => {
      const header = part.split(/\r?\n/, 1)[0].replace(/[#*`]/g, '').trim();
      return (
        header
          .replace(/^SCREEN\s*\d*\s*:\s*/i, '')
          .trim()
          .toLowerCase() === screen.name.trim().toLowerCase()
      );
    }) || '';
  const lines = [...shared.split(/\r?\n/), ...section.split(/\r?\n/).slice(1)];
  return lines
    .filter(
      (line) =>
        IMAGE_WORDS.test(line) &&
        (shared.split(/\r?\n/).includes(line) ||
          !/^\s*[-*]\s*\w+\s*\(/.test(line) ||
          line.toLowerCase().includes(node.id.toLowerCase())),
    )
    .join(' ')
    .trim();
}
function imageFree(context: string): boolean {
  return /\bimage[ -]free\b|\b(?:no|without)\s+(?:any\s+)?images?(?:\s+(?:on|in)\s+this\s+(?:screen|page))?(?=\s*(?:[.!;,]|$))/i.test(
    context,
  );
}
function imageRequestForHero(
  context: string,
  screen: ScreenDoc,
  node: ComponentNode,
): boolean {
  const sections = blueprintScreenSections(context);
  if (!sections.length) return false;
  const section = sections.find(
    (part) =>
      part
        .split(/\r?\n/, 1)[0]
        .replace(/[#*`]/g, '')
        .trim()
        .replace(/^SCREEN\s*\d*\s*:\s*/i, '')
        .trim()
        .toLowerCase() === screen.name.trim().toLowerCase(),
  );
  const line =
    section
      ?.split(/\r?\n/)
      .find((item) => item.toLowerCase().includes(node.id.toLowerCase())) || '';
  return (
    /\b(?:image|photo|photograph|illustration|artwork|picture)\b/i.test(line) &&
    !imageFree(line) &&
    !/\b(?:no|without)\s+(?:an?\s+)?(?:image|photo|photograph|illustration|artwork|picture)\b/i.test(
      line,
    )
  );
}
function providerPrompt(
  doc: ProjectDoc,
  screen: ScreenDoc,
  node: ComponentNode,
  target: ImageTarget,
  context = '',
): string {
  const targetText = (target.prompt || '').trim().slice(0, 700);
  const direction = relevantImageContext(
    context || (doc.blueprint?.decided ? doc.blueprint.text : ''),
    screen,
    node,
  ).slice(0, 250);
  const subject = imageSubject(doc, screen, node, undefined, context).slice(0, 120);
  const theme = doc.tokens.openuiTheme;
  const colors = [
    theme.brand_color,
    theme.secondary_color,
    theme.light_colors?.openui_bg,
  ].filter(
    (value): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value),
  );
  return [
    targetText ? `Requested image: ${targetText}` : '',
    direction
      ? `Applicable brief/plan context (follow explicit requests; newer target instructions take precedence): ${direction}`
      : '',
    `Subject and nearby content: ${subject}`,
    colors.length
      ? `Palette cues, only when compatible with the request: ${[...new Set(colors)].join(', ')}.`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
}

/** Wide editorial slots get more detail than compact product cards. */
export function imageSizeFor(screen: ScreenDoc, node: ComponentNode): string {
  if (node.type === 'hero' || /hero|story|banner/i.test(`${node.id} ${node.name || ''}`))
    return '1200x640';
  let current = node;
  let parent = findParent(screen.root, current.id)?.parent;
  while (parent && parent.type !== 'screen') {
    if (parent.type === 'card' || parent.type === 'grid' || parent.type === 'list')
      return '768x768';
    if (
      parent.type === 'hero' ||
      /hero|story|banner/i.test(`${parent.id} ${parent.name || ''}`)
    )
      return '1200x640';
    current = parent;
    parent = findParent(screen.root, current.id)?.parent;
  }
  return '768x768';
}

/** Muse's size is an aspect hint, not a pixel guarantee. Read the returned image. */
async function actualImageSize(
  src: string,
): Promise<{ width: number; height: number } | null> {
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 2000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(
        image.naturalWidth && image.naturalHeight
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null,
      );
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

// Serialize even manual and automated calls against the same provider.
let imageTurn: Promise<void> = Promise.resolve();
async function singleImageCall(
  prompt: string,
  size: string,
  signal?: AbortSignal,
): Promise<string> {
  const previous = imageTurn;
  let release!: () => void;
  imageTurn = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    if (signal?.aborted) throw new Error('Stopped before image generation.');
    return await generateImage(prompt, size);
  } finally {
    release();
  }
}

/** Shared by the agent, build pass, and inspector. Each image is one undoable op. */
export async function illustrateTarget(
  target: ImageTarget,
  options: {
    signal?: AbortSignal;
    onlyEmpty?: boolean;
    context?: string;
    retry?: boolean;
    takeAttempt?: () => boolean;
  } = {},
): Promise<ImageOutcome> {
  const doc = useProject.getState().doc;
  const documentEpoch = useProject.getState().documentEpoch;
  const hit = findNodeInDoc(doc, target.id);
  rail(`Illustrating ${target.id}…`);
  const finish = (outcome: ImageOutcome): ImageOutcome => {
    if (useProject.getState().documentEpoch === documentEpoch)
      rail(
        outcome.ok
          ? `🖼 ${target.id} saved — image is undoable.`
          : `Image not generated for ${target.id}: ${outcome.message}`,
      );
    return outcome;
  };
  const node = hit?.node;
  if (!node || !['hero', 'image', 'card', 'video'].includes(node.type))
    return finish({
      id: target.id,
      ok: false,
      message: 'Target must be an existing hero, image, card, or video.',
    });
  const key = node.type === 'image' ? 'src' : node.type === 'video' ? 'poster' : 'image';
  const previous = JSON.stringify([node.props.src, node.props.image, node.props.poster]);
  if (
    options.onlyEmpty &&
    (node.type === 'video' ? node.props.poster : node.props.src || node.props.image)
  )
    return finish({ id: node.id, ok: false, message: 'Already has an image.' });
  const agent = useAgent.getState();
  if (agent.demoMode)
    return finish({
      id: node.id,
      ok: false,
      stop: true,
      message:
        'Image generation needs a muse key; the local engine cannot generate images.',
    });
  if (
    agent.keySource !== 'session' &&
    (agent.houseKey === 'exhausted' || agent.budget?.exhausted)
  )
    return finish({
      id: node.id,
      ok: false,
      stop: true,
      message: 'Shared key budget exhausted; image generation skipped.',
    });
  if (options.signal?.aborted)
    return finish({
      id: node.id,
      ok: false,
      stop: true,
      message: 'Stopped before image generation.',
    });
  const prompt = providerPrompt(doc, hit.screen, node, target, options.context);
  const size = imageSizeFor(hit.screen, node);
  let attempts = 0;
  try {
    let src = '';
    let previousFailure = '';
    for (;;) {
      if (options.signal?.aborted) throw new Error('Stopped before image generation.');
      if (options.takeAttempt && !options.takeAttempt())
        throw new Error(
          `Automated image call cap exhausted before retry.${previousFailure ? ` Previous failure: ${previousFailure}` : ''}`,
        );
      attempts += 1;
      try {
        src = await singleImageCall(prompt, size, options.signal);
        break;
      } catch (err) {
        previousFailure = err instanceof Error ? err.message : String(err);
        const permanent =
          err instanceof MuseError &&
          ['house_key_exhausted', 'no_key', 'house_key_rejected', 'unauthorized'].includes(
            err.code,
          );
        if (!options.retry || attempts >= 2 || permanent || options.signal?.aborted)
          throw err;
        rail(
          `Image ${node.id} attempt failed: ${err instanceof Error ? err.message : String(err)}. Retrying in 3 seconds.`,
        );
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3000);
          options.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
    const actual = await actualImageSize(src);
    const current = findNodeInDoc(useProject.getState().doc, node.id)?.node;
    if (
      options.signal?.aborted ||
      !current ||
      current.type !== node.type ||
      useProject.getState().documentEpoch !== documentEpoch ||
      JSON.stringify([current.props.src, current.props.image, current.props.poster]) !==
        previous ||
      (options.onlyEmpty &&
        (current.type === 'video'
          ? current.props.poster
          : current.props.src || current.props.image))
    )
      return finish({
        id: node.id,
        ok: false,
        message: 'Image not applied because the target changed or the action was stopped.',
        attempts,
      });
    const result = useProject.getState().applyBatch(
      [
        {
          op: 'setProps',
          id: node.id,
          props: {
            [key]: src,
            assetWidth: actual?.width ?? null,
            assetHeight: actual?.height ?? null,
            assetAspectWidth: Number(size.split('x')[0]),
            assetAspectHeight: Number(size.split('x')[1]),
          },
        },
      ],
      {
        source: 'agent',
      },
    );
    if (result.errors.length) throw new Error(result.errors[0].message);
    return finish({ id: node.id, ok: true, message: 'Image applied.', attempts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stop =
      err instanceof MuseError &&
      [
        'house_key_exhausted',
        'no_key',
        'house_key_rejected',
        'house_key_rate_limited',
        'unauthorized',
        'rate_limited',
      ].includes(err.code);
    if (
      err instanceof MuseError &&
      err.code === 'house_key_exhausted' &&
      agent.keySource !== 'session'
    )
      useAgent.setState({ houseKey: 'exhausted' });
    return finish({ id: node.id, ok: false, message, stop, attempts });
  }
}

export async function illustrateTargets(
  targets: ImageTarget[],
  options: { signal?: AbortSignal; onlyEmpty?: boolean; context?: string } = {},
): Promise<ImageOutcome[]> {
  const outcomes: ImageOutcome[] = [];
  const documentEpoch = useProject.getState().documentEpoch;
  const eligible = targets.slice(0, 6);
  for (const target of eligible) {
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    const outcome = await illustrateTarget(target, options);
    outcomes.push(outcome);
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    if (outcome.stop) {
      const skipped = eligible.slice(outcomes.length);
      rail(
        `Image generation stopped: ${outcome.message}${skipped.length ? `; skipped ${skipped.map((item) => item.id).join(', ')}` : ''}.`,
      );
      break;
    }
  }
  if (
    useProject.getState().documentEpoch === documentEpoch &&
    outcomes.some((outcome) => outcome.ok)
  )
    rail(
      `Images: ${outcomes.filter((outcome) => outcome.ok).length} of 6 generated (manual pass).`,
    );
  return outcomes;
}

export async function autoIllustrate(
  screenIds: string[],
  context: string,
  limit: number,
  signal?: AbortSignal,
  eligibleIds?: ReadonlySet<string>,
  cardId?: string,
  reserveAttempt?: () => boolean,
): Promise<ImageOutcome[]> {
  const targets: ImageTarget[] = [];
  for (const screen of useProject.getState().doc.screens) {
    if (!screenIds.includes(screen.id)) continue;
    const visit = (node: ComponentNode) => {
      const applicable = relevantImageContext(context, screen, node);
      if (
        (node.type === 'image' ||
          (node.type === 'hero' && imageRequestForHero(context, screen, node))) &&
        !imageFree(applicable) &&
        (!eligibleIds || eligibleIds.has(node.id)) &&
        !node.props.src &&
        !node.props.image
      )
        targets.push({ id: node.id });
      node.children.forEach(visit);
    };
    visit(screen.root);
  }
  return queueAssetTargets(targets, context, limit, signal, cardId, true, reserveAttempt);
}

/** Run a build's requested assets serially and keep its card's job history. */
export async function queueAssetTargets(
  targets: ImageTarget[],
  context: string,
  limit: number,
  signal?: AbortSignal,
  cardId?: string,
  onlyEmpty = false,
  reserveAttempt?: () => boolean,
): Promise<ImageOutcome[]> {
  const documentEpoch = useProject.getState().documentEpoch;
  const cap = Math.max(0, Math.min(30, Math.floor(Number.isFinite(limit) ? limit : 6)));
  const jobs: AssetJob[] = targets.map((target) => {
    const hit = findNodeInDoc(useProject.getState().doc, target.id);
    return {
      nodeId: target.id,
      prompt:
        target.prompt?.trim().slice(0, 240) ||
        (hit
          ? imageSubject(
              useProject.getState().doc,
              hit.screen,
              hit.node,
              target.prompt,
              context,
            )
          : undefined),
      size: hit ? imageSizeFor(hit.screen, hit.node) : '768x768',
      state:
        hit && onlyEmpty && imageFree(relevantImageContext(context, hit.screen, hit.node))
          ? 'skipped'
          : 'queued',
      ...(hit && onlyEmpty && imageFree(relevantImageContext(context, hit.screen, hit.node))
        ? { reason: 'The current brief or plan requests an image-free design.' }
        : {}),
    };
  });
  const initialCard = cardId
    ? useProject.getState().doc.rail.find((entry) => entry.id === cardId)
    : undefined;
  const previous = Array.isArray(initialCard?.card?.data.assets)
    ? (initialCard.card.data.assets as AssetJob[])
    : cardId && useAgent.getState().assetDocumentEpoch === documentEpoch
      ? useAgent.getState().assetJobs
      : [];
  const publish = () => {
    if (useProject.getState().documentEpoch !== documentEpoch) return;
    const copy = [
      ...previous.filter((old) => !jobs.some((job) => job.nodeId === old.nodeId)),
      ...jobs,
    ].map((job) => ({ ...job }));
    useAgent.setState({
      assetJobs: copy,
      assetDocumentEpoch: documentEpoch,
      assetsPending: new Set(
        copy.filter((job) => job.state === 'running').map((job) => job.nodeId),
      ),
    });
    const card = cardId
      ? useProject.getState().doc.rail.find((entry) => entry.id === cardId)
      : undefined;
    if (card?.card?.kind === 'progress')
      useProject.getState().patchRail(card.id, {
        card: { ...card.card, data: { ...card.card.data, assets: copy } },
      });
  };
  publish();
  let attempts = 0;
  const outcomes: ImageOutcome[] = [];
  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    if (job.state === 'skipped') continue;
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    if (signal?.aborted || attempts >= cap) {
      job.state = 'skipped';
      job.reason = signal?.aborted ? 'Stopped' : 'Automated image call cap exhausted';
      publish();
      continue;
    }
    job.state = 'running';
    publish();
    const result = await illustrateTarget(targets[i], {
      signal,
      onlyEmpty,
      context,
      retry: true,
      takeAttempt: () => {
        if (attempts >= cap || (reserveAttempt && !reserveAttempt())) return false;
        attempts += 1;
        return true;
      },
    });
    outcomes.push(result);
    if (useProject.getState().documentEpoch !== documentEpoch) break;
    job.state = result.ok ? 'done' : 'failed';
    if (!result.ok) job.reason = result.message;
    if (result.stop) {
      for (const later of jobs.slice(i + 1))
        if (later.state === 'queued') {
          later.state = 'skipped';
          later.reason = result.message;
        }
      publish();
      break;
    }
    publish();
  }
  if (useProject.getState().documentEpoch === documentEpoch) {
    publish();
    const generated = jobs.filter((job) => job.state === 'done').length;
    const totalCap = useProject.getState().doc.automatedImageBudget?.cap ?? cap;
    if (generated) rail(`Images: ${generated} of ${totalCap} generated (this pass).`);
    const skipped = jobs.filter((job) => job.state === 'skipped');
    const budgetSkipped = skipped.filter((job) =>
      /automated image call cap/i.test(job.reason || ''),
    );
    if (budgetSkipped.length) rail(`image budget spent — ${budgetSkipped.length} skipped`);
    if (skipped.length)
      rail(
        `Auto-illustration skipped ${skipped.length} asset(s) (see reasons): ${skipped.map((job) => `${job.nodeId} (${job.reason || 'not generated'})`).join(', ')}. Placeholders remain.`,
      );
  }
  return outcomes;
}
