import type { OpEntry, ProjectDoc } from '../types/tree';
import { useProject, type Snapshot } from '../store/useProject';

export interface TurnJournal {
  before: ProjectDoc;
  epoch: number;
  projectId: string | null;
  startIndex: number;
  original: string;
  anchor?: Snapshot;
  entries: OpEntry[];
  userIntervened: boolean;
  finishedFingerprint?: string;
  unsubscribe?: () => void;
}
const fingerprint = (doc: ProjectDoc) =>
  JSON.stringify({
    screens: doc.screens,
    tokens: doc.tokens,
    customComponents: doc.customComponents,
    kind: doc.kind,
    name: doc.name,
    blueprint: doc.blueprint,
    opLog: doc.opLog,
  });
/** The opLog is the journal. After reload structural changes can still be discussed,
 * but prior values overwritten on existing nodes are no longer recoverable. */
export function beginTurnJournal(original: string): TurnJournal {
  const state = useProject.getState();
  const journal: TurnJournal = {
    before: state.doc,
    epoch: state.documentEpoch,
    projectId: state.projectId,
    startIndex: state.doc.opLog.length,
    original,
    entries: [],
    userIntervened: false,
  };
  let tail = state.doc.opLog.at(-1);
  journal.unsubscribe = useProject.subscribe((next) => {
    if (next.documentEpoch !== journal.epoch || next.projectId !== journal.projectId)
      return;
    const latest = next.doc.opLog.at(-1);
    if (!latest || latest === tail) return;
    tail = latest;
    if (latest.source === 'user') journal.userIntervened = true;
    else {
      journal.entries.push(latest);
      if (!journal.anchor) journal.anchor = next.undoStack.at(-1);
    }
  });
  return journal;
}
export function endTurnJournal(journal: TurnJournal): TurnJournal {
  journal.unsubscribe?.();
  journal.unsubscribe = undefined;
  const state = useProject.getState();
  journal.finishedFingerprint = fingerprint(state.doc);
  return journal;
}
export function canStartOver(journal: TurnJournal): boolean {
  const state = useProject.getState();
  return (
    state.documentEpoch === journal.epoch &&
    state.projectId === journal.projectId &&
    !journal.userIntervened &&
    journal.finishedFingerprint === fingerprint(state.doc) &&
    (!journal.entries.length ||
      Boolean(journal.anchor && state.undoStack.includes(journal.anchor)))
  );
}
export function continuationPrompt(journal: TurnJournal): string {
  const entries = journal.entries
    .flatMap((entry) => entry.batch.map((op) => JSON.stringify(op).slice(0, 120)))
    .slice(-24);
  return `${journal.original}\n\nYou already applied these changes this turn — do NOT repeat or revert them:\n${entries.join('\n') || '(no changes applied)'}\nContinue from the canvas's CURRENT state: list the canvas first, finish the task, mend don't restart.`;
}
export function restartTurn(journal: TurnJournal): boolean {
  if (!canStartOver(journal)) return false;
  return useProject
    .getState()
    .restoreInterruptedTurn(journal.before, journal.anchor, journal.entries);
}
