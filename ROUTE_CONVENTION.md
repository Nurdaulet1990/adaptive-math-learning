# ROUTE_CONVENTION.md — how to build a route for Есеп жолы

**v1.1 · 2026-09-14.** Every checkable statement below was verified against the code that is live in
this repository (`core/core.js`, `core/runner.js`, `core/map.js`, `core/map.css`, `core/ui.css`,
`core/figs.js`) and against the four routes running on it: `wp/`, `fr/`, `pv/`, `ar/`.

Everything here is normative. Where this document and the code disagree, **the code wins** — and
that disagreement is a bug in this document: report it. v1.0 had three; the audit for v1.1 found
eighteen more, several of them copied out of code comments that were themselves wrong.

---

## 给 owner 的中文摘要

这是给路线作者（助理）的唯一一份规范。五条铁律：

1. 路线不碰登录、不碰数据库、不碰 `localStorage` —— 一律走 `Core.*`
2. 关卡只能在 `STAGES` 表里定义，编号永不重编、永不复用
3. 一道题只有一个出口：runner 负责判题和记录，生成器只管出题
4. 不许用 `alert` / `confirm` / `prompt`
5. `core/` 是 owner 专属，路线一行都不能改

**v1.1 相对 v1.0 改了什么：** §5「固定题机制」删掉（那东西不存在）；§8 小数由逗号改成小数点；
§3 示例编号标注为虚构；新增 §10 诊断测试的完整规则；§7 补上重试、「不会」按钮和提示阶梯的真实行为。

**注意：段号变了。** v1.0 的「§9 交付自检」现在是 **§14**（中间插了新的 §10 诊断）。
`ar/_selfcheck.js` 和 `ar/stages.js` 里引用的「§9」指的是旧编号。

---

## §0 · Who owns what

| | owner | may edit |
|---|---|---|
| `core/` | platform owner | platform owner only |
| `<route>/` | the route author | that one folder |
| `teacher/`, the portal `index.html` | platform owner | platform owner only |

A route is a folder of plain `.js` files loaded by one `index.html`. No build step, no bundler, no
npm. It is served as static files from GitHub Pages.

Adding a route to the portal is an owner action: one row in `CFG.ROUTES` in `core/core.js` —
`[code, Kazakh name, folder, status, grades]`. Do not edit that file; ask.

---

## §1 · The five hard rules

**1. No login, no storage, no network.**
The route never calls `fetch`, never touches `localStorage`/`sessionStorage`/`indexedDB`, never
renders a login screen. `Core.start(route)` does all of it and hands back this route's state object.

**2. Stages live only in `STAGES`.**
One row per stage, in teaching order. Ids are **never renumbered and never reused** once the route
is live — a pupil's saved progress and every logged event point at them by string.

**3. One answer path.**
`core/runner.js` grades the answer (`Core.isCorrect`) and reports it (`Core.answer`). A generator
returns a question and stops. Do not grade, count, or log an answer yourself.

**4. No `alert` / `confirm` / `prompt`.**
They are blocked in some embeddings and they break the question flow. Put the message on the page.

**5. Never edit `core/`.**
If the platform needs a change, write the patch as a separate file with a note and hand it to the
owner — `../owner-patch/` (a sibling of this folder) is how the AR author did it, and the patch was
accepted. A route that edits `core/` in place will be rejected whole.

---

## §2 · The files a route owns

`fr/` is the reference implementation: 7 stages, no screens and no adaptive logic of its own — only
the required exports plus its own drawings.

Listed in the order `fr/index.html` loads them:

| file | exports | required |
|---|---|---|
| `index.html` | the shell; calls `Runner.start({…})` | yes |
| `stages.js` | `STAGES` | yes |
| `figs.js` | `FIGS` | only if the route draws its own pictures |
| `icons.js` | `ICONS` | yes |
| `bank.js` | `CARDS` | yes |
| `generate.js` | `GENERATORS` | yes |
| `MAP.md` | a table saying what each file is for | yes |

