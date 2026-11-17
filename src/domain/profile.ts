import { z } from 'zod';
import { optionalPhone, requiredText } from './fields';

// Mirrors public.update_profile. The caller's own profile only; the database never takes a user id here.
export const profileSchema = z.object({
  fullName: requiredText(120, 'errors.fullName.required', 'errors.fullName.tooLong'),
  phone: optionalPhone,
});
export type ProfileInput = z.output<typeof profileSchema>;

export function toUpdateProfileArgs(p: ProfileInput, locale: string) {
  return { p_full_name: p.fullName, p_phone: p.phone, p_locale: locale };
}
