import Dexie, { type EntityTable } from 'dexie';
import type { Profile, Workspace } from '../domain/account';

// Persistent local storage (PRD 5.1, AD-3). Phase 1 caches only what the app needs to open offline:
// the signed-in user's business, profile and recent activity. Customers, orders and the outbox arrive with their phases.
// Everything is cleared on sign-out so nothing stays on a shared phone. (Phase 5 must warn before sign-out when
// unsynced operations exist, because clearing would discard them.)

export interface AccountSnapshot { userId: string; workspace: Workspace | null; profile: Profile | null; cachedAt: number }
export interface ActivityRow { id: string; action: string; createdAt: string }
interface StoredActivity extends ActivityRow { workspaceId: string }

export class LocalDb extends Dexie {
  accounts!: EntityTable<AccountSnapshot, 'userId'>;
  activity!: EntityTable<StoredActivity, 'id'>;
  private readonly listeners = new Set<() => void>();

  constructor(name = 'tailorpro-local') {
    super(name);
    this.version(1).stores({ accounts: 'userId', activity: 'id, workspaceId, createdAt' });
    // Another tab upgraded the schema. Close at once so the upgrade is never blocked by this old tab, then tell the app
    // so it can ask the user to reload (an old tab must not keep writing with an outdated schema).
    this.on('versionchange', () => {
      this.close();
      this.listeners.forEach((l) => l());
      return false;
    });
  }

  onVersionChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

export interface LocalStore {
  getAccount(userId: string): Promise<AccountSnapshot | undefined>;
  saveAccount(snapshot: Omit<AccountSnapshot, 'cachedAt'>): Promise<void>;
  getActivity(workspaceId: string): Promise<ActivityRow[]>;
  saveActivity(workspaceId: string, rows: ActivityRow[]): Promise<void>;
  clearAll(): Promise<void>;
}

export function createLocalStore(db: LocalDb): LocalStore {
  return {
    getAccount: (userId) => db.accounts.get(userId),
    async saveAccount(snapshot) { await db.accounts.put({ ...snapshot, cachedAt: Date.now() }); },
    async getActivity(workspaceId) {
      const rows = await db.activity.where('workspaceId').equals(workspaceId).toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ id, action, createdAt }) => ({ id, action, createdAt }));
    },
    async saveActivity(workspaceId, rows) {
      await db.transaction('rw', db.activity, async () => {
        await db.activity.where('workspaceId').equals(workspaceId).delete();
        await db.activity.bulkPut(rows.map((r) => ({ ...r, workspaceId })));
      });
    },
    async clearAll() {
      await db.transaction('rw', db.accounts, db.activity, async () => { await db.accounts.clear(); await db.activity.clear(); });
    },
  };
}

// One database per page load, created only in a browser (the static export is prerendered in Node).
let db: LocalDb | null = null;
let store: LocalStore | null = null;
export function getLocalDb(): LocalDb | null {
  if (typeof indexedDB === 'undefined') return null;
  db ??= new LocalDb();
  return db;
}
export function getLocalStore(): LocalStore | null {
  const d = getLocalDb();
  if (!d) return null;
  store ??= createLocalStore(d);
  return store;
}