`STAGES` and `GENERATORS` are referenced directly by the runner (`STAGES.find(…)`,
`GENERATORS[type]`) — if either is missing the route throws on load. `CARDS`, `FIGS` and `ICONS` are
read through `typeof`, so they may be absent; the route simply loses cards, custom drawings or map
icons.

Declare them as bare top-level `const` — they live in the shared global lexical scope and the runner
sees them from there. The one exception: a file that must also load under Node for the self-check
(§14) may wrap itself and assign to `window`, as `ar/stages.js` does. Do not do both.

A route may split a large file (`generate.js` + `generate2.js`, as AR does). **Load order then
matters** — if part 2 reads a helper defined in part 1, part 1 must be listed first in `index.html`.

### `index.html`

Copy `fr/index.html` and change the `<title>`, the route's own `<script>` list, and the fields of
the single `Runner.start({…})` options object. Everything else — charset, viewport meta,
`notranslate` meta, the small language-lock script — is platform boilerplate, keep it verbatim.

```html
<script>Runner.start({route:'FR', title:'Бөлшектер · 3–5 сынып', color:'var(--fr)'});</script>
```

| field | meaning |
|---|---|
| `route` | **two capital letters** — `Core.start` throws otherwise |
| `title` | the subtitle under «Есеп жолы» in the top bar |
| `color` / `colorDark` | route colour and its pressed shade; default `var(--xx)` / `var(--xx-d)` |
| `placement:'climb'` | changes how the diagnostic searches — see §10 |

**Cache-busting.** Every `<script>` and `<link>` in `index.html` carries `?v=N`. Bump `N` on every
release, or pupils keep running yesterday's file for as long as the CDN cache lives.

---

## §3 · `STAGES`

```js
const STAGES = [
 ['FR-01','Боялған бөлік',         'shade',   {d:[2,10]},        [],        '3'],
 ['FR-02','Бөлшектерді салыстыру', 'compare', {d:[3,12]},        ['FR-01'], '3'],
 ['FR-03','Тең бөлшектер',         'equiv',   {d:[2,8],k:[2,4]}, ['FR-02'], '4'],
];
```

| position | field | rules |
|---|---|---|
| 0 | `id` | `XX-nn` — two capitals, hyphen, **two digits**. Unique. Never renumbered, never reused. |
| 1 | `name` | Kazakh, short enough for a map bubble — about 24 characters. Shown to the pupil. |
| 2 | `type` | must be a key of `GENERATORS` |
| 3 | `params` | a plain object handed to the generator; number ranges as `[min,max]` |
| 4 | `prereq` | array of stage ids, may be empty |
| 5 | `grade` | a string, e.g. `'3'` or `'3–4'` |

The id format is **not validated by `core/`** — it is a discipline every route keeps, and the
self-check enforces it per route. Note the two-digit field caps a route at 99 stages. Only the
*route code* is validated, by `Core.start`.

`prereq` is documentation: the runner never reads it (it destructures `[id,name,,,,grade]`).
Progression is purely the table order. `grade` is documentation too.

**A stage whose `type` has no generator is worse than useless.** Practice shows "Бұл кезеңде әзірге
есеп жоқ", and — this is the dangerous part — the diagnostic drops the stage from its probe list and
**marks it passed for free**, quietly inflating the placement. Never ship a row without a generator.

The table is in **teaching order**, and that order is the road on the map, bottom to top. What opens
after a passed stage is literally the next row, so do not sort the table by anything else.

> The rows above are the real `fr/stages.js`. Any id quoted in an *example* elsewhere in this
> document is marked **(illustrative)**. v1.0's §3 example invented `FR-09` and `AR-06`, and
> combined with "ids are never renumbered" the AR author reasonably read them as already taken.

---

## §4 · `GENERATORS` and the question object

```js
const GENERATORS = {
  shade(params, lvl){ … return q; },
};
```

One function per `type`. **Pure**: no DOM, no `Core`, no state, no side effects. Called with the
stage's `params` and a CPA level 1–3 (§6).

