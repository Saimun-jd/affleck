const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export function requireExternalUrl(
  value: string,
  message = "Use a valid HTTP or HTTPS URL.",
): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) {
      throw new Error(message);
    }
  } catch {
    throw new Error(message);
  }
  return trimmed;
}

export function isExternalUrl(value: string): boolean {
  try {
    requireExternalUrl(value);
    return true;
  } catch {
    return false;
  }
}
