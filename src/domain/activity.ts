import type { MessageKey } from '../i18n/en';

// Audit-log actions shown to owners as "Recent activity". The database stores stable action codes; this turns them into
// plain-language messages from the catalog. An action this version does not know shows a neutral message, never the raw code.
const labels: Record<string, MessageKey> = {
  'business.created': 'activity.businessCreated',
  'business.updated': 'activity.businessUpdated',
};

export function activityLabelKey(action: string): MessageKey {
  return labels[action] ?? 'activity.other';
}

/** Formats a timestamp in the BUSINESS timezone (AD-5), not the device's. Falls back to UTC for an unknown timezone. */
export function formatWhen(iso: string, timeZone: string, locale: string): string {
  // Malawi writes dates day-month-year (British convention), so plain English maps to en-GB, not en-US.
  const tag = locale === 'en' ? 'en-GB' : locale;
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  try {
    return new Intl.DateTimeFormat(tag, { ...options, timeZone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(tag, { ...options, timeZone: 'UTC' }).format(new Date(iso));
  }
}
