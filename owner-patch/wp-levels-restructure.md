# WP Levels Restructure — Implementation Patch

**Date**: 2026-10-04  
**Owner**: Nurdaulet  
**Status**: Ready for review  

## Summary

Implements the WP levels restructure: scaffold levels (CPA progression) are separated from template levels (number range). Grade 1 pupils get levels 1–3 (Сурет→Берілгені→Шешуі) with small numbers ≤10; Grade 2+ gets levels 2–4 (Берілгені→Шешуі→Мәтін) with numbers ≤100.

## Files Modified (5)

### 1. `wp/state.js`
- Added grade detection and level mapping functions (already done in prior session):
  - `wpGrade()` — parses grade from `Core._session().klass`
  - `gradeMin(g)`, `gradeMax(g)` — level boundaries per grade
  - `tplLvl(g, scaff)` — maps scaffold level → template level for item selection
  - `isMaxLevel(g, lvl)` — checks if at grade's max scaffold level
- `freshStages()` — uses `gradeMin()` for initial level
- `drawItem()` — accepts `opts.tplLvl` to separate scaffold from template level
- `stageL3()` — now uses grade-aware template level for content checks

### 2. `wp/screens.js` (complete rewrite, ~480 lines)
- **Kept**: `stemHTML()`, `showHome()`, `showCard()`
- `showHome()` shows `Деңгей ${s.level}/${maxL}` grade-aware
- **New CSS** via `injectLevelCSS()`: `.qj`, `.box-input`, `.eq-row`, `.l1-choice`, `.bar-scene`
- **New renderers**:
  - `renderL1(q,o)` — picture + circle choice buttons (Grade 1 only)
  - `renderL2(q,o)` — text + DM-style bar model + қысқаша жазу + equation (ops pre-filled)
  - `renderL3(q,o)` — text + қысқаша жазу + equation (ops as inputs) + answer
  - `renderL4(q,o)` — pure text + equation (ops as inputs) + answer
- **Supporting functions**:
  - `drawBarModelWP(q)` — SVG bar model for add, subtract, compare, multi-step
  - `parseEq(q)` — builds equation array from `q.eq` or `q.h2`
  - `buildEqRowHTML(parts, prefix, fillOps)` — renders equation input row
  - `buildQJHTML(q, prefix)` — renders қысқаша жазу section
  - `checkLevelInputs()` — validates all `[data-ans]` input boxes
- `renderQuestion()` dispatches: diag/test → `renderLegacy()`, practice → L1/L2/L3/L4
- `finishAnswer(v, btn, forceOk)` — extended with `forceOk` parameter, marks box inputs
- `disableInputs()` — also disables `.box-input` elements

### 3. `wp/practice.js`
- `drawItem()` call passes `tplLvl: tplLvl(g, st.level)` for correct item selection
- `atL3` uses `isMaxLevel(g, st.level)` instead of `st.level===3`
- Level-up check: `st.level < gradeMax(g)` (was `st.level < 3`)
- Level-down check: `st.level > gradeMin(g)` (was `st.level > 1`)
- `l3streak` updates use `atL3` variable consistently

### 4. `wp/generate.js`
- `generate()` now processes template-level `given`, `qline`, `eq`, `unit` fields:
  - `given` — array of `{label, val, unit}` for қысқаша жазу lines (values via `evalExpr`)
  - `qline` — `{label, unit}` for question line (filled via `fill()`)
  - `eq` — equation token array `[{v:'a'},'+',{v:'b'},'=',{v:'ans'}]` (values via `evalExpr`)
  - `unit` — string for answer unit (filled via `fill()`)

### 5. `wp/diag_test.js`
- `nextDiag()`: `drawItem(st, tplLvl(g, gradeMax(g)))` instead of `drawItem(st, 3)`
- `startTest()`: same grade-aware template level for test item selection

### 6. `wp/bank.js`
- All 25 WP-01 templates now have `given`, `qline`, `eq`, `unit` fields
- Fields contain template variables that `generate()` fills at runtime
- Other stages (WP-02 through WP-13) still work — no `given` → legacy render

## Grade-Level Mapping Table

| Grade | Scaffold levels | Template levels | Level names (KZ) |
|-------|----------------|-----------------|-------------------|
| 1     | 1 → 2 → 3     | all → tpl 1     | Сурет → Берілгені → Шешуі |
| 2+    | 2 → 3 → 4     | 2→tpl 2, 3–4→tpl 3 | Берілгені → Шешуі → Мәтін |

## Backward Compatibility

- Templates without `given`/`qline`/`eq`/`unit` → the renderer falls back to legacy mode via `parseEq(q)` deriving from `h2`, and skipping қысқаша жазу / bar model
- Diagnostic and test modes always use `renderLegacy()` — no change in behavior
- Existing saved progress (`st.level`) is clamped to `gradeMin(g)` on load via `freshStages()`
- Grade unknown (no class assigned) defaults to grade 2 — same levels as before (2–4 maps to what was 1–3 in the old system, with level 1 effectively being the old level 1 content)

## Testing

Verified via Node.js integration tests:
- Grade detection from class name ("1 ALEM" → 1, "2 SAMURYQ" → 2)
- Level boundary functions (gradeMin, gradeMax, tplLvl, isMaxLevel)
- Level progression: streak 3 → level up (capped at gradeMax), wrong 2 → level down (floored at gradeMin)
- `drawItem()` respects tplLvl option
- `generate()` produces `given`/`qline`/`eq`/`unit` fields correctly
- `stageL3()` uses grade-aware template level
- All 5 JS files pass `node -c` syntax check

## Remaining Work

- Add `given`/`qline`/`eq`/`unit` to WP-02 through WP-13 templates (multi-step templates need more complex eq structures)
- Add teaching cards for L1/L2 scaffold explanations
- Bump `?v=` in `wp/index.html` before deploy
- End-to-end browser testing with actual Core framework
