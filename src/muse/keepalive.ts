/** Internal transport chatter never belongs in the conversation. */
export function isKeepalive(text: string): boolean {
  return /still working|silence is normal/i.test(text);
}
