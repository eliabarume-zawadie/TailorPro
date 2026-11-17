// Shared test vectors for business registration. The SAME vectors are run through the client-side Zod schema
// (tests/unit) and through the real create_business database function (tests/integration), so the two cannot drift (AD-7).
export interface RawBusinessInput {
  name: string; ownerName: string; phone: string; email: string; location: string; country: string; currency: string; businessType: string;
}
export const baseInput: RawBusinessInput = {
  name: 'Banda Tailoring', ownerName: 'Amina Banda', phone: '+265 999 123 456', email: '',
  location: 'Area 25, Lilongwe', country: 'MW', currency: 'MWK', businessType: 'individual_tailor',
};

export interface ValidVector { label: string; input: Partial<RawBusinessInput>; expect: Partial<{ name: string; phone: string; email: string | null; country: string; location: string }> }
export const validVectors: ValidVector[] = [
  { label: 'typical Malawi registration', input: {}, expect: { phone: '+265999123456', email: null, country: 'MW' } },
  { label: 'phone with brackets and hyphens', input: { phone: '(0999) 123-456' }, expect: { phone: '0999123456' } },
  { label: 'email is lower-cased', input: { email: 'Amina@Example.TEST' }, expect: { email: 'amina@example.test' } },
  { label: 'surrounding spaces are trimmed', input: { name: '  Banda Tailoring  ', location: '  Area 25 ' }, expect: { name: 'Banda Tailoring', location: 'Area 25' } },
  { label: 'lower-case country code is normalised', input: { country: 'mw' }, expect: { country: 'MW' } },
  { label: 'name of exactly 120 characters', input: { name: 'x'.repeat(120) }, expect: { name: 'x'.repeat(120) } },
  { label: 'markup is plain text, not rejected', input: { name: '<script>alert(1)</script>' }, expect: { name: '<script>alert(1)</script>' } },
];

export interface InvalidVector { label: string; input: Partial<RawBusinessInput>; field: keyof RawBusinessInput }
export const invalidVectors: InvalidVector[] = [
  { label: 'empty business name', input: { name: '' }, field: 'name' },
  { label: 'blank business name', input: { name: '   ' }, field: 'name' },
  { label: 'business name over 120 characters', input: { name: 'x'.repeat(121) }, field: 'name' },
  { label: 'empty owner name', input: { ownerName: '' }, field: 'ownerName' },
  { label: 'phone with letters', input: { phone: 'not-a-phone' }, field: 'phone' },
  { label: 'phone too short', input: { phone: '12345' }, field: 'phone' },
  { label: 'phone too long', input: { phone: '1234567890123456' }, field: 'phone' },
  { label: 'email without @', input: { email: 'no-at-sign' }, field: 'email' },
  { label: 'empty location', input: { location: '   ' }, field: 'location' },
  { label: 'location over 200 characters', input: { location: 'x'.repeat(201) }, field: 'location' },
  { label: 'country that is not a 2-letter code', input: { country: 'malawi' }, field: 'country' },
  { label: 'currency that is not enabled', input: { currency: 'USD' }, field: 'currency' },
  { label: 'empty business type', input: { businessType: '' }, field: 'businessType' },
];
