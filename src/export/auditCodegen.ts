/** Shared banned patterns for generated markup, including React and flat HTML. */
export function auditCodegen(markup: string): void {
  const forbidden = [
    /<\s*(?:script|iframe|object|embed|base)\b/i,
    /\s(?:srcdoc)\s*=/i,
    /(?:href|src|action)\s*=\s*["']\s*javascript:/i,
    /dangerouslySetInnerHTML\s*=/i,
  ];
  if (forbidden.some((pattern) => pattern.test(markup)))
    throw new Error('Export blocked: unsafe markup in generated page.');
}
/** Static HTML cannot contain inline event handlers either. */
export function auditFlattenedDom(markup: string): void {
  auditCodegen(markup);
  if (/\son[a-z]+\s*=/i.test(markup))
    throw new Error('Export blocked: unsafe markup in generated page.');
}
