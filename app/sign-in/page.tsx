'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AuthAdapterError, type AuthErrorKind } from '../../src/auth/adapter';
import { useAuthState } from '../../src/auth/AuthProvider';
import { getAuth } from '../../src/auth/client';
import { t, type MessageKey } from '../../src/i18n/en';
import { Banner, Button, TextField } from '../../src/ui/components';

const errorKey: Record<AuthErrorKind, MessageKey> = {
  invalid_code: 'errors.auth.invalidCode', rate_limited: 'errors.auth.rateLimited', invalid_email: 'errors.auth.invalidEmail',
  network: 'errors.auth.network', unknown: 'errors.auth.unknown',
};
const describe = (e: unknown) => t(errorKey[e instanceof AuthAdapterError ? e.kind : 'unknown']);

export default function SignInPage() {
  const { state } = useAuthState();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => { if (state.status === 'signed-in') router.replace('/'); }, [state.status, router]);

  // one request at a time: a double tap must not send two emails or two verifications
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null); setInfo(null);
    try { await action(); } catch (e) { setError(describe(e)); } finally { inFlight.current = false; setBusy(false); }
  }

  const sendCode = (e: FormEvent) => { e.preventDefault(); void run(async () => { await getAuth().requestEmailCode(email); setStep('code'); setCode(''); }); };
  const resend = () => void run(async () => { await getAuth().requestEmailCode(email); setInfo(t('signIn.codeResent')); });
  const verify = (e: FormEvent) => { e.preventDefault(); void run(async () => { await getAuth().verifyEmailCode(email, code); }); };
  const google = () => void run(async () => { await getAuth().signInWithGoogle(`${window.location.origin}/auth/callback/`); });

  return (
    <main>
      <h1>{t('signIn.title')}</h1>
      <p className="subtitle">{t('signIn.subtitle')}</p>
      <div className="card">
        {error ? <Banner kind="error">{error}</Banner> : null}
        {info ? <Banner kind="info">{info}</Banner> : null}
        {step === 'email' ? (
          <>
            <Button type="button" variant="secondary" onClick={google} disabled={busy}>{t('signIn.google')}</Button>
            <div className="divider" aria-hidden="true">{t('signIn.or')}</div>
            <form onSubmit={sendCode} noValidate className="stack">
              <TextField id="email" label={t('signIn.emailLabel')} type="email" value={email} onChange={setEmail} autoComplete="email" inputMode="email" />
              <Button type="submit" disabled={busy}>{busy ? t('signIn.sending') : t('signIn.sendCode')}</Button>
            </form>
          </>
        ) : (
          <form onSubmit={verify} noValidate className="stack">
            <p>{t('signIn.codeSent', { email })}</p>
            <TextField id="code" label={t('signIn.codeLabel')} value={code} onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
            <Button type="submit" disabled={busy || code.length !== 6}>{busy ? t('signIn.verifying') : t('signIn.submit')}</Button>
            <Button type="button" variant="secondary" onClick={resend} disabled={busy}>{t('signIn.resend')}</Button>
            <Button type="button" variant="link" onClick={() => { setStep('email'); setError(null); setInfo(null); }}>{t('signIn.useOtherEmail')}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
