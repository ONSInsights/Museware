import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { armReveals, enterPanel } from './reveal';
import type { ProjectDoc, ScreenDoc } from '../types/tree';
import { NodeBody } from './NodeBody';
import { generateFullCss } from './cssGen';
import { materializeCss, screenLookVariables } from '../design/materialize';
import { useResolvedCanvasTheme } from '../design/theme';
import { RuntimeContext, type RuntimeApi } from '../preview/runtime';

export function CanvasStyle({
  doc,
  scope,
  editScope = false,
  scrollModel,
}: {
  doc: ProjectDoc;
  scope?: string;
  editScope?: boolean;
  scrollModel?: 'phone' | 'web';
}) {
  const css = useMemo(
    () =>
      `${materializeCss(doc.tokens, scope)}\n${generateFullCss(doc, { editScope, scrollModel: scrollModel || (editScope ? 'web' : 'phone') })}`,
    [doc, scope, editScope, scrollModel],
  );
  return <style data-museware-css>{css}</style>;
}

export function NodeView({
  doc,
  screen,
  mode = 'edit',
  runtime,
  noMotionArm = false,
}: {
  doc: ProjectDoc;
  screen: ScreenDoc;
  mode?: 'edit' | 'run';
  runtime?: RuntimeApi | null;
  noMotionArm?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const previousScreen = useRef(screen.id);
  useLayoutEffect(() => {
    if (mode === 'run' && !noMotionArm && previousScreen.current !== screen.id)
      enterPanel(root.current);
    previousScreen.current = screen.id;
  }, [mode, noMotionArm, screen.id]);
  useLayoutEffect(
    () => (mode === 'run' ? armReveals(root.current, { noArm: noMotionArm }) : undefined),
    [mode, noMotionArm, screen.id],
  );
  const theme = useResolvedCanvasTheme(doc.tokens.openuiTheme.theme_mode);
  return (
    <div className="mw-css-root">
      <div
        className="mw-app"
        ref={root}
        data-theme={theme}
        data-screen-id={screen.id}
        style={screenLookVariables(screen.root.props) as CSSProperties}
      >
        {mode === 'run' && runtime ? (
          <RuntimeContext.Provider value={runtime}>
            <NodeBody node={screen.root} doc={doc} mode="run" screenId={screen.id} />
          </RuntimeContext.Provider>
        ) : (
          <NodeBody node={screen.root} doc={doc} mode={mode} screenId={screen.id} />
        )}
      </div>
    </div>
  );
}
