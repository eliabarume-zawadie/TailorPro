'use client';
import { useEffect, useState } from 'react';
import { addCustomer, db } from './db';

export default function Home() {
  const [count, setCount] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [name, setName] = useState('');
  const refresh = async () => {
    setCount(await db.customers.count());
    setPending(await db.outbox.count());
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <main>
      <h1>TailorPro offline spike</h1>
      <p>
        Customers: <b data-testid="count">{count ?? '...'}</b> | Pending ops:{' '}
        <b data-testid="pending">{pending ?? '...'}</b>
      </p>
      <input data-testid="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
      <button
        data-testid="add"
        onClick={async () => {
          await addCustomer(name || 'Unnamed');
          setName('');
          await refresh();
        }}
      >
        Add customer (saved locally)
      </button>
    </main>
  );
}
