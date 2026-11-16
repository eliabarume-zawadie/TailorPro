import Dexie, { type EntityTable } from 'dexie';

export interface Customer {
  id: string;
  name: string;
  createdAt: number;
}
export interface OutboxOp {
  opId: string;
  entity: string;
  entityId: string;
  createdAt: number;
}

export const db = new Dexie('tailorpro-spike') as Dexie & {
  customers: EntityTable<Customer, 'id'>;
  outbox: EntityTable<OutboxOp, 'opId'>;
};
db.version(1).stores({ customers: 'id, name', outbox: 'opId, createdAt' });

/** Local-first write: data and outbox entry in ONE transaction (SYNC_DESIGN.md section 1). */
export async function addCustomer(name: string) {
  const id = crypto.randomUUID();
  const opId = crypto.randomUUID();
  await db.transaction('rw', db.customers, db.outbox, async () => {
    await db.customers.add({ id, name, createdAt: Date.now() });
    await db.outbox.add({ opId, entity: 'customer', entityId: id, createdAt: Date.now() });
  });
  return id;
}
