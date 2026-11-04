import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { Action, ScreenDoc } from '../types/tree';
import { useEffect, useId, useState } from 'react';
import { useProject } from '../store/useProject';
import { boundKeys } from '../ops/treeUtils';
import { parseStateValue } from './stateValue';

/** The WHEN/THEN chip editor — pickers only, zero code (§4.2). */
const KINDS: Array<{ value: Action['type']; label: string }> = [
  { value: 'navigate', label: 'Go to screen' },
  { value: 'setState', label: 'Set a value' },
  { value: 'toggle', label: 'Toggle a value' },
  { value: 'toast', label: 'Show a toast' },
  { value: 'openUrl', label: 'Open link / WhatsApp' },
  { value: 'submitWebhook', label: 'Submit to Webhook / API' },
];

const WHEN: { value: Action['type']; label: string } = { value: 'when', label: 'When…' };

function blankAction(type: Action['type'], screens: ScreenDoc[]): Action {
  switch (type) {
    case 'navigate':
      return { type: 'navigate', to: screens[1]?.id || screens[0]?.id || 'home' };
    case 'setState':
      return { type: 'setState', key: 'value', value: '' };
    case 'toggle':
      return { type: 'toggle', key: 'on' };
    case 'toast':
      return { type: 'toast', text: 'Done' };
    case 'openUrl':
      return { type: 'openUrl', url: 'https://', target: '_blank' };
    case 'submitWebhook':
      return {
        type: 'submitWebhook',
        url: 'https://',
        method: 'POST',
        successToast: 'Submitted successfully!',
        clearOnSuccess: true,
      };
    case 'when':
      return { type: 'when', key: 'on', equals: true, then: [] };
    default:
      return { type: 'toast', text: 'Done' };
  }
}

export function ActionEditor({
  actions,
  screens,
  onChange,
  depth = 0,
}: {
  actions: Action[];
  screens: ScreenDoc[];
  onChange: (next: Action[]) => void;
  depth?: number;
}) {
  const replace = (index: number, action: Action) => {
    const next = [...actions];
    next[index] = action;
    onChange(next);
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= actions.length) return;
    const next = [...actions];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };
  const remove = (index: number) => onChange(actions.filter((_, i) => i !== index));
  const add = (type: Action['type']) => onChange([...actions, blankAction(type, screens)]);

  return (
    <div className="events-list">
      {actions.map((action, index) => (
        <ActionRow
          key={`${action.type}-${index}`}
          action={action}
          screens={screens}
          depth={depth}
          onChange={(next) => replace(index, next)}
          onUp={() => move(index, -1)}
          onDown={() => move(index, 1)}
          onRemove={() => remove(index)}
        />
      ))}
      <div className="mw-detail-1">
        {[...KINDS, WHEN].map((kind) => (
          <button
            type="button"
            key={kind.value}
            className="chip mw-detail-2"
            onClick={() => add(kind.value)}
          >
            <Plus size={11} /> {kind.label}
          </button>
        ))}
      </div>
      {actions.length === 0 && <p className="field-hint">No additional actions set.</p>}
    </div>
  );
}

