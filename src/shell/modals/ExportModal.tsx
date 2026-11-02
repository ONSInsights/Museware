import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { useProject } from '../../store/useProject';
import { useUi } from '../../store/useUi';
import { downloadZip, downloadTextFile, downloadHtmlFolder } from '../../export/zip';
import { buildSingleHtml } from '../../export/singleFile';
import { assetCensus } from '../../export/assets';
import { PublishGuide } from './PublishGuide';
import { downloadScreenshots } from '../../export/screenshots';
import { installInstructions, manifestFor, serviceWorkerTemplate } from '../../export/pwa';

const CORE_FILES = [
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
  'index.html',
  'src/main.tsx',
  'src/App.tsx',
  'src/runtime.tsx',
  'src/types.ts',
  'src/screens.ts',
  'src/tokens.ts',
  'src/styles.css',
];

export function ExportModal({ onClose }: { onClose: () => void }) {
  const doc = useProject((s) => s.doc);
  const toast = useUi((s) => s.toast);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const install = useMemo(() => installInstructions(doc), [doc]);
  const census = useMemo(() => assetCensus(doc), [doc]);
  // §6.1 legal guard: contributor-tier output trades training consent for a 20x
  // discount, so a production build refuses to export a project shaped by it.
  const blocked = Boolean(doc.builtWithContributor) && !import.meta.env.DEV;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast('Clipboard is blocked in this browser.', 'warn');
    }
  };

  return (
    <Modal
      title="Export the app"
      size="wide"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={blocked || capturing || !doc.screens.length}
            onClick={async () => {
              setCapturing(true);
              try {
                await downloadScreenshots(doc, activeScreenId);
                toast('Screenshots downloaded', 'ok');
              } catch (err) {
                toast(
                  err instanceof Error ? err.message : 'Screenshots could not be created',
                  'warn',
                );
              } finally {
                setCapturing(false);
              }
            }}
          >
            {capturing ? 'Creating screenshots…' : 'Download screenshots'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={blocked}
            onClick={async () => {
              if (blocked) return;
              toast('Zipping the project…');
              await downloadZip(doc);
              toast('Downloaded — npm install && npm run dev', 'ok');
            }}
          >
            <Download size={13} /> {blocked ? 'Export blocked' : 'Download .zip'}
          </Button>
        </>
      }
    >
      {blocked && (
        <div className="insp-section" data-tone="danger">
          <div className="insp-section-head">
            <span className="eyebrow">Export blocked</span>
          </div>
          <p className="field-hint field-hint-warn">
            This project was shaped with the contributor tier (muse-spark-1.3-contributor).
            That tier trades Meta&apos;s training-consent terms for a 20x lower price, so
            its output cannot leave a production build. Open the project in a dev build, or
            rebuild it with the standard models — then export.
          </p>
        </div>
      )}
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">HTML exports</span>
        </div>
        <p className="field-hint">
          {census.inline} images embedded · {census.remote} media load from the internet
          {census.missing ? ` · ${census.missing} missing or placeholder` : ''}
        </p>
        <div className="mw-detail-13">
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked || !doc.screens.length}
            onClick={() => {
              try {
                const html = buildSingleHtml(doc);
                if (new TextEncoder().encode(html).length > 2 * 1024 * 1024)
                  toast('This HTML exceeds 2 MB; consider the HTML folder zip.', 'warn');
                downloadTextFile('index.html', html, 'text/html');
              } catch (err) {
                toast(err instanceof Error ? err.message : 'HTML export failed', 'warn');
              }
            }}
          >
            <Download size={12} /> Single-file HTML
          </Button>
          <span className="field-hint">
            Runs anywhere — no install
            {census.remoteVideo ? ' · needs internet for video' : ''} · rename only if you
            add other pages
          </span>
        </div>
        <div className="mw-detail-13">
          <Button
            size="sm"
            variant="secondary"
            disabled={blocked || !doc.screens.length}
            onClick={async () => {
              try {
                await downloadHtmlFolder(doc);
                toast('HTML folder downloaded', 'ok');
              } catch (err) {
                toast(
                  err instanceof Error ? err.message : 'HTML folder export failed',
                  'warn',
                );
              }
            }}
          >
            <Download size={12} /> HTML folder (zip)
          </Button>
          <span className="field-hint">
            A page and its large embedded images, ready to host.
          </span>
        </div>
      </div>
      <PublishGuide />
      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">What ships</span>
          <span className="faint mono mw-detail-10">React 18 + Vite</span>
        </div>
        <p className="field-hint">
          The export is the same tree, the same token sheet and the same generated CSS the
          canvas renders — no second styling system, no runtime dependency on Museware.
        </p>
        <div className="palette-grid mw-detail-15">
          {CORE_FILES.map((file) => (
            <span className="chip chip-static mono mw-detail-16" key={file}>
              <FileCode2 size={11} /> {file}
            </span>
          ))}
        </div>
        <p className="field-hint">
          Plus <span className="mono">public/manifest.webmanifest</span>,{' '}
          <span className="mono">public/sw.js</span>, icons and a README with the install
          steps. The bundle contains no API key — it is a static app.
        </p>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">PWA pieces</span>
        </div>
        <div className="mw-detail-13">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadTextFile('manifest.webmanifest', manifestFor(doc), 'application/json')
            }
          >
            <Download size={12} /> manifest
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              downloadTextFile('sw.js', serviceWorkerTemplate(), 'text/javascript')
            }
          >
            <Download size={12} /> service worker
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copy('manifest', manifestFor(doc))}
          >
            {copied === 'manifest' ? <Check size={12} /> : <Copy size={12} />} copy manifest
          </Button>
        </div>
        <pre className="blueprint-text mw-detail-17">{install}</pre>
      </div>

      <div className="insp-section">
        <div className="insp-section-head">
          <span className="eyebrow">Run it</span>
        </div>
        <pre className="blueprint-text">
          {`npm install
npm run dev     # Vite prints the local URL
npm run build   # static files in dist/`}
        </pre>
        <p className="field-hint">
          {doc.screens.length} screen{doc.screens.length === 1 ? '' : 's'} ·{' '}
          {doc.screens.length} routes · tokens {doc.tokens.title}
        </p>
      </div>
    </Modal>
  );
}
