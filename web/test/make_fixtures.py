"""Offline Python oracle: synthetic records only; no database or model calls."""
from __future__ import annotations
import ast
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import re
import sys
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from openbcdr import boundary, report, standards
from openbcdr.analyzers import advisory, coherence, compliance
from openbcdr.models import PlanExtract, CoverageBatch, CoverageFinding, Requirement
from samples.load_sample import SAMPLE


def dump(x):
    return x.model_dump(mode="json")


def literal(path, name):
    for node in ast.parse((ROOT / path).read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise ValueError(name)


def main():
    reqs = standards.load()
    raw = (ROOT / "samples/sample_plan.md").read_text(encoding="utf-8")
    variants = [dump(SAMPLE), {"plan_id": "EMPTY"}, {
        "plan_id": "EDGE", "plan_version": "2", "last_approved": "2024-01-01",
        "next_review_due": "2025-01-01", "bia_last_updated": "2024-01-01",
        "critical_systems": ["AI Router", "Unknown", "éAIé", "Aı helper", "😀", "\ue000"],
        # The source range 4-8 hours is represented by its longer value, per SYSTEM.
        "rto_rpo": [{"system": "Upstream", "rto_hours": 8, "rpo_hours": 9,
                     "feeds": ["AI Router", "Missing", "Undated"]},
                    {"system": "AI Router", "rto_hours": 4}, {"system": "Undated"},
                    {"system": "Tiny", "rto_hours": 0.0000001, "rpo_hours": 0.0000002},
                    {"system": "Large", "rto_hours": 1e16, "rpo_hours": 2e16}],
        "contacts": [{"name": "Dr. Alex", "role": " Lead "},
                     {"name": "alex", "role": "lead", "is_backup": True},
                     {"name": "Alex", "role": "Recovery"},
                     {"name": "Backup Only", "role": "Only", "is_backup": True},
                     {"name": "Other", "role": "Recovery", "is_backup": True}],
        "critical_vendors": [{"name": "Model Vendor", "service": "LLM service"},
                             {"name": "Complete", "contact_documented": True, "rto_documented": True,
                              "escalation_documented": True, "sla_on_file": True}],
        "procedures": [{"name": "Restore", "scenario": "outage", "raw_text": "TODO TBD tbd FIXME XXX PLACEHOLDER a[]b a<insert name>b éTBCé", "systems_referenced": ["Retired"]}],
        "scenarios_covered": ["outage", "pandemic"],
        "tests": [{"scenario": "outage"},
                  {"test_date": "2024-01-01", "scenario": "outage", "result": "failed"},
                  {"test_date": "2024-02-01", "scenario": "outage", "result": "partially recovered", "plan_version_tested": "1"},
                  {"test_date": "2024-03-01", "result": "target was exceeded"}]
    }, {
        "plan_id": "THRESHOLDS", "last_approved": "2025-10-14", "approver": "Owner",
        "contacts": [{"name": "90", "last_verified": "2026-07-16", "phone": "555"},
                     {"name": "91", "last_verified": "2026-07-15", "email": "x@example.invalid"},
                     {"name": "180", "last_verified": "2026-04-17"},
                     {"name": "181", "last_verified": "2026-04-16"},
                     {"name": "Mx. Pat", "role": "lead"},
                     {"name": "Pat", "role": "lead", "is_backup": True},
                     {"name": "Other", "role": "lead", "is_backup": True}],
        "critical_systems": ["ChatGPT", "GPT-4", "ML model", "Copilot"],
        "critical_vendors": [{"name": "Service Co", "service": "AI"}],
        "procedures": [{"name": "Fallback", "raw_text": "ChatGPT manual process; Service Co workaround"},
                       {"name": "No fallback", "raw_text": "GPT-4 has no manual fallback; switch to manual mode"}],
        "tests": [{"test_date": "2025-10-14", "scenario": "outage", "result": "failed without any issues", "lessons_documented": True},
                  {"test_date": "2026-01-01", "result": "successful but partial", "lessons_documented": True}]
    }]
    fixtures = {"plans": [], "validation": [], "quotes": [], "batches": [], "scores": [], "reports": [], "boundary": []}
    for obj in variants:
        p = PlanExtract(**obj)
        for today in ("2026-10-14", "2027-11-01"):
            for finra, annual in ((True, None), (False, True), (False, False)):
                issues = coherence.run_all(p, date.fromisoformat(today), finra_member=finra, annual_required=annual)
                adv = advisory.run_all(p, date.fromisoformat(today))
                fixtures["plans"].append(dict(input=obj, value=dump(p), today=today, finraMember=finra,
                    annualRequired=annual, issues=[{k: getattr(i, k) for k in i.__slots__} for i in issues],
                    summary=coherence.summarize(issues), advisories=[vars(a) for a in adv], lines=advisory.lines(adv)))
    validation = [{}, None, [], {"plan_id": 123}, {"plan_id": "x", "plan_scope": "wrong"},
        {"plan_id": "x", "contacts": [{"name": "A", "role": None}]},
        {"plan_id": "x", "rto_rpo": [{"system": "x", "rto_hours": "4-8"}]},
        {"plan_id": "x", "rto_rpo": [{"system": "x", "rto_hours": " 4.5 ", "rpo_hours": True}]},
        {"plan_id": "x", "extra": "ignored", "contacts": [{"name": "A", "is_backup": "yes"}]},
        {"plan_id": "x", "last_approved": "2024-02-29"},
        {"plan_id": "x", "last_approved": "2025-02-29"},
        {"plan_id": "x", "last_approved": "2024-01-01T00:00:00Z"},
        {"plan_id": "x", "last_approved": 1704067200},
        {"plan_id": "x", "last_approved": "2024-01-01T01:00:00Z"},
        {"plan_id": "x", "contacts": None}, {"plan_id": "x", "contacts": [{}]}]
    validation += [{"plan_id": "x", "last_approved": v} for v in ["2024-01-01T00:00", "2024-01-01T00:00:00+05:30", "2024-01-01t00:00:00z", "2024-01-01T00:00:00.0000001", "2024-01-01T00:00:00.123", "2024-01-01T00:00:00+24:00"]]
    validation += [{"plan_id": "x", "rto_rpo": [{"system": "A", "rto_hours": v}]} for v in ["1__0", "1_0", "1._0", "1_0.2_0", "1e1_0", "1."]]
    for obj in validation:
        try:
            p = PlanExtract.model_validate(obj)
            fixtures["validation"].append(dict(input=obj, ok=True, value=dump(p)))
        except ValueError:
            fixtures["validation"].append(dict(input=obj, ok=False, value=None))
    quote_plan = 'Owner’s “recovery” plan—restore\n  the service. First sentence. Omitted middle. Last sentence.'
    for quote in ["Owner’s “recovery” plan—restore", 'owner\'s "recovery" plan-restore the service.',
                  "restore the application", "First sentence. Last sentence.", "", "  ", "Omitted middle.", "plan–restore", "plan‑restore", "\ufeff", "\x85", "restore\x1cthe service."]:
        fixtures["quotes"].append(dict(quote=quote, planText=quote_plan, normalised=compliance._normalise(quote), expected=compliance.verify_quote(quote, quote_plan)))
    batch_reqs = reqs[:5]
    draft_base = dict(rationale="Original rationale", evidence_quote="", plan_section="1", recommended_action="Fix this.")
    drafts = [dict(draft_base, req_id=batch_reqs[0].req_id, coverage="full", evidence_quote="First sentence."),
              dict(draft_base, req_id=batch_reqs[1].req_id, coverage="partial", evidence_quote="fabricated quote"),
              dict(draft_base, req_id=batch_reqs[2].req_id, coverage="gap"),
              dict(draft_base, req_id=batch_reqs[3].req_id, coverage="full", evidence_quote="wrong first duplicate"),
              dict(draft_base, req_id=batch_reqs[3].req_id, coverage="partial", evidence_quote="Last sentence."),
              dict(draft_base, req_id="OUTSIDE", coverage="full", evidence_quote="Last sentence.")]
    for drafts_in in (drafts, [], [dict(draft_base, req_id=r.req_id, coverage="full", evidence_quote="") for r in batch_reqs]):
        # Exercise the ACTUAL analyze post-processing loop, replacing only the API boundary.
        result = CoverageBatch(findings=drafts_in)
        with patch.object(compliance.llm, "structured", return_value=(result, SimpleNamespace())):
            findings, _ = compliance.analyze(quote_plan, batch_reqs)
        fixtures["batches"].append(dict(requirements=[dump(r) for r in batch_reqs], modelFindings=drafts_in, planText=quote_plan, expected=[dump(f) for f in findings]))
    fs = [CoverageFinding(**f) for f in fixtures["batches"][0]["expected"]]
    sets = [[], fs, fs[:1], fs+[fs[0]], fs+[CoverageFinding(**dict(draft_base, req_id="UNKNOWN", coverage="full", plan_version="old"))]]
    for findings in sets:
        for n in (None, 0, 5, 8):
            fixtures["scores"].append(dict(findings=[dump(f) for f in findings], totalInScope=n, expected=compliance.score(findings, n),
                requirements=[dump(r) for r in batch_reqs], planVersion="2", completeness=compliance.completeness(findings, batch_reqs, "2")))
    # Explicit ties-to-even percentages.
    for count in (1, 3, 5):
        findings = [fs[0]] * count
        fixtures["scores"].append(dict(findings=[dump(f) for f in findings], totalInScope=8, expected=compliance.score(findings, 8),
            requirements=[], planVersion="", completeness=compliance.completeness(findings, [])))
    for validated in (False, True):
        rs=[r.model_copy(update={"validated_by_human": validated}) for r in batch_reqs]
        for findings in sets:
            for examiner in (False, True):
                p=PlanExtract(**variants[2]); today=date(2026,10,14)
                issues=coherence.run_all(p,today); adv=advisory.run_all(p,today)
                gaps=[dict(severity=sev,gap_id="G"+str(i),title="Synthetic gap",standard_ref="Public ref" if i%2 else "",deadline="2026-12-01" if i%2 else None) for i,sev in enumerate(("critical","high","medium","low"))]
                opts=dict(extract=dump(p), requirements=[dump(r) for r in rs], findings=[dump(f) for f in findings],
                    issues=[{k:getattr(i,k) for k in i.__slots__} for i in issues], advisories=[vars(a) for a in adv],
                    generatedAt="2026-10-14T12:34:56Z", gaps=gaps, examinerFacing=examiner)
                text=report.render(p.plan_id,p.plan_version,findings,rs,issues,gaps,today,examiner,adv)
                fixtures["reports"].append(dict(input=opts, expected=text))
    # More than ten blocker ids, no findings, empty scope, and no sections.
    for rs in (reqs, []):
        p=PlanExtract(plan_id="Bare")
        fixtures["reports"].append(dict(input=dict(extract=dump(p),requirements=[dump(r) for r in rs],generatedAt="2026-10-14"),
            expected=report.render(p.plan_id,p.plan_version,[],rs,today=date(2026,10,14))))
    public_lines=(ROOT / "config/boundary_patterns.txt").read_text(encoding="utf-8-sig").splitlines()
    patterns=[re.compile(s.strip(),re.I) for s in public_lines if s.strip() and not s.strip().startswith("#")]
    # Supply the public patterns directly: no filesystem loading by boundary.scan.
    with patch.object(boundary,"_read_patterns",return_value=patterns), patch.object(boundary,"_load_patterns",return_value=patterns):
        for text in ("Synthetic plan", "INTERNAL USE ONLY", "Confidential — do not distribute", "Proprietary and confidential", "Internal\nuse\tonly", "internal\x85use\x1conly", "internal\ufeffuse only"):
            for mode in ("sandbox","internal"):
                for attested in (False,True):
                    result=boundary.scan(text,mode,attested)
                    fixtures["boundary"].append(dict(text=text,mode=mode,attested=attested,expected=dict(vars(result),reason=result.reason)))
    fixtures["standards"] = dict(records=[dump(r) for r in reqs],stats=standards.coverage_stats(reqs),
        applicable=[r.req_id for r in standards.applicable(reqs,{"all_banks":True,"finra_member":False})])
    fixtures["prompts"] = dict(extractionSystem=literal("openbcdr/ingest.py","SYSTEM"), complianceSystem=literal("openbcdr/analyzers/compliance.py","SYSTEM"),
        orgContext=literal("openbcdr/config.py","ORG_CONTEXT"),requirementsPerCall=literal("openbcdr/config.py","REQUIREMENTS_PER_CALL"),
        planSchema=PlanExtract.model_json_schema(),coverageSchema=CoverageBatch.model_json_schema(),sampleText=raw,
        requirementBlocks=[compliance._requirement_block(r) for r in reqs])
    target=ROOT / "web/test/fixtures.json"
    target.write_text(json.dumps(fixtures, ensure_ascii=False, indent=2)+"\n",encoding="utf-8",newline="\n")
    print("Wrote",target,"with",sum(len(fixtures[k]) for k in ("plans","validation","quotes","batches","scores","reports","boundary")),"oracle cases")


if __name__ == "__main__":
    main()
