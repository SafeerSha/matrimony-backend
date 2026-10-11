/**
 * Normalizes phone numbers to international E.164 format.
 * Defaults 10-digit Indian numbers to +91.
 */
export function normalizePhoneNumber(phone?: string | null): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Strip whitespace, hyphens, parentheses, and dots
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '').trim();

  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (digits.startsWith('91') && digits.length === 12) {
      const local = digits.slice(2);
      if (!/^[6-9]\d{9}$/.test(local)) {
        return null;
      }
    }
    if (/^\d{7,15}$/.test(digits)) {
      return `+${digits}`;
    }
  } else if (cleaned.startsWith('00')) {
    const digits = cleaned.slice(2);
    if (/^\d{7,15}$/.test(digits)) {
      return `+${digits}`;
    }
  } else if (/^\d{10}$/.test(cleaned)) {
    // 10 digits standard Indian mobile number, must start with 6-9
    if (!/^[6-9]\d{9}$/.test(cleaned)) {
      return null;
    }
    return `+91${cleaned}`;
  } else if (cleaned.startsWith('91') && cleaned.length === 12 && /^\d+$/.test(cleaned)) {
    const local = cleaned.slice(2);
    if (!/^[6-9]\d{9}$/.test(local)) {
      return null;
    }
    return `+${cleaned}`;
  } else if (/^\d{11,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return null;
}

export function isValidE164(phone?: string | null): boolean {
  if (!phone) return false;
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
