import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { clone } from '../ops/treeUtils';
import type { OpenUiTheme } from '../types/tokens';
import { BUILTIN_THEMES } from './themeLibrary';

/** Compare full themes, independent of object key order, so selection is truthful. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function sameTheme(a: OpenUiTheme, b: OpenUiTheme): boolean {
  return canonical(a) === canonical(b);
}

export function applyDesignSystem(name: string, theme: OpenUiTheme): boolean {
  const store = useProject.getState();
  const previous = clone(store.doc.tokens);
  const result = store.applyBatch(
    [{ op: 'setTokens', replace: true, patch: { openuiTheme: clone(theme), title: name } }],
    { source: 'user' },
  );
  if (result.errors.length) {
    useUi.getState().toast(result.errors[0].message, 'warn');
    return false;
  }
  const current = useProject.getState();
  const group = current.undoStack[current.undoStack.length - 1];
  const epoch = current.documentEpoch;
  useUi.getState().toast(`Applied ${name} —`, 'ok', {
    label: 'Undo',
    run: () => {
      if (!useProject.getState().undoTheme(group, epoch, previous))
        useUi
          .getState()
          .toast('Undo is no longer the latest edit; nothing was undone.', 'warn');
    },
  });
  return true;
}

export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const doc = useProject((s) => s.doc);
  const render = (item: { name: string; theme: OpenUiTheme }, key: string) => (
    <button
      type="button"
      key={key}
      className={compact ? 'preset-card-mini' : 'preset-card mw-detail-14'}
      data-selected={sameTheme(doc.tokens.openuiTheme, item.theme)}
      onClick={() => applyDesignSystem(item.name, item.theme)}
    >
      <span className="preset-swatches">
        {[
          item.theme.brand_color,
          item.theme.secondary_color,
          item.theme.light_colors.openui_bg,
        ].map((color, i) => (
          <svg aria-hidden="true" key={i}>
            <rect width="100%" height="100%" fill={color} />
          </svg>
        ))}
      </span>
      <strong>{item.name}</strong>
    </button>
  );
  return (
    <>
      {!!doc.themeLibrary?.length && (
        <>
          <span className="eyebrow">FROM THIS PROJECT</span>
          <div className={compact ? 'swatch-grid' : 'mw-detail-13'}>
            {doc.themeLibrary.map((entry, i) => render(entry, `project-${i}`))}
          </div>
        </>
      )}
      <div className={compact ? 'swatch-grid' : 'mw-detail-13'}>
        {BUILTIN_THEMES.map((entry) => render(entry, entry.id))}
      </div>
    </>
  );
}
