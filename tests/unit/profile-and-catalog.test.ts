import { describe, expect, it } from 'vitest';
import { businessRegistrationSchema } from '../../src/domain/business';
import { profileSchema, toUpdateProfileArgs } from '../../src/domain/profile';
import { hasMessage, t } from '../../src/i18n/en';
import { baseInput, invalidVectors } from '../vectors/business';

describe('profile schema', () => {
  it('accepts a name and an optional phone, normalising the phone', () => {
    const r = profileSchema.parse({ fullName: '  Chikondi Mwale ', phone: '+265 888 555 111' });
    expect(r).toEqual({ fullName: 'Chikondi Mwale', phone: '+265888555111' });
  });
  it('treats a blank phone as no phone', () => {
    expect(profileSchema.parse({ fullName: 'A', phone: '   ' }).phone).toBeNull();
  });
  it.each([
    ['empty name', { fullName: '', phone: '' }, 'fullName'],
    ['name over 120 characters', { fullName: 'x'.repeat(121), phone: '' }, 'fullName'],
    ['phone with letters', { fullName: 'A', phone: 'abc' }, 'phone'],
  ])('rejects %s', (_l, input, field) => {
    const r = profileSchema.safeParse(input);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(field);
  });
  it('maps to the update_profile RPC arguments', () => {
    expect(toUpdateProfileArgs(profileSchema.parse({ fullName: 'A B', phone: '' }), 'en')).toEqual({ p_full_name: 'A B', p_phone: null, p_locale: 'en' });
  });
});

describe('message catalog', () => {
  it('every validation message the schemas can emit exists in the catalog', () => {
    const keys = new Set<string>();
    for (const v of invalidVectors) {
      const r = businessRegistrationSchema.safeParse({ ...baseInput, ...v.input });
      if (!r.success) r.error.issues.forEach((i) => keys.add(i.message));
    }
    for (const input of [{ fullName: '', phone: 'x' }, { fullName: 'x'.repeat(121), phone: '' }]) {
      const r = profileSchema.safeParse(input);
      if (!r.success) r.error.issues.forEach((i) => keys.add(i.message));
    }
    expect(keys.size).toBeGreaterThan(5);
    for (const k of keys) expect(hasMessage(k), `missing catalog key ${k}`).toBe(true);
  });
  it('fills placeholders', () => {
    expect(t('signIn.codeSent', { email: 'a@b.co' })).toContain('a@b.co');
  });
  it('returns the key for an unknown message so a missing string is visible', () => {
    expect(t('nope.nothing' as never)).toBe('nope.nothing');
  });
});
