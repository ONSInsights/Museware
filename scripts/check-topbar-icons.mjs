import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/shell/Topbar.tsx', 'utf8');
const ast = ts.createSourceFile(
  'Topbar.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const icons = new Set();
for (const node of ast.statements) {
  if (!ts.isImportDeclaration(node) || node.moduleSpecifier.text !== 'lucide-react')
    continue;
  const names = node.importClause?.namedBindings;
  if (names && ts.isNamedImports(names))
    for (const item of names.elements) icons.add(item.name.text);
}
const counts = new Map();
function walk(node) {
  if (
    (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
    ts.isIdentifier(node.tagName) &&
    icons.has(node.tagName.text)
  ) {
    counts.set(node.tagName.text, (counts.get(node.tagName.text) || 0) + 1);
  }
  ts.forEachChild(node, walk);
}
walk(ast);
const errors = [];
if (/\bLayoutGrid\b/.test(source)) errors.push('LayoutGrid is not allowed in Topbar.tsx');
if (!icons.size) errors.push('No lucide icons found in Topbar.tsx');
for (const icon of icons)
  if (counts.get(icon) !== 1)
    errors.push(`${icon} appears ${counts.get(icon) || 0} times; expected exactly once`);
if (errors.length) {
  console.error(`Topbar icon census failed:\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(`✓ topbar icon census: ${icons.size} icons, each used once; LayoutGrid absent`);
