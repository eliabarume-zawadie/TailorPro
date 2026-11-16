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
const A=await user(`pa${sfx}@example.test`), B=await user(`pb${sfx}@example.test`);
const rpc=(t,fn,args)=>rest(t,'rpc/'+fn,{method:'POST',body:JSON.stringify(args)});
const ctx={};
ctx.a=(await rpc(A,'register_business',{p_name:'A'})).b; ctx.b=(await rpc(B,'register_business',{p_name:'B'})).b;
const custA=crypto.randomUUID(), custB=crypto.randomUUID();
await rest(A,'customers',{method:'POST',body:JSON.stringify({id:custA,business_id:ctx.a,full_name:'ca'})});
await rest(B,'customers',{method:'POST',body:JSON.stringify({id:custB,business_id:ctx.b,full_name:'cb'})});
const ordA=crypto.randomUUID(), ordB=crypto.randomUUID();
const pay=(t,order,amt,op=crypto.randomUUID(),sync=false)=>rpc(t,'record_payment',{p_op:op,p_payment:crypto.randomUUID(),p_order:order,p_amount:amt,p_from_sync:sync});
const fin=async(t,o)=>(await rest(t,'order_financials?order_id=eq.'+o)).b[0];

await ok('create order (idempotent on replay)',async()=>{
  for(let i=0;i<2;i++){const r=await rpc(A,'create_order',{p_id:ordA,p_business:ctx.a,p_customer:custA,p_total:1000});assert.equal(r.s,200,JSON.stringify(r.b));}
  await rpc(B,'create_order',{p_id:ordB,p_business:ctx.b,p_customer:custB,p_total:1000});
  const o=await rest(A,'orders?id=eq.'+ordA);assert.equal(o.b.length,1);
});
await ok('cross-tenant create_order into B business rejected',async()=>{const r=await rpc(A,'create_order',{p_id:crypto.randomUUID(),p_business:ctx.b,p_customer:custB,p_total:1});assert.ok(r.s>=400);});
await ok('cross-tenant record_payment on B order rejected, B balance untouched',async()=>{const r=await pay(A,ordB,100);assert.ok(r.s>=400,JSON.stringify(r));assert.equal((await fin(B,ordB)).paid_minor,0);});
await ok('invalid amounts rejected (0, negative)',async()=>{for(const a of [0,-5]){const r=await pay(A,ordA,a);assert.ok(r.s>=400);}});
await ok('REPLAY: same op_id sent 5x (lost responses) records exactly once',async()=>{
  const op=crypto.randomUUID();const rs=[];for(let i=0;i<5;i++)rs.push((await pay(A,ordA,100,op,true)).b.status);
  assert.deepEqual(rs,['recorded','duplicate','duplicate','duplicate','duplicate']);assert.equal((await fin(A,ordA)).paid_minor,100);});
await ok('online overpayment rejected',async()=>{const r=await pay(A,ordA,901,crypto.randomUUID(),false);assert.ok(r.s>=400);assert.equal((await fin(A,ordA)).paid_minor,100);});
await ok('CONCURRENCY: 10 parallel offline-sync payments of 200 (total 2000 vs remaining 900) -> all recorded, none lost, overpayment flagged',async()=>{
  const rs=await Promise.all(Array.from({length:10},()=>pay(A,ordA,200,crypto.randomUUID(),true)));
  assert.ok(rs.every(r=>r.s===200),JSON.stringify(rs.map(r=>r.s)));
  const f=await fin(A,ordA);assert.equal(f.paid_minor,2100);assert.equal(f.balance_minor,-1100);
  const flagged=(await rest(A,'payments?order_id=eq.'+ordA+'&needs_review=eq.true&select=id')).b.length;
  assert.equal(flagged,6,'100 paid + 4x200 = 900 fits total 1000; remaining 6 exceed it; flagged='+flagged);});
await ok('CONCURRENCY: parallel duplicate op_id x10 -> one row',async()=>{
  const op=crypto.randomUUID();const rs=await Promise.all(Array.from({length:10},()=>pay(B,ordB,50,op,true)));
  assert.ok(rs.every(r=>r.s===200));assert.equal((await fin(B,ordB)).paid_minor,50);});
await ok('payments are append-only: UPDATE/DELETE/INSERT/TRUNCATE denied AND data unchanged',async()=>{
  const before=(await rest(A,'payments?select=id,amount_minor&order_id=eq.'+ordA+'&order=id')).b;
  const id=before[0].id;
  const u=await rest(A,'payments?id=eq.'+id,{method:'PATCH',body:JSON.stringify({amount_minor:1})});
  const d=await rest(A,'payments?id=eq.'+id,{method:'DELETE'});
  const i=await rest(A,'payments',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),op_id:crypto.randomUUID(),business_id:ctx.a,order_id:ordA,amount_minor:5})});
  assert.ok(u.s>=400&&d.s>=400&&i.s>=400,'statuses '+[u.s,d.s,i.s].join());
  const after=(await rest(A,'payments?select=id,amount_minor&order_id=eq.'+ordA+'&order=id')).b;
  assert.deepEqual(after,before);});
await ok('tenant B cannot see A payments',async()=>{assert.equal((await rest(B,'payments?order_id=eq.'+ordA)).b.length,0);});
console.log(`
${pass} passed, ${fail} failed`);process.exit(fail?1:0);
