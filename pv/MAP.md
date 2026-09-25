# pv/ — Орын мәні (place value & base-ten arithmetic) · route map

Route code **PV**. Owner: Nurdaulet (original app at `adaptive-math`). Status: **legacy app wrapped**, not yet split.

| file | what it does | edit when you want to… |
|---|---|---|
| `index.html` | the original single-file app, unchanged except: `../core/core.js` loaded first, `bridge.js` loaded last, REVIEW MODE defaults turned off | change any question/visual/level of PV (as before) |
| `bridge.js` | login overlay, progress via `Core` instead of localStorage, answer/level/placement logging, mirror to platform stages `PV-01…PV-48` | never (platform owner) |
| `stages.js` | **generated** station table (id → name) in the platform's STAGES format, read by `room/routes.js` so the teacher page can name a PV station; names only, no generators | never by hand — run `node pv/stages_gen.js` after changing `MODULES` / `STAGE_NO` in `index.html` (`--check` is run by `supabase/test/e2e_teacher_print.js`) |
| `stages_gen.js` | the generator for `stages.js` (evaluates `MODULES`, the twin block and `STAGE_NO` out of `index.html`) | the shape of those blocks in `index.html` changes |

Stage ids: `PV-nn` = position in `LEVEL_ORDER` (module order × level order), e.g. `c1`→PV-01, `u5`→PV-48. Do not reorder `MODULES` — append only — or students' stage ids shift.

Planned: split into `stages.js` + `generate.js` + `figs.js` on `core/runner.js` (like `fr/`), one module at a time.
