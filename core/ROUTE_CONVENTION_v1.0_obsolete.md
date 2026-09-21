> ⚠️ **已作废 · OBSOLETE.** 这是 2026-09 之前的 v1.0，保留只为查阅历史。
> 现行版本是仓库根目录的 [`ROUTE_CONVENTION.md`](../ROUTE_CONVENTION.md)（v1.2）。
> 本文件有三处与代码不符，当初坑过路线作者：§5 说 `bank.js` 里可以放固定题（**没有这个机制**，
> 诊断和关卡测都走 `GENERATORS`）；§8 小数用逗号（**已改为小数点**）；§3 的示例编号 `FR-09` / `AR-06`
> 是虚构的，却被当成已占用的真编号。**给助理或 AI 的永远是根目录那份。**
>
> ⚠️ **OBSOLETE.** Superseded by [`/ROUTE_CONVENTION.md`](../ROUTE_CONVENTION.md) (v1.2).
> Kept for history only. Three of its statements contradict the code — see the v1.2 version history.

---

# Есеп жолы · 路线开发约定 (Route Development Convention) · v1.0

> 这份文件给两类读者：做路线的人，和他用的 AI。让 AI 写或改路线代码时，**把这份文件和 `core-stub.js` 一起交给它**，并说"按 ROUTE_CONVENTION.md 做"。
> This document is for both the route author and their AI coding tool. Always give the AI this file together with `core-stub.js` and say "follow ROUTE_CONVENTION.md".

---

## 0. 平台是什么 · What the platform is

哈萨克语小学数学自适应学习平台（1–5 年级）。不按年级，按**知识线（route / strand）**组织：应用题 WP、分数 FR、位值 PV、以后还有乘除 AR、量与几何 GM……
每条路线是一个独立文件夹里的网页；学生账号、进度记录、老师报表由平台共用层 `core/` 统一负责。路线只负责**出题、判题、画图**。

Kazakh-language adaptive maths platform for grades 1–5, organised by knowledge routes, not grades. Each route is a web page in its own folder. Accounts, progress logging and the teacher dashboard are provided by the shared `core/` layer. A route only generates questions, checks answers and draws figures.

---

## 1. 五条铁律 · Five hard rules (AI must obey)

1. **不做登录，不存成绩。** No login screens, no name/PIN prompts, no localStorage/cookies/IndexedDB for progress or scores. All persistence goes through `Core.*` (see §4). During standalone development `core-stub.js` provides a local fallback automatically.
2. **关卡只在 `STAGES` 表里。** Every level/stage exists only as a row in the `STAGES` table (§3). No stage may be defined by scattered `if (level === 5)` logic.
3. **判题只有一个出口。** Exactly one function `finishAnswer(ok, info)` is called when an answer is final, for every question type (choice, input, drag, paint…). It calls `Core.answer(...)`. No other place records results.
4. **不弹窗。** No `alert`, `confirm`, `prompt`. Use in-page messages.
5. **只改被指定的文件；不动 `core/`。** Change only the file(s) the user names. Never rename, move, split or merge files on your own. Never edit anything under `core/`. New files must first be listed in `MAP.md`.

---

## 2. 文件布局 · File layout

```
esep-joly/
  core/                 ← shared, read-only for route authors
    core.js             accounts + logging (in production)
    core-stub.js        same API, local fallback (for development)
    ui.css              shared colours, buttons, cards (+ .frac / .expr for fractions)
    figs.js             shared drawings (bar models, fraction bars, tables…)
    runner.js           ALL screens + adaptive logic (home, diagnostic, practice, hint ladder, stage test)
  <route>/              ← one folder per route, e.g. fr/  pv/  wp/
    index.html          ≤ 40 lines: <link>/<script> tags, <div id="app">, one line: Runner.start({route:'FR', title:'…'})
    stages.js           the STAGES table (§3)
    generate.js         GENERATORS: one pure function per question type (§5)
    figs.js             FIGS: route-specific drawings only (prefer core/figs.js)
    bank.js             CARDS (teaching cards per stage) and fixed items, if any
    MAP.md              one page: which file does what, who owns it
```

