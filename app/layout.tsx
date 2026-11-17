import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../src/auth/AuthProvider';
import { AppUpdateBanner } from '../src/pwa/AppUpdateBanner';
import { TapeRule } from '../src/ui/components';
import { ToastProvider } from '../src/ui/toast';
import './globals.css';

export const metadata: Metadata = { title: 'TailorPro', description: 'Customers, measurements, orders and payments for tailors.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AppUpdateBanner />
          <TapeRule />
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
