import type { ReactNode } from 'react';
import SwRegister from './sw-register';

export const metadata = { title: 'TailorPro spike', manifest: '/manifest.webmanifest' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        <nav>
          <a href="/">Home</a> | <a href="/customers/">Customers</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
