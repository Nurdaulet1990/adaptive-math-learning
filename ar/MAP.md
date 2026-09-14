# ar/ — Көбейту мен бөлу (multiplication & division) · route map

Route code **AR**. Owner: assistant (AR route author). Runs on `../core/runner.js` — the route has **no** screens, login, storage or adaptive logic of its own.

| file | what it does | edit when you want to… |
|---|---|---|
| `index.html` | shell; `Runner.start({route:'AR', title, color, placement:'climb'})` | never |
| `stages.js` | `STAGES` — 41 stages → generator type + params + prereq | add a stage (new row; type must exist in one of the generator files), change number ranges |
| `generate.js` | `GENERATORS` part 1 — the **fact layer**, AR-01…23: groups, rep_add, array, table, speed, share, divfact, distrib, remainder. Also publishes the shared helpers as `AR_UTIL`. | change wording, hints (`h1`, `steps`, `expl`), distractors, CPA levels for the fact stages |
| `generate2.js` | `GENERATORS` part 2 — the **algorithm layer**, AR-24…41: mul_col, div_long, estimate, mul_col2, div_long2, dec_pv, div_dec, div_round, div_by_dec | same, for the algorithm stages |
| `figs.js` | `FIGS` part 1 — the fact-layer models: groups, array, numline, area, grid. Also publishes the drawing primitives as `AR_DRAW`. | change how one of those drawings looks |
| `figs2.js` | `FIGS` part 2 — the algorithm-layer models: colmul, discs, longdiv, helper, decblocks, shift, rembar | change how one of those drawings looks |
| `icons.js` | `ICONS` — the picture inside each map station | change a station icon |
| `bank.js` | `CARDS` — teaching cards per stage | change/add the explanation shown before practice |

**Load order is load-bearing.** `generate2.js` and `figs2.js` read `AR_UTIL` / `AR_DRAW` from part 1 and each merges into the shared `GENERATORS` / `FIGS` object with `Object.assign`. Both throw a clear error if loaded first, and `_selfcheck.js` asserts the order in `index.html`.

Preview one generator without going through the diagnostic or the map — you still sign in as a pupil first: `ar/?preview=AR-07&lvl=1` (a drill) or `ar/?preview=AR-28&lvl=2`. `lvl` defaults to 2.

---

## Verified

