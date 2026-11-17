'use client';
import { useAuthState } from '../../src/auth/AuthProvider';
import { useRecentActivity } from '../../src/data/use-recent-activity';
import { activityLabelKey, formatWhen } from '../../src/domain/activity';
import { hasMessage, t, type MessageKey } from '../../src/i18n/en';
import { EmptyState } from '../../src/ui/components';

// Phase 1 dashboard (decision D1): the workspace shell, an honest empty state and real recent activity from the audit log.
// Metric tiles arrive in Phases 2 to 4, each with the tables that feed it; nothing here is mock data.
export default function Dashboard() {
  const { state } = useAuthState();
  const workspaceId = state.status === 'signed-in' ? state.workspace?.id : undefined;
  const activity = useRecentActivity(workspaceId);
  if (state.status !== 'signed-in' || !state.workspace) return null;
  const w = state.workspace;
  const typeKey = `register.types.${w.businessType}`;
  const typeLabel = hasMessage(typeKey) ? t(typeKey as MessageKey) : w.businessType;
  const locale = state.profile?.locale ?? 'en';
  return (
    <main>
      <h1>{w.name}</h1>
      <p className="subtitle">{t('dashboard.about', { type: typeLabel, location: w.location })}</p>
      <EmptyState title={t('dashboard.emptyTitle')} body={t('dashboard.emptyBody')} />
      {activity.length > 0 ? (
        <section aria-labelledby="activity-title">
          <hr className="stitch" aria-hidden="true" />
          <h2 id="activity-title">{t('dashboard.recentActivity')}</h2>
          <ul className="activity">
            {activity.map((a) => (
              <li key={a.id}>
                <span>{t(activityLabelKey(a.action))}</span>
                <time dateTime={a.createdAt}>{formatWhen(a.createdAt, w.timezone, locale)}</time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
