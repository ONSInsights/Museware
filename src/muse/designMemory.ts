/** Project-owned, bounded memory. Never infer preferences: retain explicit user words. */
export function appendDesignNote(notes: string[] | undefined, line: string): string[] {
  const clean = line.trim().slice(0, 240);
  if (!clean) return (notes || []).slice(-30);
  return [
    ...(notes || []).filter((note) => note.toLowerCase() !== clean.toLowerCase()),
    clean,
  ].slice(-30);
}
export function preferenceNote(text: string, id = 'global'): string | null {
  const trimmed = text.trim();
  return /\b(always|never|keep|must stay)\b/i.test(trimmed)
    ? `${id}: user preference: ${trimmed.slice(0, 140)}`
    : null;
}
