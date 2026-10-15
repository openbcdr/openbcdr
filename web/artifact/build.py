"""Assemble the OpenBCDR Claude artifact into an output folder.

Inlines the public synthetic sample plan into index.html and copies the four
engine scripts beside it. Usage: python web/artifact/build.py <out_dir>
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)

page = (WEB / "artifact" / "index.html").read_text(encoding="utf-8")
sample = (ROOT / "samples" / "sample_plan.md").read_text(encoding="utf-8")
marker = '/*SAMPLE_PLAN*/""'
assert page.count(marker) == 1, "sample marker missing"
page = page.replace(marker, json.dumps(sample).replace("</", "<\\/"))
(out / "index.html").write_text(page, encoding="utf-8", newline="\n")
for name in ("engine.js", "prompts.js", "standards.js", "boundary.js"):
    shutil.copyfile(WEB / name, out / name)
print("built", out)
