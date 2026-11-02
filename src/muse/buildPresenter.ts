import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import type { TurnJournal } from './turnJournal';
import { isKeepalive } from './keepalive';

let active: {
  id: string;
  epoch: number;
  journal: TurnJournal;
  startedAt: number;
  timer: ReturnType<typeof setInterval>;
  unsubProject: () => void;
  unsubAgent: () => void;
} | null = null;
const current = () =>
  active && useProject.getState().documentEpoch === active.epoch
    ? useProject.getState().doc.rail.find((entry) => entry.id === active?.id)
    : undefined;

export function startBuildPresenter(journal: TurnJournal): string {
  stopBuildPresenter();
  const project = useProject.getState();
  const entry = [...project.doc.rail]
    .reverse()
    .find((item) => item.card?.kind === 'thinking' && item.card.state === 'pending');
  const card =
    entry ??
    project.addRail({
      role: 'card',
      text: 'Building',
      card: { kind: 'progress', state: 'pending', data: {} },
    });
  project.patchRail(card.id, {
    text: 'Building',
    card: {
      kind: 'progress',
      state: 'pending',
      data: {
        ...card.card?.data,
        turnCard: true,
        phase: 'live',
        title: 'Building',
        startedAt: Date.now(),
        ops: 0,
        assets: [],
        timeline: [],
      },
    },
  });
  const startedAt = Date.now();
  const epoch = project.documentEpoch;
  let tail = project.doc.opLog.at(-1);
  const unsubProject = useProject.subscribe((next) => {
    if (next.documentEpoch !== epoch) return;
    const nextTail = next.doc.opLog.at(-1);
    if (tail !== nextTail) {
      tail = nextTail;
      refreshBuildPresenter();
    }
  });
  const unsubAgent = useAgent.subscribe((next, previous) => {
    if (
      next.assetJobs !== previous.assetJobs ||
      next.progress !== previous.progress ||
      next.reviewNotes !== previous.reviewNotes
    )
      refreshBuildPresenter();
  });
  const timer = setInterval(refreshBuildPresenter, 1000);
  active = { id: card.id, epoch, journal, startedAt, timer, unsubProject, unsubAgent };
  refreshBuildPresenter();
  return card.id;
}

export function refreshBuildPresenter() {
  const card = current();
  if (!active || !card?.card) return;
  const agent = useAgent.getState();
  const seconds = Math.floor((Date.now() - active.startedAt) / 1000);
  const elapsed =
    seconds >= 60
      ? `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
      : `${seconds}s`;
  const assets = agent.assetDocumentEpoch === active.epoch ? agent.assetJobs : [];
  const ops = active.journal.entries.reduce((count, item) => count + item.batch.length, 0);
  const imageDone = assets.filter((job) => job.state === 'done').length;
  const quality = (agent.reviewNotes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\[(?:warn|block)\]/i.test(line));
  if (
    !quality.length &&
    agent.reviewNotes &&
    ['problems', 'unverified'].includes(agent.verification)
  )
    quality.push(`[warn] ${agent.reviewNotes}`);
  useProject.getState().patchRail(card.id, {
    card: {
      ...card.card,
      data: {
        ...card.card.data,
        elapsed,
        ops,
        assets: assets.map((job) => ({ ...job })),
        imageDone,
        quality,
        ...(agent.progress
          ? { parts: agent.progress.parts, title: agent.progress.title }
          : {}),
      },
    },
  });
}

export function buildTimeline(text: string): boolean {
  const card = current();
  if (!card?.card || !text.trim()) return false;
  if (isKeepalive(text)) {
    console.debug(text);
    return true;
  }
  const timeline = Array.isArray(card.card.data.timeline) ? card.card.data.timeline : [];
  useProject.getState().patchRail(card.id, {
    card: {
      ...card.card,
      data: {
        ...card.card.data,
        timeline: [...timeline, { at: Date.now(), text: text.slice(0, 4000) }],
      },
    },
  });
  return true;
}
export function buildCardId(): string | undefined {
  return current()?.id;
}
export function stopBuildPresenter() {
  if (!active) return;
  clearInterval(active.timer);
  active.unsubProject();
  active.unsubAgent();
  active = null;
}

export function buildCaption(text: string): boolean {
  const card = current();
  if (!active || !card?.card || !active.journal.entries.length || !text.trim())
    return false;
  useProject.getState().patchRail(card.id, {
    card: {
      ...card.card,
      data: { ...card.card.data, caption: text.trim().slice(0, 4000) },
    },
  });
  return true;
}

/** Transform the original card, and place it after every other turn object. */
export function finishBuildPresenter(
  phase: 'receipt' | 'interrupted' | 'failed' | 'discard',
  details: { screens?: number; total?: number; message?: string; retryText?: string } = {},
) {
  refreshBuildPresenter();
  const card = current();
  if (!card?.card) return;
  if (phase === 'discard') {
    const timeline = Array.isArray(card.card.data.timeline)
      ? (card.card.data.timeline as Array<{ text?: string }>)
      : [];
    useProject.getState().patchRail(card.id, {
      text: 'Thinking',
      card: {
        kind: 'thinking',
        state: 'answered',
        data: {
          ...card.card.data,
          turnCard: false,
          active: false,
          expanded: false,
          summary: 'Finished',
          lines: timeline.map((item) => item.text || '').filter(Boolean),
        },
      },
    });
    return;
  }
  const project = useProject.getState();
  const title =
    phase === 'receipt'
      ? `Built · ${project.doc.name}`
      : phase === 'interrupted'
        ? 'Build interrupted'
        : 'That did not finish';
  project.patchRail(card.id, {
    text: title,
    card: {
      kind: phase === 'failed' ? 'error' : 'progress',
      state:
        phase === 'failed' ? 'pending' : phase === 'receipt' ? 'answered' : 'cancelled',
      data: { ...card.card.data, phase, title, ...details },
    },
  });
  useProject.setState((state) => {
    const found = state.doc.rail.find((item) => item.id === card.id);
    return found
      ? {
          doc: {
            ...state.doc,
            rail: [...state.doc.rail.filter((item) => item.id !== card.id), found],
          },
        }
      : {};
  });
}
