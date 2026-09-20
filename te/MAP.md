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
| TE-03 | `12 − x = 5` | `lid` — 12 cells, 5 open with dots, the rest under a lid marked x, the whole on the bracket above | a pan cannot take anything away |
| TE-04 | `x − 5 = 7` | `torn` — one unmarked strip with the empty label inside, and the same strip torn into 5 ǀ 7 below | nothing is hidden here, so a lid would lie |
| TE-05 | `3 · x = 12` | `bal` — 3 cups ǀ 12 blocks | the one multiplicative core a pan can hold |
| TE-06 | `x · 4 = 12` | `grp` — 3 boxes of 4, «?» on the bracket that counts them | the unknown *is* the number of cups → unplaceable |
| TE-07 | `12 : x = 4` | same as TE-06 | same unknown, same picture |
| TE-08 | `x : 3 = 4` | `grp` — 3 boxes of 4, brace below reads «?» | the unknown is the whole → the empty-label mark (`?` on the brace, not in a cell) |

**The two subtractive cores follow their own signed-off grammar** (《减法方程画法》, owner
sign-off 2026-09-20; the balance is on that document's ruled-out list, because a pan shows a
settled state and can never show an act of taking away). The two forms fail differently — TE-03
fails at working backwards, TE-04 fails at "I see a minus, so I subtract" — so they get two
different marks, and the marks are deliberately not merged:

- **lid** (TE-03, whole known, a part hidden): the child cannot lift it, which is the point —
  the answer has to come from the other sentence in the family. The lid overhangs the cells it
  covers (flush, it reads as blacked-out cells), carries a knob, and never takes a colour that
  means a quantity: `var(--muted)` is this route's "an object is hiding something" colour.
- **torn strip** (TE-04, whole unknown): nothing is hidden, so a lid would be a lie. The top
  strip carries the empty label *inside* it and — the load-bearing rule — **no cells, no dots, no
  number**: it gives a length, never a count. The pieces below are the same strip torn in two,
  and their jags must visibly interlock, since that interlock is the entire argument that the
  two pieces were once that one strip. Taken-away left, left-over right, in the reading order of
  `x − 3 = 6`. Never reversed.

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
3. **Level 3 KEEPS the picture** — a deliberate inversion of §6's default (owner decision,
   2026-09-20), and `_selfcheck.js` check 5 is inverted to match. §6 would move the bar to `hfig`,
   where it appears only if the pupil asks for a hint. On this route that turns level 3 into a bare
   `6 · x = 96` with nothing beside it — the symbol drilling the route exists to avoid. Equation
   and picture side by side *is* the level: joining them is what is being learnt, not a crutch to
   be earned. `notation` (TE-17) is the exception, having no picture at any level: it is about the
   notation itself.
4. **The answer is never a number printed in the stem**, and never 1. Otherwise a pupil can
   copy a number off the screen and be right.
5. **Distractors differ by value.** `Core.isCorrect` compares the numbers in an answer, so
   `3 · x` and `3 : x` grade as the same thing — that is why TE-17 asks for a number.
6. **Generators retry internally** rather than returning `null` often: a sparse generator
   starves `startTest`'s 10-draw dedupe.

## Open, needs the owner

- ~~`--te` / `--te-d` and the `TE` row in `CFG.ROUTES`~~ — both exist since the route was registered (fcc039b).
- Kazakh stage names and card text passed a native reading pass (2026-09-20).
- **The balance has not been in front of a child yet.** The open question is whether a grade-1
  pupil reads a sealed cup as "a hidden number" without being told. If not, the fix is a
  teaching card (`bank.js`), not a sentence on the item.
- The wrapper stages (TE-09…TE-16) still carry Kazakh notes inside `FIGS.wrap`. They are
  grade 3–4, so reading is assumed there; if that turns out to be wrong, those notes are the
  next thing to replace with marks.

## Review of 2026-09-20 (fixed on branch `te-fixes`, checks 10–11 in `_selfcheck.js`)

Found by generating 3000 items per stage × level and substituting every answer back into its equation.
Sound: 0 wrong keys, every solution unique, 4 distinct choices with exactly one accepted, last step = answer,
no placeholders, no module state, every stage test gets its 10 distinct items.

Fixed:
1. **`FIGS.wrap`, core `(x − a)`** drew `a | (v − a)` with `v = x − a`: a **negative width** whenever `x < 2a`
   (up to 17 % of level-1 items on TE-10/12–16), a printed number that is in no equation otherwise, and no `x`
   in the picture at all. Subtractive cores are now one block carrying their expression, and the tray is always
   as wide as the bracket's value, so `+ b` / `− b` beside it adds up to the right-hand side.
2. **The `(A − x)` core never reached a wrapper stage** (0 of 96 000 items): `a` was listed as a printed number
   although the printed one is `A = a + x`, so it sat in `shown` twice (next to `C.v`) and the duplicate check
   threw every such draw away. TE-14's card teaches exactly that form. All four cores occur now.
3. **Guided steps were words** («сыртын қайтар», «жақшаны аш»). They are the two computations now
   (`16 − 5`, then `11 − 4`), and `expl` shows them. For `T − (…) = b` and `T : (…) = b` the hint no longer says
   "reverse the outer operation" (that points to `b + T`); it says the bracket is the subtrahend / the divisor.
4. **`core/figs.js` `bar_equal` with an unknown number of cells drew exactly four** — TE-06/07 at levels 2–3:
   the drawn count disagreed with the answer on 77–89 % of items, and «4» was among the choices on 40 %.
   Now two cells, a dashed gap, a last cell. (Shared figure: WP's `18;?;3` items get the same fix.)

Left for the owner — content decisions, not bugs:
- **TE-18/19/20: the picture solves the item at every level**, test and placement included. `bar_equal
  "total;cells;?"` has already combined the like terms (x = total : cells), and TE-20's `bar "?;a;inner"` has
  already peeled both wrappers (x = inner − a). "Level 3 keeps the picture" is a signed-off decision; on these
  three stages the picture is the skill.
- **About half of TE-17's level-3 items are like-terms simplification** (`3x + 5x …`), which levels 1–2 never
  show and TE-18's card first teaches — yet they are half of TE-17's test and of its placement probe.
- **`n`, `g` (and `k` at level 1) in `stages.js` are ignored**; the ranges are literals in `generate.js`.
  TE-01…04 declare `n:[2,20]`, and ~20 % of their level-3 items use tens up to 100 (`x + 70 = 80`).
- TE-05…08 are tagged grade 2; at level 3, 28 % of items have both factors above 5. Check against the КТП.
- On the core stages hint 4 and hint 5 show the same text (no `steps`, no `h2`), and hint 1 has nothing to
  highlight on the wordless `x = ?` stems.
- The TE-06 and TE-10 cards still describe the old pictures (a dashed cell that was never drawn; `2 | 5`).
- TE-20 has one fixed shape, `(x + a) : b · d = e`; a pupil may read `: b · d` as `: (b · d)`.

