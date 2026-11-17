'use client';
import { useAuthState } from '../../src/auth/AuthProvider';
import { t } from '../../src/i18n/en';

// Phase 1 dashboard (decision D1): the workspace shell and an honest empty state. Metric tiles arrive in Phases 2 to 4,
// each with the tables that feed it; nothing here is mock data.
export default function Dashboard() {
  const { state } = useAuthState();
  if (state.status !== 'signed-in' || !state.workspace) return null;
  return (
    <main>
      <h1>{state.workspace.name}</h1>
      <p className="subtitle">{t('dashboard.welcome')}</p>
      <section className="card" aria-labelledby="empty-title">
        <h2 id="empty-title">{t('dashboard.emptyTitle')}</h2>
        <p>{t('dashboard.emptyBody')}</p>
      </section>
    </main>
  );
}
