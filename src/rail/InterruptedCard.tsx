import { useAgent } from '../store/useAgent';
import { useProject } from '../store/useProject';
import { canStartOver, continuationPrompt, restartTurn } from '../muse/turnJournal';
import { runAgentTurn } from '../muse/loop';

/** Session-only UI; no interruption cards enter the saved project. */
export function InterruptedCard({ embedded = false }: { embedded?: boolean }) {
  const card = useAgent((s) => s.interruptionCard);
  const busy = useAgent((s) => s.busy);
  const doc = useProject((s) => s.doc);
  const epoch = useProject((s) => s.documentEpoch);
  const undoStack = useProject((s) => s.undoStack);
  void doc;
  void undoStack;
  if (!card || card.journal.epoch !== epoch) return null;
  const edits = card.journal.entries.reduce(
    (count, entry) => count + entry.batch.length,
    0,
  );
  const allowed = canStartOver(card.journal);
  return (
    <div
      className={embedded ? undefined : 'railcard chat-card'}
      role={embedded ? undefined : 'group'}
      aria-label={embedded ? undefined : 'Interrupted build'}
    >
      <div className="railcard-head">
        <strong>
          {card.reason === 'cap'
            ? `${edits} edits done, more to do — continue?`
            : `The build was interrupted after ${edits} edits.`}
        </strong>
      </div>
      {card.message && <p className="field-hint">{card.message}</p>}
      <div className="card-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy}
          onClick={() => {
            const prompt = continuationPrompt(card.journal);
            useAgent.getState().setInterruptionCard(null);
            void runAgentTurn(card.journal.original, { resumeJournal: prompt });
          }}
        >
          Continue where it left off
        </button>
        {allowed && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={busy}
            onClick={() => {
              if (!restartTurn(card.journal)) return;
              const original = card.journal.original;
              useAgent.getState().setInterruptionCard(null);
              void runAgentTurn(original);
            }}
          >
            Start over — remove this turn’s {edits} edits
          </button>
        )}
      </div>
      {!allowed && (
        <p className="field-hint">
          Start over isn't available anymore — continue, or tell me what to undo
        </p>
      )}
    </div>
  );
}
