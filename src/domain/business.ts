import { z } from 'zod';
import { fail, optionalEmail, requiredPhone, requiredText } from './fields';

// Client-side mirror of the rules enforced by the database function public.create_business.
// The database is authoritative; this schema exists to give the user fast, field-level feedback.
// tests/unit and tests/integration run the same vectors through both so they cannot drift.
// Error messages are i18n catalog keys (src/i18n), never literal sentences.

export const businessTypes = ['individual_tailor', 'tailoring_shop', 'multi_worker_business', 'other'] as const;
/** Currencies enabled in the database `currencies` table. MWK only for now (Decision N). */
export const enabledCurrencies = ['MWK'] as const;

export const businessRegistrationSchema = z.object({
  name: requiredText(120, 'errors.businessName.required', 'errors.businessName.tooLong'),
  ownerName: requiredText(120, 'errors.ownerName.required', 'errors.ownerName.tooLong'),
  phone: requiredPhone,
  email: optionalEmail,
  location: requiredText(200, 'errors.location.required', 'errors.location.tooLong'),
  country: z.string({ error: 'errors.country' }).transform((v, ctx) => {
    const t = v.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(t) ? t : fail(ctx, 'errors.country', v);
  }),
  currency: z.string({ error: 'errors.currency' }).transform((v, ctx) => {
    const t = v.trim().toUpperCase();
    return (enabledCurrencies as readonly string[]).includes(t) ? t : fail(ctx, 'errors.currency', v);
  }),
  businessType: requiredText(60, 'errors.businessType.required', 'errors.businessType.tooLong'),
});

export type BusinessRegistration = z.output<typeof businessRegistrationSchema>;

/** Arguments for the create_business RPC. `id` is client-generated and doubles as the idempotency key. */
export function toCreateBusinessArgs(id: string, b: BusinessRegistration) {
  return {
    p_id: id, p_name: b.name, p_owner_name: b.ownerName, p_phone: b.phone, p_email: b.email,
    p_location: b.location, p_country: b.country, p_currency: b.currency, p_business_type: b.businessType,
  };
}
