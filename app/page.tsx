'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthState } from '../src/auth/AuthProvider';
import { t } from '../src/i18n/en';
import { Spinner } from '../src/ui/components';

// The root decides where a visitor belongs: sign in, register a business, or the app.
export default function Home() {
  const { state } = useAuthState();
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'signed-out') router.replace('/sign-in/');
    else if (state.status === 'signed-in') router.replace(state.workspace || state.loadError ? '/app/' : '/register/');
  }, [state, router]);
  return <main><Spinner label={t('app.loading')} /></main>;
}
