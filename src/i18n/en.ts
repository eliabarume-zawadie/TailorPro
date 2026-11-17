// English message catalog (Decision K, AD-6). All user-facing strings live here; Chichewa and French are added later.
// Validation errors from src/domain use these keys as their messages.
export const en = {
  app: { name: 'TailorPro', loading: 'Loading…' },
  nav: { dashboard: 'Dashboard', settings: 'Settings', signOut: 'Sign out', main: 'Main navigation' },
  signIn: {
    title: 'Sign in to TailorPro',
    subtitle: 'Keep your customers, measurements and orders in one place.',
    google: 'Continue with Google',
    or: 'or',
    emailLabel: 'Email address',
    sendCode: 'Send sign-in code',
    sending: 'Sending…',
    codeSent: 'We sent a 6-digit code to {email}. It expires in 10 minutes.',
    codeLabel: '6-digit code',
    submit: 'Sign in',
    verifying: 'Signing in…',
    resend: 'Send a new code',
    codeResent: 'We sent a new code. Use the newest one.',
    useOtherEmail: 'Use a different email',
    callbackWorking: 'Finishing sign-in…',
    callbackFailed: 'Google sign-in did not complete.',
    backToSignIn: 'Back to sign in',
  },
  register: {
    title: 'Set up your business',
    subtitle: 'This creates your private workspace. You can change most details later.',
    businessName: 'Business name',
    ownerName: 'Your name',
    phone: 'Phone number',
    phoneHint: 'Customers and staff will see this. Example: +265 999 123 456',
    email: 'Business email (optional)',
    location: 'Location',
    locationHint: 'Town or area, for example Area 25, Lilongwe',
    country: 'Country',
    currency: 'Currency',
    businessType: 'Business type',
    businessTypeChoose: 'Choose…',
    submit: 'Create business',
    submitting: 'Creating…',
    types: {
      individual_tailor: 'Individual tailor',
      tailoring_shop: 'Tailoring shop',
      multi_worker_business: 'Business with several workers',
      other: 'Other',
    },
    countryMalawi: 'Malawi',
    fixErrors: 'Please fix the highlighted fields.',
  },
  dashboard: {
    welcome: 'Welcome to TailorPro',
    emptyTitle: 'Your workspace is ready',
    emptyBody: 'Customers, measurements, orders and payments will appear here as you add them. Your business details are saved.',
    workspaceError: 'We could not load your business. Check your connection and try again.',
    retry: 'Try again',
  },
  settings: {
    title: 'Settings',
    profileTitle: 'Your profile',
    fullName: 'Your name',
    phone: 'Phone number',
    saveProfile: 'Save profile',
    saving: 'Saving…',
    saved: 'Profile saved.',
    signedInAs: 'Signed in as {email}',
  },
  errors: {
    required: 'This field is required.',
    businessName: { required: 'Enter your business name.', tooLong: 'Business name must be 120 characters or fewer.' },
    ownerName: { required: 'Enter your name.', tooLong: 'Name must be 120 characters or fewer.' },
    fullName: { required: 'Enter your name.', tooLong: 'Name must be 120 characters or fewer.' },
    phone: 'Enter a phone number with 7 to 15 digits.',
    email: 'Enter a valid email address, or leave it empty.',
    location: { required: 'Enter your business location.', tooLong: 'Location must be 200 characters or fewer.' },
    country: 'Choose a country.',
    currency: 'Choose a supported currency.',
    businessType: { required: 'Choose a business type.', tooLong: 'Business type must be 60 characters or fewer.' },
    auth: {
      invalidCode: 'That code is not correct or has expired.',
      rateLimited: 'Please wait a minute before asking for another code.',
      invalidEmail: 'Enter a valid email address.',
      network: 'No connection. Check your internet and try again.',
      unknown: 'Something went wrong. Please try again.',
    },
    saveFailed: 'We could not save that. Check your connection and try again.',
  },
} as const;

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Leaves<typeof en>;

export function hasMessage(key: string): key is MessageKey {
  let cur: unknown = en;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string';
}

/** Looks up a message and fills {placeholders}. Returns the key itself if missing (and tests fail on that). */
export function t(key: MessageKey, params: Record<string, string> = {}): string {
  let cur: unknown = en;
  for (const part of key.split('.')) cur = (cur as Record<string, unknown>)?.[part];
  if (typeof cur !== 'string') return key;
  return cur.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`);
}
