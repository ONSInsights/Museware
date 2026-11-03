import { useEffect, useId, useState } from 'react';
import { buildSingleHtml } from '../export/singleFile';
import { useResolvedCanvasTheme } from '../design/theme';
import { canvasOutline } from '../muse/canvasOutline';
import { chatStream, estimateCents } from '../muse/client';
import { TOOL_DEFS } from '../muse/loop';
import { getReference, isReferenceBlueprint } from '../muse/referenceSession';
import {
  clearVisualDraftSession,
  generateVisualDrafts,
  getVisualDraftSession,
  patchVisualDraftSession,
  setVisualDraftSession,
  setVisualPreviewController,
  stopVisualPreview,
  subscribeVisualDraftSession,
  type VisualDraft,
  type VisualDraftSession,
  visualBaseline,
} from '../muse/visualDrafts';
import { useAgent } from '../store/useAgent';
import { useProject } from '../store/useProject';

export function VisualDirections({
  onBuild,
  onSkip,
}: {
  onBuild: (draft: VisualDraft, epoch: number, baseline: string) => void;
  onSkip?: () => void;
}) {
  const groupId = useId();
  const themeMode = useProject((state) => state.doc.tokens.openuiTheme.theme_mode);
  const theme = useResolvedCanvasTheme(themeMode);
  const busy = useAgent((state) => state.busy);
  const demo = useAgent((state) => state.demoMode);

  const doc = useProject((state) => state.doc);
  const epoch = useProject((state) => state.documentEpoch);
  const baseline = visualBaseline(doc);

  const [session, setSession] = useState<VisualDraftSession | null>(() => {
    const s = getVisualDraftSession();
    return s && s.epoch === epoch && s.baseline === baseline ? s : null;
  });

  useEffect(() => {
    const sync = () => {
      const s = getVisualDraftSession();
      if (s && s.epoch === epoch && s.baseline === baseline) {
        setSession({ ...s });
      } else {
        setSession(null);
      }
    };
    sync();
    return subscribeVisualDraftSession(sync);
  }, [epoch, baseline]);

  const drafts = session?.drafts || [];
  const selected = session?.selected ?? null;
  const working = session?.working || false;
  const message = session?.message || '';
  const snapshot = session?.snapshot || null;
  const [wish, setWish] = useState(() => session?.wish || '');

  const generate = async () => {
    if (useAgent.getState().busy) return;
    const state = useProject.getState();
    const currentDoc = state.doc;
    const plan = currentDoc.blueprint?.text || '';
    const currentEpoch = state.documentEpoch;
    const referencePlan = isReferenceBlueprint(currentDoc, plan);
    const reference = referencePlan ? getReference(currentEpoch, plan) : null;
    if (referencePlan && !reference) {
      patchVisualDraftSession({
        message:
          'The screenshot is no longer in this session. Send it again to make a new recreation plan.',
      });
      return;
    }
    if (!plan) {
      patchVisualDraftSession({
        message: 'There is no blueprint to preview.',
      });
      return;
    }
    const controller = new AbortController();
    setVisualPreviewController(controller);
    setVisualDraftSession({
      epoch: currentEpoch,
      baseline: visualBaseline(currentDoc),
      drafts: [],
      selected: null,
      working: true,
      message: 'Preparing visual directions in the background… They will appear right here in this card. You can minimize this chat while they prepare.',
      snapshot: null,
      wish,
    });
    useAgent.getState().startTurn();
    const unsubscribe = useProject.subscribe((next) => {
      if (next.documentEpoch !== currentEpoch) {
        controller.abort();
        clearVisualDraftSession();
      }
    });
    try {
      const previewProject = structuredClone(currentDoc);
      if (wish.trim())
        previewProject.rail.push({
          id: 'preview_wish',
          at: Date.now(),
          role: 'user',
          text: wish.trim().slice(0, 1000),
        });
      const result = await generateVisualDrafts({
        project: previewProject,
        blueprint: plan,
        reference,
        signal: controller.signal,
        tools: TOOL_DEFS.filter((tool) =>
          ['edit_canvas', 'finish'].includes(tool.function.name),
        ),
        model: useAgent.getState().models?.builder.id || 'muse-spark-1.3',
        request: async (options) => {
          const res = await chatStream(options);
          const source = useAgent.getState().keySource;
          useAgent.getState().addReceipt({
            role: 'builder',
            model: res.model,
            latencyMs: res.latencyMs,
            promptChars: options.messages.reduce(
              (total, m) =>
                total + (typeof m.content === 'string' ? m.content.length : 0),
              0,
            ),
            toolNames: res.toolCalls.map((call) => call.name),
            inputTokens: res.usage.inputTokens,
            outputTokens: res.usage.outputTokens,
            cachedTokens: res.usage.cachedTokens,
            cents: estimateCents(res.model, res.usage),
            ...(source === 'none'
              ? {}
              : { key: source === 'session' ? ('user' as const) : ('house' as const) }),
          });
          return res;
        },
        onProgress: (direction) => {
          useAgent.getState().setLive(`Preparing visual direction ${direction} of 3…`);
          patchVisualDraftSession({
            message: `Preparing visual direction ${direction} of 3… Previews will appear right here in this card.`,
          });
        },
      });
      if (controller.signal.aborted || useProject.getState().documentEpoch !== currentEpoch) {
        if (useProject.getState().documentEpoch === currentEpoch)
          patchVisualDraftSession({
            working: false,
            message: 'Preview generation stopped. Nothing was applied.',
          });
        return;
      }
      if (visualBaseline(useProject.getState().doc) !== visualBaseline(currentDoc)) {
        patchVisualDraftSession({
          working: false,
          message:
            'Your design changed while previews were being prepared. Generate them again.',
        });
        return;
      }
      setVisualDraftSession({
        epoch: currentEpoch,
        baseline: visualBaseline(currentDoc),
        drafts: result,
        selected: null,
        working: false,
        snapshot: { epoch: currentEpoch, baseline: visualBaseline(currentDoc) },
        message:
          'Choose one direction, then select Build it. The chosen draft becomes editable. Museware will finish it while protecting the chosen layout; check the result for anything that still needs work.',
        wish,
      });
    } catch (error) {
      if (useProject.getState().documentEpoch === currentEpoch) {
        patchVisualDraftSession({
          working: false,
          message: controller.signal.aborted
            ? 'Preview generation stopped. Nothing was applied.'
            : `Could not prepare all three previews. Nothing was applied. ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } finally {
      unsubscribe();
      setVisualPreviewController(null);
      useAgent.getState().endTurn();
      patchVisualDraftSession({ working: false });
    }
  };
  return (
    <section className="visual-directions" aria-label="Visual directions">
      <p className="choice-note">
        Three isolated, editable first-screen drafts. Preparing them uses AI (up to 24
        requests) and may take time; they stay in this session. Screenshot references are
        sent with each preview request. Scroll within a preview to see the rest. Previews
        are non-interactive. After selection, Museware tries to add explicitly requested
        behavior; check the result.
      </p>
      {demo && (
        <p className="choice-note">
          Visual directions need a muse key. The local demo cannot generate them.
        </p>
      )}
      <label className="choice-note" htmlFor={`${groupId}-adjustment`}>
        Optional preview guidance
      </label>
      <textarea
        id={`${groupId}-adjustment`}
        className="textarea"
        rows={2}
        value={wish}
        onChange={(event) => {
          setWish(event.target.value);
          patchVisualDraftSession({ wish: event.target.value });
        }}
        placeholder="What should the directions explore?"
        disabled={busy}
      />
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        disabled={busy || demo}
        onClick={() => void generate()}
      >
        {drafts.length ? 'Regenerate three directions' : 'Preview three directions'}
      </button>
      {working && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => stopVisualPreview()}
        >
          Stop previews
        </button>
      )}
      {message && (
        <p className="choice-note" role="status">
          {message}
        </p>
      )}
      {onSkip && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={onSkip}
        >
          Build without visual previews
        </button>
      )}
      {drafts.map((draft, index) => (
        <div className="visual-direction" key={draft.label}>
          <label className="visual-direction-label">
            <input
              type="radio"
              name={`${groupId}-direction`}
              checked={selected === index}
              onChange={() => patchVisualDraftSession({ selected: index })}
            />{' '}
            <strong>{draft.label}</strong>
          </label>
          <iframe
            className="visual-direction-frame"
            title={`${draft.label} visual preview`}
            sandbox=""
            srcDoc={buildSingleHtml(draft.document)
              .replace('<html lang="en">', `<html lang="en" data-theme="${theme}">`)
              .replace(
                '<head>',
                `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body *{pointer-events:none!important}</style>`,
              )}
            tabIndex={-1}
            aria-hidden="true"
          />
          <details>
            <summary>Screen contents for {draft.label}</summary>
            <pre className="visual-direction-outline">
              {canvasOutline(draft.document, [draft.screen.id])}
            </pre>
          </details>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={busy || selected === null || !snapshot}
        title={
          selected === null
            ? 'Choose one direction above, or select Build without visual previews'
            : undefined
        }
        onClick={() => {
          if (selected !== null && snapshot)
            onBuild(drafts[selected], snapshot.epoch, snapshot.baseline);
        }}
      >
        Build it
      </button>
    </section>
  );
}