It may be called many times in a row. Practice retries a failed generator up to **8 times**; the
stage test wraps that in its own loop, so a single test can call one generator up to 80 times.
Return `undefined`/`null` to mean "not possible with these params at this level" — do not throw. A
thrown error is caught, logged to the console, and burns one of the 8 tries.

### The question object

```js
{
  stem,            // required. The question, plain text. Escaped — no HTML.
  ans,             // required. The expected answer, as a string.
  kind,            // 'choice' | 'input' | 'custom'
  choices,         // ['>','<','='] — the values compared against ans
  choiceHTML,      // optional, same length: what each choice looks like (HTML)
  ansHTML,         // optional: how the correct answer is displayed in the feedback line
  exprHTML,        // optional: an expression shown under the stem (HTML)
  fig,             // optional: a picture shown with the question
  hfig,            // optional: a picture shown only at hint step 2
  h1, h2,          // optional: hint step 3 — the plan (h1) or the expression (h2)
  steps,           // optional: hint step 4 — [{label, expr, val}], the pupil types each val
  expl,            // optional but strongly recommended: the full solution, hint step 5
  mount(el,submit) // kind:'custom' only
}
```

The runner **sets** `stage`, `lvl`, `type` and `id` — do not set those. It **defaults** `kind`
(`'choice'` if `choices` is non-empty, else `'input'`) and `choices` (`[]`), so leaving them out is
allowed but being explicit is better.

**`stem` and `expl` are escaped**, so they are plain text — no tags. `choiceHTML`, `ansHTML`,
`exprHTML` and the figure fields are **not** escaped and may carry markup; they must therefore never
contain anything a pupil typed. (`Core.esc` escapes `&` and `<` only — enough for text nodes, not
enough to build an HTML attribute out of.)

### Choices

- 3 or 4 choices. `core/ui.css` lays 3 out in one row (`.choices.three`), 4 as a 2×2 grid.
- Distractors must be **distinct from the answer by value, not just by text**. The runner marks
  green *every* choice `Core.isCorrect` accepts, so two choices that compare equal both light up.
- Make them plausible: the common wrong method, the digits swapped, the off-by-one. A distractor
  no child would pick teaches nothing.

### `kind:'custom'`

`mount(el, submit)` renders into `el` and calls `submit(value)` once. Two traps:

1. **Do not lock your own UI after a submit.** The runner guards with `window._Q.done`, and in
   practice a first wrong answer gets a free retry (§7) — a self-disabled widget leaves the pupil
   staring at a dead screen.
2. **One scalar answer per question.** `Core.isCorrect` can compare a multi-number answer
   (`'3 қ. 1'`), but the feedback line prints one value: `Дұрыс жауабы: X`.

### How answers are compared (`Core.isCorrect`)

In order: exact match after normalising (trim, collapse spaces, first `,`→`.`, strip a trailing
`%`, lowercase) → fraction value (`2/4` = `1/2`, mixed `1 3/4` ok) → if `ans` is a plain number, the
first number found in what the pupil typed → otherwise **every** number in `ans` must appear, in
order, with the same count.

---

## §5 · `CARDS` — teaching cards

```js
const CARDS = {
 'FR-01':[{stem:'Бөлшек — бүтіннің тең бөліктері.', fig:{type:'pie',d:4,n:1},
           expl:'Дөңгелек 4 ТЕҢ бөлікке бөлінген…'}],
};
```

Shown before a pupil's **first** practice at a stage, and again **after a level drop** (§7 clears
`seenCard`). One idea per card; one or two cards per stage. `stem` and `expl` are both escaped —
plain text, no HTML.

**There is no fixed-item mechanism.** `bank.js` exports `CARDS` and nothing else. Diagnostics and
stage tests both draw from `GENERATORS` at level 3, exactly like practice. Hand-written items have
nowhere to go; writing them produces dead code.

The consequence to design around: **a stage needs enough level-3 variety to yield at least 6
distinct items** (deduplicated by `stem + ans`), or the stage test refuses to open and the pupil can
never pass the stage. The draw is random, so a marginal stage opens some days and refuses others —
which is exactly why the self-check runs it 200 times. Aim for 10 comfortably distinct items.

