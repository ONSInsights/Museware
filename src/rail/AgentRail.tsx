import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { emptyProjectLabel, useSaveStatus } from '../store/useSaveStatus';
import { runAgentTurn, runScopedAction, stopAgent } from '../muse/loop';
import { recreateFromScreenshot } from '../muse/screenshot';
import { stageScreenshot } from './stageScreenshot';
import { generateHeroImage } from '../muse/cards';
import { RailCard } from './RailCard';
import { InterruptedCard } from './InterruptedCard';
import { isKeepalive } from '../muse/keepalive';
import type { RailEntry } from '../types/tree';

const CALL_CAP = 24;
const VISIBLE = 100;

function money(cents: number): string {
  if (!cents) return '$0.00';
  return `$${(cents / 100).toFixed(cents < 10 ? 3 : 2)}`;
}

function Ring({ value, cap }: { value: number; cap: number }) {
  const pct = Math.min(1, value / cap);
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      aria-label={`${value} of ${cap} calls this turn`}
      role="img"
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--mw-border)"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--mw-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * pct} ${circumference}`}
        transform="rotate(-90 12 12)"
        className="chat-ring-progress"
      />
    </svg>
  );
}

function SentImage({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <img className="chat-sent-image" src={url} alt={`Attached image: ${file.name}`} /> : null;
}

export function RailMessage({ entry, fresh, image }: { entry: RailEntry; fresh: boolean; image?: File }) {
  if (entry.role === 'card') return <RailCard entry={entry} />;
  if (entry.role === 'system')
    return (
      <div className="sys-pill">
        {entry.text}
        {entry.scopedBatch && (
          <button
            type="button"
            className="chip"
            onClick={() => {
              const batch = entry.scopedBatch!;
              void runScopedAction(batch.nodeId, batch.instruction, true, {
                screenId: batch.screenId,
                type: batch.type,
                count: batch.count,
              });
            }}
          >
            Apply to all {entry.scopedBatch.count} {entry.scopedBatch.type}s on this screen
          </button>
        )}
      </div>
    );
  if (entry.role === 'user')
    return (
      <div className="rail-msg user">
        <div className="bubble-user chat-bubble chat-bubble--user">
          {image && <SentImage file={image} />}
          <div>{entry.text}</div>
          {image && <span className="chat-image-note">Image is temporary (up to 30 recent images; not saved after refresh)</span>}
        </div>
      </div>
    );
  return (
    <div className="rail-msg">
      <div
        className="prose-agent chat-bubble chat-bubble--agent"
        data-fresh={fresh || undefined}

      >
        {entry.text}
        {entry.reasoningReplayed && (
          <span className="chip" aria-label="Reasoning replayed">
            reasoning replayed
          </span>
        )}
      </div>
    </div>
  );
}

export function AgentRail({ focused = false, onMinimize, minimizing = false }: { focused?: boolean; onMinimize?: () => void; minimizing?: boolean }) {
  const rail = useProject((s) => s.doc.rail);
  const doc = useProject((s) => s.doc);
  const projectId = useProject((s) => s.projectId);
  useSaveStatus((s) => (projectId ? s.byProject[projectId] : undefined));
  const setDraft = useUi((s) => s.setDraft);
  const draftTrimmed = useUi((s) => s.draftTrimmed);
  const draft = useUi((s) => s.draft);
  const pendingImage = useUi((s) => s.pendingImage);
  const setPendingImage = useUi((s) => s.setPendingImage);
  const imageForProject = pendingImage?.projectId === projectId ? pendingImage.file : null;
  const railCollapsed = useUi((s) => s.railCollapsed);
  const setChatExpanded = useUi((s) => s.setChatExpanded);
  const toggleRail = useUi((s) => s.toggleRail);
  const selectedId = useUi((s) => s.selectedId);
  const toast = useUi((s) => s.toast);
  const mobileRailOpen = useUi((s) => s.mobileRailOpen);
  const setMobileRail = useUi((s) => s.setMobileRail);
  const setModal = useUi((s) => s.setModal);
  const busy = useAgent((s) => s.busy);
  const liveLine = useAgent((s) => s.liveLine);
  const interruptionCard = useAgent((s) => s.interruptionCard);
  const liveText = useAgent((s) => s.liveText);
  const turnCalls = useAgent((s) => s.turnCalls);
  const sessionCents = useAgent((s) => s.sessionCents);
  const modelMatrix = useAgent((s) => s.models);
  const demoMode = useAgent((s) => s.demoMode);
  const wonder = useAgent((s) => s.wonder);
  const setWonder = useAgent((s) => s.setWonder);
  const receipts = useAgent((s) => s.receipts);
  const chatImages = useUi((s) => s.chatImages);
  const rememberChatImage = useUi((s) => s.rememberChatImage);
  const [filter, setFilter] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem('museware/receiptFilter');
      return ['Wonder', 'Spark', 'Image', 'Voice'].includes(saved || '') ? saved : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (filter) localStorage.setItem('museware/receiptFilter', filter);
      else localStorage.removeItem('museware/receiptFilter');
    } catch {
      /* storage unavailable */
    }
  }, [filter]);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  useEffect(() => {
    if (!imageForProject) { setAttachmentUrl(''); return; }
    const url = URL.createObjectURL(imageForProject);
    setAttachmentUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageForProject]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  const hiddenThinkingEntries = new Set(
    rail.flatMap((entry) =>
      (entry.card?.kind === 'thinking' || entry.card?.kind === 'progress') &&
      Array.isArray(entry.card.data.entryIds)
        ? entry.card.data.entryIds.filter((id): id is string => typeof id === 'string')
        : [],
    ),
  );
  const visibleRail = rail.filter(
    (entry) =>
      !hiddenThinkingEntries.has(entry.id) &&
      !(entry.role !== 'user' && isKeepalive(entry.text)),
  );
  const visible = showAll ? visibleRail : visibleRail.slice(-VISIBLE);

  // Measure wrapped lines as well as explicit newlines. CSS supplies the
  // responsive height cap; the browser scrolls inside once it is reached.
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    let lastWidth = el.getBoundingClientRect().width;
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            const width = el.getBoundingClientRect().width;
            if (width !== lastWidth) {
              lastWidth = width;
              resize();
            }
          });
    observer?.observe(el);
    return () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [draft, railCollapsed, focused]);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rail.length, liveText, liveLine, busy]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
      setAwayFromLatest(!stickToBottom.current);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const heroId = (() => {
    for (const screen of doc.screens) {
      const stack = [screen.root];
      while (stack.length) {
        const node = stack.pop()!;
        if (node.type === 'hero') return node.id;
        stack.push(...node.children);
      }
    }
    return '';
  })();

  const suggestions = (() => {
    const base = (() => {
      if (!doc.screens.length)
        return ['Design me a landing page website', 'Recreate a screenshot'];
      if (selectedId) return [`Restyle ${selectedId}`, 'Make it feel more premium'];
      if (!doc.blueprint) return ['Propose a blueprint', 'Add a settings screen'];
      if (!doc.blueprint.decided) return ['Approve the blueprint', 'Adjust the plan'];
      return ['Add a settings screen', 'Rerun the review'];
    })();
    // One tap to a real muse-image asset, only where a hero exists to fill.
    if (heroId && doc.screens.length) return [...base.slice(0, 1), 'Illustrate the hero'];
    return base;
  })();

  const send = async (text?: string) => {
    const value = (text ?? draft).slice(0, 8000).trim();
    const attachment = text === undefined ? imageForProject : null;
    if (!value && !attachment) return;
    if (useAgent.getState().busy) {
      toast('muse is already working — Stop first.', 'warn');
      return;
    }
    if (text === undefined) setDraft('');
    const sent = useProject.getState().addRail({ role: 'user', text: value || 'Recreate this screenshot.' });
    if (attachment) rememberChatImage({ entryId: sent.id, projectId, file: attachment });
    stickToBottom.current = true;
    if (attachment) {
      setPendingImage(null);
      await recreateFromScreenshot(attachment, value);
    } else {
      await runAgentTurn(value);
    }
  };

  const coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  if (railCollapsed && !focused) {
    return (
      <aside className="rail" data-collapsed="true">
        <div className="rail-collapsed">
          <button
            type="button"
            className="icon-btn"
            aria-label="Open muse rail"
            onClick={toggleRail}
          >
            <ChevronLeft size={16} />
          </button>
          <Sparkles size={16} className="chat-accent-icon" />
          <span className="eyebrow chat-vertical">muse</span>
          {busy && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Stop"
              onClick={() => stopAgent()}
            >
              <Square size={14} />
            </button>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="rail"
      data-busy={busy || undefined}
      data-open={focused || mobileRailOpen}
      data-chat-focused={focused || undefined}
    >
      <button type="button" className="rail-peek" onClick={() => setMobileRail(true)}>
        <Sparkles size={14} className="chat-accent-icon" />
        <span className="chat-grow chat-align-left">
          {busy
            ? liveLine && !isKeepalive(liveLine)
              ? liveLine
              : 'muse is working…'
            : 'Talk to muse — swipe up'}
        </span>
        {busy && (
          <span
            className="chip"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              stopAgent();
            }}
            onKeyDown={(e) => e.key === 'Enter' && stopAgent()}
          >
            Stop
          </span>
        )}
      </button>
      <div className="rail-header">
        {focused && onMinimize && <button type="button" className="chat-minimize" aria-label="Minimize chat" onClick={onMinimize} tabIndex={minimizing ? -1 : undefined}><X size={20} /></button>}
        <Sparkles size={15} className="chat-accent-icon" />
        <div className="title-row">
          <strong>muse</strong>
          <span>
            <button
              type="button"
              className="link-btn"
              data-tip="One pinned model per role — tap for the matrix"
              onClick={() => setModal('settingsOpen', true)}
            >
              {demoMode
                ? 'local engine'
                : `${(modelMatrix?.builder.id || 'muse-spark-1.3').replace('muse-', '')} · ${
                    modelMatrix?.builder.effort || 'med'
                  }`}
            </button>
            {' · '}
            {money(sessionCents)}
          </span>
        </div>
        {!focused && (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Expand muse chat"
            onClick={() => setChatExpanded(true)}
          >
            <Maximize2 size={15} />
          </button>
        )}
        <Ring value={turnCalls} cap={CALL_CAP} />
        {busy ? (
          <button type="button" className="stop-btn" onClick={() => stopAgent()}>
            <Square size={12} /> Stop
          </button>
        ) : !focused ? (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Collapse rail"
            onClick={() => {
              if (mobileRailOpen) {
                setMobileRail(false);
                return;
              }
              toggleRail();
            }}
          >
            {mobileRailOpen ? <X size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : null}
      </div>

      {focused && <div id="chat-toast-slot" className="chat-toast-slot" />}
      <details className="chat-options"><summary>Models and activity</summary>
      <div className="chat-model-strip">
        <button
          type="button"
          className="chip"
          aria-pressed={wonder}
          onClick={() => setWonder(!wonder)}
        >
          Wonder {wonder ? '· 4x cost' : '· off'}
        </button>
        {['Wonder', 'Spark', 'Image', 'Voice'].map((model) => (
          <button
            key={model}
            type="button"
            className="chip"
            aria-pressed={filter === model}
            data-selected={filter === model}
            onClick={() => setFilter(filter === model ? null : model)}
          >
            {model}
            {receipts.some(
              (r) =>
                r.model.toLowerCase().includes(model.toLowerCase()) ||
                r.role.toLowerCase() === model.toLowerCase(),
            )
              ? ' ●'
              : ''}
          </button>
        ))}
      </div>
      {filter && (
        <div className="chat-receipt-list" aria-label={`${filter} calls`}>
          {receipts
            .filter(
              (r) =>
                r.model.toLowerCase().includes(filter.toLowerCase()) ||
                r.role.toLowerCase() === filter.toLowerCase(),
            )
            .map((r) => (
              <div className="chat-card chat-card--receipt" key={r.id}>
                {r.model} · {r.status || 'success'} · {r.latencyMs}ms
              </div>
            ))}
        </div>
      )}
      </details>
      <div className="rail-body" ref={bodyRef}>
        {projectId &&
          !doc.screens.length &&
          !doc.opLog.length &&
          !doc.rail.length && (
            <div className="sys-pill">{emptyProjectLabel(projectId)}</div>
          )}
        {visibleRail.length > VISIBLE && !showAll && (
          <button
            type="button"
            className="chat-chip chat-load-earlier"
            onClick={() => setShowAll(true)}
          >
            Load earlier ({visibleRail.length - VISIBLE})
          </button>
        )}
        {visible.map((entry) => (
            <RailMessage
              key={entry.id}
              entry={entry}
              fresh={Date.now() - entry.at < 1200}
              image={chatImages.find((item) => item.entryId === entry.id && item.projectId === projectId)?.file}
            />
          ))}
        {(!interruptionCard?.cardId ||
            !rail.some((entry) => entry.id === interruptionCard.cardId)) && (
            <InterruptedCard />
          )}
      </div>

      {awayFromLatest && <button type="button" className="chat-latest chat-chip" onClick={() => { const el = bodyRef.current; if (el) { stickToBottom.current = true; el.scrollTop = el.scrollHeight; setAwayFromLatest(false); } }}>Latest message ↓</button>}
      <div className="composer">
        {!busy && (
          <details className="chat-suggestions" open={rail.length === 0 || undefined}><summary>Suggestions</summary><div className="composer-suggestions">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s}
                className="suggestion chat-chip chat-card chat-card--seed"
                onClick={() => {
                  if (s === 'Recreate a screenshot') fileRef.current?.click();
                  else if (s === 'Illustrate the hero') void generateHeroImage();
                  else void send(s);
                }}
              >
                {s}
              </button>
            ))}
          </div></details>
        )}
        <div className="composer-box" data-expanded={composerExpanded || undefined}>
          {imageForProject && (
            <div className="composer-attachment">
              {attachmentUrl && <img src={attachmentUrl} alt="Attached image preview" />}
              <span>{imageForProject.name}</span>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="Remove attached image" onClick={() => setPendingImage(null)}><X size={15} /></button>
            </div>
          )}
          <textarea
            ref={composerRef}
            value={draft}
            rows={1}
            maxLength={8000}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData('text');
              const element = event.currentTarget;
              const combined =
                draft.slice(0, element.selectionStart) +
                pasted +
                draft.slice(element.selectionEnd);
              if (combined.length > 8000) {
                event.preventDefault();
                setDraft(combined);
              }
            }}
            placeholder={
              doc.screens.length
                ? 'Ask muse, or drag on the canvas — same tree, same undo.'
                : 'Describe the app you want. Blueprint first, always.'
            }
            aria-label="Message muse"
            aria-describedby={draft.length >= 7000 ? 'composer-limit' : undefined}
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !coarsePointer &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="chat-composer-actions">
            <button type="button" className="icon-btn icon-btn-sm" aria-label={composerExpanded ? 'Shrink message box' : 'Expand message box'} onClick={() => setComposerExpanded((v) => !v)}>
              {composerExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label="Recreate from a screenshot"
              data-tip="Screenshot → canvas"
              onClick={() => fileRef.current?.click()}
            >
              <Camera size={15} />
            </button>
            <button
              type="button"
              className="send-btn"
              aria-label="Send"
              disabled={(!draft.trim() && !imageForProject) || busy}
              onClick={() => void send()}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
        {draft.length > 4000 && (
          <div className="field-hint">long message — consider splitting it</div>
        )}
        {draft.length >= 7000 && (
          <div className="field-hint" id="composer-limit">
            {draft.length >= 8000
              ? '8,000-character limit reached'
              : `${(8000 - draft.length).toLocaleString()} characters remaining`}
          </div>
        )}
        {draftTrimmed && (
          <div className="field-hint" role="status">
            message trimmed to the first 8000 characters
          </div>
        )}
        <div className="rail-status chat-composer-status">
          <span
            className={demoMode ? 'badge-dot' : 'badge-dot'}
            data-tone={demoMode ? 'accent' : 'ok'}
          />
          <span className="chat-grow">
            {demoMode
              ? 'Local engine — real pipeline, no key needed. Add a key in Settings for the muse models.'
              : 'Pinned muse models · key stays on the server'}
          </span>
          <button
            type="button"
            className="chat-chip chat-receipts-button"
            onClick={() => setModal('receiptsOpen', true)}
          >
            receipts
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            stageScreenshot(file);
          }}
        />
      </div>
    </aside>
  );
}
