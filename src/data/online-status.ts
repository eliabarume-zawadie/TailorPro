'use client';
import { useSyncExternalStore } from 'react';

// Connectivity as the browser reports it. "Online" means a network exists, not that the server is reachable;
// real sync state (pending, failed, conflicts) arrives with the sync engine in Phase 5, and nothing here says "synced".
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback); };
}
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
