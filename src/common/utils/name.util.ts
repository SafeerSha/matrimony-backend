/**
 * Splits a full name or combined name string into firstName and lastName.
 */
export function splitFullName(
  name?: string | null,
  firstName?: string | null,
  lastName?: string | null,
): { firstName: string; lastName: string } {
  if (firstName && firstName.trim()) {
    return {
      firstName: firstName.trim(),
      lastName: lastName ? lastName.trim() : '',
    };
  }

  if (!name || !name.trim()) {
    return {
      firstName: 'User',
      lastName: '',
    };
  }

  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] || 'User',
    lastName: parts.slice(1).join(' ') || '',
  };
}
