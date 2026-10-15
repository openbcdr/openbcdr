/* Prove the oracle rejects broken guards/checks, always restoring source. */
'use strict';
const fs=require('fs'), path=require('path'), cp=require('child_process');
const engine=path.resolve(__dirname,'../engine.js'), boundary=path.resolve(__dirname,'../boundary.js');
const mutations=[
  [engine,'RTO dependency inequality','e.rto_hours>d.rto_hours','e.rto_hours<d.rto_hours'],
  [engine,'quote verifier',"Boolean(strip(quote)) && compliance.normalise(planText).includes(compliance.normalise(quote))",'true'],
  [engine,'report score gate','if(blockers.length) {','if(false) {'],
  [boundary,'boundary attestation',"matches.length===0 && (mode==='internal'||attested)",'matches.length===0']
];
let failures=0;
for(const [file,label,from,to] of mutations) {
  const original=fs.readFileSync(file,'utf8');
  if(!original.includes(from)) throw new Error('Mutation anchor missing: '+label);
  try {
    fs.writeFileSync(file,original.replace(from,to));
    const result=cp.spawnSync(process.execPath,[path.join(__dirname,'parity.js')],{encoding:'utf8'});
    const detected=result.status!==null && result.status!==0 && result.stderr.includes('MISMATCH');
    console.log(`${label}: parity exit ${result.status}; ${detected?'DETECTED':'NOT DETECTED'}`);
    if(!detected) { failures++; console.error(result.stdout,result.stderr); }
  } finally {fs.writeFileSync(file,original);}
}
const restored=cp.spawnSync(process.execPath,[path.join(__dirname,'parity.js')],{encoding:'utf8'});
process.stdout.write(restored.stdout); process.stderr.write(restored.stderr);
process.exitCode=failures || restored.status!==0 ? 1 : 0;
