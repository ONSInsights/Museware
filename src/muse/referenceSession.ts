import type { ProjectDoc } from '../types/tree';

// No image bytes or reference identifiers are written to the project document.
const marker =
  'Screenshot reference is session-only. After refresh or switching projects, send it again before building this plan.';
let reference: { epoch: number; blueprint: string; image: string } | null = null;
let screenshotAbort: AbortController | null = null;
export const screenshotReferenceNotice = marker;
export function rememberReference(epoch: number, blueprint: string, image: string) {
  reference = { epoch, blueprint, image };
}
export function getReference(epoch: number, blueprint: string): string | null {
  return reference?.epoch === epoch && reference.blueprint === blueprint
    ? reference.image
    : null;
}
export function updateReference(epoch: number, before: string, after: string) {
  if (reference?.epoch === epoch && reference.blueprint === before)
    reference.blueprint = after;
}
export function clearReference(epoch: number, blueprint: string) {
  if (reference?.epoch === epoch && reference.blueprint === blueprint) reference = null;
}
/** The existing visible chat notice links the immediately following plan card, without a schema change. */
export function isReferenceBlueprint(doc: ProjectDoc, _blueprint: string): boolean {
  for (let i = doc.rail.length - 1; i >= 0; i--) {
    const card = doc.rail[i].card;
    if (card?.kind !== 'blueprint') continue;
    return doc.rail[i - 1]?.role === 'system' && doc.rail[i - 1]?.text === marker;
  }
  return false;
}
export function setScreenshotAbort(controller: AbortController | null) {
  screenshotAbort = controller;
}
export function stopScreenshot() {
  screenshotAbort?.abort();
}
