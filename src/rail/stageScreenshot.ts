import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';

/** Keep the image local until the user explicitly sends the composed message. */
export function stageScreenshot(file: File): boolean {
  const ui = useUi.getState();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    ui.toast('Choose a JPEG, PNG, or WebP image.', 'warn');
    return false;
  }
  if (file.size > 5 * 1024 * 1024) {
    ui.toast('Image is too large. Choose one under 5 MB.', 'warn');
    return false;
  }
  ui.setPendingImage({ file, projectId: useProject.getState().projectId });
  return true;
}
