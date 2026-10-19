/**
 * Matrimonial Compatibility Engine
 * Calculates deterministic, multi-factor compatibility scores (0 - 100%)
 * between a viewing user (preferences) and a candidate profile.
 */

function parseStringOrArray(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((item) => String(item).trim().toLowerCase())
      .filter((s) => s.length > 0 && s !== 'any' && s !== 'open to all' && s !== "doesn't matter");
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim().toLowerCase())
          .filter((s) => s.length > 0 && s !== 'any' && s !== 'open to all' && s !== "doesn't matter");
      }
    } catch {}
    return val
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s !== 'any' && s !== 'open to all' && s !== "doesn't matter");
  }
  return [];
}

function parseNumber(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function calculateAge(dateOfBirth?: Date | string | null): number | null {
  if (!dateOfBirth) return null;
  try {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    const diffMs = Date.now() - dob.getTime();
    return Math.floor(diffMs / 31557600000);
  } catch {
    return null;
  }
}

export interface NormalizedPreferences {
  minAge: number | null;
  maxAge: number | null;
  religions: string[];
  caste: string | null;
  locations: string[];
  education: string[];
  professions: string[];
  employmentStatuses: string[];
  maritalStatuses: string[];
  diet: string[];
}

export function extractNormalizedPreferences(user: any): NormalizedPreferences {
  if (!user) {
    return {
      minAge: null,
      maxAge: null,
      religions: [],
      caste: null,
      locations: [],
      education: [],
      professions: [],
      employmentStatuses: [],
      maritalStatuses: [],
      diet: [],
    };
  }

  const p = user.preference || {};
  const profPrefs = (user.profile?.preferences || {}) as any;

  const minAge = parseNumber(p.minAge ?? profPrefs.minAge);
  const maxAge = parseNumber(p.maxAge ?? profPrefs.maxAge);

  const religions = [
    ...parseStringOrArray(p.religions),
    ...parseStringOrArray(profPrefs.religions || profPrefs.religion),
  ];

  const rawCaste = p.caste || profPrefs.caste;
  const caste = rawCaste && rawCaste !== 'Any' ? String(rawCaste).trim().toLowerCase() : null;

  const locations = [
    ...parseStringOrArray(p.location),
    ...parseStringOrArray(profPrefs.locations || profPrefs.location),
  ];

  const education = [
    ...parseStringOrArray(p.education),
    ...parseStringOrArray(profPrefs.education || profPrefs.educationLevel),
  ];

  const professions = [
    ...parseStringOrArray(p.occupations),
    ...parseStringOrArray(profPrefs.professions || profPrefs.occupations),
  ];

  const employmentStatuses = [
    ...parseStringOrArray(p.employmentStatuses),
    ...parseStringOrArray(profPrefs.employmentStatuses || profPrefs.employmentStatus),
  ];

  const maritalStatuses = [
    ...parseStringOrArray(p.maritalStatuses),
    ...parseStringOrArray(profPrefs.maritalStatus || profPrefs.maritalStatuses),
  ];

  const diet = [
    ...parseStringOrArray(p.diet),
    ...parseStringOrArray(profPrefs.diet),
  ];

  return {
    minAge,
    maxAge,
    religions: Array.from(new Set(religions)),
    caste,
    locations: Array.from(new Set(locations)),
    education: Array.from(new Set(education)),
    professions: Array.from(new Set(professions)),
    employmentStatuses: Array.from(new Set(employmentStatuses)),
    maritalStatuses: Array.from(new Set(maritalStatuses)),
    diet: Array.from(new Set(diet)),
  };
}

/**
 * Calculates a personalized matrimonial compatibility score (0 - 100%)
 * between the viewing user and candidate profile.
 */
export function calculateCompatibility(viewer: any, candidate: any): number {
  if (!viewer || !candidate) {
    return 88; // Sensible default when unauthenticated or incomplete
  }

  // Same user
  if (viewer.id && candidate.id && viewer.id === candidate.id) {
    return 100;
  }

  const prefs = extractNormalizedPreferences(viewer);
  const candProf = candidate.profile || candidate;

  let totalScore = 0;

  // -------------------------------------------------------------
  // 1. AGE COMPATIBILITY (15 points max)
  // -------------------------------------------------------------
  const candidateAge =
    calculateAge(candProf.dateOfBirth || candidate.dateOfBirth) ||
    candProf.age ||
    candidate.age ||
    null;

  if (candidateAge && (prefs.minAge || prefs.maxAge)) {
    const min = prefs.minAge ?? 18;
    const max = prefs.maxAge ?? 60;
    if (candidateAge >= min && candidateAge <= max) {
      totalScore += 15;
    } else if (candidateAge >= min - 2 && candidateAge <= max + 2) {
      totalScore += 10;
    } else if (candidateAge >= min - 4 && candidateAge <= max + 4) {
      totalScore += 6;
    } else {
      totalScore += 2;
    }
  } else {
    totalScore += 12; // Neutral baseline when age preference is not restricted
  }

  // -------------------------------------------------------------
  // 2. LOCATION / GEOGRAPHY ALIGNMENT (15 points max)
  // -------------------------------------------------------------
  const candCity = (candProf.city || candidate.city || '').toLowerCase();
  const candState = (candProf.state || candidate.state || candProf.country || candidate.country || '').toLowerCase();

  if (prefs.locations.length > 0) {
    const isDirectMatch = prefs.locations.some(
      (loc) =>
        (candCity && candCity.includes(loc)) ||
        (loc && candCity && loc.includes(candCity)) ||
        (candState && candState.includes(loc))
    );

    if (isDirectMatch) {
      totalScore += 15;
    } else if (
      candState.includes('kerala') ||
      candState.includes('india') ||
      candCity.includes('kochi') ||
      candCity.includes('trivandrum')
    ) {
      totalScore += 10; // Same major region
    } else {
      totalScore += 6;
    }
  } else {
    totalScore += 12;
  }

  // -------------------------------------------------------------
  // 3. RELIGION & COMMUNITY (15 points max)
  // -------------------------------------------------------------
  const candReligion = (candProf.religion || candidate.religion || '').toLowerCase();
  const candCaste = (candProf.caste || candidate.caste || '').toLowerCase();

  if (prefs.religions.length > 0) {
    const isReligionMatch = prefs.religions.some(
      (r) => candReligion.includes(r) || r.includes(candReligion)
    );

    if (isReligionMatch) {
      if (prefs.caste && candCaste && candCaste.includes(prefs.caste)) {
        totalScore += 15;
      } else {
        totalScore += 13;
      }
    } else {
      totalScore += 3;
    }
  } else {
    totalScore += 12;
  }

  // -------------------------------------------------------------
  // 4. EDUCATION LEVEL (15 points max)
  // -------------------------------------------------------------
  const candEducation = (candProf.education || candidate.education || '').toLowerCase();

  if (prefs.education.length > 0) {
    const isEduMatch = prefs.education.some(
      (edu) => candEducation.includes(edu) || edu.includes(candEducation)
    );

    if (isEduMatch) {
      totalScore += 15;
    } else if (
      candEducation.includes('bachelor') ||
      candEducation.includes('master') ||
      candEducation.includes('b.tech') ||
      candEducation.includes('mca') ||
      candEducation.includes('degree') ||
      candEducation.includes('graduate')
    ) {
      totalScore += 10; // Educated professional baseline
    } else {
      totalScore += 6;
    }
  } else {
    totalScore += 12;
  }

  // -------------------------------------------------------------
  // 5. PROFESSION & CAREER (15 points max)
  // -------------------------------------------------------------
  const candOcc = (candProf.occupation || candProf.profession || candidate.occupation || '').toLowerCase();
  const candEmp = (candProf.employmentStatus || candidate.employmentStatus || '').toLowerCase();

  if (prefs.professions.length > 0) {
    const isOccMatch = prefs.professions.some(
      (occ) => candOcc.includes(occ) || occ.includes(candOcc)
    );

    if (isOccMatch) {
      totalScore += 15;
    } else if (
      candEmp.includes('private') ||
      candEmp.includes('government') ||
      candEmp.includes('business') ||
      candEmp.includes('self') ||
      candOcc.length > 2
    ) {
      totalScore += 10;
    } else {
      totalScore += 6;
    }
  } else {
    totalScore += 12;
  }

  // -------------------------------------------------------------
  // 6. MARITAL STATUS (10 points max)
  // -------------------------------------------------------------
  const candMarital = (candProf.maritalStatus || candidate.maritalStatus || '').toLowerCase();

  if (prefs.maritalStatuses.length > 0) {
    const isMaritalMatch = prefs.maritalStatuses.some(
      (m) => candMarital.includes(m) || m.includes(candMarital)
    );

    if (isMaritalMatch) {
      totalScore += 10;
    } else {
      totalScore += 3;
    }
  } else {
    totalScore += 10; // Default when open to all marital statuses
  }

  // -------------------------------------------------------------
  // 7. DIET, LIFESTYLE & SHARED INTERESTS (15 points max)
  // -------------------------------------------------------------
  const candDiet = (candProf.diet || candidate.diet || '').toLowerCase();
  let dietScore = 7;

  if (prefs.diet.length > 0) {
    const isDietMatch = prefs.diet.some(
      (d) => candDiet.includes(d) || d.includes(candDiet)
    );
    dietScore = isDietMatch ? 7 : 3;
  }

  // Mutual interests overlap
  const viewerInterests = Array.isArray(viewer.profile?.interests)
    ? viewer.profile.interests.map((i: any) => String(i).toLowerCase())
    : [];
  const candInterests = Array.isArray(candProf.interests)
    ? candProf.interests.map((i: any) => String(i).toLowerCase())
    : [];

  let interestScore = 5;
  if (viewerInterests.length > 0 && candInterests.length > 0) {
    const shared = candInterests.filter((i: string) => viewerInterests.includes(i));
    if (shared.length >= 3) interestScore = 8;
    else if (shared.length >= 1) interestScore = 6;
    else interestScore = 4;
  } else {
    interestScore = 5;
  }

  totalScore += dietScore + interestScore;

  // Clamp realistically between 48% and 98%
  return Math.min(98, Math.max(48, Math.round(totalScore)));
}
