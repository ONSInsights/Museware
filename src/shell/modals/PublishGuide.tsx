import { useState } from 'react';
import { Copy } from 'lucide-react';
import { useUi } from '../../store/useUi';

type Flow = 'pages' | 'drop' | 'import';

/** Guided manual publishing only. In-product publishing is a post-hackathon
 * GitHub App / Vercel token feature handled server-side; no credentials pass through Museware. */
export function PublishGuide() {
  const [flow, setFlow] = useState<Flow>('pages');
  const [open, setOpen] = useState<'github' | 'vercel' | null>(null);
  const [copied, setCopied] = useState('');
  const toast = useUi((s) => s.toast);
  const choose = (next: Flow) => {
    setFlow(next);
    setOpen(next === 'pages' ? 'github' : 'vercel');
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      toast('Clipboard is blocked in this browser.', 'warn');
    }
  };
  const value = (label: string, text = label) => (
    <span className="publish-copy">
      <code>{label}</code>
      <button
        type="button"
        className="icon-btn icon-btn-sm"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        onClick={() => void copy(text)}
      >
        <Copy size={12} />
      </button>
    </span>
  );
  return (
    <section className="insp-section" aria-label="Publish">
      <div className="insp-section-head">
        <span className="eyebrow">Publish</span>
      </div>
      <p className="field-hint">
        Guided publishing — no credentials are entered into Museware.
      </p>
      <div role="group" aria-label="Which flow?" className="publish-decider">
        <span className="field-hint">Which flow?</span>
        <button
          type="button"
          className="chip"
          aria-pressed={flow === 'pages'}
          onClick={() => choose('pages')}
        >
          One file to share
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={flow === 'drop'}
          onClick={() => choose('drop')}
        >
          Live in 10 seconds
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={flow === 'import'}
          onClick={() => choose('import')}
        >
          A project that updates on push
        </button>
      </div>
      <div className="publish-grid">
        <div className="publish-card">
          <div className="publish-card-head">
            <a href="https://github.com/new" target="_blank" rel="noopener noreferrer">
              GitHub Pages
            </a>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              aria-expanded={open === 'github'}
              onClick={() => setOpen(open === 'github' ? null : 'github')}
            >
              Steps
            </button>
          </div>
          {open === 'github' && (
            <div className="publish-details">
              <h4 data-selected={flow === 'pages'}>Flow 1 — GitHub Pages</h4>
              <ol>
                <li>
                  Open{' '}
                  <a
                    href="https://github.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    github.com/new
                  </a>{' '}
                  {value('github.com/new', 'https://github.com/new')}, name your repository
                  (for example {value('repo-name')}) and choose Create.
                </li>
                <li>
                  Choose “uploading an existing file”. Drag in {value('index.html')} or the
                  extracted HTML folder contents, then commit the upload.
                </li>
                <li>
                  Open Settings → Pages. Set Source to {value('Deploy from a branch')},
                  select {value('main')} and {value('/ (root)')}, then Save. GitHub displays
                  your URL when ready, typically {value('username.github.io/repo-name/')}{' '}
                  (replace the placeholders).
                </li>
              </ol>
              <p className="field-hint">
                React zip: upload the extracted project, including its hidden{' '}
                {value('.github')} folder, and set Settings → Pages → Source to{' '}
                {value('GitHub Actions')}. The included workflow builds and publishes it.
              </p>
            </div>
          )}
        </div>
        <div className="publish-card">
          <div className="publish-card-head">
            <a href="https://vercel.com/new" target="_blank" rel="noopener noreferrer">
              Vercel
            </a>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              aria-expanded={open === 'vercel'}
              onClick={() => setOpen(open === 'vercel' ? null : 'vercel')}
            >
              Steps
            </button>
          </div>
          {open === 'vercel' && (
            <div className="publish-details">
              <h4 data-selected={flow === 'drop'}>Flow 2 — Vercel drag-and-drop</h4>
              <ol>
                <li>
                  Open{' '}
                  <a
                    href="https://vercel.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    vercel.com/new
                  </a>{' '}
                  {value('vercel.com/new', 'https://vercel.com/new')} and sign in with
                  GitHub. Alternatively use{' '}
                  <a
                    href="https://vercel.com/drop"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Vercel Drop
                  </a>{' '}
                  {value('vercel.com/drop', 'https://vercel.com/drop')}.
                </li>
                <li>
                  Extract the HTML folder zip first. Drag the extracted folder, with{' '}
                  {value('index.html')} at its root, onto the page.
                </li>
                <li>
                  Choose Deploy. Vercel provides a live URL such as{' '}
                  {value('project.vercel.app')}.
                </li>
              </ol>
              <h4 data-selected={flow === 'import'}>
                Flow 3 — GitHub repo → Vercel import
              </h4>
              <ol>
                <li>
                  Create a GitHub repository as in Flow 1, then upload and commit the
                  extracted React zip contents.
                </li>
                <li>
                  Open{' '}
                  <a
                    href="https://vercel.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    vercel.com/new
                  </a>{' '}
                  {value('vercel.com/new', 'https://vercel.com/new')} and import that
                  repository. Vercel detects Vite automatically.
                </li>
                <li>
                  Choose Deploy. Future Git pushes automatically redeploy: change it in
                  Museware, re-upload and commit to GitHub, and the site updates itself.
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
      <span className="field-hint" role="status">
        {copied ? `Copied ${copied}` : ''}
      </span>
    </section>
  );
}
