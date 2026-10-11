/**
 * Sanitizes user-supplied text strings:
 * - Strips dangerous HTML tags
 * - Strips control characters
 * - Trims leading and trailing whitespace
 * - Limits max length if specified
 */
export function sanitizeText(val: string | undefined | null, maxLength?: number): string | undefined {
  if (val === undefined || val === null) {
    return undefined;
  }
  let str = String(val);
  // Strip HTML tags
  str = str.replace(/<[^>]*>/g, '');
  // Strip control characters except basic whitespace
  str = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  str = str.trim();
  if (maxLength && str.length > maxLength) {
    str = str.slice(0, maxLength);
  }
  return str.length > 0 ? str : undefined;
}

export function sanitizeStringArray(arr: any, maxItems = 20, maxItemLength = 100): string[] {
  if (!arr) return [];
  let list: any[] = [];
  if (Array.isArray(arr)) {
    list = arr;
  } else if (typeof arr === 'string') {
    try {
      const parsed = JSON.parse(arr);
      if (Array.isArray(parsed)) {
        list = parsed;
      } else {
        list = arr.split(',').map((s) => s.trim());
      }
    } catch {
      list = arr.split(',').map((s) => s.trim());
    }
  }
  return list
    .map((item) => sanitizeText(item, maxItemLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}
