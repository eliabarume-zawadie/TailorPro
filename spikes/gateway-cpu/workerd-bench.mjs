import { execSync } from 'node:child_process';
const API='http://127.0.0.1:54321';
const SVC='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const h=(k)=>({apikey:k,authorization:'Bearer '+k,'content-type':'application/json'});
const email=`w${Date.now()}@example.test`;
await fetch(API+'/auth/v1/admin/users',{method:'POST',headers:h(SVC),body:JSON.stringify({email,email_confirm:true})});
const gl=await (await fetch(API+'/auth/v1/admin/generate_link',{method:'POST',headers:h(SVC),body:JSON.stringify({type:'magiclink',email})})).json();
const tok=(await (await fetch(API+'/auth/v1/verify',{method:'POST',headers:h(ANON),body:JSON.stringify({type:'email',email,token:gl.email_otp})})).json()).access_token;
const body=JSON.stringify({device_id:crypto.randomUUID(),ops:Array.from({length:50},(_,i)=>({op_id:crypto.randomUUID(),table:'payments',entity_id:crypto.randomUUID(),payload:{order_id:crypto.randomUUID(),amount_minor:1500000+i,currency:'MWK',note:'x'.repeat(80)}}))});
const cpu=()=>parseFloat(execSync(`powershell -NoProfile -Command "(Get-Process workerd | Measure-Object -Property CPU -Sum).Sum"`).toString().trim());
const call=()=>fetch('http://127.0.0.1:8799/sync',{method:'POST',headers:{authorization:'Bearer '+tok,'content-type':'application/json'},body});

const run=async(path,withAuth)=>{
  const call=()=>fetch('http://127.0.0.1:8799'+path,{method:'POST',headers:{...(withAuth?{authorization:'Bearer '+tok}:{}),'content-type':'application/json'},body});
  for(let i=0;i<300;i++) await call();
  const N=1500; const c0=cpu(); for(let i=0;i<N;i++){const r=await call(); if(r.status!==200) throw new Error(path+' '+r.status);}
  console.log(path.padEnd(7),(((cpu()-c0)*1000)/N).toFixed(2),'ms CPU/request');
};
await run('/ping',false); await run('/sync',true);
const bad=await fetch('http://127.0.0.1:8799/sync',{method:'POST',headers:{authorization:'Bearer garbage','content-type':'application/json'},body}); console.log('garbage token ->',bad.status);
