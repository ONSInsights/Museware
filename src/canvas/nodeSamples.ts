import type { ComponentNode } from '../types/tree';

/** The rows worn by the editor's empty list and table previews. */
export function sampleRows(
  type: ComponentNode['type'],
): Array<{ title: string; detail: string; meta: string }> {
  const seeds =
    type === 'table'
      ? [
          ['Beacon launch', 'Ready', 'Oct 12'],
          ['Signal audit', 'In review', 'Oct 14'],
          ['Warm intro', 'Draft', 'Oct 18'],
        ]
      : [
          ['Morning walk', '6,204 steps', '+12%'],
          ['Deep work', '2h 40m', '+8%'],
          ['Reading', '24 pages', '—'],
          ['Water', '1.8 L', '+5%'],
        ];
  return seeds.map(([title, detail, meta]) => ({ title, detail, meta }));
}
