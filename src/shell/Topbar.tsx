import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Download,
  Home,
  Moon,
  MoreHorizontal,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Square,
  Sun,
  Undo2,
} from 'lucide-react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { IconButton, Menu } from '../components/ui';
import {
  addScreenBatch,
  deleteScreenBatch,
  duplicateScreenBatch,
  renameScreenBatch,
} from '../ops/screenOps';
import { stopAgent } from '../muse/loop';
import { closeProject, downloadProjectFile, readProjectFile } from '../persist/save';
import { parseProjectDoc } from '../persist/schema';

export function Topbar() {
  const doc = useProject((s) => s.doc);
  const applyBatch = useProject((s) => s.applyBatch);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const undoDepth = useProject((s) => s.undoStack.length);
  const redoDepth = useProject((s) => s.redoStack.length);
  const setName = useProject((s) => s.setName);
  const replaceDoc = useProject((s) => s.replaceDoc);
  const busy = useAgent((s) => s.busy);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const setActiveScreen = useUi((s) => s.setActiveScreen);
  const select = useUi((s) => s.select);
  const setRunMode = useUi((s) => s.setRunMode);
  const setMobileRail = useUi((s) => s.setMobileRail);
  const setModal = useUi((s) => s.setModal);
  const setRoute = useUi((s) => s.setRoute);
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const toast = useUi((s) => s.toast);
  const [menu, setMenu] = useState<'screen' | 'file' | 'muse' | 'more' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [saved, setSaved] = useState(false);
  const [width, setWidth] = useState(() => window.innerWidth);
  const [hiddenTabs, setHiddenTabs] = useState(0);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeId = activeScreenId || doc.screens[0]?.id;
  const historyOverflow = width <= 900;
  const utilitiesOverflow = width <= 1100;
  const homeOverflow = width <= 700;

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => setSaved(true), 1400);
    return () => window.clearTimeout(timer);
  }, [doc.updatedAt]);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const measure = () => {
      const bounds = tabs.getBoundingClientRect();
      setTabsOverflow(tabs.scrollWidth > tabs.clientWidth + 1);
      setHiddenTabs(
        Array.from(tabs.querySelectorAll<HTMLElement>('.screen-tab')).filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.right <= bounds.left + 1 || rect.left >= bounds.right - 1;
        }).length,
      );
    };
    const active = tabs.querySelector<HTMLElement>('.screen-tab[data-active="true"]');
    if (active && tabs.clientWidth) {
      const area = tabs.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      if (rect.width > area.width) tabs.scrollLeft += rect.left - area.left;
      else if (rect.left < area.left) tabs.scrollLeft -= area.left - rect.left;
      else if (rect.right > area.right) tabs.scrollLeft += rect.right - area.right;
    }
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(tabs);
    Array.from(tabs.children).forEach((child) => observer?.observe(child));
    tabs.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      tabs.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [activeId, doc.screens, width, hiddenTabs > 0]);

  const run = (ops: unknown[], ok?: string) => {
    const res = applyBatch(ops, { source: 'user' });
    if (res.errors.length) {
      toast(res.errors[0].message, 'warn');
      return false;
    }
    if (ok) toast(ok);
    return true;
  };
  const addScreen = () => {
    if (!run(addScreenBatch(doc, `Screen ${doc.screens.length + 1}`), 'Screen added'))
      return;
    const created = useProject.getState().doc.screens.slice(-1)[0];
    if (created) {
      setActiveScreen(created.id);
      select(null);
    }
  };
  const current = doc.screens.find((screen) => screen.id === activeId);
  const home = () => {
    void closeProject(useProject.getState().projectId)
      .then(() => setRoute('projects'))
      .catch(() => toast('Could not save this project.', 'warn'));
  };
  const openMuse = () => setMobileRail(true);
  const cycleTheme = () =>
    setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark');
  const exportActions = (
    <>
      <button
        type="button"
        onClick={() => {
          setMenu(null);
          setModal('exportOpen', true);
        }}
      >
        Export the app…
      </button>
      <button
        type="button"
        onClick={() => {
          setMenu(null);
          downloadProjectFile(doc);
        }}
      >
        Download project .json
      </button>
      <button
        type="button"
        onClick={() => {
          setMenu(null);
          importRef.current?.click();
        }}
      >
        Import project .json
      </button>
    </>
  );
  const museActions = (
    <>
      <button
        type="button"
        onClick={() => {
          setMenu(null);
          openMuse();
        }}
      >
        Open muse
      </button>
      <button
        type="button"
        onClick={() => {
          setMenu(null);
          setModal('receiptsOpen', true);
        }}
      >
        Receipts
      </button>
      <button
        type="button"
        onClick={() => {
          setMenu(null);
          setModal('settingsOpen', true);
        }}
      >
        Settings &amp; models
      </button>
    </>
  );
  return (
    <header className="topbar">
      <button
        type="button"
        className="brand"
        aria-label="Museware — back to the start page"
        title="Back to the start page"
        onClick={() => setRoute('landing')}
      >
        <svg
          className="brand-mark"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3z" />
          <path d="M19 16v4M17 18h4" />
        </svg>
        <span className="brand-word">
          museware<em>.</em>
        </span>
      </button>
      <div className="project-name mw-shell-util-2">
        <input
          value={doc.name}
          aria-label="Project name"
          title="Double-click to rename"
          readOnly={!editingProjectName}
          onDoubleClick={() => setEditingProjectName(true)}
          onBlur={() => setEditingProjectName(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !editingProjectName) setEditingProjectName(true);
            else if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
          onChange={(e) => setName(e.target.value)}
          className="project-name-input"
        />
        <span className="faint mono mw-shell-util-3" title="Autosaved to this browser">
          {saved ? 'saved' : 'saving…'}
        </span>
      </div>
      <div className="screen-switcher">
        <div className="screen-tabs-clip" data-overflow={tabsOverflow}>
          <div className="screen-tabs" ref={tabsRef}>
            {doc.screens.map((screen) => (
              <button
                type="button"
                key={screen.id}
                className="screen-tab"
                data-active={screen.id === activeId}
                title={`${screen.name} · ${screen.id}${screen.entry ? ' · entry' : ''}`}
                onClick={() => {
                  setActiveScreen(screen.id);
                  select(null);
                }}
                onDoubleClick={() => {
                  setRenaming(screen.id);
                  setRenameValue(screen.name);
                }}
              >
                {screen.entry && <span className="badge-dot" data-tone="ok" />}
                {renaming === screen.id ? (
                  <input
                    className="input mw-shell-util-4"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => {
                      const next = renameValue.trim();
                      setRenaming(null);
                      if (next && next !== screen.name)
                        run(renameScreenBatch(doc, screen.id, next));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  screen.name
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="screens-menu-anchor mw-shell-util-2">
          {hiddenTabs > 0 && (
            <button
              type="button"
              className="screen-overflow-count"
              aria-label={`${hiddenTabs} hidden screens`}
              onClick={() => setMenu(menu === 'screen' ? null : 'screen')}
            >
              +{hiddenTabs}
            </button>
          )}
          <IconButton
            label="Screens menu"
            size="sm"
            active={menu === 'screen'}
            onClick={() => setMenu(menu === 'screen' ? null : 'screen')}
          >
            <Plus size={14} />
          </IconButton>
          <Menu open={menu === 'screen'} onClose={() => setMenu(null)} align="left">
            {doc.screens.map((screen) => (
              <button
                type="button"
                key={screen.id}
                aria-current={screen.id === activeId ? 'page' : undefined}
                onClick={() => {
                  setActiveScreen(screen.id);
                  select(null);
                  setMenu(null);
                }}
              >
                {screen.id === activeId ? '✓ ' : ''}
                {screen.name}
              </button>
            ))}
            {!doc.screens.length && (
              <button type="button" disabled>
                No screens yet
              </button>
            )}
            <hr />
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                addScreen();
              }}
            >
              Add screen
            </button>
            <button
              type="button"
              disabled={!current}
              onClick={() => {
                setMenu(null);
                if (
                  current &&
                  run(duplicateScreenBatch(doc, current.id), 'Screen duplicated')
                ) {
                  const created = useProject.getState().doc.screens.slice(-1)[0];
                  if (created) setActiveScreen(created.id);
                }
              }}
            >
              Duplicate current
            </button>
            <button
              type="button"
              disabled={!current}
              onClick={() => {
                setMenu(null);
                if (current) {
                  setRenaming(current.id);
                  setRenameValue(current.name);
                }
              }}
            >
              Rename current
            </button>
            <button
              type="button"
              className="danger"
              disabled={!current || doc.screens.length <= 1}
              onClick={() => {
                setMenu(null);
                if (
                  current &&
                  run(deleteScreenBatch(doc, current.id), 'Screen removed — ⌘Z restores it')
                ) {
                  const next = useProject.getState().doc.screens[0];
                  if (next) setActiveScreen(next.id);
                }
              }}
            >
              Delete current
            </button>
          </Menu>
        </div>
      </div>
      {!homeOverflow && (
        <IconButton label="Projects home" size="sm" disabled={busy} onClick={home}>
          <Home size={15} />
        </IconButton>
      )}
      <span className="topbar-spacer" />
      {!historyOverflow && (
        <span className="topbar-history mw-shell-util-5">
          <IconButton
            label={`Undo${undoDepth ? ` (${undoDepth})` : ''}`}
            size="sm"
            disabled={!undoDepth}
            onClick={() => undo()}
          >
            <Undo2 size={15} />
          </IconButton>
          <IconButton
            label={`Redo${redoDepth ? ` (${redoDepth})` : ''}`}
            size="sm"
            disabled={!redoDepth}
            onClick={() => redo()}
          >
            <Redo2 size={15} />
          </IconButton>
        </span>
      )}
      <div className="topbar-right">
        {busy ? (
          <button
            type="button"
            className="stop-btn"
            onClick={stopAgent}
            title="Stop the agent"
            aria-label="Stop the agent"
          >
            <Square size={12} /> Stop
          </button>
        ) : (
          <button
            type="button"
            className="run-btn"
            onClick={() =>
              doc.screens.length
                ? setRunMode(true, activeId)
                : toast('Create or generate a screen first to run the app', 'warn')
            }
            title={doc.screens.length ? 'Run the app (⌘⏎)' : 'Start with a prompt'}
            aria-label={doc.screens.length ? 'Run the app' : 'Start with a prompt'}
          >
            <Play size={13} fill="currentColor" strokeWidth={0} /> Run
          </button>
        )}
        {!utilitiesOverflow && (
          <>
            <div className="mw-shell-util-2">
              <IconButton
                label="Muse menu"
                size="sm"
                active={menu === 'muse'}
                onClick={() => setMenu(menu === 'muse' ? null : 'muse')}
              >
                <Sparkles size={15} />
              </IconButton>
              <Menu open={menu === 'muse'} onClose={() => setMenu(null)}>
                {museActions}
              </Menu>
            </div>
            <div className="mw-shell-util-2">
              <IconButton
                label="Project file"
                size="sm"
                active={menu === 'file'}
                onClick={() => setMenu(menu === 'file' ? null : 'file')}
              >
                <Download size={15} />
              </IconButton>
              <Menu open={menu === 'file'} onClose={() => setMenu(null)}>
                {exportActions}
              </Menu>
            </div>
          </>
        )}
        <div className="topbar-overflow mw-shell-util-2">
          <IconButton
            label="More actions"
            size="sm"
            active={menu === 'more'}
            onClick={() => setMenu(menu === 'more' ? null : 'more')}
          >
            <MoreHorizontal size={16} />
          </IconButton>
          <Menu open={menu === 'more'} onClose={() => setMenu(null)}>
            {historyOverflow && (
              <>
                <button
                  type="button"
                  disabled={!undoDepth}
                  onClick={() => {
                    undo();
                    setMenu(null);
                  }}
                >
                  Undo
                </button>
                <button
                  type="button"
                  disabled={!redoDepth}
                  onClick={() => {
                    redo();
                    setMenu(null);
                  }}
                >
                  Redo
                </button>
                <hr />
              </>
            )}
            {homeOverflow && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setMenu(null);
                  home();
                }}
              >
                Projects home
              </button>
            )}
            {utilitiesOverflow && (
              <>
                {museActions}
                <hr />
                {exportActions}
                <hr />
              </>
            )}
            <button
              type="button"
              onClick={() => {
                cycleTheme();
                setMenu(null);
              }}
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />} Theme: {theme}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('shortcutsOpen', true);
              }}
            >
              Keyboard shortcuts
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null);
                setModal('onboardingOpen', true);
              }}
            >
              About Museware
            </button>
          </Menu>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const parsed = parseProjectDoc(await readProjectFile(file));
              replaceDoc(parsed);
              const first = parsed.screens.find((s) => s.entry) || parsed.screens[0];
              if (first) setActiveScreen(first.id);
              toast('Project imported', 'ok');
            } catch (err) {
              toast(
                err instanceof Error ? err.message : 'Could not read that file',
                'danger',
              );
            }
          }}
        />
      </div>
    </header>
  );
}
