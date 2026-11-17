'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '../auth/client';
import { getLocalStore, type ActivityRow } from './local-store';

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The newest audit-log entries for a workspace. Only owners (and staff granted `audit.view`) can read the log:
 * everyone else simply gets an empty list. Online the server's answer refreshes the device copy; offline, or if the
 * server cannot be reached, the device copy is shown.
 */
async function loadActivity(workspaceId: string): Promise<ActivityRow[]> {
  const { data, error } = await getSupabase()
    .from('audit_logs')
    .select('id, action, created_at')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(10)
    .retry(false)
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));
  if (error) throw error;
  return data.map((r) => ({ id: r.id as string, action: r.action as string, createdAt: r.created_at as string }));
}

export function useRecentActivity(workspaceId: string | undefined): ActivityRow[] {
  const [state, setState] = useState<{ workspaceId: string; rows: ActivityRow[] } | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    const store = getLocalStore();
    const show = (rows: ActivityRow[]) => { if (alive) setState({ workspaceId, rows }); };
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const fromDevice = () => Promise.resolve(store?.getActivity(workspaceId)).then((r) => show(r ?? []), () => show([]));
    if (offline) { void fromDevice(); } else {
      loadActivity(workspaceId).then(
        (rows) => { show(rows); void store?.saveActivity(workspaceId, rows).catch(() => undefined); },
        () => { void fromDevice(); },
      );
    }
    return () => { alive = false; };
  }, [workspaceId]);

  return state && state.workspaceId === workspaceId ? state.rows : [];
}
