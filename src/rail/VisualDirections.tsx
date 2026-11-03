import { useEffect, useId, useRef, useState } from 'react';
import { buildSingleHtml } from '../export/singleFile';
import { useResolvedCanvasTheme } from '../design/theme';
import { canvasOutline } from '../muse/canvasOutline';
import { chatStream, estimateCents } from '../muse/client';
import { TOOL_DEFS } from '../muse/loop';
import { getReference, isReferenceBlueprint } from '../muse/referenceSession';
import {
  generateVisualDrafts,
  setVisualPreviewController,
  type VisualDraft,
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
  const theme = useResolvedCanvasTheme();
  const busy = useAgent((state) => state.busy);
  const demo = useAgent((state) => state.demoMode);
  const [drafts, setDrafts] = useState<VisualDraft[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [wish, setWish] = useState('');
  const [snapshot, setSnapshot] = useState<{ epoch: number; baseline: string } | null>(
    null,
  );
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  const generate = async () => {
    if (useAgent.getState().busy) return;
    const state = useProject.getState();
    const doc = state.doc;
    const plan = doc.blueprint?.text || '';
    const epoch = state.documentEpoch;
    const referencePlan = isReferenceBlueprint(doc, plan);
    const reference = referencePlan ? getReference(epoch, plan) : null;
    if (referencePlan && !reference) {
      setMessage(
        'The screenshot is no longer in this session. Send it again to make a new recreation plan.',
      );
      return;
    }
    if (!plan) {
      setMessage('There is no blueprint to preview.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setVisualPreviewController(controller);
    setWorking(true);
    setMessage('');
    setFailed(false);
    setDrafts([]);
    setSelected(null);
    setSnapshot(null);
    useAgent.getState().startTurn();
    const unsubscribe = useProject.subscribe((next) => {
      if (next.documentEpoch !== epoch) controller.abort();
    });
    try {
      const previewProject = structuredClone(doc);
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
          const result = await chatStream(options);
          const source = useAgent.getState().keySource;
          useAgent.getState().addReceipt({
            role: 'builder',
            model: result.model,
            latencyMs: result.latencyMs,
            promptChars: options.messages.reduce(
              (total, message) =>
                total + (typeof message.content === 'string' ? message.content.length : 0),
              0,
            ),
            toolNames: result.toolCalls.map((call) => call.name),
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cachedTokens: result.usage.cachedTokens,
            cents: estimateCents(result.model, result.usage),
            ...(source === 'none'
              ? {}
              : { key: source === 'session' ? ('user' as const) : ('house' as const) }),
          });
          return result;
        },
        onProgress: (direction) =>
          useAgent.getState().setLive(`Preparing visual direction ${direction} of 3…`),
      });
      if (controller.signal.aborted || useProject.getState().documentEpoch !== epoch) {
        if (useProject.getState().documentEpoch === epoch)
          setMessage('Preview generation stopped. Nothing was applied.');
        return;
      }
      if (visualBaseline(useProject.getState().doc) !== visualBaseline(doc)) {
        setMessage(
          'Your design changed while previews were being prepared. Generate them again.',
        );
        return;
      }
      setDrafts(result);
      setSnapshot({ epoch, baseline: visualBaseline(doc) });
      setMessage(
        'Choose one direction, then select Build it. The chosen draft becomes editable. Museware will finish it while protecting the chosen layout; check the result for anything that still needs work.',
      );
    } catch (error) {
      if (useProject.getState().documentEpoch === epoch) {
        if (!controller.signal.aborted) setFailed(true);
        setMessage(
          controller.signal.aborted
            ? 'Preview generation stopped. Nothing was applied.'
            : `Could not prepare all three previews. Nothing was applied. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      unsubscribe();
      if (active.current === controller) active.current = null;
      setVisualPreviewController(null);
      useAgent.getState().endTurn();
      setWorking(false);
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
        onChange={(event) => setWish(event.target.value)}
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
          onClick={() => active.current?.abort()}
        >
          Stop previews
        </button>
      )}
      {message && (
        <p className="choice-note" role="status">
          {message}
        </p>
      )}
      {failed && onSkip && (
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
              onChange={() => setSelected(index)}
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
