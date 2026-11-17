'use client';
import { useAuthState } from '../../src/auth/AuthProvider';
import { hasMessage, t, type MessageKey } from '../../src/i18n/en';
import { EmptyState } from '../../src/ui/components';

// Phase 1 dashboard (decision D1): the workspace shell and an honest empty state. Metric tiles arrive in Phases 2 to 4,
// each with the tables that feed it; nothing here is mock data.
export default function Dashboard() {
  const { state } = useAuthState();
  if (state.status !== 'signed-in' || !state.workspace) return null;
  const w = state.workspace;
  const typeKey = `register.types.${w.businessType}`;
  const typeLabel = hasMessage(typeKey) ? t(typeKey as MessageKey) : w.businessType;
  return (
    <main>
      <h1>{w.name}</h1>
      <p className="subtitle">{t('dashboard.about', { type: typeLabel, location: w.location })}</p>
      <EmptyState title={t('dashboard.emptyTitle')} body={t('dashboard.emptyBody')} />
    </main>
  );
}
