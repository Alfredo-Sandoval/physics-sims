# Papercuts

## 2026-09-13T07:25:58.714Z — gpt-6 — Alfredo Sandoval

During the solar-system review, an inventory command included a nonexistent .github directory and stopped the chained README reads. Use existing paths or separate optional directory searches from dependent reads.

## 2026-09-13T07:41:26.366Z — gpt-6 — Alfredo Sandoval

Large batched source reads during the solar-system changes exceeded the tool output budget and hid relevant sections. Use smaller scoped ranges for adaptive code inspection.

## 2026-09-13T07:45:56.360Z — gpt-6 — Alfredo Sandoval

The browser smoke test's cross-window dynamic import resolved against the test page rather than the app iframe. Use the explicit /Solar-System/ module URL for iframe state inspection.

## 2026-09-13T08:04:32.609Z — gpt-6 — Alfredo Sandoval

Running the Solar-System check with npm --prefix failed because shell nvm initialization rejects npm_config_prefix. Run npm test with Solar-System as the working directory instead.

## 2026-09-13T16:27:45.474Z — gpt-6 — Alfredo Sandoval

The browser test runner waited for its full timeout after a module parse error because the test page never set its completion status. A future runner should fail immediately on page errors; the test page also emits an unrelated missing-favicon console warning.

## 2026-09-13T16:31:50.254Z — gpt-6 — Alfredo Sandoval

The commit/push memory lookup matched unrelated repositories and truncated the output. Use exact repository keywords before broader workflow terms.

## 2026-09-13T20:03:03.201Z — gpt-6 — Alfredo Sandoval

A source-review batch exceeded its output cap and clipped a function excerpt. Keep reads limited to the specific functions needed for each finding.

## 2026-09-13T20:07:20.516Z — gpt-6 — Alfredo Sandoval

Combining a skill read with source inspection clipped the source output. Keep skill reads separate from code reads to avoid repeating the lookup.

## 2026-09-13T20:17:56.945Z — gpt-6 — Alfredo Sandoval

The Solar-System test command was invoked from the collection root, which has no package.json. Run npm test with Solar-System as the working directory.

## 2026-09-13T20:29:53.873Z — gpt-6 — Alfredo Sandoval

Synthetic pointer events in the picking test triggered OrbitControls' native pointer-capture check because no real pointer was active. Isolate the custom picking handler by disabling OrbitControls during those synthetic events.

## 2026-09-13T20:36:28.937Z — gpt-6 — Alfredo Sandoval

While reviewing the Solar System visual styles, a batched source read exceeded the combined tool output limit and hid relevant CSS. Keep follow-up reads to targeted sections and cap the total batch output.