---

## §6 · CPA levels 1–3

Every generator is called with `lvl` 1, 2 or 3 and must answer at all three.

| lvl | Concrete → Pictorial → Abstract |
|---|---|
| 1 | **Concrete.** A picture that can be counted, small numbers, choices. |
| 2 | **Pictorial.** A diagram (bar, number line, place-value discs), bigger numbers. |
| 3 | **Abstract.** Text or symbols only — no picture. This is what the diagnostic and the stage test use. |

Level 3 carries the whole assessment load, so it must be both *hard enough to mean something* and
*varied enough to yield 10 distinct items*.

A useful pattern (`fr/generate.js`): compute the numbers once, then branch only on presentation —
`if(lvl<3){ q.fig=…; q.choices=… } else { q.kind='input'; q.hfig=…; }`. Moving a picture from `fig`
to `hfig` keeps it available as hint step 2 without giving it away.

---

## §7 · Practice — what the runner does with the answer

The route supplies questions; these rules are the platform's and are identical on every route.

**Per-stage state:** `{status, level, streak, wrong, l3streak, testUnlocked, tests[], seenCard}`.

**One free retry.** In practice, the first wrong answer on a question (before hint step 5) is not
graded: the choice greys out, the input clears, and the pupil is told to think again or take a hint.
Logged as `ev:'attempt'`. Only the second attempt counts.

**Does it count towards the streak?** Only if correct **with fewer than 3 hints used**. Correct on
hint 3 or 4 is still correct — it just does not advance the streak, and the pupil is told so. (You
cannot answer at hint 5; that step ends the question.)

**Level up:** 3 counted-correct in a row → `level++` (max 3), streak resets, a rising sound plays.
**Level down:** 2 wrong answers **with no correct answer between them** → `level--` (min 1), streak
and the wrong-counter reset, and the teaching card is shown again. Any correct answer clears the
counter, even a hinted one; reaching hint step 5 does *not* add to it.
**Test unlocks:** 3 counted-correct in a row *at level 3*.
**Twin item:** after a wrong answer or after seeing the full solution, the next item is labelled
«ұқсас есеп» and logged as `twin`. Practice already only draws from the stage's own generator, so
this is a signal to the pupil, not a different question. A level drop cancels it.

### The hint ladder — 5 steps, one button

| step | what the pupil gets | what the route supplies |
|---|---|---|
| 1 | The stem re-read with numbers and keywords highlighted | nothing — automatic |
| 2 | `hfig` if present; else the existing `fig` pulses; else "write down what you know" | `hfig` |
| 3 | The plan | `h1`, else `h2`, else a generic "which operation, and why?" |
| 4 | Guided computation — the pupil types each intermediate value and it is checked | `steps:[{label,expr,val}]`, else one step synthesised from `h2`, else `expl` is printed |
| 5 | The full solution. **Counts as wrong**, ends the question, next item is a twin. | `expl` |

Two behaviours worth knowing:

- **«Білмеймін» in practice is a one-shot.** It advances one hint step (and logs `ev:'dontknow'`),
  then the button disappears; from then on it is «Кеңес».
- **Finishing the guided steps auto-submits.** When the pupil types the last value in step 4
  correctly, the runner submits it as the answer: graded correct, but with `hints=4`, so it does not
  count towards the streak.

Write `h1` as the *idea*, not the arithmetic ("Бөлімдері бірдей: алымы үлкені — үлкен бөлшек"), and
`expl` as a complete worked solution — it is the last thing a stuck child reads.

---

## §8 · Numbers, language, text

- **Decimal point** (`5.25`). Fractions `3/4`, mixed numbers `1 1/2`.
  `Core.isCorrect` converts a comma to a point, so a pupil may type either — this rule governs how
  the route **displays** numbers, not how they are graded. (Only the *first* comma is converted, so
  an answer containing two numbers must not use commas as decimal separators.)
