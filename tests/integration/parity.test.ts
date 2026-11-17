// Client/server rule parity (AD-7): the same vectors go through the Zod schema and the real create_business function.
import { beforeAll, describe, expect, it } from 'vitest';
import { businessRegistrationSchema, toCreateBusinessArgs } from '../../src/domain/business';
import { baseInput, invalidVectors, validVectors } from '../vectors/business';
import { rest, rpc, signInNewUser } from './helpers';

let token: string;
beforeAll(async () => { token = (await signInNewUser('parity', 'Parity Tester')).token; });

// Calls the database with the RAW input (what a malicious client could send), bypassing the client schema,
// using the same field mapping the app uses.
const rawRpc = (id: string, raw: Record<string, string>) => rpc(token, 'create_business', {
  p_id: id, p_name: raw.name, p_owner_name: raw.ownerName, p_phone: raw.phone, p_email: raw.email || null,
  p_location: raw.location, p_country: raw.country, p_currency: raw.currency, p_business_type: raw.businessType,
});

describe('client schema and database function agree', () => {
  it.each(validVectors)('both accept, and normalise identically: $label', async ({ input }) => {
    const raw = { ...baseInput, ...input };
    const parsed = businessRegistrationSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const id = crypto.randomUUID();
    const r = await rpc(token, 'create_business', toCreateBusinessArgs(id, parsed.data));
    expect(r.status).toBe(200);
    const row = (await rest(token, `businesses?id=eq.${id}&select=name,owner_name,phone,email,location,country,currency,business_type`)).body as Record<string, unknown>[];
    expect(row).toEqual([{ name: parsed.data.name, owner_name: parsed.data.ownerName, phone: parsed.data.phone, email: parsed.data.email, location: parsed.data.location, country: parsed.data.country, currency: parsed.data.currency, business_type: parsed.data.businessType }]);
  });

  it.each(validVectors)('database alone also normalises raw input the same way: $label', async ({ input }) => {
    const raw = { ...baseInput, ...input };
    const parsed = businessRegistrationSchema.parse(raw);
    const id = crypto.randomUUID();
    const r = await rawRpc(id, raw);
    expect(r.status).toBe(200);
    const row = (await rest(token, `businesses?id=eq.${id}&select=name,phone,email,location,country`)).body as Record<string, unknown>[];
    expect(row).toEqual([{ name: parsed.name, phone: parsed.phone, email: parsed.email, location: parsed.location, country: parsed.country }]);
  });

  it.each(invalidVectors)('both reject: $label', async ({ input }) => {
    const raw = { ...baseInput, ...input };
    expect(businessRegistrationSchema.safeParse(raw).success).toBe(false);
    const id = crypto.randomUUID();
    const r = await rawRpc(id, raw);
    expect(r.status).toBe(400);
    expect((await rest(token, `businesses?id=eq.${id}`)).body).toEqual([]);
  });
});
