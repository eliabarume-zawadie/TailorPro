import assert from 'node:assert/strict';
const API='http://127.0.0.1:54321';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
let pass=0, fail=0;
const ok=(name,fn)=>fn().then(()=>{pass++;console.log('PASS',name)},e=>{fail++;console.log('FAIL',name,'-',e.message)});
const j=async(r)=>{const t=await r.text();try{return {s:r.status,b:JSON.parse(t)}}catch{return {s:r.status,b:t,raw:true}}};
const rest=(tok,path,opt={})=>fetch(API+'/rest/v1/'+path,{...opt,headers:{apikey:ANON,authorization:'Bearer '+tok,'content-type':'application/json',prefer:'return=representation',...(opt.headers||{})}}).then(j);

// users created via admin API, then signed in through the email-OTP path (admin generate_link gives the real OTP)
async function user(email){
  await fetch(API+'/auth/v1/admin/users',{method:'POST',headers:{apikey:SVC,authorization:'Bearer '+SVC,'content-type':'application/json'},body:JSON.stringify({email,email_confirm:true})});
  const gl=await fetch(API+'/auth/v1/admin/generate_link',{method:'POST',headers:{apikey:SVC,authorization:'Bearer '+SVC,'content-type':'application/json'},body:JSON.stringify({type:'magiclink',email})}).then(j);
  const v=await fetch(API+'/auth/v1/verify',{method:'POST',headers:{apikey:ANON,'content-type':'application/json'},body:JSON.stringify({type:'email',email,token:gl.b.email_otp})}).then(j);
  assert.equal(v.s,200,'otp verify '+JSON.stringify(v.b));
  return v.b.access_token;
}
const sfx=Date.now();
const A=await user(`a${sfx}@example.test`), B=await user(`b${sfx}@example.test`);
const hdr=JSON.parse(Buffer.from(A.split('.')[0],'base64url'));
console.log('JWT header from local Auth:',JSON.stringify(hdr));

await ok('Google provider redirects to accounts.google.com (wiring only, dummy client id)',async()=>{
  const r=await fetch(API+'/auth/v1/authorize?provider=google',{redirect:'manual',headers:{apikey:ANON}});
  assert.equal(r.status,302); const loc=r.headers.get('location');
  assert.match(loc,/^https:\/\/accounts\.google\.com\//); assert.match(loc,/client_id=spike-dummy/);
});
await ok('email OTP sign-in yields a JWT',async()=>assert.ok(A&&B&&A!==B));

const ctx={};
await ok('A registers business via RPC',async()=>{const r=await rest(A,'rpc/register_business',{method:'POST',body:JSON.stringify({p_name:'A Tailors'})});assert.equal(r.s,200,JSON.stringify(r.b));ctx.a=r.b;});
await ok('B registers business via RPC',async()=>{const r=await rest(B,'rpc/register_business',{method:'POST',body:JSON.stringify({p_name:'B Tailors'})});assert.equal(r.s,200);ctx.b=r.b;});
await ok('anonymous cannot call register_business',async()=>{const r=await rest(ANON,'rpc/register_business',{method:'POST',body:JSON.stringify({p_name:'x'})});assert.ok(r.s>=400,'status '+r.s);});
await ok('direct INSERT into businesses is denied (no grant)',async()=>{const r=await rest(A,'businesses',{method:'POST',body:JSON.stringify({name:'evil',created_by:'00000000-0000-0000-0000-000000000000'})});assert.ok(r.s>=400,JSON.stringify(r));});
await ok('direct INSERT into business_members (self-join B) is denied',async()=>{const r=await rest(A,'business_members',{method:'POST',body:JSON.stringify({business_id:ctx.b,user_id:'00000000-0000-0000-0000-000000000000',role:'owner'})});assert.ok(r.s>=400);});
const cA=crypto.randomUUID(), cB=crypto.randomUUID();
await ok('A creates customer in own business',async()=>{const r=await rest(A,'customers',{method:'POST',body:JSON.stringify({id:cA,business_id:ctx.a,full_name:'Alice client'})});assert.equal(r.s,201,JSON.stringify(r.b));});
await ok('B creates customer in own business',async()=>{const r=await rest(B,'customers',{method:'POST',body:JSON.stringify({id:cB,business_id:ctx.b,full_name:'Bob client'})});assert.equal(r.s,201);});
await ok('CROSS-TENANT INSERT: A inserts into B business -> rejected',async()=>{const r=await rest(A,'customers',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),business_id:ctx.b,full_name:'planted'})});assert.ok(r.s>=400,JSON.stringify(r));});
await ok('CROSS-TENANT READ: A lists customers -> only own',async()=>{const r=await rest(A,'customers?select=id');assert.deepEqual(r.b.map(x=>x.id),[cA]);});
await ok('CROSS-TENANT READ by id: A reads B customer -> empty',async()=>{const r=await rest(A,'customers?id=eq.'+cB);assert.deepEqual(r.b,[]);});
await ok('CROSS-TENANT READ: A reads B business -> empty',async()=>{const r=await rest(A,'businesses?id=eq.'+ctx.b);assert.deepEqual(r.b,[]);});
await ok('CROSS-TENANT UPDATE: A updates B customer -> 0 rows changed',async()=>{const r=await rest(A,'customers?id=eq.'+cB,{method:'PATCH',body:JSON.stringify({full_name:'hacked'})});assert.deepEqual(r.b,[]);const chk=await rest(B,'customers?id=eq.'+cB);assert.equal(chk.b[0].full_name,'Bob client');});
await ok('MOVE ATTACK: A moves own customer into B business -> rejected',async()=>{const r=await rest(A,'customers?id=eq.'+cA,{method:'PATCH',body:JSON.stringify({business_id:ctx.b})});assert.ok(r.s>=400,JSON.stringify(r));});
await ok('CROSS-TENANT DELETE: A deletes B customer -> denied, row survives',async()=>{const r=await rest(A,'customers?id=eq.'+cB,{method:'DELETE'});assert.ok(r.s>=400||(Array.isArray(r.b)&&r.b.length===0));const chk=await rest(B,'customers?id=eq.'+cB);assert.equal(chk.b.length,1);});
await ok('OWN DELETE: A cannot delete own customer either (archive-only rule)',async()=>{const r=await rest(A,'customers?id=eq.'+cA,{method:'DELETE'});assert.ok(r.s>=400);const chk=await rest(A,'customers?id=eq.'+cA);assert.equal(chk.b.length,1);});
await ok('anonymous reads nothing',async()=>{const r=await rest(ANON,'customers');assert.ok(r.s>=400||r.b.length===0);});
await ok('replayed upsert of same client UUID does not duplicate',async()=>{const r=await rest(A,'customers',{method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id:cA,business_id:ctx.a,full_name:'Alice client'})});assert.ok(r.s<300);const c=await rest(A,'customers?select=id');assert.equal(c.b.length,1);});

console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);
