import { describe, expect, it } from 'vitest';
import { businessRegistrationSchema, toCreateBusinessArgs } from '../../src/domain/business';
import { baseInput, invalidVectors, validVectors } from '../vectors/business';

describe('business registration schema (client-side rules)', () => {
  it.each(validVectors)('accepts and normalises: $label', ({ input, expect: want }) => {
    const r = businessRegistrationSchema.safeParse({ ...baseInput, ...input });
    expect(r.success).toBe(true);
    if (!r.success) return;
    for (const [k, v] of Object.entries(want)) expect((r.data as Record<string, unknown>)[k]).toBe(v);
  });

  it.each(invalidVectors)('rejects: $label, reporting the $field field', ({ input, field }) => {
    const r = businessRegistrationSchema.safeParse({ ...baseInput, ...input });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.map((i) => i.path[0])).toContain(field);
  });

  it('reports every invalid field at once so the form can show all errors', () => {
    const r = businessRegistrationSchema.safeParse({ ...baseInput, name: '', phone: 'x', location: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(new Set(r.error.issues.map((i) => i.path[0]))).toEqual(new Set(['name', 'phone', 'location']));
  });

  it('error messages are catalog keys, never hard-coded sentences (i18n)', () => {
    const r = businessRegistrationSchema.safeParse({ ...baseInput, name: '' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.message).toMatch(/^errors\.[a-zA-Z.]+$/);
  });

  it('maps parsed data to the create_business RPC arguments', () => {
    const parsed = businessRegistrationSchema.parse({ ...baseInput, email: 'A@B.CO' });
    expect(toCreateBusinessArgs('11111111-1111-1111-1111-111111111111', parsed)).toEqual({
      p_id: '11111111-1111-1111-1111-111111111111', p_name: 'Banda Tailoring', p_owner_name: 'Amina Banda', p_phone: '+265999123456',
      p_email: 'a@b.co', p_location: 'Area 25, Lilongwe', p_country: 'MW', p_currency: 'MWK', p_business_type: 'individual_tailor',
    });
  });
});
