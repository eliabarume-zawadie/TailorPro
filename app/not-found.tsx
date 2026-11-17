import Link from 'next/link';
import { t } from '../src/i18n/en';

// Also exported as 404.html and served by the service worker for unknown addresses while offline.
export default function NotFound() {
  return (
    <main>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link href="/app/">{t('notFound.home')}</Link>
    </main>
  );
}
