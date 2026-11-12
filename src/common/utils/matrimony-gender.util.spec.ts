import {
  getOppositeGender,
  isMarriageCategory,
  normalizeMarriageLookingFor,
} from './matrimony-gender.util';

describe('matrimony-gender.util', () => {
  it('identifies Marriage vs Friendship/Live-In categories', () => {
    expect(isMarriageCategory('Marriage', 'Marriage')).toBe(true);
    expect(isMarriageCategory(null, null)).toBe(true);
    expect(isMarriageCategory('Friendship', 'Friendship')).toBe(false);
    expect(isMarriageCategory('Live-In', 'Live-In')).toBe(false);
    expect(isMarriageCategory('Living Together', null)).toBe(false);
  });

  it('computes opposite gender accurately', () => {
    expect(getOppositeGender('female')).toBe('Male');
    expect(getOppositeGender('Woman')).toBe('Male');
    expect(getOppositeGender('male')).toBe('Female');
    expect(getOppositeGender('Man')).toBe('Female');
    expect(getOppositeGender('other')).toBeNull();
  });

  it('normalizes stale or empty bare gender lookingFor to opposite gender in Marriage', () => {
    expect(
      normalizeMarriageLookingFor({
        category: 'Marriage',
        profileFor: 'Marriage',
        gender: 'female',
        lookingFor: 'Female',
      }),
    ).toBe('Male');

    expect(
      normalizeMarriageLookingFor({
        category: 'Marriage',
        gender: 'male',
        lookingFor: 'Male',
      }),
    ).toBe('Female');

    expect(
      normalizeMarriageLookingFor({
        category: 'Marriage',
        gender: 'female',
        lookingFor: null,
      }),
    ).toBe('Male');
  });

  it('preserves custom partner expectation prose and non-Marriage categories', () => {
    expect(
      normalizeMarriageLookingFor({
        category: 'Marriage',
        gender: 'female',
        lookingFor: 'Someone kind, settled in Kerala, and family-oriented.',
      }),
    ).toBe('Someone kind, settled in Kerala, and family-oriented.');

    expect(
      normalizeMarriageLookingFor({
        category: 'Friendship',
        gender: 'female',
        lookingFor: 'Female',
      }),
    ).toBe('Female');
  });
});

