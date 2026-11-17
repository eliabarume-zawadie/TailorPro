// Local data layer (AD-3): persistent cache of the signed-in user's account, behind a repository interface.
// Uses an in-memory IndexedDB; the real browser behaviour (reopen, offline) is covered by tests/e2e/offline.spec.ts.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '../../src/domain/account';
import { LocalDb, createLocalStore } from '../../src/data/local-store';

const workspace: Workspace = { id: 'w1', name: 'Banda Tailoring', version: 2, role: 'owner', location: 'Area 25, Lilongwe', businessType: 'individual_tailor', currency: 'MWK', timezone: 'Africa/Blantyre' };
const profile = { fullName: 'Amina Banda', phone: '+265999123456', email: 'amina@example.test', locale: 'en' };
let n = 0;
const fresh = () => { const db = new LocalDb(`test-${n++}-${Math.random()}`); return { db, store: createLocalStore(db) }; };
const opened: LocalDb[] = [];
afterEach(async () => { for (const d of opened.splice(0)) { d.close(); await Dexie.delete(d.name); } });

describe('account cache', () => {
  it('saves and returns an account snapshot', async () => {
    const { db, store } = fresh(); opened.push(db);
    expect(await store.getAccount('u1')).toBeUndefined();
    await store.saveAccount({ userId: 'u1', workspace, profile });
    const got = await store.getAccount('u1');
    expect(got?.workspace).toEqual(workspace);
    expect(got?.profile).toEqual(profile);
    expect(got?.cachedAt).toBeGreaterThan(0);
  });

  it('keeps accounts apart: one user never reads another user\'s cache', async () => {
    const { db, store } = fresh(); opened.push(db);
    await store.saveAccount({ userId: 'u1', workspace, profile });
    expect(await store.getAccount('u2')).toBeUndefined();
  });

  it('overwrites the previous snapshot for the same user', async () => {
    const { db, store } = fresh(); opened.push(db);
    await store.saveAccount({ userId: 'u1', workspace, profile });
    await store.saveAccount({ userId: 'u1', workspace: { ...workspace, name: 'Banda & Sons', version: 3 }, profile });
    expect((await store.getAccount('u1'))?.workspace?.name).toBe('Banda & Sons');
  });

  it('survives closing and reopening the database', async () => {
    const name = `reopen-${Math.random()}`;
    const first = new LocalDb(name);
    await createLocalStore(first).saveAccount({ userId: 'u1', workspace, profile });
    first.close();
    const second = new LocalDb(name); opened.push(second);
    expect((await createLocalStore(second).getAccount('u1'))?.workspace?.name).toBe('Banda Tailoring');
  });

  it('clearAll removes everything, so nothing is left on a shared phone after sign-out', async () => {
    const { db, store } = fresh(); opened.push(db);
    await store.saveAccount({ userId: 'u1', workspace, profile });
    await store.saveActivity('w1', [{ id: 'a1', action: 'business.created', createdAt: '2026-11-17T10:00:00Z' }]);
    await store.clearAll();
    expect(await store.getAccount('u1')).toBeUndefined();
    expect(await store.getActivity('w1')).toEqual([]);
  });
});

describe('activity cache', () => {
  it('returns the newest first and replaces the previous set for the workspace', async () => {
    const { db, store } = fresh(); opened.push(db);
    await store.saveActivity('w1', [
      { id: 'a1', action: 'business.created', createdAt: '2026-11-17T10:00:00Z' },
      { id: 'a2', action: 'business.updated', createdAt: '2026-11-17T12:00:00Z' },
    ]);
    expect((await store.getActivity('w1')).map((r) => r.id)).toEqual(['a2', 'a1']);
    await store.saveActivity('w1', [{ id: 'a3', action: 'business.updated', createdAt: '2026-11-18T09:00:00Z' }]);
    expect((await store.getActivity('w1')).map((r) => r.id)).toEqual(['a3']);
  });
  it('does not mix workspaces', async () => {
    const { db, store } = fresh(); opened.push(db);
    await store.saveActivity('w1', [{ id: 'a1', action: 'business.created', createdAt: '2026-11-17T10:00:00Z' }]);
    expect(await store.getActivity('w2')).toEqual([]);
  });
});

describe('schema change from another tab', () => {
  it('closes this connection and tells the app, so an old tab never blocks or corrupts an upgrade', async () => {
    const name = `upgrade-${Math.random()}`;
    const old = new LocalDb(name);
    const listener = vi.fn();
    old.onVersionChange(listener);
    await old.open();
    const newer = new Dexie(name);
    newer.version(1).stores({ accounts: 'userId', activity: 'id, workspaceId, createdAt' });
    newer.version(2).stores({ accounts: 'userId', activity: 'id, workspaceId, createdAt', extra: 'id' });
    await newer.open();
    expect(listener).toHaveBeenCalledOnce();
    expect(old.isOpen()).toBe(false);
    newer.close(); await Dexie.delete(name);
  });
});
