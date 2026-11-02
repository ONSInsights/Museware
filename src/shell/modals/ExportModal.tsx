import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Modal, Button } from '../../components/ui';
import { useProject } from '../../store/useProject';
import { useUi } from '../../store/useUi';
import { downloadZip, downloadTextFile, downloadHtmlFolder } from '../../export/zip';
import { buildSingleHtml } from '../../export/singleFile';
import { assetCensus } from '../../export/assets';
import {
  downloadDisabled,
  downloadLabel,
  loadExportFormat,
  recommendedFormat,
  saveExportFormat,
  type ExportFormat,
} from '../../export/exportFormat';
import { PublishGuide } from './PublishGuide';
import { downloadScreenshots } from '../../export/screenshots';

const formats: Array<{
  value: ExportFormat;
  title: string;
  description: string;
  best: string;
}> = [
  {
    value: 'single',
    title: 'Website — one file',
    description: 'One index.html. Share it, email it, double-click it.',
    best: 'Best for sharing a lightweight website.',
  },
  {
    value: 'folder',
    title: 'Website — folder (zip)',
    description: 'A folder with the page and its images. Best for hosting.',
    best: 'Best for larger embedded images and hosting.',
  },
  {
    value: 'react',
    title: 'React project (zip)',
    description: 'Real code for developers. Build and host it anywhere.',
    best: 'Best for developers who want to work with the code.',
  },
];

export function ExportModal({ onClose }: { onClose: () => void }) {
  const projectId = useProject((s) => s.projectId);
  const epoch = useProject((s) => s.documentEpoch);
  return (
    <ExportModalForProject
      key={projectId || `session:${epoch}`}
      onClose={onClose}
      projectId={projectId}
      epoch={epoch}
    />
  );
}
function ExportModalForProject({
  onClose,
  projectId,
  epoch,
}: {
  onClose: () => void;
  projectId: string | null;
  epoch: number;
}) {
  const doc = useProject((s) => s.doc);
  const toast = useUi((s) => s.toast);
  const activeScreenId = useUi((s) => s.activeScreenId);
  const [capturing, setCapturing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const census = useMemo(() => assetCensus(doc), [doc]);
  const recommended = recommendedFormat(census);
  const [format, setFormat] = useState<ExportFormat | null>(
    () => loadExportFormat(projectId, epoch) || recommended,
  );
  const blocked = Boolean(doc.builtWithContributor) && !import.meta.env.DEV;
  const selectFormat = (next: ExportFormat) => {
    setFormat(next);
    saveExportFormat(projectId, epoch, next);
  };
  const download = async () => {
    if (downloadDisabled(format, blocked, !doc.screens.length, downloading)) return;
    setDownloading(true);
    try {
      if (format === 'single') {
        const html = buildSingleHtml(doc);
        if (new TextEncoder().encode(html).length > 2 * 1024 * 1024)
          toast('This HTML exceeds 2 MB; consider the HTML folder zip.', 'warn');
        downloadTextFile('index.html', html, 'text/html');
      } else if (format === 'folder') {
        await downloadHtmlFolder(doc);
        toast('HTML folder downloaded', 'ok');
      } else if (format === 'react') {
        await downloadZip(doc);
        toast('React project downloaded', 'ok');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'warn');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Modal
      title="Export the app"
      className="export-modal"
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
            className="export-download"
            variant="primary"
            size="sm"
            disabled={downloadDisabled(format, blocked, !doc.screens.length, downloading)}
            onClick={() => void download()}
          >
            <Download size={13} />{' '}
            {downloading ? 'Preparing download…' : downloadLabel(format)}
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
            This project was shaped with the contributor tier. Its output cannot leave a
            production build; rebuild it with the standard models to export.
          </p>
        </div>
      )}
      <section className="insp-section" aria-label="Choose a format">
        <div className="insp-section-head">
          <span className="eyebrow">Choose a format</span>
        </div>
        <p className="field-hint">
          {census.inline} images {format === 'single' ? 'embedded' : 'in assets/'} ·{' '}
          {census.remote} need internet
          {census.missing ? ` · ${census.missing} missing or placeholder` : ''}
        </p>
        <fieldset className="export-format-list">
          <legend className="sr-only">Export format</legend>
          {formats.map((item) => (
            <div
              className="export-format-card"
              data-selected={format === item.value}
              key={item.value}
            >
              <label className="export-format-choice">
                <input
                  type="radio"
                  name="exportFormat"
                  value={item.value}
                  checked={format === item.value}
                  onChange={() => selectFormat(item.value)}
                />
                <span className="export-format-text">
                  <span className="export-format-title">
                    {item.title}
                    {recommended === item.value && (
                      <span className="export-recommended">Recommended</span>
                    )}
                  </span>
                  <span>{item.description}</span>
                  <span className="field-hint">{item.best}</span>
                </span>
              </label>
              {item.value === 'react' && (
                <details className="export-react-details">
                  <summary>What ships in the React project</summary>
                  <p className="field-hint">
                    React 18 and Vite, the same tree, tokens and generated CSS, plus a
                    GitHub Pages workflow and README. No Museware key is included.
                  </p>
                </details>
              )}
            </div>
          ))}
        </fieldset>
        {format === 'single' && (
          <p className="field-hint">
            Rename index.html only if you add other pages alongside it.
          </p>
        )}
        {census.remoteVideo && <p className="field-hint">Needs internet for video.</p>}
        {!format && <p className="field-hint">Choose a format above</p>}
      </section>
      <PublishGuide key={format || recommended} format={format || recommended} />
    </Modal>
  );
}
