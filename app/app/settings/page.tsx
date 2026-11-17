'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthState } from '../../../src/auth/AuthProvider';
import { getSupabase } from '../../../src/auth/client';
import { profileSchema, toUpdateProfileArgs } from '../../../src/domain/profile';
import { t, type MessageKey } from '../../../src/i18n/en';
import { Banner, Button, TextField } from '../../../src/ui/components';

export default function Settings() {
  const { state, reload } = useAuthState();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const loaded = useRef(false);

  // fill the form once from the stored profile (not on every refresh, which would overwrite typing)
  useEffect(() => {
    if (state.status === 'signed-in' && state.profile && !loaded.current) {
      loaded.current = true;
      setFullName(state.profile.fullName);
      setPhone(state.profile.phone ?? '');
    }
  }, [state]);

  if (state.status !== 'signed-in') return null;
  const locale = state.profile?.locale ?? 'en';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    setSaved(false); setFailed(false);
    const parsed = profileSchema.safeParse({ fullName, phone });
    if (!parsed.success) {
      const next: { fullName?: string; phone?: string } = {};
      for (const i of parsed.error.issues) next[i.path[0] as 'fullName' | 'phone'] ??= t(i.message as MessageKey);
      setErrors(next);
      return;
    }
    setErrors({});
    inFlight.current = true; setBusy(true);
    try {
      const { error } = await getSupabase().rpc('update_profile', toUpdateProfileArgs(parsed.data, locale));
      if (error) { setFailed(true); return; }
      setPhone(parsed.data.phone ?? '');
      setSaved(true);
      await reload();
    } catch { setFailed(true); } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <main>
      <h1>{t('settings.title')}</h1>
      <p className="subtitle">{t('settings.signedInAs', { email: state.session.user.email ?? '' })}</p>
      <form className="card" onSubmit={save} noValidate>
        <h2>{t('settings.profileTitle')}</h2>
        {saved ? <Banner kind="success">{t('settings.saved')}</Banner> : null}
        {failed ? <Banner kind="error">{t('errors.saveFailed')}</Banner> : null}
        <TextField id="fullName" label={t('settings.fullName')} value={fullName} onChange={setFullName} error={errors.fullName} autoComplete="name" />
        <TextField id="phone" label={t('settings.phone')} value={phone} onChange={setPhone} error={errors.phone} type="tel" inputMode="tel" autoComplete="tel" />
        <Button type="submit" disabled={busy}>{busy ? t('settings.saving') : t('settings.saveProfile')}</Button>
      </form>
    </main>
  );
}
