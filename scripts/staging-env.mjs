// Guards the hosted (staging/production) build. NEXT_PUBLIC_* values are compiled into code every visitor downloads, so
// this refuses: missing values, a local or non-HTTPS URL, and any SECRET key in the public key's place. It never prints a key.
// Usage: node scripts/staging-env.mjs   (reads the environment; exit code 1 means do not build or deploy)

function problems(env) {
  const out = [];
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) out.push('NEXT_PUBLIC_SUPABASE_URL is not set.');
  if (!key) out.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.');

  if (url) {
    let parsed = null;
    try { parsed = new URL(url); } catch { out.push('NEXT_PUBLIC_SUPABASE_URL is not a valid URL.'); }
    if (parsed) {
      if (parsed.protocol !== 'https:') out.push('NEXT_PUBLIC_SUPABASE_URL must use https.');
      if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) out.push('NEXT_PUBLIC_SUPABASE_URL points at this machine; the hosted app needs the hosted project URL.');
    }
  }

  if (key) {
    if (key.startsWith('sb_secret_')) out.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is a SECRET key (sb_secret_...). Use the publishable key. A secret key in the app gives every visitor full database access.');
    else if (key.startsWith('sb_publishable_')) { /* the public key: fine */ } else {
      const parts = key.split('.');
      let role = null;
      if (parts.length === 3) {
        try { role = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? null; } catch { /* not a JWT */ }
      }
      if (role === 'service_role') out.push('NEXT_PUBLIC_SUPABASE_ANON_KEY holds a service_role key. That key bypasses all security rules and must never be in the app. Use the anon or publishable key.');
      else if (role !== 'anon') out.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not an anon JWT or a publishable key.');
    }
  }
  return out;
}

const found = problems(process.env);
if (found.length > 0) {
  console.error('Refusing to build for the hosted environment:');
  for (const p of found) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Hosted environment check passed (hosted URL, public key only).');
