# OpenBCDR browser engine

Offline ES2020 scripts: no dependencies, build step, DOM, network, storage, or
model client. The HTML application supplies `sample()` and handles input caps,
batching, JSON parsing, errors/retries, and presentation. These scripts never
call a model. Only public standards, public prompt literals, generic boundary
patterns, and synthetic fixtures are included.

Load `engine.js`, `prompts.js`, `standards.js`, and `boundary.js` as ordinary
scripts. They expose `window.OpenBCDR`, `window.OpenBCDR_PROMPTS`,
`window.OpenBCDR_STANDARDS`, and `window.OpenBCDR_BOUNDARY`. Each also supports
Node `require()` / `module.exports`, independently of the other scripts.

1. Call `OpenBCDR_BOUNDARY.enforce(text, 'sandbox', true)` only after the viewer
   explicitly attests that the document is synthetic/sanitized. A deny-list hit
   refuses either mode. **This public artifact deliberately provides generic-only
   boundary protection**; it cannot detect organisation names or private systems.
2. Build the extraction input with `buildExtractionInput(text, planIdHint)`.
   Parse the model result and call `OpenBCDR.validateExtract(object)`. It returns
   `{ok, value, errors}`; errors contain `{path, message}`. On success `value`
   contains Pydantic-compatible defaults/coercions and drops unknown fields.
   Missing required fields or invalid values are errors, never guessed values.
   Analyze only successfully validated records. A literal RTO range is invalid:
   the extraction instructions require the model to return its longer endpoint.
3. Run `coherence.runAll(value, todayISO)` and `advisory.runAll(value, todayISO)`.
   Dates are explicit `YYYY-MM-DD`; no check reads the current clock. Optional
   coherence arguments are `finraMember=true, annualRequired=null`, matching Python.
4. `standards.load(OpenBCDR_STANDARDS)` returns normalized requirements;
   `standards.applicable(requirements, profile)` applies the same ANY-tag overlay.
   Batch them using `REQUIREMENTS_PER_CALL` from the prompts export. Call
   `buildComplianceInput(text, batch)` and then
   `compliance.applyBatch(batch, parsedFindings, text)`; `parsedFindings` can be
   an array or `{findings: [...]}`. Missing findings are filled, duplicate model
   ids use the last finding, and extra ids are ignored, matching Python.
   Invalid draft fields/enums throw. Verification and revision fields supplied by
   the model are discarded. The caller can stamp the actual plan version afterward.
5. `report.renderMarkdown({extract, requirements, findings, issues, advisories,
   generatedAt, gaps: [], examinerFacing: false})` returns the CLI's exact text
   (plain text is also valid Markdown). `generatedAt` is an explicit ISO date or
   timestamp; its date portion is displayed. The score is recomputed from the
   in-scope requirements, so a caller-supplied score cannot bypass the validation
   and completeness gates. No registry or database is required. `gaps` optionally
   holds in-memory records with `severity, gap_id, title, standard_ref, deadline`.

From the repository root, using the existing Python dependencies and Node:

```sh
python web/build_standards.py
python web/build_prompts.py
python web/build_boundary.py
python web/test/make_fixtures.py
node web/test/parity.js
node web/test/mutation.js
python tests/run_all.py
```

The generators use explicit public paths. The standards generator embeds only
the three named top-level indexes, in Python loader order, with model defaults.
Prompt generation also refreshes the schema embedded in `engine.js`. Fixtures
use `samples.load_sample.SAMPLE`, three small synthetic variants, fixed dates,
and actual Python analyzers/report rendering. Model calls are stubbed at the API
boundary. Parity deep-compares results and prints every mismatch, exiting nonzero
on failure; it also loads the scripts in a browser-like VM. The mutation runner
breaks the RTO check, quote verifier, report gate, and boundary attestation in turn,
requires parity to fail each time, restores the files, and reruns clean parity.
This does not verify live Claude sampling, real-browser integration, model
judgment quality, or platform input limits.