- **Kazakh only** in everything a pupil sees. No Russian, no English, no Chinese in any shipped
  file. A pupil who needs Russian presses `РУС`, which unlocks the browser's own translator; the
  route does nothing for this.
- Keep `stem` to one or two short sentences. A word problem that needs three lines of reading is
  testing reading, not arithmetic.
- Kazakh number agreement matters (`5 алма`, not `5 алмалар`). If the route builds sentences from
  templates, build a case table — `wp/generate.js` has one.

---

## §9 · The stage test

Automatic; the route only has to make sure enough distinct level-3 items exist (§5).

- **Up to 10 items** at level 3, deduplicated by `stem + ans`. If fewer than 10 distinct ones can be
  drawn the test runs short; below 6 it refuses to open.
- **Pass = `ceil(n × 0.8)`** — 8 of 10 on a full test, but 6 of 7 on a thin stage.
- Passing marks the stage `passed` and opens the next row. Failing re-locks the test and resets
  `l3streak`; the level stays at 3, so the pupil practises there and retries.
- **Stars are a ratio of the best result ever recorded** (pass or fail): ≥100% → ★★★, ≥90% → ★★,
  ≥80% → ★. On a full 10-item test that is 10/10, 9/10, 8/10. On a short test the thresholds bite:
  6/7 is a pass and still zero stars. One more reason to reach 10 distinct items.

---

## §10 · The diagnostic (placement test) — NEW in v1.1

Every route places the pupil before teaching them. This section is the whole contract.

**Forced.** While the route's state has no `diag`, the home screen shows the diagnostic card in
place of the map and the stage list (the stats card and the «← Барлық бағыттар» link stay). The
pupil cannot practise their way around it.

**Re-diagnostic — NEW in v1.2.** Once placed, the home screen carries a plain-text button under
the current-stage card: «Бәрі тым оңай ма? Қайта диагностика». It asks for confirmation, then runs
the same probe again. **It can only move a pupil forward.** If the second run places lower than
where they already are, the placement is discarded, the pupil keeps their stage, and the result
screen says so. Stars and passed stages are never touched. The reason is that the button exists
for a child who rushed the first diagnostic and got parked in work they can already do; if a
second bad run could cost them stages, the way out would itself be a trap. The rule lives in
`finishDiag` (`core/runner.js`, and the same code in `wp/diag_test.js`); PV, whose placement is
its own app's, gets the same ceiling in the `finishPlacement` wrapper in `pv/bridge.js`.
A route inherits all of this — there is nothing to implement.

**How it probes.** The runner builds the list of stages that have a generator, then:

- **2 items per probed stage**, both at level 3;
- **pass = 2 out of 2.** One miss marks the stage failed. Deliberately strict: it is cheaper to
  place a child one stage too low than one stage too high.
- **«Білмеймін» is scored wrong** and moves on at once. Hints are off during the diagnostic.
- **Stops at 12 questions** (or 15 minutes), whichever comes first, and places on what it knows.

**Which stage it probes next** — this is what `placement` changes:

| `placement` | search |
|---|---|
| *(omitted)* | **Binary search.** First probe is the middle stage. Right for a short route. |
| `'climb'` | **Climb, then bisect.** Start at the easiest stage and jump 2, 4, 8, 16 stages per success (internally `step = step*2+1`); the first failure brackets the range and it bisects inside it. |

Use `'climb'` on any route longer than roughly 15 stages. Binary search opens on the middle stage,
which is ~50% likely to be failed by design — on AR's 41 stages that put the 8- and 9-times division
facts (AR-21) in front of a child who had never multiplied. With `climb` a beginner answers two easy
questions and starts at stage 1.

Note the interaction: 12 questions ÷ 2 items = at most **6 stages asked about** (stages with no
generator are traversed for free — §3). On a long route the bracket may still be open when the cap
hits; the pupil is then placed at the **bottom** of it.

**What placement does.** Every stage before the placed one is marked `passed` outright (no test, so
no stars), the placed stage becomes `current`, the rest `locked`. The result is written to the
route's state as `diag = {t, placed, results, n}` and logged as one `ev:'diag'` event; every probe
answer is also logged individually with `mode:'diag'`.

