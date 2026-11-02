import { placeholderImage } from '../canvas/placeholder';
import { clone, walk } from '../ops/treeUtils';
import type { ProjectDoc } from '../types/tree';

/** Make the canvas's empty image boxes real assets on an export-only copy. */
export function fillPlaceholderArt(input: ProjectDoc): ProjectDoc {
  const doc = clone(input);
  for (const screen of doc.screens) {
    walk(screen.root, (node) => {
      if (node.type !== 'image' || node.props.src || node.props.image) return;
      const aspect = String(node.styles.aspectRatio || '').match(
        /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/,
      );
      const ratio =
        aspect && Number(aspect[2])
          ? Number(aspect[1]) / Number(aspect[2])
          : Number(node.props.assetAspectWidth) > 0 &&
              Number(node.props.assetAspectHeight) > 0
            ? Number(node.props.assetAspectWidth) / Number(node.props.assetAspectHeight)
            : 16 / 10;
      node.props.src = placeholderImage(doc.tokens, {
        seed: node.id,
        width: Math.max(1, Math.round(420 * Math.min(10, Math.max(0.1, ratio)))),
        height: 420,
        variant: 'wide',
      });
    });
  }
  return doc;
}
