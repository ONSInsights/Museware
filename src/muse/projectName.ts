import { useProject } from '../store/useProject';

/** Called only after a successful first build; user-selected names are sticky. */
export function nameProjectAfterBuild(): boolean {
  const { doc, setName, addRail } = useProject.getState();
  if (doc.name !== 'Untitled project' || doc.projectNameLocked) return false;
  const entry = doc.screens.find((screen) => screen.entry);
  if (!entry?.root.children.length) return false;
  const name = entry.name
    .trim()
    .replace(/(?:\s+(?:landing|page|screen))+$/i, '')
    .trim()
    .slice(0, 40)
    .trim();
  if (!name || /^(?:landing|page|screen)$/i.test(name)) return false;
  setName(name);
  addRail({
    role: 'system',
    text: `Project named "${name}" — rename anytime in the topbar.`,
  });
  return true;
}
