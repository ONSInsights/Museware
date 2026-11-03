import { useId } from 'react';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import {
  projectAppearance,
  storedAppearance,
  type ProjectAppearance,
} from './projectAppearance';

/** Project setting is saved; preview override is temporary and never affects export. */
export function ProjectAppearanceControls() {
  const id = useId();
  const mode = useProject((state) =>
    projectAppearance(state.doc.tokens.openuiTheme.theme_mode),
  );
  const epoch = useProject((state) => state.documentEpoch);
  const preview = useUi((state) => state.projectPreview);
  const setPreview = useUi((state) => state.setProjectPreview);
  const toast = useUi((state) => state.toast);
  const previewMode = preview.epoch === epoch ? preview.mode : 'project';
  return (
    <div className="project-appearance-controls">
      <label htmlFor={`${id}-project`}>Project appearance</label>
      <select
        id={`${id}-project`}
        className="select"
        value={mode}
        onChange={(event) => {
          const value = event.target.value as ProjectAppearance;
          const result = useProject
            .getState()
            .applyBatch(
              [{ op: 'setTokens', patch: { theme_mode: storedAppearance(value) } }],
              { source: 'user' },
            );
          if (result.errors.length) toast(result.errors[0].message, 'warn');
        }}
      >
        <option value="auto">Auto — follow viewer’s device</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <label htmlFor={`${id}-preview`}>Preview appearance</label>
      <select
        id={`${id}-preview`}
        className="select"
        value={previewMode}
        onChange={(event) => setPreview(event.target.value as 'project' | 'light' | 'dark')}
      >
        <option value="project">Project setting</option>
        <option value="light">Preview light</option>
        <option value="dark">Preview dark</option>
      </select>
      <p className="field-hint">
        Preview is temporary. Downloads use the project appearance, not the preview or
        editor theme.
      </p>
    </div>
  );
}
