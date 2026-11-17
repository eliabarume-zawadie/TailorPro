import { z } from 'zod';

// The content security policy forbids eval. Zod 4 would otherwise compile validators with new Function and the browser
// would report a violation on every page that validates. Validation here is tiny, so the interpreted path costs nothing.
z.config({ jitless: true });

// Field rules shared by the domain schemas. They mirror the database helper functions
// (private.require_text, private.normalise_phone, private.normalise_email). Messages are i18n catalog keys.

export const fail = (ctx: z.core.$RefinementCtx<string>, message: string, input: string) => {
  ctx.issues.push({ code: 'custom', message, input });
  return z.NEVER;
};

export const requiredText = (max: number, requiredKey: string, longKey: string) =>
  z.string({ error: requiredKey }).transform((v, ctx) => {
    const t = v.trim();
    if (t === '') return fail(ctx, requiredKey, v);
    if (t.length > max) return fail(ctx, longKey, v);
    return t;
  });

const PHONE = /^\+?[0-9]{7,15}$/;
const stripPhone = (v: string) => v.replace(/[\s\-()]/g, '');

export const requiredPhone = z.string({ error: 'errors.phone' }).transform((v, ctx) => {
  const t = stripPhone(v);
  return PHONE.test(t) ? t : fail(ctx, 'errors.phone', v);
});

/** Blank means "no phone" (null). */
export const optionalPhone = z.string({ error: 'errors.phone' }).transform((v, ctx): string | null => {
  if (v.trim() === '') return null;
  const t = stripPhone(v);
  return PHONE.test(t) ? t : fail(ctx, 'errors.phone', v);
});

export const optionalEmail = z.string({ error: 'errors.email' }).transform((v, ctx): string | null => {
  const t = v.trim();
  if (t === '') return null;
  return t.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t.toLowerCase() : fail(ctx, 'errors.email', v);
});
