/* Offline parity runner. Node built-ins only; exit 0 means every comparison matched. */
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
const dir=path.resolve(__dirname,'..');
const e=require('../engine.js'), prompts=require('../prompts.js'), data=require('../standards.js'), boundary=require('../boundary.js');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures.json'),'utf8'));
let checks=0, failures=0;
function check(label,actual,expected) {
  checks++;
  try { assert.deepStrictEqual(actual,expected); }
  catch(err) { failures++; console.error('MISMATCH '+label+'\n'+err.message); }
}
function run(label,fn) {
  try { fn(); } catch(err) { failures++; console.error('MISMATCH '+label+' threw: '+err.stack); }
}
fixture.plans.forEach((t,i)=>run('plan '+i,()=>{
  const v=e.validateExtract(t.input);
  check('plan '+i+' validation',v,{ok:true,value:t.value,errors:[]});
  const issues=e.coherence.runAll(v.value,t.today,t.finraMember,t.annualRequired);
  check('plan '+i+' coherence',issues,t.issues);
  check('plan '+i+' summary',e.coherence.summarize(issues),t.summary);
  const as=e.advisory.runAll(v.value,t.today);
  check('plan '+i+' advisories',as,t.advisories);
  check('plan '+i+' advisory lines',e.advisory.lines(as),t.lines);
}));
fixture.validation.forEach((t,i)=>run('validation '+i,()=>{
  const v=e.validateExtract(t.input);
  check('validation '+i+' ok',v.ok,t.ok);
  check('validation '+i+' value',v.value,t.value);
  check('validation '+i+' errors consistent',v.errors.length>0,!t.ok);
}));
fixture.quotes.forEach((t,i)=>{
  check('quote '+i,e.compliance.verifyQuote(t.quote,t.planText),t.expected);
  check('normalise '+i,e.compliance.normalise(t.quote),t.normalised);
});
fixture.batches.forEach((t,i)=>{
  check('batch '+i,e.compliance.applyBatch(t.requirements,t.modelFindings,t.planText),t.expected);
  check('batch object '+i,e.compliance.applyBatch(t.requirements,{findings:t.modelFindings},t.planText),t.expected);
});
fixture.scores.forEach((t,i)=>{
  check('score '+i,e.compliance.score(t.findings,t.totalInScope),t.expected);
  check('completeness '+i,e.compliance.completeness(t.findings,t.requirements,t.planVersion),t.completeness);
});
fixture.reports.forEach((t,i)=>run('report '+i,()=>check('report '+i,e.report.renderMarkdown(t.input),t.expected)));
fixture.boundary.forEach((t,i)=>{
  check('boundary '+i,boundary.scan(t.text,t.mode,t.attested),t.expected);
  let error=null; try {boundary.enforce(t.text,t.mode,t.attested);} catch(err) {error=err;}
  check('boundary enforce '+i,error instanceof boundary.BoundaryViolation,!t.expected.allowed);
  if(error) check('boundary reason '+i,error.message,'['+t.mode+' mode] refused: '+t.expected.reason);
});
check('standards records',e.standards.load(data),fixture.standards.records);
check('standards stats',e.standards.coverageStats(data),fixture.standards.stats);
check('standards applicable',e.standards.applicable(data,{all_banks:true,finra_member:false}).map(r=>r.req_id),fixture.standards.applicable);
let duplicateRejected=false, unvalidatedRejected=false;
try {e.standards.load([data[0],data[0]]);} catch(_) {duplicateRejected=true;}
try {e.standards.assertValidated(data);} catch(_) {unvalidatedRejected=true;}
check('duplicate standards refused',duplicateRejected,true);
check('unvalidated standards refused',unvalidatedRejected,true);
const fp=fixture.prompts;
check('extraction SYSTEM verbatim',prompts.EXTRACTION_SYSTEM,fp.extractionSystem);
check('compliance SYSTEM verbatim',prompts.COMPLIANCE_SYSTEM,fp.complianceSystem);
check('org context verbatim',prompts.ORG_CONTEXT,fp.orgContext);
check('batch size',prompts.REQUIREMENTS_PER_CALL,fp.requirementsPerCall);
check('PlanExtract schema',prompts.PLAN_EXTRACT_SCHEMA,fp.planSchema);
check('CoverageBatch schema',prompts.COVERAGE_BATCH_SCHEMA,fp.coverageSchema);
check('requirement blocks',data.map(e.compliance.requirementBlock),fp.requirementBlocks);
const schema=s=>'Return ONLY a JSON object matching this schema:\n'+JSON.stringify(s,null,2);
check('extraction builder',prompts.buildExtractionInput(fp.sampleText,'HINT'),fp.extractionSystem+fp.orgContext+'\n\n'+schema(fp.planSchema)+'\n\nExtract the structured record from this plan document.\nUse plan_id HINT if the document does not state one.\n\n<plan_document>\n'+fp.sampleText+'\n</plan_document>');
check('extraction no hint',prompts.buildExtractionInput('sample'),fp.extractionSystem+fp.orgContext+'\n\n'+schema(fp.planSchema)+'\n\nExtract the structured record from this plan document.\n\n<plan_document>\nsample\n</plan_document>');
check('compliance builder',prompts.buildComplianceInput(fp.sampleText,data.slice(0,12)),fp.complianceSystem+fp.orgContext+'\n\n<plan_document>\n'+fp.sampleText+'\n</plan_document>\n\nAssess the plan document against these 12 requirements. Return exactly one finding per requirement.\n\n'+fp.requirementBlocks.slice(0,12).join('\n\n---\n\n')+'\n\n'+schema(fp.coverageSchema));
// A script-only browser context has neither CommonJS nor Node globals.
const context={window:{}}; vm.createContext(context);
for(const name of ['engine','prompts','standards','boundary']) vm.runInContext(fs.readFileSync(path.join(dir,name+'.js'),'utf8'),context,{filename:name+'.js'});
const browser=context.window;
check('browser engine export',typeof browser.OpenBCDR.coherence.runAll,'function');
check('browser prompts export',browser.OpenBCDR_PROMPTS.EXTRACTION_SYSTEM,prompts.EXTRACTION_SYSTEM);
check('browser standards export',JSON.parse(JSON.stringify(browser.OpenBCDR_STANDARDS)),data);
check('browser boundary export',browser.OpenBCDR_BOUNDARY.scan('synthetic','sandbox',true).allowed,true);
for(const t of fixture.plans) check('browser coherence '+t.input.plan_id,JSON.parse(JSON.stringify(browser.OpenBCDR.coherence.runAll(t.value,t.today,t.finraMember,t.annualRequired))),t.issues);
for(const method of [e.coherence.runAll,e.advisory.runAll]) {
  for(const today of [undefined,'2026-02-30']) {
    let rejected=false; try {method(fixture.plans[0].value,today);} catch(_) {rejected=true;}
    check('explicit valid today required',rejected,true);
  }
}
// Model assertions about its own quote verification must never be trusted.
const draft={...fixture.batches[0].modelFindings[1],evidence_verified:true,plan_version:'forged'};
check('model cannot set verification',e.compliance.applyBatch([fixture.batches[0].requirements[1]],[draft],'')[0],fixture.batches[0].expected[1]);
let maxInput=0;
for(let i=0;i<data.length;i+=prompts.REQUIREMENTS_PER_CALL) maxInput=Math.max(maxInput,prompts.buildComplianceInput(fp.sampleText,data.slice(i,i+prompts.REQUIREMENTS_PER_CALL)).length);
console.log(`${checks} comparisons; ${failures} mismatches.`);
console.log(`standards.js: ${fs.statSync(path.join(dir,'standards.js')).size} bytes; largest sample compliance input: ${maxInput} characters (JS UTF-16 units).`);
process.exitCode=failures?1:0;
