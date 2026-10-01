# pv/ — Орын мәні (place value & base-ten arithmetic) · route map

Route code **PV**. Owner: Nurdaulet (original app at `adaptive-math`). Status: **legacy app wrapped**, not yet split.

| file | what it does | edit when you want to… |
|---|---|---|
| `index.html` | the original single-file app, unchanged except: `../core/core.js` loaded first, `bridge.js` loaded last, REVIEW MODE defaults turned off | change any question/visual/level of PV (as before) |
| `bridge.js` | login overlay, progress via `Core` instead of localStorage, answer/level/placement logging, mirror to platform stages `PV-01…PV-48` | never (platform owner) |
| `stages.js` | **generated** station table (id → name) in the platform's STAGES format, read by `room/routes.js` so the teacher page can name a PV station; names only, no generators | never by hand — run `node pv/stages_gen.js` after changing `MODULES` / `STAGE_NO` in `index.html` (`--check` is run by `supabase/test/e2e_teacher_print.js`) |
| `facts.js` | the fact tables of the fluency ladder (`window.PVFACTS`: facts per level, `pick`/`distinct`, the seconds per fact in `PVFACTS.MS`) — loaded before `fluency.js`, and by `review/` so the daily review can ask PV facts without the app | change a fact group or a time limit |
| `fluency.js` | the fluency ladder for +/− within 10 and 20 (levels `f1…fsr`, stations PV-77…91): strategy cards, learn phase with the picture, the timed ⚡ round, then for every fact missed **four different picture questions** (that fact + three others of the level, `FLU.fixPer`, at most `FLU.fixMax` a round, mixed) — never the same question repeated, never the whole level again; `FLU.gate` (false = measure only) | change the pass mark, the correction count, or switch the gate on (design: `claude/pv-fluency-proposal.md`) |
| `modtest.js` | the module test (the «Түсіну» levels `u1…u5`): two different text questions from every live level of the module, pass = all right; a miss reopens the level the question came from (its `completed` is cleared, the map goes back there) and the test stays shut until every level is complete again | change how many questions per level (`MT.per`) |
| `stages_gen.js` | the generator for `stages.js` (evaluates `MODULES`, the twin block and `STAGE_NO` out of `index.html`) | the shape of those blocks in `index.html` changes |

2026-10-01: the six within-20 add/sub levels (`a1 s1 a20n a2 s20n s20b`, PV-02/03/07–10) and their twins (PV-49–54) are **retired** — still in `MODULES` and `STAGE_NO` so the teacher page names them, but off the map and the ladder (`LEVEL_ORDER` skips `retired:true`). The fluency ladder replaces them.

Stage ids: `PV-nn` = position in `LEVEL_ORDER` (module order × level order), e.g. `c1`→PV-01, `u5`→PV-48. Do not reorder `MODULES` — append only — or students' stage ids shift.

Planned: split into `stages.js` + `generate.js` + `figs.js` on `core/runner.js` (like `fr/`), one module at a time.
