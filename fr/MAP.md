# fr/ — Бөлшектер (fractions) · route map

Route code **FR**. Owner: assistant (fractions author). Runs on `../core/runner.js` — the route has **no** screens, login, storage or adaptive logic of its own.

| file | what it does | edit when you want to… |
|---|---|---|
| `index.html` | shell; `Runner.start({route:'FR', title})` | never |
| `stages.js` | `STAGES` — 7 stages → generator type + params + prereq | add a stage (new row; type must exist in `generate.js`), change number ranges |
| `generate.js` | `GENERATORS` — one function per type: shade, compare, equiv, numberline, addsub, mixed, part_of | change question wording, hints (`h1`, `steps`, `expl`), distractors, CPA levels |
| `figs.js` | `FIGS` — pie, bar, grid, twobars, numberline, circles, groups; `fracHTML`, `mixedHTML` | change how a drawing looks, add a drawing |
| `bank.js` | `CARDS` — teaching cards per stage | change/add the explanation shown before practice |

Preview one generator without logging in to a class: `fr/?preview=FR-05&lvl=2`.

Each generator returns `{stem, kind, choices, choiceHTML?, ans, ansHTML?, fig?, hfig?, exprHTML?, h1, h2?, steps?, expl}` — see the header of `core/runner.js`.
Answers are compared by `Core.isCorrect` (fractions compared by value: `2/4` = `1/2`; mixed `1 3/4` ok).

Migrated from the standalone `fractions-` app: levels 1–7 → FR-01…FR-07 (level 8 "mixed problems" is covered by the stage tests); medals/confetti/sounds dropped; diagnostic and adaptive rules now come from the platform.