**Re-taking.** There is no pupil-facing retake. The teacher page has «Диагностиканы қайта ашу» per
pupil per route, which clears `diag` and re-arms the gate, plus a manual stage set for when a
teacher already knows where a child belongs.

> **PV is the exception, and it is a known defect rather than a pattern to copy.** `pv/` wraps a
> legacy app with its own placement: optional — the button appears only on a fresh account — one
> item per level, no «Білмеймін», +3 levels per correct answer, stopping after 2 consecutive wrong.
> A new route must not do this.

---

## §11 · Map icons

```js
const ICONS = {
 'FR-01':'<circle r="11" fill="none" stroke="currentColor" stroke-width="1.8"/>…',
};
```

One entry per stage — a missing icon leaves the station's position number instead. SVG markup with
**no `<svg>` wrapper**, drawn around (0,0) inside a 48×48 viewBox (−24…+24). Keep the artwork within
about ±12, as `fr/icons.js` does; it renders at 38px, 44px on the current station.

Use `currentColor` for everything. `core/map.css` sets the station's text colour by state: **white
on the current station and on a passed one** (the disc behind turns the route colour and green
respectively), grey on a locked one. `var(--panel)` draws a contrast line across a filled shape —
it is flat white (dark slate in dark mode), not a true knock-out, since it never matches the disc.

Make the icon say what the stage *is* — a quarter-circle for "shaded part", `<` for comparison, a
number line for a number line. It is how a pupil finds their place on the road.

---

## §12 · Figures

Two sources, in this order:

1. **`core/figs.js`** — shared, owned by the platform: `objects`, `objects_rows`, `array`, `bar`,
   `bars`, `unit_bar`, `diff_bar`, `bar_equal`, `bar_compare`, `dist`, `table`, `table3`,
   `short_note`, `meet`, `same`, `frac`, `pct`, `clock`. Used as `{type:'bar_equal', fp:'12;4;?'}`.
