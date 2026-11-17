'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthState } from '../../../src/auth/AuthProvider';
import { t } from '../../../src/i18n/en';
import { Banner, Spinner } from '../../../src/ui/components';

// Google redirects here. The Supabase client exchanges the code in the URL for a session (detectSessionInUrl);
// once the session exists the root page sends the user on.
export default function AuthCallback() {
  const { state } = useAuthState();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (state.status === 'signed-in') router.replace('/'); }, [state.status, router]);
  useEffect(() => {
    if (state.status === 'signed-in') return;
    const q = new URLSearchParams(window.location.search + window.location.hash.replace('#', '&'));
    const providerError = Boolean(q.get('error') || q.get('error_description'));
    // an error in the URL fails at once; otherwise give the code exchange a few seconds to produce a session
    const timer = setTimeout(() => setFailed(true), providerError ? 0 : 8000);
    return () => clearTimeout(timer);
  }, [state.status]);

  if (failed) {
    return (
      <main>
        <Banner kind="error">{t('signIn.callbackFailed')}</Banner>
        <Link href="/sign-in/">{t('signIn.backToSignIn')}</Link>
      </main>
    );
  }
  return <main><Spinner label={t('signIn.callbackWorking')} /></main>;
}
