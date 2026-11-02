import { useEffect, useRef, useState } from 'react';
import { spec } from '../types/library';
import type { MockRow, ProjectDoc, ScreenDoc } from '../types/tree';
import { walk } from '../ops/treeUtils';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { DataDrawer } from './DataDrawer';
import { ExpandContent } from './ContentEditor';

const CANONICAL = ['title', 'detail', 'meta'];
const VALID_KEY = /^[a-z][a-z0-9_]{0,30}$/;

/** Only expose a text representation when editing it cannot discard data. */
export function inlineRowKeys(rows: MockRow[]): string[] | null {
  if (!rows.length) return CANONICAL;
  const keys = Object.keys(rows[0]);
  if (!keys.length || keys.length > 3) return null;
  for (const row of rows) {
    const rowKeys = Object.keys(row);
    if (rowKeys.length !== keys.length || keys.some((key) => !Object.hasOwn(row, key)))
      return null;
    for (const key of keys) {
      const value = row[key];
      if (typeof value !== 'string' || value.trim() !== value || /[|\r\n]/.test(value))
        return null;
    }
    if (keys.every((key) => row[key] === '')) return null;
  }
  return keys;
}
export function formatRows(rows: MockRow[], keys: string[]): string {
  return rows.map((row) => keys.map((key) => row[key]).join(' | ')).join('\n');
}
export function parseRows(text: string, keys: string[], existing: boolean): MockRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 100) throw new Error('A dataset can have at most 100 rows.');
  const values = lines.map((line) => line.split('|').map((field) => field.trim()));
  if (values.some((row) => row.length > keys.length))
    throw new Error(
      `Use at most ${keys.length} fields per row. Open the field editor for more.`,
    );
  const count = existing ? keys.length : Math.max(0, ...values.map((row) => row.length));
  return values.map((row) =>
    Object.fromEntries(keys.slice(0, count).map((key, i) => [key, row[i] ?? ''])),
  );
}
function widgetsUsing(screen: ScreenDoc, dataKey: string): number {
  let count = 0;
  walk(screen.root, (node) => {
    const definition = spec(node.type);
    const declared = definition?.props.some(
      (prop) =>
        prop.kind === 'dataset' &&
        String(node.props[prop.key] ?? definition.defaultProps[prop.key] ?? '') === dataKey,
    );
    // Accordion consumes screen rows too, but keeps its existing direct editor.
    // Older list/table/chart documents can also use the renderer's bindKey fallback.
    const rendererReads =
      ['list', 'table', 'chart', 'accordion'].includes(node.type) &&
      String(node.props.dataKey || node.props.bindKey || '') === dataKey;
    if (declared || rendererReads) count++;
  });
  return count;
}
function seededByMuse(doc: ProjectDoc, screenId: string, key: string): boolean {
  return doc.opLog.some(
    (entry) =>
      entry.source === 'agent' &&
      entry.batch.some((op) =>
        op.op === 'setMockData'
          ? op.screenId === screenId && op.key === key
          : op.op === 'addScreen' &&
            op.screen?.id === screenId &&
            Boolean(op.screen.mockData && Object.hasOwn(op.screen.mockData, key)),
      ),
  );
}

