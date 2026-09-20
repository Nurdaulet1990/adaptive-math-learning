# te/ — Теңдеулер · what each file is for

Route code `TE`. 20 stages. Built against ROUTE_CONVENTION v1.1.
Structure comes from an audit of 296 equation items in the four KZ textbooks:
**8 cores × 8 wrappers + 4 notation stages** — every item is either a single-step core,
or one core with one outer step.

| file | exports | what it is |
|---|---|---|
| `index.html` | — | shell. Loads the four `core/` files, then stages → figs → icons → bank → generate. `placement:'climb'` (20 stages > the ~15 threshold, §10). |
| `stages.js` | `STAGES` | the 20 rows, in teaching order. 7 types; the structural variant lives in `params`. |
| `figs.js` | `FIGS` | three types: `bal` (two-pan balance, level 1), `grp` (equal groups, level 1), `wrap` (a core bar in a tray with one outer step). Everything else uses `core/figs.js`. |
| `icons.js` | `ICONS` | 20 map icons, `currentColor` only, artwork within ±12. |
| `bank.js` | `CARDS` | one teaching card per stage. No fixed items — §5. |
| `generate.js` | `GENERATORS` | 7 generators. |
| `_selfcheck.js` | — | §14. `node te/_selfcheck.js`. Not shipped. |

## Figures, level 2 and up: what core/figs.js already does for us

From level 2 on, all eight core stages are drawn by `core/figs.js` — nothing custom needed:

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

## Figures, level 1: the balance, and where it cannot go

Level 1 of the eight core stages carries **no sentence at all** — see rule 2. The picture is
the question, so the picture alone must say which quantity is being asked for. A sealed cup
marked «?» does that; a row of apples does not.

**What a pan may hold: known blocks, and a *known number* of whole sealed cups.** Everything
else is unplaceable — you cannot put "an unknown number of cups" on a pan, and you cannot
remove an unknown amount from one.

| stage | equation | level-1 figure | why |
|---|---|---|---|
| TE-01 | `5 + x = 12` | `bal` — 5 blocks + cup ǀ 12 blocks | |
| TE-02 | `x + 5 = 12` | same drawing as TE-01 | a pan has no left and right; at level 1 the two forms *are* one puzzle. They part company at level 3, where they are written differently. |
| TE-03 | `12 − x = 5` | `ubar` — 5 squares + a lidded strip «?», brace reads 12 | a pan cannot take anything away |
| TE-04 | `x − 5 = 7` | `ubar` — 5 + 7 squares, brace reads «?» | the whole is the unknown → empty label |
| TE-05 | `3 · x = 12` | `bal` — 3 cups ǀ 12 blocks | the one multiplicative core a pan can hold |
| TE-06 | `x · 4 = 12` | `grp` — 3 boxes of 4, «?» on the bracket that counts them | the unknown *is* the number of cups → unplaceable |
| TE-07 | `12 : x = 4` | same as TE-06 | same unknown, same picture |
| TE-08 | `x : 3 = 4` | `grp` — 3 boxes of 4, brace below reads «?» | the unknown is the whole → the empty-label mark (`?` on the brace, not in a cell) |

**The two subtractive cores keep the bar.** A balance shows a *solved* state, not an act of
taking away: TE-04 would mean tipping an unknown amount out of the cup, and TE-03 fits on a pan
only after it has been rewritten as an addition — which is the solution, not the question. So
the question is the countable bar carrying the two marks (a lid = the whole is known, an empty
label = it is not), and for TE-03 the balance comes back as `hfig`, where that rewriting belongs.
Addition and multiplication are the other way round: there the pan *is* the natural statement.

The hint for a balance item (`hfig`, hint step 2) is the same balance with the blocks that
appear on *both* pans crossed out — the physical act of taking the same amount off each side,
which is what the abstract rule will later be called.

`figBars` cannot carry a wrapper: a row whose base is `null` returns early and its `delta` is
never drawn, so `'?,+3'` renders no `+3`. Hence `FIGS.wrap`.

## Rules the generators keep

1. **Level-3 numbers go in `stem`.** `startTest` dedupes by `stem + ans` and never sees
   `exprHTML`; a stage whose variation lives outside the stem yields too few distinct items and
   the level test refuses to open. (This is the FR-02 bug, documented in `fr/generate.js`.)
2. **Level 1 of a core stage is wordless.** §6 calls level 1 concrete; for a grade-1 pupil who
   cannot yet read a word problem, a sentence is not concrete — a balance is. `stem` is a
   required field, so every level-1 item carries the same three characters, `x = ?` — nothing to
   read, and it is the first time the letter appears. It names the covered thing in the picture
   and then means the same at level 3, where the equation itself shows up. The equation itself first appears at level 2. (Constant stems are safe
   here: `startTest` dedupes by `stem + ans`, and the stage test draws level 3, which keeps its
   numbers in the stem.)
3. **No `fig` at level 3** — the bar moves to `hfig` so it stays available as hint step 2.
4. **The answer is never a number printed in the stem**, and never 1. Otherwise a pupil can
   copy a number off the screen and be right.
5. **Distractors differ by value.** `Core.isCorrect` compares the numbers in an answer, so
   `3 · x` and `3 : x` grade as the same thing — that is why TE-17 asks for a number.
6. **Generators retry internally** rather than returning `null` often: a sparse generator
   starves `startTest`'s 10-draw dedupe.

## Open, needs the owner

- **`--te` / `--te-d` do not exist in `core/ui.css`**, and `CFG.ROUTES` has no `TE` row.
  Both are owner actions (§0). `index.html` currently asks for `var(--te)` and will fall back
  to nothing until they exist.
- Kazakh stage names and card text passed a native reading pass (2026-09-20).
- **The balance has not been in front of a child yet.** The open question is whether a grade-1
  pupil reads a sealed cup as "a hidden number" without being told. If not, the fix is a
  teaching card (`bank.js`), not a sentence on the item.
- The wrapper stages (TE-09…TE-16) still carry Kazakh notes inside `FIGS.wrap`. They are
  grade 3–4, so reading is assumed there; if that turns out to be wrong, those notes are the
  next thing to replace with marks.
