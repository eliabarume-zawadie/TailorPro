// Generates a THROWAWAY ES256 keypair. Public JWKS goes into the Worker config; the signed test token goes to cf/token.txt (gitignored).
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { writeFileSync } from 'node:fs';
const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'spike', alg: 'ES256', use: 'sig' };
const token = await new SignJWT({ sub: crypto.randomUUID(), role: 'authenticated', aud: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'spike' }).setExpirationTime('24h').sign(privateKey);
writeFileSync('cf/jwks.json', JSON.stringify({ keys: [jwk] }));
writeFileSync('cf/token.txt', token);
console.log('wrote cf/jwks.json (public) and cf/token.txt (throwaway, 24h)');
