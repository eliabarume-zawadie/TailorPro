'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuthState } from '../../src/auth/AuthProvider';
import { t } from '../../src/i18n/en';
import { Banner, Button, Spinner } from '../../src/ui/components';

// The authenticated shell. Signed-out visitors are sent to sign-in; signed-in users without a business to registration.
export default function AppShell({ children }: { children: ReactNode }) {
  const { state, reload, signOut } = useAuthState();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'signed-out') router.replace('/sign-in/');
    else if (state.status === 'signed-in' && !state.workspace && !state.loadError) router.replace('/register/');
  }, [state, router]);

  if (state.status === 'loading' || state.status === 'signed-out') return <main><Spinner label={t('app.loading')} /></main>;
  if (!state.workspace) {
    return (
      <main>
        <Banner kind="error">{t('dashboard.workspaceError')}</Banner>
        <Button type="button" onClick={() => void reload()}>{t('dashboard.retry')}</Button>
      </main>
    );
  }
  return (
    <>
      <header className="topbar">
        <nav className="topbar-inner" aria-label={t('nav.main')}>
          <span className="brand">{t('app.name')}</span>
          <Link href="/app/">{t('nav.dashboard')}</Link>
          <Link href="/app/settings/">{t('nav.settings')}</Link>
          <Button type="button" variant="secondary" onClick={() => void signOut()}>{t('nav.signOut')}</Button>
        </nav>
      </header>
      {children}
    </>
  );
}
