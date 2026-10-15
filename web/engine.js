/* OpenBCDR deterministic browser core. No IO, DOM, model calls or implicit clock.
 * Inputs to analyzers must be successful validateExtract().value records.
 */
(function(root) {
'use strict';
const PLAN_SCHEMA = /* PLAN_SCHEMA */ {"$defs": {"Contact": {"properties": {"name": {"title": "Name", "type": "string"}, "title": {"default": "", "title": "Title", "type": "string"}, "role": {"default": "", "title": "Role", "type": "string"}, "is_backup": {"default": false, "title": "Is Backup", "type": "boolean"}, "phone": {"default": "", "title": "Phone", "type": "string"}, "email": {"default": "", "title": "Email", "type": "string"}, "last_verified": {"anyOf": [{"format": "date", "type": "string"}, {"type": "null"}], "default": null, "title": "Last Verified"}}, "required": ["name"], "title": "Contact", "type": "object"}, "PlanSection": {"properties": {"number": {"title": "Number", "type": "string"}, "title": {"title": "Title", "type": "string"}, "owner": {"default": "", "title": "Owner", "type": "string"}, "text": {"default": "", "title": "Text", "type": "string"}}, "required": ["number", "title"], "title": "PlanSection", "type": "object"}, "Procedure": {"properties": {"name": {"title": "Name", "type": "string"}, "scenario": {"default": "", "title": "Scenario", "type": "string"}, "has_trigger_condition": {"default": false, "title": "Has Trigger Condition", "type": "boolean"}, "has_step_by_step": {"default": false, "title": "Has Step By Step", "type": "boolean"}, "responsible_party": {"default": "", "title": "Responsible Party", "type": "string"}, "has_success_criteria": {"default": false, "title": "Has Success Criteria", "type": "boolean"}, "systems_referenced": {"items": {"type": "string"}, "title": "Systems Referenced", "type": "array"}, "raw_text": {"default": "", "title": "Raw Text", "type": "string"}}, "required": ["name"], "title": "Procedure", "type": "object"}, "RtoRpo": {"properties": {"system": {"title": "System", "type": "string"}, "rto_hours": {"anyOf": [{"type": "number"}, {"type": "null"}], "default": null, "title": "Rto Hours"}, "rpo_hours": {"anyOf": [{"type": "number"}, {"type": "null"}], "default": null, "title": "Rpo Hours"}, "feeds": {"items": {"type": "string"}, "title": "Feeds", "type": "array"}}, "required": ["system"], "title": "RtoRpo", "type": "object"}, "TestRecord": {"properties": {"test_date": {"anyOf": [{"format": "date", "type": "string"}, {"type": "null"}], "default": null, "title": "Test Date"}, "scenario": {"default": "", "title": "Scenario", "type": "string"}, "result": {"default": "", "title": "Result", "type": "string"}, "plan_version_tested": {"default": "", "title": "Plan Version Tested", "type": "string"}, "lessons_documented": {"default": false, "title": "Lessons Documented", "type": "boolean"}}, "title": "TestRecord", "type": "object"}, "Vendor": {"properties": {"name": {"title": "Name", "type": "string"}, "service": {"default": "", "title": "Service", "type": "string"}, "criticality": {"default": "", "title": "Criticality", "type": "string"}, "contact_documented": {"default": false, "title": "Contact Documented", "type": "boolean"}, "rto_documented": {"default": false, "title": "Rto Documented", "type": "boolean"}, "escalation_documented": {"default": false, "title": "Escalation Documented", "type": "boolean"}, "sla_on_file": {"default": false, "title": "Sla On File", "type": "boolean"}}, "required": ["name"], "title": "Vendor", "type": "object"}}, "description": "Spec section 4.1 structured output.", "properties": {"plan_id": {"title": "Plan Id", "type": "string"}, "plan_scope": {"default": "business_unit", "enum": ["business_unit", "it_application", "shared_service", "vendor"], "title": "Plan Scope", "type": "string"}, "scope_name": {"default": "", "title": "Scope Name", "type": "string"}, "depends_on_scopes": {"items": {"type": "string"}, "title": "Depends On Scopes", "type": "array"}, "plan_version": {"default": "", "title": "Plan Version", "type": "string"}, "last_approved": {"anyOf": [{"format": "date", "type": "string"}, {"type": "null"}], "default": null, "title": "Last Approved"}, "approver": {"default": "", "title": "Approver", "type": "string"}, "next_review_due": {"anyOf": [{"format": "date", "type": "string"}, {"type": "null"}], "default": null, "title": "Next Review Due"}, "rto_rpo": {"items": {"$ref": "#/$defs/RtoRpo"}, "title": "Rto Rpo", "type": "array"}, "contacts": {"items": {"$ref": "#/$defs/Contact"}, "title": "Contacts", "type": "array"}, "critical_vendors": {"items": {"$ref": "#/$defs/Vendor"}, "title": "Critical Vendors", "type": "array"}, "critical_systems": {"items": {"type": "string"}, "title": "Critical Systems", "type": "array"}, "system_inventory": {"items": {"type": "string"}, "title": "System Inventory", "type": "array"}, "procedures": {"items": {"$ref": "#/$defs/Procedure"}, "title": "Procedures", "type": "array"}, "scenarios_covered": {"items": {"type": "string"}, "title": "Scenarios Covered", "type": "array"}, "tests": {"items": {"$ref": "#/$defs/TestRecord"}, "title": "Tests", "type": "array"}, "sections": {"items": {"$ref": "#/$defs/PlanSection"}, "title": "Sections", "type": "array"}, "bia_last_updated": {"anyOf": [{"format": "date", "type": "string"}, {"type": "null"}], "default": null, "title": "Bia Last Updated"}}, "required": ["plan_id"], "title": "PlanExtract", "type": "object"};
const clone = x => JSON.parse(JSON.stringify(x));
// Python strings sort by Unicode code point, rather than UTF-16 code unit.
const cmp = (a,b) => { const x=[...a],y=[...b]; for(let i=0;i<Math.min(x.length,y.length);i++) { const d=x[i].codePointAt(0)-y[i].codePointAt(0); if(d) return d; } return x.length-y.length; };
const sorted = xs => [...xs].sort(cmp);
const unique = xs => [...new Set(xs)];
const pyFloat = n => {
  if(Number.isNaN(n)) return 'nan'; if(!Number.isFinite(n)) return n<0?'-inf':'inf';
  if(Object.is(n,-0)) return '-0.0';
  if(n!==0 && (Math.abs(n)<1e-4 || Math.abs(n)>=1e16)) return n.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
};
const WS='[\\t-\\r\\x1c-\\x20\\x85\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const strip=s=>s.replace(new RegExp('^'+WS+'+|'+WS+'+$','g'),'');
const spaces=s=>s.replace(new RegExp(WS+'+','g'),' ');
// Python re uses Unicode word boundaries even without an explicit flag.
function pyRegex(re) {
  const word='[\\p{L}\\p{N}_]';
  const boundary='(?:(?<!'+word+')(?='+word+')|(?<='+word+')(?!'+word+'))';
  const source=re.source.split('\\b').join(boundary).split('\\s').join(WS).split('\\d').join('\\p{Nd}');
  // Python's IGNORECASE also matches the Turkish dotted/dotless I variants.
  return new RegExp(re.ignoreCase?source.replace(/[iI]/g,'[iIİı]'):source,re.flags+'u');
}
// Python round uses ties to even, unlike Math.round.
const round = n => { const f=Math.floor(n), d=n-f; return d===0.5 ? (f%2===0?f:f+1) : Math.round(n); };
function isoDay(s) {
  if(typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new TypeError('Expected explicit ISO date YYYY-MM-DD');
  const n=Date.parse(s+'T00:00:00Z');
  if(!Number.isFinite(n) || new Date(n).toISOString().slice(0,10)!==s || s.startsWith('0000')) throw new TypeError('Invalid ISO date: '+s);
  return n/86400000;
}
const age = (today,date) => isoDay(today)-isoDay(date);
function validateExtract(obj) {
  const errors=[];
  function fail(path,message) { errors.push({path,message}); return undefined; }
  function visit(v,s,path) {
    if(s.$ref) s=PLAN_SCHEMA.$defs[s.$ref.split('/').pop()];
    if(s.anyOf) { if(v===null) return null; s=s.anyOf.find(x=>x.type!=='null'); }
    if(s.enum) return s.enum.includes(v) ? v : fail(path,'Invalid enum value');
    if(s.type==='object') {
      if(!v || typeof v!=='object' || Array.isArray(v)) return fail(path,'Expected object');
      const out={};
      for(const [k,t] of Object.entries(s.properties)) {
        if(!Object.prototype.hasOwnProperty.call(v,k)) {
          if((s.required||[]).includes(k)) fail([...path,k],'Field required');
          else out[k]=Object.prototype.hasOwnProperty.call(t,'default') ? clone(t.default) : [];
        } else out[k]=visit(v[k],t,[...path,k]);
      }
      return out; // Pydantic ignores extra fields.
    }
    if(s.type==='array') return Array.isArray(v) ? v.map((x,i)=>visit(x,s.items,[...path,i])) : fail(path,'Expected array');
    if(s.type==='boolean') {
      if(typeof v==='boolean') return v;
      if(v===0||v===1) return Boolean(v);
      if(typeof v==='string') { if(['1','true','t','on','yes','y'].includes(v.toLowerCase())) return true;
        if(['0','false','f','off','no','n'].includes(v.toLowerCase())) return false; }
      return fail(path,'Expected boolean');
    }
    if(s.type==='number') {
      if(typeof v==='boolean') return +v;
      if(typeof v==='number') return v;
      if(typeof v==='string') {
        const s=strip(v);
        const numeric=s.replace(/_/g,'');
        if(!s.startsWith('_') && !s.endsWith('_') && !s.includes('__') && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(numeric)) return Number(numeric);
        if(/^[+-]?(nan|inf|infinity)$/i.test(s)) return /nan/i.test(s)?NaN:s.startsWith('-')?-Infinity:Infinity;
      }
      return fail(path,'Expected number');
    }
    if(s.format==='date') {
      try {
        if(typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { isoDay(v); return v; }
        if(typeof v==='string' && /^\d{4}-\d{2}-\d{2}[Tt ]00:00(?::00(?:[.,]0{1,6}\d*)?)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/.test(v)) {
          const fraction=v.match(/[.,](\d+)/);
          if(fraction && /[1-9]/.test(fraction[1].slice(0,6))) return fail(path,'Expected valid date');
          const d=v.slice(0,10); isoDay(d); return d;
        }
        let num = (typeof v==='number' || (typeof v==='string' && /^[+-]?\d+(\.\d+)?$/.test(v))) ? Number(v) : NaN;
        if(Math.abs(num)>2e10) num/=1000;
        if(Number.isFinite(num) && num%86400===0) { const d=new Date(num*1000).toISOString().slice(0,10); isoDay(d); return d; }
      } catch (_) { /* invalid date */ }
      return fail(path,'Expected valid date');
    }
    if(s.type==='string') return typeof v==='string' ? v : fail(path,'Expected string');
    return fail(path,'Unsupported schema');
  }
  const value=visit(obj,PLAN_SCHEMA,[]);
  return {ok:errors.length===0,value:errors.length?null:value,errors};
}
const coherence = {};
coherence.runAll = function(p,today,finraMember=true,annualRequired=null) {
  isoDay(today);
  const out=[];
  const add=(check,severity,title,detail,section='',evidence='')=>out.push({check,severity,title,detail,section,evidence});
  const rto=new Map(p.rto_rpo.map(e=>[e.system,e]));
  for(const e of p.rto_rpo) {
    if(e.rto_hours===null) continue;
    for(const name of e.feeds) {
      const d=rto.get(name);
      if(!d) { add('rto_dependency','medium','Dependency target has no RTO: '+name,e.system+' is documented as feeding '+name+', but '+name+' has no documented RTO to check against.'); continue; }
      if(d.rto_hours!==null && e.rto_hours>d.rto_hours) add('rto_dependency','high','RTO conflict: '+name+' cannot meet its objective',name+' has an RTO of '+pyFloat(d.rto_hours)+'h but depends on '+e.system+', whose RTO is '+pyFloat(e.rto_hours)+'h. The dependency recovers after the system that needs it.','',e.system+' RTO='+pyFloat(e.rto_hours)+'h -> '+name+' RTO='+pyFloat(d.rto_hours)+'h');
    }
  }
  for(const e of p.rto_rpo) if(e.rpo_hours!==null && e.rto_hours!==null && e.rpo_hours>e.rto_hours) add('rpo_sanity','medium','RPO exceeds RTO for '+e.system,'RPO '+pyFloat(e.rpo_hours)+'h is greater than RTO '+pyFloat(e.rto_hours)+'h. Confirm this is intended; it usually indicates the two were set independently.');
  for(const s of p.critical_systems) if(!rto.has(s)) add('rto_coverage','critical','No RTO/RPO documented for critical system: '+s,'The plan designates '+s+' as critical but documents no recovery objectives for it.');
  for(const c of p.contacts) {
    if(c.last_verified===null) { add('contact_currency','medium','Contact never verified: '+c.name,'No verification date recorded for '+c.name+(c.role?' ('+c.role+')':'')+'.'); continue; }
    const days=age(today,c.last_verified);
    if(days>90) add('contact_currency',days>180?'high':'medium','Stale contact: '+c.name,c.name+(c.role?' ('+c.role+')':'')+' last verified '+c.last_verified+', '+days+' days ago.');
  }
  const roles=new Map();
  for(const c of p.contacts) if(c.role) { if(!roles.has(c.role)) roles.set(c.role,{primary:false,backup:false}); roles.get(c.role)[c.is_backup?'backup':'primary']=true; }
  for(const role of sorted(roles.keys())) {
    const slot=roles.get(role);
    if(!slot.backup) add('contact_backup','high','No backup contact for role: '+role,'Role '+role+' has a primary contact but no documented backup. An escalation path with a single point of failure is not an escalation path.');
    if(!slot.primary) add('contact_backup','medium','Backup listed with no primary for role: '+role,'Role '+role+' lists only a backup contact.');
  }
  for(const c of p.contacts) if(!c.phone && !c.email) add('contact_reachability','high','No contact method for '+c.name,'Neither phone nor email is recorded, so this contact cannot be reached during an event.');
  const inventory=new Set([...p.system_inventory,...p.critical_systems].map(s=>s.toLowerCase()));
  const covered=new Set(p.procedures.filter(p=>p.scenario).map(p=>p.scenario.toLowerCase()));
  for(const s of p.scenarios_covered) if(!covered.has(s.toLowerCase())) add('procedure_missing','high','Scenario has no documented procedure: '+s,'The plan lists '+s+' as a covered scenario but no recovery procedure is documented for it.');
  for(const proc of p.procedures) {
    const missing=[];
    if(!proc.has_trigger_condition) missing.push('trigger condition');
    if(!proc.has_step_by_step) missing.push('step-by-step actions');
    if(!proc.responsible_party) missing.push('named responsible party');
    if(!proc.has_success_criteria) missing.push('success criteria');
    if(missing.length) add('procedure_incomplete','medium','Incomplete procedure: '+proc.name,'Missing '+missing.join(', ')+'.',proc.name);
    const found=[...(proc.raw_text||'').matchAll(pyRegex(/\b(TBD|TODO|TBC|FIXME|XXX|\[\s*\]|<insert[^>]*>|PLACEHOLDER)\b/gi))].map(m=>m[1]);
    if(found.length) add('procedure_unresolved','high','Unresolved placeholder in procedure: '+proc.name,'Procedure text contains '+sorted(unique(found)).join(', ')+'. A procedure with an open placeholder is not executable under pressure.',proc.name);
    for(const s of proc.systems_referenced) if(!inventory.has(s.toLowerCase())) add('procedure_stale_system','medium','Procedure references a system not in inventory: '+s,"Procedure '"+proc.name+"' references "+s+", which does not appear in the plan's system inventory. Confirm whether this is a renamed or decommissioned system.",proc.name);
  }
  for(const v of p.critical_vendors) {
    const missing=[];
    if(!v.contact_documented) missing.push('contact');
    if(!v.rto_documented) missing.push('recovery time expectation');
    if(!v.escalation_documented) missing.push('escalation procedure');
    if(missing.length) add('vendor_coverage',missing.includes('recovery time expectation')?'critical':'high','Critical vendor incompletely documented: '+v.name,v.name+(v.service?' ('+v.service+')':'')+' is missing '+missing.join(', ')+'.');
    if(!v.sla_on_file) add('vendor_sla','high','No SLA on file for critical vendor: '+v.name,'The plan names '+v.name+' as critical but references no SLA.');
  }
  const dated=p.tests.filter(t=>t.test_date);
  if(!dated.length) add('test_coverage','critical','No test records documented','The plan documents no exercise or test history.');
  else {
    const latest=dated.reduce((a,b)=>b.test_date>a.test_date?b:a), days=age(today,latest.test_date);
    if(finraMember && days>365) add('test_annual','critical','No test within the last 12 months','Most recent documented test is '+latest.test_date+', '+days+' days ago. FINRA Rule 4370 requires annual testing.');
    else if(annualRequired && days>365) add('test_annual','high','No test within the last 12 months','Most recent documented test is '+latest.test_date+', '+days+' days ago. Your organisation profile asks for a test at least every 12 months.');
    if(p.plan_version && latest.plan_version_tested && latest.plan_version_tested!==p.plan_version) add('test_version','high','Current plan version has never been tested','Latest test covered version '+latest.plan_version_tested+'; the current plan is version '+p.plan_version+'.');
    for(const t of dated) if(!t.lessons_documented) add('test_lessons','medium','Test result without documented lessons: '+t.test_date,'A test was run but no lessons identified were recorded, so the exercise cannot demonstrate improvement.');
    const tested=new Set(p.tests.filter(t=>t.scenario).map(t=>t.scenario.toLowerCase()));
    for(const s of p.scenarios_covered) if(!tested.has(s.toLowerCase())) add('test_scenario_gap','medium','Scenario planned but never tested: '+s,'The plan covers '+s+' but no test record exercises it.');
  }
  if(p.last_approved===null) add('plan_freshness','high','No approval date on plan','The plan records no approval date, so its currency cannot be established.');
  else {
    const months=age(today,p.last_approved)/30.44;
    if(months>18) add('plan_freshness','high','Plan is stale','Last approved '+p.last_approved+', roughly '+Math.trunc(months)+' months ago.');
    else if(months>12) add('plan_freshness','medium','Plan is past its annual review','Last approved '+p.last_approved+', roughly '+Math.trunc(months)+' months ago.');
  }
  if(p.next_review_due && p.next_review_due<today) add('plan_freshness','high','Scheduled review date has passed','next_review_due was '+p.next_review_due+'.');
  if(p.bia_last_updated && age(today,p.bia_last_updated)/30.44>12) add('bia_freshness','high','Business Impact Analysis is out of date','BIA last updated '+p.bia_last_updated+', roughly '+Math.trunc(age(today,p.bia_last_updated)/30.44)+' months ago.');
  if(!p.approver) add('plan_approval','low','No approver recorded','The plan does not name who approved it.');
  const order={critical:0,high:1,medium:2,low:3};
  return out.sort((a,b)=>order[a.severity]-order[b.severity] || cmp(a.check,b.check) || cmp(a.title,b.title));
};
coherence.summarize = function(issues) { const out={critical:0,high:0,medium:0,low:0,total:0}; for(const i of issues) { out[i.severity]=(out[i.severity]||0)+1; out.total++; } return out; };

const LABEL='Good practice raised at industry conferences, not a regulatory requirement. Not scored and not opened as gaps.';
const advisory={LABEL};
const clean=s=>strip(spaces(s)).toLowerCase();
const person=s=>clean(s).replace(pyRegex(/^(dr|mr|mrs|ms|mx|prof|sir)\.?\s+/i),'');
advisory.runAll=function(p,today) {
  isoDay(today);
  const out=[], add=(check,title,detail,idea)=>out.push({check,title,detail,idea});
  const shown=new Map(), roleShown=new Map(), primary=new Map(), byRole=new Map();
  for(const c of p.contacts) {
    if(strip(c.name) && !shown.has(person(c.name))) shown.set(person(c.name),strip(c.name));
    if(strip(c.role) && !roleShown.has(clean(c.role))) roleShown.set(clean(c.role),strip(c.role));
  }
  for(const c of p.contacts) if(strip(c.role) && strip(c.name)) {
    const key=person(c.name), role=clean(c.role);
    if(!c.is_backup) { if(!primary.has(key)) primary.set(key,new Set()); primary.get(key).add(role); }
    if(!byRole.has(role)) byRole.set(role,{primary:new Set(),backup:new Set()});
    byRole.get(role)[c.is_backup?'backup':'primary'].add(key);
  }
  for(const key of sorted(primary.keys())) { const roles=primary.get(key); if(roles.size>=2) add('key_person','One person is primary for several recovery roles: '+shown.get(key),shown.get(key)+' is the primary contact for '+sorted([...roles].map(r=>roleShown.get(r))).join(', ')+'. If they are unavailable, all of those roles fall to their backups at the same moment.','People are dependencies too; one person carrying several roles concentrates risk.'); }
  for(const role of sorted(byRole.keys())) { const slot=byRole.get(role); for(const key of sorted([...slot.primary].filter(x=>slot.backup.has(x)))) add('key_person','Backup is the same person as the primary: '+roleShown.get(role),shown.get(key)+' is listed as both primary and backup for '+roleShown.get(role)+'. '+(slot.backup.size>1?"That backup entry doesn't count; the other backup does.":'Without another backup, the role has no real backup.'),'People are dependencies too; a backup has to be a different person.'); }
  const dated=p.tests.filter(t=>t.test_date).sort((a,b)=>cmp(a.test_date,b.test_date));
  if(dated.length) {
    const latest=dated[dated.length-1];
    if(!latest.lessons_documented) add('test_follow_through','Latest test has no documented lessons','The test on '+latest.test_date+' ('+(latest.scenario||'scenario not named')+') records no lessons learned, so there is no way to tell whether what it found was fixed.','Ask whether test findings were fixed or only written down.');
    const short=pyRegex(/\b(fail(ed|ure|s)?|partial(ly)?|not met|missed|(rto|rpo|time|target|window|objective)s?\s+(was\s+|were\s+)?exceeded|over (the )?(rto|rpo|target))\b/i);
    const success=pyRegex(/\b(no (issues?|problems?|failures?|findings?)|without (any )?(issues?|problems?|failures?)|passed|successful(ly)?|all objectives met|met all)\b/i);
    for(const t of dated) if(t.result && short.test(t.result) && !success.test(t.result)) {
      const name=clean(t.scenario||'');
      if(!dated.some(x=>x.test_date>t.test_date && name && clean(x.scenario)===name)) add('test_follow_through','A test that reads like it fell short has no later retest: '+(strip(t.scenario)||t.test_date),'The '+t.test_date+' test result reads "'+[...strip(t.result)].slice(0,120).join('')+'" and no later test of '+(name?'that scenario':'an unnamed scenario')+' is on record.','Carry open findings forward until a later test shows them fixed.');
    }
  }
  const ai=pyRegex(/\b(AI|A\.I\.|artificial intelligence|machine learning|ML model|LLM|large language model|chat ?bot|chatgpt|gpt(-?\d+(\.\d+)?)?|copilot|generative|agentic|AI agent)\b/i);
  const fallback=pyRegex(/\b(fall ?back (to|is|process|procedure)|workaround|manually|manual (process|workaround|mode|entry|replies|steps?|procedure|routing)|work(ing)? without|switch(es)? to)\b/i);
  const noFallback=pyRegex(/\b(no|not|without (a|any))\s+(manual\s+)?(fall ?back|workaround|alternative)/i);
  const found=p.critical_systems.filter(s=>ai.test(s)).map(s=>[s,s]);
  for(const v of p.critical_vendors) if(ai.test(v.name)||ai.test(v.service||'')) found.push([v.name+(v.service?' ('+v.service+')':''),v.name]);
  const seen=new Set();
  for(const [display,name] of found) {
    const key=JSON.stringify([display,name]); if(seen.has(key)) continue; seen.add(key);
    if(!p.procedures.some(proc=>{const text=[proc.raw_text,proc.name,proc.scenario].join(' '); return text.toLowerCase().includes(name.toLowerCase()) && fallback.test(text) && !noFallback.test(text);})) add('ai_dependency','AI tool in a critical path with no documented fallback (keyword match): '+display,display+" looks like an AI tool (a keyword match, so check it) that the plan relies on, and no procedure describes how to keep working without it. A vendor's fallback is matched by vendor name, not by service.",'Map AI tools as dependencies, with a tested fallback that can be manual.');
  }
  return out;
};
advisory.lines=function(as) { return as.length ? ['Practice advisories ('+as.length+'): '+LABEL,...as.map(a=>'  ADVISORY  '+a.check.padEnd(20)+' '+a.title)] : []; };

const compliance={};
compliance.normalise=s=>strip(spaces(s.replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[—–‑]/g,'-'))).toLowerCase();
compliance.verifyQuote=(quote,planText)=>Boolean(strip(quote)) && compliance.normalise(planText).includes(compliance.normalise(quote));
compliance.requirementBlock=r=>'req_id: '+r.req_id+'\nsource: '+r.source+' '+r.section+'\nmandatory: '+(r.mandatory===false?'no':'yes')+'\nrequirement: '+r.requirement;
compliance.applyBatch=function(reqs,modelFindings,planText) {
  const byId=new Map((Array.isArray(modelFindings)?modelFindings:modelFindings.findings).map(f=>[f.req_id,f]));
  return reqs.map(r=>{
    const draft=byId.get(r.req_id);
    if(!draft) return {req_id:r.req_id,coverage:'insufficient_evidence',rationale:'Model returned no finding for this requirement.',evidence_quote:'',plan_section:'',recommended_action:'Re-run this requirement.',evidence_verified:false,plan_version:''};
    // Never trust model-supplied verification or revision fields.
    const f={};
    for(const key of ['req_id','coverage','rationale','evidence_quote','plan_section','recommended_action']) {
      if(typeof draft[key]!=='string') throw new TypeError('Invalid coverage draft field: '+key);
      f[key]=draft[key];
    }
    if(!['full','partial','gap','insufficient_evidence'].includes(f.coverage)) throw new TypeError('Invalid coverage');
    f.evidence_verified=compliance.verifyQuote(f.evidence_quote,planText); f.plan_version='';
    if(['full','partial'].includes(f.coverage) && !f.evidence_verified) {
      f.coverage='insufficient_evidence';
      f.rationale='UNVERIFIED EVIDENCE - the model claimed coverage but its quote does not appear in the plan text. Original rationale: '+draft.rationale;
      f.recommended_action='Human review required: confirm by hand whether the plan covers this.';
    }
    return f;
  });
};
compliance.completeness=function(fs,reqs,planVersion='') {
  const scope=new Set(reqs.map(r=>r.req_id)), seen=new Map();
  for(const f of fs) seen.set(f.req_id,(seen.get(f.req_id)||0)+1);
  return {missing:sorted([...scope].filter(x=>!seen.has(x))),unknown:sorted([...seen.keys()].filter(x=>!scope.has(x))),duplicate:sorted([...seen.keys()].filter(x=>seen.get(x)>1)),stale:sorted(unique(fs.filter(f=>planVersion && f.plan_version && f.plan_version!==planVersion).map(f=>f.req_id)))};
};
compliance.score=function(fs,totalInScope=null) {
  const n=(totalInScope!==null?totalInScope:fs.length)||1, count=c=>fs.filter(f=>f.coverage===c).length;
  const full=count('full'),partial=count('partial'),gap=count('gap'),unclear=count('insufficient_evidence');
  return {total:totalInScope!==null?n:fs.length,assessed:fs.length,full,partial,gap,insufficient_evidence:unclear,score:round(100*(full+0.5*partial)/n),pct_full:round(100*full/n),pct_partial:round(100*partial/n),pct_gap:round(100*gap/n)};
};

const standards={
  load(data) {
    const records=Array.isArray(data)?data:data.requirements;
    if(!records || !records.length) throw new Error('no requirement records found');
    const seen=new Set();
    return records.map(r=>{if(seen.has(r.req_id)) throw new Error('duplicate req_id in standards index: '+r.req_id); seen.add(r.req_id); return Object.assign({mandatory:true,applicability:['all_banks'],related_standards:[],related_regulations:[],tags:[],last_confirmed:null,as_of_version:'',source_quote:'',validated_by:'',gap_severity:'high',validated_by_human:false},clone(r));});
  },
  applicable:(reqs,profile)=>reqs.filter(r=>r.applicability.some(t=>profile[t])),
  assertValidated(reqs) {const bad=reqs.filter(r=>!r.validated_by_human).map(r=>r.req_id); if(bad.length) throw new Error(bad.length+' requirement record(s) have not been confirmed against the primary source and cannot back an examiner-facing report: '+bad.slice(0,8).join(', ')+(bad.length>8?'...':''));},
  coverageStats:reqs=>({total:reqs.length,validated:reqs.filter(r=>r.validated_by_human).length,mandatory:reqs.filter(r=>r.mandatory).length})
};

const report={};
// options: {extract, requirements, findings, issues, advisories, generatedAt,
//           gaps?, examinerFacing?}. Score is always recomputed for the scope.
report.renderMarkdown=function({extract,requirements,findings=[],issues=[],advisories=[],generatedAt,gaps=[],examinerFacing=false}) {
  const today=generatedAt.slice(0,10); isoDay(today);
  const planId=extract.plan_id, version=extract.plan_version;
  const unvalidated=requirements.filter(r=>!r.validated_by_human).map(r=>r.req_id);
  const stats=compliance.score(findings,requirements.length), incomplete=compliance.completeness(findings,requirements,version);
  const byReq=new Map(requirements.map(r=>[r.req_id,r]));
  const L=['COMPLIANCE ANALYSIS REPORT','Plan: '+planId+(version?' '+version:'')+'  |  Date: '+today,'Analyzed Against: '+sorted(unique(requirements.map(r=>r.source))).join(', '),''];
  const list=ids=>ids.slice(0,10).join(', ')+(ids.length>10?'...':''), blockers=[], BAR='='.repeat(72);
  if(unvalidated.length) blockers.push([unvalidated.length+' of '+requirements.length+' requirement records in scope have not been confirmed against their','primary source.','Unvalidated: '+list(unvalidated)]);
  if(incomplete.missing.length) blockers.push([incomplete.missing.length+' of '+requirements.length+' in-scope requirements were never assessed. An assessment that','skips a requirement is not a lower score, it is an unfinished report.','Not assessed: '+list(incomplete.missing)]);
  if(incomplete.unknown.length) blockers.push(['Findings were supplied for requirements that are not in the selected set.','Unknown: '+list(incomplete.unknown)]);
  if(incomplete.duplicate.length) blockers.push(['More than one finding was supplied for the same requirement, so which one','is the answer is undefined.','Duplicated: '+list(incomplete.duplicate)]);
  if(incomplete.stale.length) blockers.push(['Findings were assessed against a different revision of the plan than this','report names ('+(version||'unversioned')+').','Stale: '+list(incomplete.stale)]);
  if(blockers.length) {
    L.push(BAR,'!! NOT EXAMINER-READY - the coverage score is WITHHELD.','   The findings below are indicative only.');
    for(const reason of blockers) { L.push(''); reason.forEach((line,i)=>L.push((i===0?'   - ':'     ')+line)); }
    L.push(BAR,'');
    if(examinerFacing) { L.push('Report generation stopped: examiner-facing output was requested over an','assessment that is unvalidated, incomplete, or does not match its scope.'); return L.join('\n'); }
  } else L.push('Overall Score: '+stats.score+'/100','');
  const pct=n=>stats.total?round(100*n/stats.total)+'%':'0%';
  L.push('Coverage Summary:',
    '  Full Coverage:    '+String(stats.full).padStart(3)+' requirements ('+pct(stats.full)+')',
    '  Partial Coverage: '+String(stats.partial).padStart(3)+' requirements ('+pct(stats.partial)+')',
    '  Gap:              '+String(stats.gap).padStart(3)+' requirements ('+pct(stats.gap)+')',
    '  Unverifiable:     '+String(stats.insufficient_evidence).padStart(3)+' requirements ('+pct(stats.insufficient_evidence)+')  <- needs human review, NOT counted as coverage','');
  for(const [sev,label] of [['critical','Critical'],['high','High'],['medium','Medium'],['low','Low']]) {
    const rows=gaps.filter(g=>g.severity===sev); if(!rows.length) continue;
    L.push(label+' Gaps ('+rows.length+'):');
    for(const g of rows) L.push('  ['+g.gap_id+'] '+g.title+(g.standard_ref?' - '+g.standard_ref:'')+(g.deadline?'  (due '+g.deadline+')':''));
    L.push('');
  }
  const unverified=findings.filter(f=>f.coverage==='insufficient_evidence' && f.rationale.startsWith('UNVERIFIED EVIDENCE'));
  if(unverified.length) {
    L.push(BAR,'EVIDENCE VERIFICATION FAILURES ('+unverified.length+')','The model asserted coverage but quoted text that is not in the plan.','These are excluded from the score and require manual assessment.');
    for(const f of unverified) { const r=byReq.get(f.req_id); L.push('  - '+f.req_id+(r?' ('+r.section+')':''),'      claimed quote: '+([...f.evidence_quote].slice(0,110).join('')||'(empty)')); }
    L.push(BAR,'');
  }
  if(issues.length) {
    L.push('Coherence Findings (deterministic checks, no model involved):');
    for(const sev of ['critical','high','medium','low']) for(const i of issues.filter(i=>i.severity===sev)) L.push('  '+sev.toUpperCase().padEnd(9)+' '+i.check.padEnd(24)+' '+i.title);
    L.push('');
  }
  if(advisories.length && !examinerFacing) L.push(...advisory.lines(advisories),'');
  L.push('Method: coverage judged by model against the standards index; every','coverage claim quote-verified against plan source text. Coherence','findings are computed, not inferred. All findings require risk-owner','disposition before any plan change.');
  return L.join('\n');
};
const api={validateExtract,coherence,advisory,compliance,standards,report};
if(typeof module==='object' && module.exports) module.exports=api;
if(root) root.OpenBCDR=api;
})(typeof window!=='undefined'?window:null);
