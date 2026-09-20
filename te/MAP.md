# te/ — Теңдеулер · what each file is for

Route code `TE`. 20 stages. Built against ROUTE_CONVENTION v1.1.
Structure comes from an audit of 296 equation items in the four KZ textbooks:
**8 cores × 8 wrappers + 4 notation stages** — every item is either a single-step core,
or one core with one outer step.

| file | exports | what it is |
|---|---|---|
| `index.html` | — | shell. Loads the four `core/` files, then stages → figs → icons → bank → generate. `placement:'climb'` (20 stages > the ~15 threshold, §10). |
| `stages.js` | `STAGES` | the 20 rows, in teaching order. 7 types; the structural variant lives in `params`. |
| `figs.js` | `FIGS` | **one** type: `wrap` — a core bar in a tray with one outer step. Everything else uses `core/figs.js`. |
| `icons.js` | `ICONS` | 20 map icons, `currentColor` only, artwork within ±12. |
| `bank.js` | `CARDS` | one teaching card per stage. No fixed items — §5. |
| `generate.js` | `GENERATORS` | 7 generators. |
| `_selfcheck.js` | — | §14. `node te/_selfcheck.js`. Not shipped. |

## Figures: what core/figs.js already does for us

All eight core stages are drawn by `core/figs.js` — nothing custom needed:

| stage | equation | fig |
|---|---|---|
| TE-01 | `4 + x = 11` | `{type:'bar', fp:'4;?;11'}` |
| TE-02 | `x + 5 = 13` | `{type:'bar', fp:'?;5;13'}` |
| TE-03 | `12 − x = 5` | `{type:'bar', fp:'5;?;12'}` — **same shape as TE-01** |
| TE-04 | `x − 3 = 6` | `{type:'bar', fp:'3;6;?'}` |
| TE-05 | `3 · x = 12` | `{type:'bar_equal', fp:'12;3;?'}` |
| TE-06 | `x · 4 = 12` | `{type:'bar_equal', fp:'12;?;4'}` — figBarEqual adds "? қорап" itself |
| TE-07 | `12 : x = 4` | `{type:'bar_equal', fp:'12;?;4'}` — **same shape as TE-06** |
| TE-08 | `x : 3 = 5` | `{type:'bar_equal', fp:'?;3;5'}` |

`?` inside a cell means *this part* is unknown; `?` on the brace means *the whole* is unknown.
That is the entire mark system — nothing else had to be invented.

`figBars` cannot carry a wrapper: a row whose base is `null` returns early and its `delta` is
never drawn, so `'?,+3'` renders no `+3`. Hence `FIGS.wrap`.

## Rules the generators keep

1. **Level-3 numbers go in `stem`.** `startTest` dedupes by `stem + ans` and never sees
   `exprHTML`; a stage whose variation lives outside the stem yields too few distinct items and
   the level test refuses to open. (This is the FR-02 bug, documented in `fr/generate.js`.)
2. **No `fig` at level 3** — the bar moves to `hfig` so it stays available as hint step 2.
3. **The answer is never a number printed in the stem**, and never 1. Otherwise a pupil can
   copy a number off the screen and be right.
4. **Distractors differ by value.** `Core.isCorrect` compares the numbers in an answer, so
   `3 · x` and `3 : x` grade as the same thing — that is why TE-17 asks for a number.
5. **Generators retry internally** rather than returning `null` often: a sparse generator
   starves `startTest`'s 10-draw dedupe.

## Open, needs the owner

- **`--te` / `--te-d` do not exist in `core/ui.css`**, and `CFG.ROUTES` has no `TE` row.
  Both are owner actions (§0). `index.html` currently asks for `var(--te)` and will fall back
  to nothing until they exist.
- Kazakh stage names and card text need a native reading pass.
