'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthState } from '../../src/auth/AuthProvider';
import { getSupabase } from '../../src/auth/client';
import { businessRegistrationSchema, businessTypes, toCreateBusinessArgs } from '../../src/domain/business';
import { t, type MessageKey } from '../../src/i18n/en';
import { Banner, Button, SelectField, Spinner, TextField } from '../../src/ui/components';

const ATTEMPT_KEY = 'tp.registration-attempt';

// The client-generated workspace id is the idempotency key. It is kept until registration succeeds, so a retry,
// a double tap or a reload re-sends the same id and can never create a second business (create_business replays safely).
function attemptId(): string {
  try {
    const existing = localStorage.getItem(ATTEMPT_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(ATTEMPT_KEY, id);
    return id;
  } catch { return crypto.randomUUID(); }
}
const clearAttempt = () => { try { localStorage.removeItem(ATTEMPT_KEY); } catch { /* storage unavailable */ } };

type FieldName = 'name' | 'ownerName' | 'phone' | 'email' | 'location' | 'country' | 'currency' | 'businessType';

export default function RegisterPage() {
  const { state, reload } = useAuthState();
  const router = useRouter();
  const [form, setForm] = useState<{ name: string; ownerName: string | null; phone: string; email: string; location: string; businessType: string }>({ name: '', ownerName: null, phone: '', email: '', location: '', businessType: '' });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (state.status === 'signed-out') router.replace('/sign-in/');
    else if (state.status === 'signed-in' && state.workspace) router.replace('/app/');
  }, [state, router]);

  if (state.status !== 'signed-in' || state.workspace) return <main><Spinner label={t('app.loading')} /></main>;

  // until the user types, the owner name shows their profile name (from Google or an earlier edit)
  const ownerName = form.ownerName ?? (state.profile?.fullName || state.session.user.fullName);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);
    const parsed = businessRegistrationSchema.safeParse({ ...form, ownerName, country: 'MW', currency: 'MWK' });
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName;
        next[field] ??= t(issue.message as MessageKey);
      }
      setErrors(next);
      setFormError(t('register.fixErrors'));
      const first = (['name', 'ownerName', 'phone', 'email', 'location', 'businessType'] as FieldName[]).find((f) => next[f]);
      if (first) document.getElementById(first === 'ownerName' ? 'ownerName' : first)?.focus();
      return;
    }
    setErrors({});
    inFlight.current = true; setBusy(true);
    try {
      const { error } = await getSupabase().rpc('create_business', toCreateBusinessArgs(attemptId(), parsed.data));
      if (error) {
        if (error.code === '42501') clearAttempt(); // the stored id belongs to someone else; use a fresh one next time
        setFormError(t(error.code ? 'errors.saveFailed' : 'errors.auth.network'));
        return;
      }
      clearAttempt();
      await reload();
      router.replace('/app/');
    } catch {
      setFormError(t('errors.auth.network'));
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <main>
      <h1>{t('register.title')}</h1>
      <p className="subtitle">{t('register.subtitle')}</p>
      <form className="sheet" onSubmit={submit} noValidate>
        {formError ? <Banner kind="error">{formError}</Banner> : null}
        <TextField id="name" label={t('register.businessName')} value={form.name} onChange={set('name')} error={errors.name} autoComplete="organization" />
        <TextField id="ownerName" label={t('register.ownerName')} value={ownerName} onChange={set('ownerName')} error={errors.ownerName} autoComplete="name" />
        <TextField id="phone" label={t('register.phone')} hint={t('register.phoneHint')} value={form.phone} onChange={set('phone')} error={errors.phone} type="tel" inputMode="tel" autoComplete="tel" />
        <TextField id="email" label={t('register.email')} value={form.email} onChange={set('email')} error={errors.email} type="email" inputMode="email" autoComplete="email" />
        <TextField id="location" label={t('register.location')} hint={t('register.locationHint')} value={form.location} onChange={set('location')} error={errors.location} autoComplete="address-level2" />
        <TextField id="country" label={t('register.country')} value={t('register.countryMalawi')} onChange={() => undefined} readOnly />
        <TextField id="currency" label={t('register.currency')} value="MWK" onChange={() => undefined} readOnly />
        <SelectField id="businessType" label={t('register.businessType')} value={form.businessType} onChange={set('businessType')} error={errors.businessType}
          options={[{ value: '', label: t('register.businessTypeChoose') }, ...businessTypes.map((v) => ({ value: v, label: t(`register.types.${v}` as MessageKey) }))]} />
        <Button type="submit" busy={busy}>{busy ? t('register.submitting') : t('register.submit')}</Button>
      </form>
    </main>
  );
}