function ActionRow({
  action,
  screens,
  onChange,
  onUp,
  onDown,
  onRemove,
  depth,
}: {
  action: Action;
  screens: ScreenDoc[];
  onChange: (next: Action) => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  depth: number;
}) {
  return (
    <div className="event-block">
      <div className="event-head">
        <select
          className="select mw-detail-3"
          value={action.type}
          aria-label="Action kind"
          onChange={(e) => onChange(blankAction(e.target.value as Action['type'], screens))}
        >
          {[...KINDS, ...(depth === 0 ? [WHEN] : [])].map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
        <span className="mw-detail-4" />
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label="Move up"
          onClick={onUp}
        >
          <ArrowUp size={11} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label="Move down"
          onClick={onDown}
        >
          <ArrowDown size={11} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          aria-label="Remove action"
          onClick={onRemove}
        >
          <Trash2 size={11} />
        </button>
      </div>
      <ActionArgs action={action} screens={screens} onChange={onChange} depth={depth} />
    </div>
  );
}

function StateValueInput({
  value,
  label,
  placeholder,
  onCommit,
}: {
  value: unknown;
  label: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const text = value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const commit = () => onCommit(draft);
  return (
    <input
      className="input mw-detail-5"
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}

function ActionArgs({
  action,
  screens,
  onChange,
  depth,
}: {
  action: Action;
  screens: ScreenDoc[];
  onChange: (next: Action) => void;
  depth: number;
}) {
  const doc = useProject((s) => s.doc);
  const keys = boundKeys(doc);
  const listId = useId();
  const keyPicker = (key: string) => (
    <>
      <datalist id={listId}>
        {keys.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <div className="mw-detail-1">
        {keys.map((k) => (
          <button
            type="button"
            className="chip"
            key={k}
            onClick={() => {
              if (
                action.type === 'setState' ||
                action.type === 'toggle' ||
                action.type === 'when'
              )
                onChange({ ...action, key: k });
            }}
            aria-pressed={key === k}
          >
            {k}
          </button>
        ))}
      </div>
    </>
  );
  switch (action.type) {
    case 'navigate':
      return (
        <select
          className="select mw-detail-2"
          value={action.to}
          aria-label="Target screen"
          onChange={(e) => onChange({ type: 'navigate', to: e.target.value })}
        >
          {screens.map((screen) => (
            <option key={screen.id} value={screen.id}>
              {screen.name} ({screen.id})
            </option>
          ))}
        </select>
      );
    case 'setState':
      return (
        <div className="set-state-args mw-detail-6">
          {keyPicker(action.key)}
          <div className="set-state-inputs mw-detail-7">
            <label className="set-state-field">
              <span>Key</span>
              <input
                list={listId}
                className="input mw-detail-5"
                value={action.key}
                aria-label="State key"
                placeholder="key"
                onChange={(e) =>
                  onChange({ type: 'setState', key: e.target.value, value: action.value })
                }
              />
            </label>
            <label className="set-state-field">
              <span>Value</span>
              <StateValueInput
                value={action.value as string | number | boolean}
                label="State value"
                placeholder="value"
                onCommit={(value) =>
                  onChange({
                    type: 'setState',
                    key: action.key,
                    value: parseStateValue(value),
                  })
                }
              />
            </label>
          </div>
        </div>
      );
    case 'toggle':
      return (
        <div>
          {keyPicker(action.key)}
          <input
            list={listId}
            className="input mw-detail-2"
            value={action.key}
            aria-label="State key"
            placeholder="key"
            onChange={(e) => onChange({ type: 'toggle', key: e.target.value })}
          />
        </div>
      );
    case 'toast':
      return (
        <input
          className="input mw-detail-2"
          value={action.text}
          aria-label="Toast text"
          placeholder="Saved!"
          onChange={(e) => onChange({ type: 'toast', text: e.target.value })}
        />
      );
    case 'openUrl':
      return (
        <div className="mw-detail-8" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            className="input mw-detail-2"
            value={action.url}
            aria-label="URL"
            placeholder="https://wa.me/1234567890?text=Hi%20{name}"
            onChange={(e) => onChange({ ...action, url: e.target.value })}
          />
          <div className="mw-detail-1" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button
              type="button"
              className="chip"
              onClick={() =>
                onChange({
                  ...action,
                  url: 'https://wa.me/PHONE_NUMBER?text=Hi%20there,%20I%20am%20{name}:%20{message}',
                  target: '_blank',
                })
              }
            >
              + WhatsApp Preset
            </button>
            <button
              type="button"
              className="chip"
              onClick={() =>
                onChange({
                  ...action,
                  url: 'mailto:you@example.com?subject=Inquiry%20from%20{name}&body={message}',
                  target: '_blank',
                })
              }
            >
              + Email (mailto) Preset
            </button>
          </div>
          {keys.length > 0 && (
            <div>
              <span className="field-hint" style={{ display: 'block', marginBottom: 2 }}>
                Insert bound field:
              </span>
              <div className="mw-detail-1" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {keys.map((k) => (
                  <button
                    type="button"
                    key={k}
                    className="chip"
                    onClick={() => {
                      const token = `{${k}}`;
                      onChange({
                        ...action,
                        url: `${action.url}${action.url.endsWith('=') || action.url.endsWith('/') || action.url.endsWith(' ') ? '' : ' '}${token}`,
                      });
                    }}
                  >
                    {`{${k}}`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Target:
              <select
                className="select mw-detail-3"
                style={{ width: 'auto' }}
                value={action.target || '_blank'}
                onChange={(e) =>
                  onChange({ ...action, target: e.target.value as '_blank' | '_self' })
                }
              >
                <option value="_blank">New tab (_blank)</option>
                <option value="_self">Same tab (_self)</option>
              </select>
            </label>
          </div>
        </div>
      );
    case 'submitWebhook': {
      const isGoogleScript = /script\.google\.com/i.test(action.url);
      const copyScriptSnippet = () => {
        const snippet = `function doPost(e) {\n  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  sheet.appendRow([new Date(), JSON.stringify(e.parameter)]);\n  return ContentService.createTextOutput("OK");\n}`;
        navigator.clipboard?.writeText(snippet);
        alert('Google Apps Script snippet copied to clipboard! Paste it into Extensions > Apps Script in your Google Sheet.');
      };
      return (
        <div className="mw-detail-8" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="set-state-field">
            <span>Endpoint URL</span>
            <input
              className="input mw-detail-2"
              value={action.url}
              aria-label="Webhook URL"
              placeholder="https://script.google.com/macros/s/.../exec"
              onChange={(e) => onChange({ ...action, url: e.target.value })}
            />
          </label>
          {isGoogleScript && (
            <div className="field-hint" style={{ color: 'var(--openui-accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>✓ Google Apps Script detected (auto no-cors POST)</span>
              <button
                type="button"
                className="chip"
                onClick={copyScriptSnippet}
              >
                Copy Sheet Script
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="set-state-field" style={{ flex: 1 }}>
              <span>Method</span>
              <select
                className="select mw-detail-3"
                value={action.method || 'POST'}
                onChange={(e) => onChange({ ...action, method: e.target.value as 'POST' | 'GET' })}
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
            </label>
            <label className="set-state-field" style={{ flex: 1 }}>
              <span>CORS Mode</span>
              <select
                className="select mw-detail-3"
                value={action.mode || (isGoogleScript ? 'no-cors' : 'cors')}
                onChange={(e) => onChange({ ...action, mode: e.target.value as 'cors' | 'no-cors' })}
              >
                <option value="cors">Standard CORS</option>
                <option value="no-cors">No-CORS (Google Apps Script)</option>
              </select>
            </label>
          </div>
          <label className="set-state-field">
            <span>Success Toast</span>
            <input
              className="input mw-detail-5"
              value={action.successToast ?? 'Submitted successfully!'}
              placeholder="Submitted successfully!"
              onChange={(e) => onChange({ ...action, successToast: e.target.value })}
            />
          </label>
          <label className="set-state-field">
            <span>Error Toast</span>
            <input
              className="input mw-detail-5"
              value={action.errorToast ?? 'Submission failed.'}
              placeholder="Submission failed."
              onChange={(e) => onChange({ ...action, errorToast: e.target.value })}
            />
          </label>
          <label className="set-state-field">
            <span>Go to screen on success (optional)</span>
            <select
              className="select mw-detail-2"
              value={action.navigateOnSuccess || ''}
              onChange={(e) => onChange({ ...action, navigateOnSuccess: e.target.value || undefined })}
            >
              <option value="">(None — stay on screen)</option>
              {screens.map((screen) => (
                <option key={screen.id} value={screen.id}>
                  {screen.name} ({screen.id})
                </option>
              ))}
            </select>
          </label>
          <label className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginTop: 4 }}>
            <input
              type="checkbox"
              checked={action.clearOnSuccess !== false}
              onChange={(e) => onChange({ ...action, clearOnSuccess: e.target.checked })}
            />
            Clear form inputs on success
          </label>
        </div>
      );
    }
    case 'when':
      return (
        <div className="mw-detail-8">
          {keyPicker(action.key)}
          <div className="mw-detail-9">
            <input
              className="input mw-detail-2"
              value={action.key}
              list={listId}
              aria-label="Condition key"
              placeholder="key"
              onChange={(e) => onChange({ ...action, key: e.target.value })}
            />
            <StateValueInput
              value={action.equals}
              label="Equals"
              placeholder="equals (blank = truthy)"
              onCommit={(value) =>
                onChange({
                  ...action,
                  equals: value === '' ? undefined : parseStateValue(value),
                })
              }
            />
          </div>
          <span className="field-hint">Then:</span>
          {depth < 1 ? (
            <ActionEditor
              actions={action.then}
              screens={screens}
              depth={depth + 1}
              onChange={(then) => onChange({ ...action, then })}
            />
          ) : (
            <p className="field-hint">Nested conditions stop at two levels.</p>
          )}
        </div>
      );
    default:
      return null;
  }
}
