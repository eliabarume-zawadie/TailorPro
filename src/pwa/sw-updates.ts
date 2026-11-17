// Update detection for the service worker. A new version never takes over silently (spike finding):
// it installs and WAITS, and the app tells the user. `controlled` says whether a worker already controls the page,
// because the very first install is not an update. It may be a function, evaluated when the event fires.
export function watchForUpdate(
  reg: ServiceWorkerRegistration,
  controlled: boolean | (() => boolean),
  onReady: (waiting: ServiceWorker) => void,
): void {
  const isControlled = () => (typeof controlled === 'function' ? controlled() : controlled);
  if (reg.waiting && isControlled()) onReady(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && isControlled()) onReady(worker);
    });
  });
}
