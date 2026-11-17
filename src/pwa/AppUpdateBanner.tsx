'use client';
import { useEffect, useRef, useState } from 'react';
import { getLocalDb } from '../data/local-store';
import { t } from '../i18n/en';
import { Button } from '../ui/components';
import { watchForUpdate } from './sw-updates';

const HOUR = 60 * 60 * 1000;

/**
 * Registers the service worker (production builds only) and tells the user when something needs a reload:
 * a new version is waiting, or another tab upgraded the local database. Nothing reloads by itself, so a user
 * in the middle of typing never loses their work.
 */
export function AppUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [otherTab, setOtherTab] = useState(false);
  const reloading = useRef(false);

  useEffect(() => {
    const db = getLocalDb();
    return db ? db.onVersionChange(() => setOtherTab(true)) : undefined;
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let registration: ServiceWorkerRegistration | undefined;
    const check = () => { void registration?.update().catch(() => undefined); };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const onControllerChange = () => { if (reloading.current) window.location.reload(); };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      registration = reg;
      watchForUpdate(reg, () => !!navigator.serviceWorker.controller, setWaiting);
      timer = setInterval(check, HOUR);
      document.addEventListener('visibilitychange', onVisible);
    }, () => undefined); // no worker: the app still works online

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, []);

  const applyUpdate = () => {
    if (!waiting) return;
    reloading.current = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!waiting && !otherTab) return null;
  return (
    <div className="update-bar" role="status">
      {waiting ? (
        <>
          <span>{t('update.ready')}</span>
          <Button type="button" onClick={applyUpdate}>{t('update.reload')}</Button>
        </>
      ) : (
        <>
          <span>{t('update.otherTab')}</span>
          <Button type="button" onClick={() => window.location.reload()}>{t('update.reloadNow')}</Button>
        </>
      )}
    </div>
  );
}
