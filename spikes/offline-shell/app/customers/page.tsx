'use client';
import { useEffect, useState } from 'react';
import { db, type Customer } from '../db';

export default function Customers() {
  const [rows, setRows] = useState<Customer[] | null>(null);
  useEffect(() => {
    void db.customers.orderBy('name').toArray().then(setRows);
  }, []);
  return (
    <main>
      <h1>Customers (from IndexedDB)</h1>
      <ul data-testid="list">
        {rows?.map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
    </main>
  );
}
