import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Button } from '../../components/ui';
import { useUi } from '../../store/useUi';
import type { ExportFormat } from '../../export/exportFormat';

type Flow = 'pages' | 'drop' | 'import';
interface Step {
  action: string;
  detail: ReactNode;
  url: string;
  ready: string;
  expected?: string;
}

/** Guided manual publishing only. In-product publishing is a post-hackathon
 * GitHub App / Vercel token feature handled server-side; no credentials pass through Museware. */
export function PublishGuide({ format = 'single' }: { format?: ExportFormat }) {
  const [flow, setFlow] = useState<Flow>('pages');
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState('');
  const toast = useUi((s) => s.toast);
  const choose = (next: Flow) => {
    setFlow(next);
    setStep(0);
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      toast('Clipboard is blocked in this browser.', 'warn');
    }
  };
  const upload =
    format === 'single'
      ? 'Upload the downloaded index.html.'
      : format === 'folder'
        ? 'Extract the site folder zip, then upload its contents including index.html and assets if present.'
        : 'Extract the React zip and upload its contents, including the hidden .github folder.';
  const pages: Step[] = [
    {
      action: 'Create a repository',
      detail: 'Name your repository and choose Create.',
      url: 'https://github.com/new',
      ready: 'You can see your new, empty repository.',
    },
    {
      action: 'Upload your website',
      detail: <>{upload} Choose “uploading an existing file”, then commit the files.</>,
      url: 'https://github.com',
      ready: 'Your files appear in the repository.',
    },
    {
      action: 'Turn on GitHub Pages',
      detail:
        format === 'react'
          ? 'Open your repository’s Settings → Pages and choose GitHub Actions as the Source. If the first workflow failed before Pages was enabled, rerun it.'
          : 'Open your repository’s Settings → Pages. Choose Deploy from a branch, select main and / (root), then Save.',
      url: 'https://github.com',
      ready:
        'Pages shows the site URL after the deployment finishes; it can take a few minutes.',
      expected: 'https://username.github.io/repo-name/',
    },
  ];
  const drop: Step[] = [
    {
      action: 'Open Vercel Drop',
      detail: 'Sign in to keep the deployment; GitHub can be used to sign in.',
      url: 'https://vercel.com/drop',
      ready: 'You can see the page for dropping a file or folder.',
    },
    {
      action: 'Add your export',
      detail:
        format === 'single'
          ? 'Drop your downloaded index.html onto the page.'
          : format === 'folder'
            ? 'Extract the site folder zip first, then drop the extracted folder with index.html at its root.'
            : 'Extract the React project zip first, then drop the extracted project folder. Vercel detects and builds Vite projects when signed in.',
      url: 'https://vercel.com/drop',
      ready: 'Your file or folder appears in Vercel.',
    },
    {
      action: 'Deploy your site',
      detail: 'Choose a team and project name if asked, then select Deploy.',
      url: 'https://vercel.com/drop',
      ready: 'Vercel shows a live link after the deployment completes.',
      expected: 'https://project.vercel.app',
    },
  ];
  const importing: Step[] = [
    {
      action: 'Create a GitHub repository',
      detail: 'Name the repository and choose Create.',
      url: 'https://github.com/new',
      ready: 'Your empty repository is visible.',
    },
    {
      action: 'Upload and commit your export',
      detail: upload,
      url: 'https://github.com',
      ready: 'Your committed files appear in the repository.',
    },
    {
      action: 'Import and deploy on Vercel',
      detail:
        format === 'react'
          ? 'Import your repository and choose Deploy. Vercel detects Vite automatically. Future Git pushes automatically redeploy: change it in Museware, re-upload and commit to GitHub, and the site updates itself.'
          : 'Import your repository and choose Deploy. Future Git pushes automatically redeploy: re-upload and commit your changes to GitHub to update the site.',
      url: 'https://vercel.com/new',
      ready: 'Vercel shows a live link after deployment.',
      expected: 'https://project.vercel.app',
    },
  ];
  const current = (flow === 'pages' ? pages : flow === 'drop' ? drop : importing)[step];
  return (
    <section className="insp-section" aria-label="Publish">
      <div className="insp-section-head">
        <span className="eyebrow">Publish</span>
      </div>
      <p className="field-hint">
        GitHub Pages and Vercel both host free — same result, different steps. The React zip
        includes a .github workflow for GitHub only; Vercel never needs it.
      </p>
      <p className="field-hint">
        Guided publishing — no credentials are entered into Museware.
      </p>
      <div role="group" aria-label="Which flow?" className="publish-decider">
        <span className="field-hint">Which flow?</span>
        <button
          type="button"
          className="chip"
          aria-pressed={flow === 'pages'}
          data-selected={flow === 'pages'}
          onClick={() => choose('pages')}
        >
          One file to share
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={flow === 'drop'}
          data-selected={flow === 'drop'}
          onClick={() => choose('drop')}
        >
          Live in 10 seconds
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={flow === 'import'}
          data-selected={flow === 'import'}
          onClick={() => choose('import')}
        >
          A project that updates on push
        </button>
      </div>
      <div className="publish-step-card">
        <div className="publish-step-header">
          <strong>
            {flow === 'pages'
              ? 'GitHub Pages'
              : flow === 'drop'
                ? 'Vercel Drop'
                : 'GitHub → Vercel'}
          </strong>
          <span className="field-hint">{step + 1} of 3</span>
        </div>
        <div className="publish-dots" role="img" aria-label={`Step ${step + 1} of 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} data-active={i === step} />
          ))}
        </div>
        <div className="publish-step-content" aria-live="polite">
          <strong>{current.action}</strong>
          <p>{current.detail}</p>
          <span className="publish-copy">
            <a href={current.url} target="_blank" rel="noopener noreferrer">
              {current.url.replace('https://', '')}
            </a>
            <button
              type="button"
              className="icon-btn icon-btn-sm"
              aria-label={`Copy ${current.url}`}
              onClick={() => void copy(current.url)}
            >
              <Copy size={12} />
            </button>
          </span>
          <p className="field-hint">
            You’ll know it worked when{' '}
            {current.ready.charAt(0).toLowerCase() + current.ready.slice(1)}
          </p>
          {current.expected && (
            <p className="field-hint">
              Expected URL: <code>{current.expected}</code>{' '}
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                aria-label={`Copy ${current.expected}`}
                onClick={() => void copy(current.expected!)}
              >
                <Copy size={12} />
              </button>{' '}
              (replace the example names).
            </p>
          )}
        </div>
        <div className="publish-step-actions">
          {step > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setStep((i) => i - 1)}>
              Back
            </Button>
          )}
          {step < 2 && (
            <Button variant="primary" size="sm" onClick={() => setStep((i) => i + 1)}>
              Next step →
            </Button>
          )}
        </div>
        <span className="field-hint" role="status">
          {copied ? `Copied ${copied}` : ''}
        </span>
      </div>
    </section>
  );
}
