import { describe, expect, it, vi } from 'vitest';
import { watchForUpdate } from '../../src/pwa/sw-updates';

// Minimal fakes for ServiceWorkerRegistration and ServiceWorker: only the events the logic uses.
class FakeWorker extends EventTarget { state = 'installing'; }
class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
}
const asReg = (r: FakeRegistration) => r as unknown as ServiceWorkerRegistration;

describe('watchForUpdate', () => {
  it('reports an update that is already waiting when the page loads', () => {
    const reg = new FakeRegistration();
    reg.waiting = new FakeWorker();
    const ready = vi.fn();
    watchForUpdate(asReg(reg), true, ready);
    expect(ready).toHaveBeenCalledWith(reg.waiting);
  });

  it('reports a newly installed worker when the page is already controlled (a real update)', () => {
    const reg = new FakeRegistration();
    const ready = vi.fn();
    watchForUpdate(asReg(reg), true, ready);
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event('updatefound'));
    w.state = 'installed';
    w.dispatchEvent(new Event('statechange'));
    expect(ready).toHaveBeenCalledWith(w);
  });

  it('does not report the very first install, which is not an update', () => {
    const reg = new FakeRegistration();
    const ready = vi.fn();
    watchForUpdate(asReg(reg), false, ready);
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event('updatefound'));
    w.state = 'installed';
    w.dispatchEvent(new Event('statechange'));
    expect(ready).not.toHaveBeenCalled();
  });

  it('ignores intermediate worker states', () => {
    const reg = new FakeRegistration();
    const ready = vi.fn();
    watchForUpdate(asReg(reg), true, ready);
    const w = new FakeWorker();
    reg.installing = w;
    reg.dispatchEvent(new Event('updatefound'));
    w.state = 'installing';
    w.dispatchEvent(new Event('statechange'));
    expect(ready).not.toHaveBeenCalled();
  });
});
