# wp/ — Мәтінді есептер (word problems) · route map

Owner: Nurdaulet. Route code **WP**. Runs on the platform core (`../core/`), never edits it.

| file | what it does | edit when you want to… | lines |
|---|---|---|---|
| `index.html` | shell: loads core + the files below, calls `Core.start('WP')` | never (add a file → add one `<script>` line) | ~25 |
| `stages.js` | `STAGES` table — 13 stages, names, grades, prereqs | rename a stage, add a stage | ~20 |
| `bank.js` | `BANK = {items, templates}` — fixed items, teaching cards (`kind:'教学卡'`), question templates | add/fix questions, hints, cards (generated from the Excel bank) | large, data only |
| `generate.js` | template engine: word lists, Kazakh endings, variable binding, `generate(tpl)` | add a word list, fix a case ending, add a placeholder | ~180 |
| `state.js` | route state `R`, item pools (`drawItem`), the only Core calls (`log`, `persist`) | change how items are drawn | ~45 |
| `screens.js` | home, teaching card, question view, `finishAnswer` | change layout/texts of screens | ~70 |
| `practice.js` | practice loop, adaptive thresholds, 5-step hint ladder, twin items | change hint texts or adaptive rules | ~85 |
| `diag_test.js` | diagnostic (binary search) and 10-item stage test | change diag/test rules | ~55 |

Data flow: `bank.js` → `generate.js` → `state.js (drawItem)` → `screens.js (renderQuestion/finishAnswer)` → `practice.js` / `diag_test.js` → `log()` → `Core.answer / Core.event`; progress → `persist()` → `Core.save(R)`.

Answer event fields (read by `teacher/`): `stage, lvl, ok, mode, hints, ms, twin, skip, id, tpl, stem, ans, given`.