- 49 200 generated questions (41 stages × 3 levels × 400) pass: stem/kind/ans present, one and only one choice grades correct, `ans` grades itself correct **under a verbatim copy of `Core.isCorrect`**, guided-step values gradeable, every `fig`/`hfig` renders without NaN, arithmetic correct wherever the stem is machine-checkable.
- Stage test viability: `startTest()` draws 10 items deduped by `stem+ans` and refuses a stage under 6 distinct. Every stage yields 8/10 or better across 200 trials (the runner's floor is 6).
- Run against the **real** `core/` (only the Supabase-backed `Core.login/start/save/answer` stubbed): home map, preview mode, the 5-step hint ladder, guided steps, the custom widgets and the one-retry rule all work. No page errors.

## Status for the platform owner

### 1–3 · The three `core/` changes — ✅ all landed, closed

`ROUTE_CONVENTION.md` v1.1 (2026-09-14) and the shipped `core/` confirm all three went in:
`isCorrect` now requires every number in the expected answer to match in order (§4 is written to
the new behaviour); `CFG.ROUTES` carries `['AR','Көбейту мен бөлу','ar/','live','2–5']`; and
`ui.css` has `--ar` / `--ar-d` in both themes, so `index.html` no longer needs the fallback
spelling. `placement:'climb'` landed too and is documented in §10. `owner-patch/` has been emptied
of these and now holds only the one change still outstanding, below.

The scalar-answer discipline stays regardless: §4's `kind:'custom'` trap 2 still applies — the
feedback line prints a single value (`Дұрыс жауабы: X`), so a compound answer would display wrong
even though it now grades right.

> Colour note, kept because it is easy to repeat: purple, not green. The first attempt used a
> teal-green and **the current station became almost indistinguishable from the passed ones** on
> the map, since `--good` is green too. FR never hit this because its route colour is magenta.

### 3b · ⚠️ NEW · the diagnostic places a strong pupil up to 14 stages too low

`nextDiag()` asks **2 items per stage** and stops at **12 questions**, so one diagnostic can ask
about at most **6 stages** (v1.1 §10 states this). That is fine on a short route. On AR's 41 the
climb phase spends the whole budget before the bracket closes, and `finishDiag()` places at the
**bottom** of what is still open:

```
true level AR-28  →  placed AR-16   12 stages low
true level AR-30  →  placed AR-16   14 stages low   ← worst
true level AR-41  →  placed AR-32    9 stages low
```

Twelve stages is roughly a year of content the child must re-do before meeting anything new —
which is the exact failure the diagnostic exists to prevent.

The fix is one line: **ask 1 item per stage while climbing, 2 once bracketed.** The climb only needs
a coarse "clearly above them?" signal and is self-correcting — a stray wrong answer just brackets
earlier, and the bisect phase still asks two. Worst error falls from 14 stages to 1, and a beginner
is placed in 4 questions instead of 6. It is gated on `DG.climb`, so WP/FR/PV are provably
untouched: the evidence script replays `nextDiag` for 84 route-length × true-level combinations
without `placement:'climb'` and gets identical probes, question counts and placements.

Patch, patched file and the replay script: `owner-patch/`.

### 4 · Decimal place value — resolved: AR owns it
The owner ruled on 2026-09-13 that AR owns decimal place value rather than PV, so **AR-38 `Ондық бөлшек`** (generator `dec_pv`) sits before the decimal-division stages. No `PV-??` placeholder remains.

### 5 · Convention corrections — ✅ all in v1.1, closed

Both are in the published v1.1: §8 is now the decimal **point**, and §5 states outright that no
fixed-item mechanism exists (`startDiag`/`startTest` both call the generators) plus the ≥6-distinct-
items rule that fails silently. §3's example ids are marked illustrative, so the `AR-06` scare is
documented as a doc bug rather than a numbering constraint.

v1.1 also renumbered hand-off from §9 to **§14**; the references in `_selfcheck.js` and `stages.js`
have been repointed.

### 6 · File split — done (approved 2026-09-13)

`generate.js` (648) and `figs.js` (381) both exceeded §2's ~300-line guideline. With the owner's approval they are now four files, all listed in the table above:

| | before | after |
|---|---|---|
| generators | one file, 648 | `generate.js` + `generate2.js` |
| drawings | one file, 381 | `figs.js` + `figs2.js` |

The seam is the one that already existed in the route's design — **facts (AR-01…23) vs algorithms (AR-24…41)** — not an arbitrary line count. Shared code is published from part 1 (`AR_UTIL`, `AR_DRAW`) rather than duplicated.

### 7 · Kazakh terminology — checked against published KZ lesson material, four terms changed

| was | now | why |
|---|---|---|
| `Бұрыштап бөлу` | **`Баған түрінде бөлу`** | «бұрыштап бөлу» is the **grade-10 polynomial** term (көпмүшені көпмүшеге бұрыштап бөлу). Primary lesson plans say `баған түрінде` / `жазбаша бөлу`. |
| `Бөлшектеп көбейту` | **`Үлестірімділік`** | the textbook property name is `көбейтудің үлестірімділік қасиеті`. |
| `Жиым` | **`Қатар мен баған`** / `кесте` | `жиым` is the **computing** word for array; no evidence it is primary-maths usage. Descriptive wording is safe either way. |
| `Бөліндіні болжау` | **`Бөліндінің цифрын таңдау`** | matches `подбор цифры частного`; `болжау` (to forecast) is weaker. |

Confirmed correct and left alone: `бөлінгіш` (dividend) · `бөлгіш` (divisor) · `бөлінді` (quotient) · `қалдық` · `көбейткіш` · `көбейтінді` · `бағаналап көбейту` · `ауыстырымдылық` · `бірдей қосылғыштардың қосындысы`.

**Bigger than wording — the long-division script was re-framed.** KZ textbooks do not teach the Anglo divide → multiply → subtract → bring-down chant. They work by place value around the **толымсыз бөлінгіш** (partial dividend): *«Жүздіктерді бөлемін… ондықтарды бөлемін… бірліктерді бөлемін»*. The long-division stages' hints, guided steps and cards now use that framing, so what the app says matches what the teacher says. The four-step cycle still happens — it just isn't the name of the thing.

**Human-reviewed against the textbooks and approved on 2026-09-13** — including the two I could not settle from published lesson plans alone: `Қатар мен баған` as a station name, and `қ.` as the remainder abbreviation. The route's Kazakh is final; no terminology item remains open.

---

## Design notes

**The tables are graded one table per stage, cumulatively.** The first version had two stations — "Кесте 2, 5, 10" and "Кесте 3, 4, 6–9" — carrying 100 facts between them: a pupil either passed the whole 6–9 table or nothing. Fact-fluency programmes grade the opposite way (Rocket Math: 26 levels, **two new facts plus their reverses each**, and every level's test covers only what has been learned so far). AR now runs one stage per table in the Kazakh textbook order — **2 → 5 → 10 → 3 → 4 → 6 → 7 → 8 → 9** — each with a `review` list, so a slice of every question pool is drawn from tables already passed. Cumulative review is part of the grading, not a separate spaced-repetition system bolted on. `Үлестірімділік` sits at AR-10, *before* the hard tables, because breaking 7 × 8 into 5 × 8 + 2 × 8 is the tool for learning them.

**⚡ stages are drills — practice with correction, then the test.** There are four: AR-07 (2·5·10), AR-11 (mixed 2·3·4·5·10), AR-17 (all × tables) and AR-22 (÷).  Rocket Math keeps the two apart: oral practice with a partner who corrects every hesitation, and only then a 1-minute written test with no help at all. The CPA levels carry that split.

| lvl | what it is | correction | timing |
|---|---|---|---|
| 1 | Жаттығу — 10-fact round | on a wrong answer | none |
| 2 | Жаттығу | on a wrong answer **or a pause over 4 s** | per fact |
| 3 | Сынақ — what the stage test runs 10 of | none | copy phase then compute phase |

**The correction is the partner's procedure, verified in the browser.** A wrong answer puts the WHOLE fact on screen (`7 × 4 = 28`), the pupil types the answer three times (the counter shows 0/3 → 3/3), and the round then **backs up three problems** — measured: the counter went from "Мысал 5 / 10" to "Мысал 2 / 10". At lvl 2, leaving a question untouched for five seconds fired the same correction, so a hesitation is graded as an error exactly as the programme intends.

**The test measures automaticity against the pupil's own speed.** "Three correct in a row" cannot tell a child who knows 7 × 8 from one who adds 7 eight times — both are correct, and the platform records `ms` but never uses it. §5 forbids a generator from touching `Core`, so the bar cannot be stored; each test measures it on the spot — a short COPY phase (answers already on screen, so it times pure input) sets the bar, then COMPUTE must reach a share of it. Measured against four simulated pupils: fluent (300 ms/fact) 24 against a target of 12 → pass; finger-counting (900 ms/fact) 9 against 12 → fail; random answers → fail; and sitting out the COPY phase is caught by a floor of 4, or a pupil could set a target of 1 and pass by answering once.

**Division is graded the same way, as its own block after × is automatic.** One station used to carry all 100 division facts. It is now the inverse-relation stage (AR-18) plus three divisor groups mirroring the × groups (AR-19 3·4, AR-20 6·7, AR-21 8·9) and a ÷ drill (AR-22), each with its own `review` list. The block sits after AR-17, where multiplication has been shown to be automatic — Rocket Math's reasoning is that a pupil should not be learning two operations at once, and every division fact here is retrieved from a multiplication fact that is already fluent. The drill component is the same one; `params.op:'div'` turns the fact around.

**The column multiplication is now drawn — and graded.** Both column stages were named after a layout the route never showed: they rendered an area model and the grid method, and the famous trailing zero of the second row was discussed in words without the column ever appearing. `FIGS.colmul` draws it — digits right-aligned, carries as small figures above the top line, and for a multi-digit multiplier one row per partial product with the trailing place-holder zeros boxed.

**Column multiplication is split by what actually makes a column hard, not by digit count.** `234 × 2` is easier than `78 × 9`: what costs a child is *carrying* and *interior zeros*, and a station that mixes `12 × 3` with `749 × 8` fails a pupil for a skill it never taught. The single-digit-multiplier block is now six stations, one new difficulty each — AR-24 layout only (1 × 1 taңба, the fact is already automatic, so only the writing is new), AR-25 2 × 1 with no carry, AR-26 2 × 1 with exactly one carry, AR-27 3 × 1 with no carry, AR-28 3 × 1 with several carries, AR-29 a zero inside the multiplicand. The multi-digit block mirrors it: AR-32 2 × 2 carry-free (so the only new idea is the shifted second row), AR-33 2 × 2 with carries, AR-34 3 × 2, AR-35 a zero in the multiplier. The classes are enforced in the generator, not just in the name: `carriesOf(a, b)` counts the column carries and `hasInnerZero` tests for a zero that is neither leading nor trailing, and `pickPair` rejects a candidate that belongs to a neighbouring class — so an interior zero never leaks into a "no zero" stage and a trailing zero never stands in for an interior one.

**A carry is one the pupil has to write.** `carriesOf` deliberately does not count the overflow out of the leftmost digit: `71 × 7 = 497` has nothing above the line, so counting it would have filed a carry-free item under «бір ауысу». Likewise «ауысумен» stations *guarantee* at least one carry rather than merely allowing one — a station named after a skill must practise it every time.

**The area model no longer collapses on a lopsided split.** Bands were sized strictly in proportion, so `60 + 2` gave the units band ten pixels and its label fell outside the rectangle. Each band now keeps a readable minimum and the remaining space is still shared in proportion — the picture stays ordered and stops being exactly to scale only when it otherwise could not be read at all.

**The zero row is named by its place, not by its number.** With a 0 in the multiplier the textbook column writes no row for it, so the next row jumps two places. AR-35's lvl 1–2 item asks what the row multiplying by hundreds equals, and its distractors are the two real errors: forgetting the zeros entirely, and shifting the row by one place instead of two. Asking for "the 3rd row" would have pointed at a row the drawing deliberately does not have.

**Two defects found while splitting the column stages.** `div_long2` — the generator for both multi-digit-divisor stations — was referenced by `stages.js` but had never been written; the route would have thrown on reaching AR-36. It is written now, framed on the толымсыз бөлінгіш like `div_long`, carrying the helper table in from AR-31 as the scaffold and withdrawing it by lvl 3, and holding a zero *inside* the quotient back until lvl 3 because writing that digit is its own trap. Separately, `G.speed` picked a focus group from a fixed list and then filtered it against the stage's tables, so AR-07 could head a round "× 6, 7" while drilling 2, 5 and 10. Focus groups are now built from the stage's own tables, and a second axis (small multipliers 2–5 vs large 6–10, the way fact-fluency programmes split a table) both fixes the label and widens the drill stages past the runner's 6-distinct floor.

**«Copy what? Everything I write is wrong.»** Reported from play-testing the lvl-3 timed test, and
reproducible on screen: the COPY phase is the one place in the route where the answer is ALREADY
displayed, and nothing said so. The header read «Көшір: 8 с · 0», the stem read `7 × 3 = 21`, and
that was the entire instruction. Worse, a wrong copy scored **silently** — the ✗ branch only ran in
phase 2, so the counter sat at 0 whatever you typed, and the phase then ended telling you to «do the
copy test for real», which reads as an accusation. And the 8-second clock was already running while
the pupil worked out what was being asked, so the phase measured confusion, not hand speed.

Four changes: a standing instruction line inside the widget («Жауабы жазулы тұр — асты сызылған
санды сол күйінде жаз»); the number to copy picked out in the accent colour and underlined; feedback
on every answer in both phases, with the copy miss naming the number that was wanted; and **the clock
starts on the first answer, not when the phase opens** — measured: staring at the screen for six
seconds before starting now yields the same 8 copies as starting instantly. An idle timeout still
ends a phase nobody answers, so the widget cannot hang.

The lvl 1–2 drill got the same standing instruction, naming the round length, the «Қою» button and
the per-item limit, and the correction screen now says what the repetition is for.

**The drill is now verified inside the real runner, not just in isolation.** The first round of
fixes was proved against the mounted widget alone; the case the pupil actually meets goes through
`renderQuestion`, the teaching card, `_Q.done` and the one-retry rule as well. Driven end to end at
phone width against the real `core/runner.js`: answering every fact correctly 4.3 s after it appears
— the sequence that used to loop for ever — now gives 0 correction screens, «Раунд бітті · түзету:
0», «Өттің ✓», a usable restart button and no page errors.

That pass also caught what the widget fixes could not: **the teaching card never mentioned the
clock at level 2.** AR-07 said only «Үшінші деңгейде уақыт өлшенеді», so the first time a correct
answer was refused for being slow, it looked like a bug rather than the rule. AR-07 now has a second
card naming the 6 s limit, the visible countdown and the «Қою» button; AR-11 said 4 s and now says
6; AR-17 and AR-22 said the compute phase had to reach *half* the copy rate when the bar is 60%, and
now give the real phase lengths (8 s / 12 s) and the real target.

**Audited against ROUTE_CONVENTION v1.1 (2026-09-14).** Everything v1.1 names as a stale copy in
this file is fixed: the climb figure is 2,4,8,16 (`step = step*2+1`), the placement anecdote no
longer quotes a 19-stage route, and preview does require signing in as a pupil first. The `§9`
cross-references in `_selfcheck.js` and `stages.js` now point at **§14**, and the `isCorrect` copy
inside `_selfcheck.js` has been re-taken verbatim from the current `core/core.js` — v1.1 §14.4 is
right that it had gone stale, and stale in the dangerous direction: it still had the old parseFloat
fallback, so the check was **laxer** than production. Re-run with the real comparer: still 0
failures, 49 200 questions.

Two other clauses bit. §3's ~24-character map-bubble limit: four stage names were over it (AR-03 at
32), now shortened — names are not ids, so this is safe on a live route. And §2's `?v=N`
cache-busting was already in place, but `index.html` still carried `var(--ar,#6B4FA3)` with a
comment saying the token did not exist yet; it does, in both themes, so the fallback spelling is
gone.

Checked and clean: no generator throws (the two `throw`s are the part-2 load-order guards §2 asks
for), every icon is `currentColor` only, no route file touches `Core.*`. One deliberate shadow:
`FIGS.array` overrides core's `array` type — `figHTML()` checks route figs first, and §12 says the
route type wins. Core's takes a `fp` string; AR's takes `{r, c}`.

**The drill was failing children who were right.** Reported from play-testing: "it keeps saying I'm wrong." Driving the widget headlessly reproduced it exactly — at lvl 2 a pupil answering EVERY fact correctly, 4.3 s after it appeared, was sent to the correction screen seven times and the round never ended. Four defects, all fixed:

- The hesitation limit was **4 s measured from when the problem appears**, so it had to cover reading, recall, typing and submitting. Rocket Math's ~2 s standard is *spoken* to a partner; typing is a slower channel. Raised to 6 s, and the remaining time is now drawn as a draining bar — a clock the child cannot see feels arbitrary.
- A timeout and a wrong answer produced the **identical screen**, so a correct-but-slow answer looked like the app calling it wrong. They now say different things, and the wrong-answer case shows what the child actually typed next to the right answer.
- **The round could not end.** Each correction backs up three problems, which outruns the ten ahead of it, so a consistently borderline child looped for ever; a mistyped repetition also reset silently with no way out and no message. There is now a presentation budget, the repetition says what is wrong with it, and the round stops as soon as the corrections pass ALLOW — which used to grind on to ALLOW + 3, about three minutes of losing before the app said so.
- **Enter was the only way to answer.** On a tablet that key is not discoverable, and a drill you cannot submit to reads as one that marks you wrong. Every phase now has a «Қою» button beside the input.

At lvl 3 the timed test had two more: the restart button was never restored after the test, so the runner's one retry showed a dead widget; and `FLOOR` was used both as the sit-out gate *and* as the target, so a slow typist (base 4–6) had to compute as fast as they copied — 100%, not the 60% the screen promised. The gate and the target are now separate, the phases are 8 s / 12 s rather than 6 s / 9 s, one more slip is tolerated, and each answer flashes ✓ or ✗ so the child can see the submit registered.

**What is still a classroom-only mechanic.** Rocket Math's practice is *oral* — the partner hears the hesitation and the learner says the fact aloud. Typing is a weaker channel than speaking, and there is no second child. The procedure transferred; the modality did not.

**Placement climbs from the easiest stage, it does not binary-search.** `core/runner.js` normally probes the middle of the stage list — a search that is ~50% likely to be failed at question one *by design*. On a route spanning grades 2–5 that opened on a mid-route stage for a child who had never multiplied, with no picture and no hint button (the diagnostic runs `noHints`); on today's 41 stages the middle is AR-21, the 8- and 9-times division facts. `index.html` passes `placement:'climb'`, which opens on AR-01 and then jumps **2, 4, 8, 16** stages per success (`step = step*2+1` internally) before the first failure brackets the range and it bisects inside it. A beginner answers **2 easy questions** and starts at AR-01.

Mind the cap on a route this long (ROUTE_CONVENTION §10): the diagnostic stops at **12 questions**, 2 per stage, so at most **6 stages** are ever asked about. Climbing from AR-01 those 6 probes land on AR-01, 03, 07, 15, 31 and one more — a child who really knows everything through AR-35 runs out of questions with the bracket still open and is placed at the **bottom** of it. That is the intended bias (too low beats too high), but it means a strong pupil will practise below their level for a while; the teacher page's manual stage set is the remedy.

**Kazakh case endings are stored, not generated.** `THING` carries each noun's accusative and each container's locative and dative as written-out forms (`қарындаш → қарындашты`, `қорап → қорапқа / қорапта`). The first version appended fixed suffixes and produced `қарындашды`, `пеналке`, `қорапте`. §8 says not to hard-code endings and to use `core/words.js` — that file does not exist yet, so the forms live in the table where a human can check them; move them to `core/words.js` if it is ever added.

**Long division uses the уголком layout** (dividend left, bar, divisor top-right, quotient *under* the divisor) as in Kazakh/Russian textbooks — not the Anglo form with the quotient on top. One function (`FIGS.longdiv`) if you want it changed.

**AR-31 `estimate` is the point of the whole route.** Trial-quotient is the one place where knowing the algorithm still isn't enough, and on paper a pupil can only guess blindly. The widget answers each guess with `Үлкен ↓` / `Кіші ↑` and submits every press, so the platform's own one-retry rule becomes a taught *adjust the estimate* step. `mount()` deliberately keeps **no** local "already answered" latch — `core/runner.js` owns that, and a latch here would leave a dead UI on the retry.

**AR-03's array builder grades the dot count, not the shape.** 4 × 6 and 6 × 4 both give 24; grading the shape would need a compound answer, which issue 1 makes unsafe. The on-screen label still shows `r × c` as the pupil builds.

**`FIGS.rembar` overlaps `core/figs.js`'s `bar_equal`** but adds the dashed remainder block, which the core version has no way to show. Happy to drop it if you would rather extend the core figure.