- **A route writes NO screens and NO adaptive logic.** `core/runner.js` does home, diagnostic, practice, the 5-step hint ladder, twin items and the stage test for every route, from `STAGES` + `GENERATORS` (+ optional `CARDS`, `FIGS`). See `fr/` for a complete example (≈ 300 lines for 7 stages). `wp/` is the older template-based route and keeps its own screens for now.
- Author preview without a class: `<route>/?preview=FR-05&lvl=2` shows one generated item with the hint ladder.
- Each file ≤ ~300 lines and does one thing. If it grows, ask the owner before splitting.
- All CSS/JS lives in these files. No other external scripts except `https://cdnjs.cloudflare.com` and `https://cdn.jsdelivr.net/npm/` (pinned versions).
- Everything must work when `index.html` is opened by double-click (`file://`) with the folder structure intact.

---

## 3. 阶段表 · The STAGES table

`stages.js` exports one array. Every stage is a row:

```js
const STAGES = [
// id       name (Kazakh)                  type        params                 prereq          grade
 ['FR-01', 'Боялған бөлік',               'shade',    {d:[2,8]},             [],             '3'],
 ['FR-02', 'Салыстыру',                   'compare',  {d:[2,10]},            ['FR-01'],      '3'],
 ['FR-05', 'Қосу-азайту',                 'addsub',   {d:[2,10]},            ['FR-02'],      '4'],
 ['FR-09', 'Бөлшекті санға көбейту',      'mul_int',  {d:[2,9], k:[2,5]},    ['FR-07','AR-06'], '4'],
];
```

Rules:
- **id** = route code + two digits (`FR-09`). Route codes are assigned by the platform owner: WP, FR, PV, AR, GM, ME. **Ids are never renumbered or reused** — students' progress is keyed by them. New stages append at the end; order is given by `prereq`, not by number.
- **type** must be a key in `GENERATORS` (§5). Adding a stage that uses an existing type = adding a row, no code.
- **prereq** may reference other routes (`AR-06`). The portal uses it to lock/unlock stages.
- **grade** is informational only (teacher filter). Never used for routing students.

---

## 4. 平台接口 · The `Core` API (same in core.js and core-stub.js)

```js
// 1. at start — returns the student's saved state for THIS route (or {} if new)
const state = await Core.start('FR');          // route code
// state.stages['FR-03'] = {status:'current'|'passed'|'locked', level:1..3, ...anything you save}

// 2. after EVERY final answer — the only place results are recorded
Core.answer({
  stage: 'FR-03',      // required
  lvl: 2,              // CPA level 1..3 (§6), required
  ok: true,            // required
  mode: 'practice',    // 'practice' | 'diag' | 'test'
  hints: 0,            // deepest hint step used 0..5 (§7)
  ms: 8400,            // time on this question
  stem: '...',         // question text as shown (≤ 200 chars)
  ans: '3/4',          // correct answer as string
  given: '2/4',        // student's answer as string
  type: 'compare'      // generator type
});

// 3. whenever progress changes (level up, stage passed, test result)
Core.save(state);                              // whole route state object; small (< 10 KB)

// 4. optional events
Core.event({ev:'hint', stage:'FR-03', n:2});   // hint step opened
Core.event({ev:'test', stage:'FR-03', ok:8, n:10, pass:true});
Core.event({ev:'dontknow', stage:'FR-03'});

// 5. helpers
Core.student   // {id, name, klass} or null when not logged in (stub: a test student)
Core.online    // true/false
```

- Never call fetch/Supabase directly. Never read/write the student table yourself.
- If `Core` is missing (file not loaded) the page must still run: guard with `if (window.Core)`. The stub is always safe to load.

---

## 5. 题型生成器 · Question generators

`generate.js` exports `GENERATORS`, an object `type → function(params, lvl) → question`:

```js
const GENERATORS = {
  compare(params, lvl) {
    // ... build one random question ...
    return {
      stem: 'Қай бөлшек үлкен?',       // Kazakh text
      kind: 'choice',                   // 'choice' | 'input' | 'drag' | 'paint' | 'multi'
      choices: ['3/8','5/8'],           // for kind:'choice'
      ans: '5/8',                       // canonical answer string
      fig:  {type:'fracbar', d:8, n:5}, // optional; drawn by figs.js (route or core)
      h1: 'Бөлімдері бірдей — алымын салыстыр.',   // hint step 3 text (§7)
      h2: '5 > 3',                                  // hint step 4 expression
      expl: '5/8 > 3/8, себебі 5 > 3.',            // full solution (step 5)
      steps: [{label:'', expr:'5 ? 3', val:'>'}]    // optional guided steps for multi-step items
    };
  },
  // ...
};
```