2. **`<route>/figs.js`** — `FIGS[type](fig) → HTML string`, for drawings only this route needs.
   A route type with the same name wins (`fr/figs.js` shadows core's `bar` this way).

Rules: SVG or plain HTML, no external images, no `<img>`, no canvas. Colours from the `ui.css`
variables (`var(--ink)`, `var(--fig)`, `var(--good)`…) so figures work in dark mode. Size in
relative units; a figure must survive a 360px phone.

**Draw things that can be counted.** Ten discs must look like ten discs, and a hundred-square must
be visibly 10×10. A picture that only *suggests* the quantity is decoration.

---

## §13 · The `Core` API a route may use

| call | what it does |
|---|---|
| `Core.start(route)` | login if needed, returns this route's state object (`Runner.start` calls it) |
| `Core.save(state)` | persist that object (the runner calls it; a route with custom screens must) |
| `Core.answer({stage,lvl,ok,hints,ms,…})` | record one final answer — **the runner's job, not yours** |
| `Core.event({ev:…})` | any other event worth logging |
| `Core.stateOf(route)` | read another route's state (prerequisites, the portal) |
| `Core.isCorrect(q,given)` | the grading rule |
| `Core.esc(s)` | escape `&` and `<` |
| `Core.map / mapBind / mapScroll / mapStars` | the road map |
| `Core.topbar(sub)` | the standard header |
| `Core.avatar()`, `Core.sound('ok'\|'no'\|'up')`, `Core.lang()` | the pupil's animal, the sounds, the language |

The four underscored members — `_sb`, `_session`, `_allState`, `_loadStateOnly` — are portal and
teacher-page internals; a route that calls one is doing something it should have asked about. The
rest of `Core` (`login`, `logout`, `setLang`, `setAvatar`, `toggleMute`, `config`, …) is platform
plumbing, wired up by `Core.topbar`; a route has no reason to call it directly.

---

## §14 · Hand-off

Before a route is handed over, the author runs a self-check script — not shipped, kept beside the
route; `ar/_selfcheck.js` is a working example. It loads every route `.js` file in `index.html`
order into a bare context and asserts:

1. Every id matches `XX-nn`, is unique, and is never reused.
2. Every stage has a generator, a teaching card, and a map icon.
3. Every generator, called **400 times at each of levels 1/2/3**, returns a valid question every
   time: `stem` and `ans` present, `kind` one of the three, and the answer among the choices.
4. **The answer passes `Core.isCorrect`** — copy that function **verbatim from the current
   `core/core.js`** so the check grades exactly as the platform will. (The copy inside
   `ar/_selfcheck.js` predates the multi-number patch and is now *laxer* than production — do not
   copy it from there.)
5. No two choices in one question compare equal under `Core.isCorrect`.
6. Every stage yields **≥ 6 distinct level-3 items** out of 10 draws, over 200 trials (§5, §9).
7. No `alert`/`confirm`/`prompt`, no `localStorage`/`sessionStorage`/`indexedDB`, no `fetch` — in
   any route file except `index.html`. (`document` *is* allowed, inside `mount()`.)
8. Every `var(--token)` used exists in `core/ui.css`.
9. `index.html` loads all four `core/` files, uses `class="app"`, carries the `notranslate` meta,
   and does not load `core-stub.js`.
10. Split files are listed in dependency order (§2).

Deliver: the route folder, `MAP.md`, and the self-check output showing 0 failures.

**The STAGES table is reviewed before any generator is written.** Send it to the owner first — it is
the one thing that cannot be changed later.

Preview a single generator without going through the diagnostic or the map — you still sign in as a
pupil first: `<route>/?preview=FR-05&lvl=2` **(illustrative id)**. `lvl` defaults to 2.

---

## Version history

**v1.2 · 2026-09-20** — the re-diagnostic (§10). A pupil who rushed the placement test could only
grind forward through stages they already owned; the home screen now offers a second run, which may
raise their placement and may never lower it. Implemented in `core/runner.js` (FR, AR, TE), mirrored
in `wp/diag_test.js` (WP keeps its own copy of the runner) and guarded in `pv/bridge.js`
(PV places with its own app's code). Every route's `index.html` had its `?v=` bumped — without that,
a returning pupil's browser serves the cached runner and the button never appears.

**v1.1 · 2026-09-14** — audited line by line against live code.

- §5 rewritten. v1.0 said *"Fixed (hand-written) items, if any, live in `bank.js` and are used only
  for diagnostics and stage tests."* No such mechanism exists: `startDiag()` and `startTest()` both
  call the generators. Added the ≥6-distinct-items rule, which fails silently and non-deterministically.
- §8 decimal separator changed from comma to **point** (owner decision, 2026-09-13), with a note
  that grading accepts both — and that only the first comma is converted.
- §3 example ids marked illustrative. v1.0's `FR-09` / `AR-06` were invented, and combined with
  "ids are never renumbered" they read as reserved.
- §7 gained the free-retry rule, the real level-down condition, the «Білмеймін» one-shot, the hint
  fallbacks, the step-4 auto-submit, and the two `kind:'custom'` traps.
- §9 corrected: a test can run short (6–10 items) and the pass mark and stars follow the ratio.
- §10 (the diagnostic) is new — v1.0 documented placement nowhere.
- §2 gained the load-order note for split files, the `?v=N` rule, and which globals are mandatory.
- §11, §12, §13, §14 corrected against the code (icon colours, figure type list, `Core` surface,
  the self-check's real contents and its 400-draw count).

**Known stale copies of corrected facts**, for whoever fixes them next: the "1, 2, 4, 8" climb
figure in the `core/runner.js` §diagnostic comment and in `ar/MAP.md`; the `674 × 4` placement
anecdote in `ar/MAP.md`, written when AR had 19 stages; "preview without logging in" in
`fr/MAP.md` and `ar/MAP.md`; the "green on a passed one" icon comment in `fr/icons.js`; and the
`§9` cross-references in `ar/_selfcheck.js` and `ar/stages.js`, which now point at §14.

**v1.0** — the original hand-off convention. Superseded.
