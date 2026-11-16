'use client';
import { useEffect, useState } from 'react';

export default function SwRegister() {
  const [state, setState] = useState('unregistered');
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }
    navigator.serviceWorker.register('/sw.js').then(
      () => navigator.serviceWorker.ready.then(() => setState('ready')),
      () => setState('failed'),
    );
  }, []);
  return (
    <span data-testid="sw-state" hidden>
      {state}
    </span>
  );
}