- Generators are **pure**: no DOM, no globals, no Core. UI calls them.
- Fixed (hand-written) items, if any, live in `bank.js` and are used only for diagnostics and stage tests. Practice draws from generators.
- Answers are compared with `Core.isCorrect(q, given)` (numbers tolerant of `,`/`.`; fractions reduced) — do not write your own comparer unless the type is exotic.

---

## 6. 三个表征层级 · The three CPA levels (every stage has all three)

| lvl | name | what the student sees |
|---|---|---|
| 1 | Concrete · Нақты | objects / emoji / shaded shapes; small numbers |
| 2 | Pictorial · Сұлба | bar model, number line, table, short note; larger numbers |
| 3 | Abstract · Мәтін | text/numbers only; textbook wording |

Generators receive `lvl` and must vary at least the figure and number range accordingly.

---

## 7. 统一的自适应规则 · Adaptive rules (identical in all routes)

- **Diagnostic** (per route, on first entry): binary search over stages using lvl-3 items, 2 items per stage, 2/2 → up, else down, max 12 items. Places the student at the first stage not passed.
- **Practice**: 3 correct in a row → level +1; 2 wrong in a row → level −1 and re-show the teaching card; at lvl 3, 3 in a row unlocks the stage test.
- **Hint ladder** (practice only), button "Кеңес n/5" + "Білмеймін":
  1 highlight numbers & keywords · 2 show the picture / bar model · 3 plan sentence (`h1`) · 4 step-by-step expressions the student fills (`steps` or `h2`) · 5 full solution (`expl`) → then a **twin item** (same type, new numbers) is mandatory.
  Hints ≥ 3 → the answer does not count toward the streak. Step 5 → streak reset.
- **First wrong answer** in practice: allow one retry ("Қате. Тағы ойлан немесе Кеңес бас"). Second wrong → reveal.
- **Stage test**: 10 lvl-3 items, pass ≥ 8. Pass → next stage `current`. No hints in diag/test.
- These rules are implemented once in `core/runner.js`. Routes never re-implement them; do not invent different thresholds.
- Question object consumed by the runner: `{stem, kind:'choice'|'input'|'custom', choices, choiceHTML?, ans, ansHTML?, exprHTML?, fig?, hfig?, h1, h2?, steps?, expl, mount?(el, submit)}` — `fig`/`hfig` are `{type,…}` drawn by the route's `FIGS[type]` or by `core/figs.js` (`{type, fp}`); `kind:'custom'` renders its own input via `mount` and calls `submit(value)`.

---

## 8. 语言与文案 · Language

- All student-facing text in **Kazakh**. Use textbook wording (Ақпаева / Оспанов / Әбілқасымова). Buttons: Тексеру · Кеңес · Білмеймін · Келесі есеп · Басты бет.
- Numbers after numerals are singular (`5 алма`). Use the shared word lists in `core/words.js` for names/items/case endings when they exist; do not hard-code new case endings — ask.
- Decimal comma (`0,5`), fractions as `3/4`, mixed numbers `1 1/2`.

---

## 9. 交付检查表 · Hand-off checklist (before sending a route to the platform owner)

- [ ] `STAGES` table complete; ids follow the code; prereqs valid.
- [ ] Every question type is in `GENERATORS`; each returns `stem, kind, ans` and works for lvl 1/2/3.
- [ ] One `finishAnswer` → `Core.answer`; `Core.save` on progress change; no other storage.
- [ ] No `alert/confirm/prompt`; no login screen.
- [ ] Opens by double-click with `core-stub.js`; `check.html` shows events arriving.
- [ ] `MAP.md` filled in (file → purpose → owner).
- [ ] Sent the STAGES table to the owner **before** building (5-minute review avoids renumbering later).

---

## 10. 给 AI 的最短提示 · Shortest prompt to give your AI

> 你在修改 Есеп жолы 平台的一条路线。严格遵守附带的 ROUTE_CONVENTION.md（尤其第 1 节五条铁律和第 4 节 Core 接口）。只改我指明的文件。现在的任务是：……
>
> You are editing one route of the Есеп жолы platform. Strictly follow the attached ROUTE_CONVENTION.md (especially §1 hard rules and §4 Core API). Change only the file(s) I name. The task: …