export function DataBlock({
  screen,
  dataKey,
  doc,
}: {
  screen: ScreenDoc;
  dataKey: string;
  doc: ProjectDoc;
}) {
  const rows =
    dataKey && screen.mockData && Object.hasOwn(screen.mockData, dataKey)
      ? screen.mockData[dataKey]
      : undefined;
  const data = rows || [];
  const keys = inlineRowKeys(data);
  const serialized = keys ? formatRows(data, keys) : '';
  const signature = JSON.stringify(data);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const base = useRef(signature);
  const dirty = useRef(false);
  const overlayOpen = useRef(false);
  useEffect(() => {
    if (!drawer) return;
    useUi.getState().setInspectorDrawerOpen(true);
    return () => useUi.getState().setInspectorDrawerOpen(false);
  }, [drawer]);
  const valid = VALID_KEY.test(dataKey);
  const users = dataKey ? widgetsUsing(screen, dataKey) : 0;
  const shared = dataKey && (users > 1 || seededByMuse(doc, screen.id, dataKey));
  useEffect(() => {
    if (!dirty.current && !overlayOpen.current) {
      setDraft(serialized);
      base.current = signature;
      setError('');
    }
  }, [signature, serialized]);
  const commit = (value = draft): string | void => {
    if (!dirty.current || !keys || !valid) return;
    const currentScreen = useProject
      .getState()
      .doc.screens.find((item) => item.id === screen.id);
    const currentRows =
      currentScreen?.mockData && Object.hasOwn(currentScreen.mockData, dataKey)
        ? currentScreen.mockData[dataKey]
        : [];
    if (JSON.stringify(currentRows) !== base.current) {
      const message =
        'Rows changed elsewhere. Reopen this editor to review the latest data.';
      setError(message);
      return message;
    }
    try {
      const next = parseRows(value, keys, data.length > 0);
      if (JSON.stringify(next) !== signature) {
        const result = useProject
          .getState()
          .applyBatch(
            [{ op: 'setMockData', screenId: screen.id, key: dataKey, rows: next }],
            { source: 'user' },
          );
        if (result.errors.length) throw new Error(result.errors[0].message);
      }
      dirty.current = false;
      base.current = JSON.stringify(next);
      setDraft(formatRows(next, inlineRowKeys(next) || keys));
      setError('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save rows.';
      setError(message);
      return message;
    }
  };
  return (
    <section className="data-block" aria-label={`Data rows for ${dataKey || 'dataset'}`}>
      <div className="data-block-head">
        <strong>DATA ROWS · {data.length}</strong>
        {valid && (
          <button type="button" className="link-btn" onClick={() => setDrawer(!drawer)}>
            {drawer ? 'Close field editor' : 'Field editor'}
          </button>
        )}
      </div>
      {shared && (
        <div className="field-hint">
          shared dataset · {dataKey} · used by {users} {users === 1 ? 'widget' : 'widgets'}
        </div>
      )}
      {!valid ? (
        <>
          {!data.length && (
            <p className="field-hint">No rows yet — the canvas is showing samples</p>
          )}
          <p className="field-hint">Enter a valid data key to edit rows.</p>
        </>
      ) : !keys ? (
        <p className="field-hint">Advanced fields — open the data editor</p>
      ) : (
        <>
          {!data.length && (
            <>
              <p className="field-hint">No rows yet — the canvas is showing samples</p>
              <div className="data-block-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => textarea.current?.focus()}
                >
                  Add rows
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    useUi
                      .getState()
                      .startPrompt(
                        `Fill ${dataKey} with 5-8 realistic rows for this screen`,
                      )
                  }
                >
                  Ask muse
                </button>
              </div>
            </>
          )}
          <div className="content-field-wrap">
            <textarea
              ref={textarea}
              className="textarea"
              aria-label={`Data rows for ${dataKey}`}
              rows={4}
              value={draft}
              placeholder="Title | Detail | Meta"
              onChange={(event) => {
                if (!dirty.current) base.current = signature;
                dirty.current = true;
                setDraft(event.target.value);
                setError('');
              }}
              onBlur={() => {
                if (!overlayOpen.current) commit();
              }}
            />
            <ExpandContent
              title="DATA ROWS"
              value={draft}
              feedback="rows"
              fieldRef={textarea}
              onOpen={() => {
                overlayOpen.current = true;
                if (!dirty.current) base.current = signature;
              }}
              onClose={() => {
                overlayOpen.current = false;
                if (!dirty.current) {
                  const latest = useProject
                    .getState()
                    .doc.screens.find((item) => item.id === screen.id)?.mockData;
                  const current =
                    latest && Object.hasOwn(latest, dataKey) ? latest[dataKey] : [];
                  const currentKeys = inlineRowKeys(current);
                  base.current = JSON.stringify(current);
                  setDraft(currentKeys ? formatRows(current, currentKeys) : '');
                }
              }}
              onSave={(next) => {
                dirty.current = true;
                setDraft(next);
                return commit(next);
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit()}
          >
            Save rows
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="field-hint">
          {error}
        </p>
      )}
      {drawer && valid && (
        <DataDrawer
          screenId={screen.id}
          dataKey={dataKey}
          onClose={() => setDrawer(false)}
        />
      )}
    </section>
  );
}
