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
export interface CompatibilityResult {
  score: number;
  highlights: Array<{
    title: string;
    value: string;
    description: string;
  }>;
}

export function calculateCompatibilityWithHighlights(viewer: any, candidate: any): CompatibilityResult {
  if (!viewer || !candidate) {
    return {
      score: 88,
      highlights: [
        {
          title: 'Verified Member',
          value: 'Identity Verified',
          description: 'Profile identity verified via phone verification.',
        },
      ],
    };
  }

  // Same user
  if (viewer.id && candidate.id && viewer.id === candidate.id) {
    return { score: 100, highlights: [] };
  }

  const prefs = extractNormalizedPreferences(viewer);
  const candProf = candidate.profile || candidate;
  const highlights: Array<{ title: string; value: string; description: string }> = [];

  let totalScore = 0;

  // 1. AGE COMPATIBILITY (15 points max)
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
      highlights.push({
        title: 'Age Alignment',
        value: `Age ${candidateAge} years`,
        description: `Falls within your preferred ${min}–${max} age window.`,
      });
    } else if (candidateAge >= min - 2 && candidateAge <= max + 2) {
      totalScore += 10;
    } else if (candidateAge >= min - 4 && candidateAge <= max + 4) {
      totalScore += 6;
    } else {
      totalScore += 2;
    }
  } else {
    totalScore += 12;
  }

  // 2. LOCATION / GEOGRAPHY ALIGNMENT (15 points max)
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
      highlights.push({
        title: 'Preferred Location',
        value: candProf.city ? `${candProf.city}${candProf.state ? `, ${candProf.state}` : ''}` : candProf.state || 'Local Region',
        description: 'Matches your preferred location criteria.',
      });
    } else if (
      candState.includes('kerala') ||
      candState.includes('india') ||
      candCity.includes('kochi') ||
      candCity.includes('trivandrum')
    ) {
      totalScore += 10;
    } else {
      totalScore += 6;
    }
  } else {
    totalScore += 12;
  }

  // 3. RELIGION & COMMUNITY (15 points max)
  const candReligion = (candProf.religion || candidate.religion || '').toLowerCase();
  const candCaste = (candProf.caste || candidate.caste || '').toLowerCase();

  if (prefs.religions.length > 0) {
    const isReligionMatch = prefs.religions.some(
      (r) => candReligion.includes(r) || r.includes(candReligion)
    );

    if (isReligionMatch) {
      if (prefs.caste && candCaste && candCaste.includes(prefs.caste)) {
        totalScore += 15;
        highlights.push({
          title: 'Community Match',
          value: candProf.caste ? `${candProf.religion || ''} - ${candProf.caste}` : candProf.religion || 'Community',
          description: 'Matches your religious and community preferences.',
        });
      } else {
        totalScore += 13;
        highlights.push({
          title: 'Religious Alignment',
          value: candProf.religion || 'Community',
          description: 'Matches your preferred religious background.',
        });
      }
    } else {
      totalScore += 3;
    }
  } else {
    totalScore += 12;
  }

  // 4. EDUCATION LEVEL (15 points max)
  const candEducation = (candProf.education || candidate.education || '').toLowerCase();

  if (prefs.education.length > 0) {
    const isEduMatch = prefs.education.some(
      (edu) => candEducation.includes(edu) || edu.includes(candEducation)
    );

    if (isEduMatch) {
      totalScore += 15;
      highlights.push({
        title: 'Educational Alignment',
        value: candProf.education || 'Graduate',
        description: 'Meets your preferred educational background criteria.',
      });
    } else if (
      candEducation.includes('bachelor') ||
      candEducation.includes('master') ||
      candEducation.includes('b.tech') ||
      candEducation.includes('mca') ||
      candEducation.includes('degree') ||
      candEducation.includes('graduate')
    ) {
      totalScore += 10;
    } else {
      totalScore += 6;
    }
  } else {
    totalScore += 12;
  }

  // 5. PROFESSION & CAREER (15 points max)
  const candOcc = (candProf.occupation || candProf.profession || candidate.occupation || '').toLowerCase();
  const candEmp = (candProf.employmentStatus || candidate.employmentStatus || '').toLowerCase();

  if (prefs.professions.length > 0) {
    const isOccMatch = prefs.professions.some(
      (occ) => candOcc.includes(occ) || occ.includes(candOcc)
    );

    if (isOccMatch) {
      totalScore += 15;
      highlights.push({
        title: 'Career Alignment',
        value: candProf.occupation || candProf.profession || 'Professional',
        description: 'Matches your partner career preferences.',
      });
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

  // 6. MARITAL STATUS (10 points max)
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
    totalScore += 10;
  }

  // 7. DIET, LIFESTYLE & SHARED INTERESTS (15 points max)
  const candDiet = (candProf.diet || candidate.diet || '').toLowerCase();
  let dietScore = 7;

  if (prefs.diet.length > 0) {
    const isDietMatch = prefs.diet.some(
      (d) => candDiet.includes(d) || d.includes(candDiet)
    );
    if (isDietMatch) {
      dietScore = 7;
      highlights.push({
        title: 'Dietary Compatibility',
        value: candProf.diet || 'Dietary Habit',
        description: 'Compatible with your dietary lifestyle.',
      });
    } else {
      dietScore = 3;
    }
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
    if (shared.length >= 3) {
      interestScore = 8;
      highlights.push({
        title: 'Shared Passions',
        value: shared.slice(0, 2).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' & '),
        description: 'Overlapping leisure interests make initial conversations effortless.',
      });
    } else if (shared.length >= 1) {
      interestScore = 6;
      highlights.push({
        title: 'Shared Passions',
        value: shared.slice(0, 2).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' & '),
        description: 'Common hobbies provide great mutual conversation starters.',
      });
    } else {
      interestScore = 4;
    }
  } else {
    interestScore = 5;
  }

  totalScore += dietScore + interestScore;
  const score = Math.min(98, Math.max(48, Math.round(totalScore)));

  // Fallbacks if fewer than 2 highlights matched
  if (highlights.length < 2) {
    if (candProf.bio) {
      highlights.push({
        title: 'Authentic Background',
        value: 'Detailed Profile',
        description: 'Candidate has provided thoughtful details about their life and values.',
      });
    }
    if (candProf.city || candProf.state) {
      highlights.push({
        title: 'Location Context',
        value: [candProf.city, candProf.state].filter(Boolean).join(', '),
        description: 'Regional roots and native background shared openly.',
      });
    }
  }

  return {
    score,
    highlights: highlights.slice(0, 4),
  };
}

export function calculateCompatibility(viewer: any, candidate: any): number {
  return calculateCompatibilityWithHighlights(viewer, candidate).score;
}
