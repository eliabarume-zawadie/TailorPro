// Writes .env.local for the Next build from the running local Supabase stack. Public values only (URL and anon key).
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const s = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
writeFileSync('.env.local', `NEXT_PUBLIC_SUPABASE_URL=${s.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${s.ANON_KEY}\n`);
console.log('wrote .env.local for', s.API_URL);
