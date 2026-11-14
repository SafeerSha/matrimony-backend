/**
 * High-Security Input Sanitization Utility
 * Protects against:
 * - Cross-Site Scripting (XSS - stored, reflected, nested tags, event handlers, pseudoprotocols)
 * - Prototype Pollution (__proto__, constructor, prototype)
 * - Control character injection / Null byte injection
 * - Unicode homoglyph / Bidirectional Trojan attacks
 * - Buffer / memory exhaustion via excessive string lengths
 */

const PASSWORD_OR_SECRET_KEYS = new Set([
  'password',
  'oldpassword',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'refreshtoken',
  'accesstoken',
  'token',
  'otp',
  'codehash',
  'signature',
  'secret',
  'clientsecret',
]);

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Regex for dangerous pseudoprotocols (e.g. javascript:, vbscript:, data:text/html)
const DANGEROUS_PROTOCOLS = /(javascript|vbscript|data\s*:\s*text\/html)\s*:/gi;

// Regex for inline HTML event handlers (e.g. onerror=, onload=, onclick=)
const EVENT_HANDLER_REGEX = /\bon\w+\s*=/gi;

// Control characters excluding standard newlines and tabs (\t = \u0009, \n = \u000A, \r = \u000D)
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// Bidirectional override characters (Trojan Source attacks)
const BIDI_CHARS_REGEX = /[\u202A-\u202E\u2066-\u2069]/g;

/**
 * Robustly sanitizes a user-supplied text string:
 * - Removes null bytes and control characters
 * - Strips bidirectional Trojan override characters
 * - Normalizes unicode (NFKC)
 * - Iteratively removes HTML tags (prevents nested bypasses like <<script>script>)
 * - Neutralizes inline event handlers and dangerous URI protocols
 * - Trims whitespace and caps maximum length
 */
export function sanitizeText(val: string | undefined | null, maxLength = 10000): string | undefined {
  if (val === undefined || val === null) {
    return undefined;
  }

  let str = String(val);

  // 1. Strip null bytes and dangerous control characters
  str = str.replace(CONTROL_CHARS_REGEX, '');

  // 2. Strip Unicode direction override characters (Trojan Source)
  str = str.replace(BIDI_CHARS_REGEX, '');

  // 3. Normalize Unicode to canonical equivalence
  try {
    str = str.normalize('NFKC');
  } catch {
    // Fallback if normalize fails
  }

  // 4. Iteratively strip HTML tags to defeat nested tag evasion (e.g. <<script>script>)
  let previous = '';
  let iterations = 0;
  const maxIterations = 5;
  while (str !== previous && iterations < maxIterations) {
    previous = str;
    str = str.replace(/<[^>]*>?/gm, '');
    iterations++;
  }

  // 5. Neutralize dangerous script pseudoprotocols and inline event handlers
  str = str.replace(DANGEROUS_PROTOCOLS, '');
  str = str.replace(EVENT_HANDLER_REGEX, 'no_handler=');

  // 6. Trim leading and trailing whitespace
  str = str.trim();

  // 7. Enforce maximum length limit to prevent memory/storage exhaustion
  if (maxLength && str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  return str.length > 0 ? str : undefined;
}

/**
 * Sanitizes an array of strings (e.g. tags, hobbies, locations).
 */
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

/**
 * Recursively sanitizes all string properties in an object or array.
 * Automatically excludes password, token, and secret fields.
 * Protects against Prototype Pollution by dropping forbidden keys.
 */
export function sanitizeObject<T = any>(obj: T, depth = 0): T {
  // Prevent stack overflow on deeply nested payloads
  if (depth > 10 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return (sanitizeText(obj) ?? '') as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1)) as unknown as T;
  }

  if (typeof obj === 'object') {
    // If not a plain object (e.g. Date, Buffer, RegExp), return as-is
    if (obj instanceof Date || obj instanceof RegExp || Buffer.isBuffer(obj)) {
      return obj;
    }

    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const normalizedKey = key.trim().toLowerCase();

      // Guard against Prototype Pollution
      if (FORBIDDEN_OBJECT_KEYS.has(normalizedKey)) {
        continue;
      }

      // Do NOT strip HTML or modify passwords/tokens/secrets
      if (PASSWORD_OR_SECRET_KEYS.has(normalizedKey)) {
        if (typeof value === 'string') {
          // Only strip null bytes from passwords/secrets
          clean[key] = value.replace(/\0/g, '').slice(0, 1024);
        } else {
          clean[key] = value;
        }
        continue;
      }

      if (typeof value === 'string') {
        clean[key] = sanitizeText(value) ?? '';
      } else if (typeof value === 'object' && value !== null) {
        clean[key] = sanitizeObject(value, depth + 1);
      } else {
        clean[key] = value;
      }
    }
    return clean as T;
  }

  return obj;
}

/**
 * Checks if a string contains known high-risk injection patterns (for monitoring/alerting).
 */
export function containsMaliciousPattern(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  const lower = val.toLowerCase();
  return (
    lower.includes('<script') ||
    lower.includes('javascript:') ||
    lower.includes('onerror=') ||
    lower.includes('onload=') ||
    lower.includes('union select') ||
    lower.includes('--') ||
    lower.includes('/*')
  );
}

