export function isMarriageCategory(
  category?: string | null,
  profileFor?: string | null,
): boolean {
  const cat = (category || '').toLowerCase().trim();
  const pf = (profileFor || '').toLowerCase().trim();
  if (
    cat.includes('friend') ||
    pf.includes('friend') ||
    cat.includes('live') ||
    cat.includes('living') ||
    pf.includes('live') ||
    pf.includes('living')
  ) {
    return false;
  }
  return true;
}

export function getOppositeGender(gender?: string | null): 'Male' | 'Female' | null {
  const g = (gender || '').toLowerCase().trim();
  if (g === 'female' || g === 'woman' || g === 'women') return 'Male';
  if (g === 'male' || g === 'man' || g === 'men') return 'Female';
  return null;
}

const BARE_GENDER_TOKENS = new Set([
  'male',
  'female',
  'man',
  'woman',
  'men',
  'women',
  'bride',
  'groom',
]);

export function normalizeMarriageLookingFor(params: {
  category?: string | null;
  profileFor?: string | null;
  gender?: string | null;
  lookingFor?: string | null;
}): string | null | undefined {
  if (!isMarriageCategory(params.category, params.profileFor)) {
    return params.lookingFor;
  }

  const opposite = getOppositeGender(params.gender);
  if (!opposite) {
    return params.lookingFor;
  }

  const rawLookingFor = (params.lookingFor || '').trim();
  if (!rawLookingFor || BARE_GENDER_TOKENS.has(rawLookingFor.toLowerCase())) {
    return opposite;
  }

  return params.lookingFor;
}

