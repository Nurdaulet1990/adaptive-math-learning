# owner-patch · register route TE (Теңдеулер)

Two changes in `core/`, which a route may not edit (§0, §1.5). Everything else the route needs
is inside `te/` and already works. Written the way the AR author's patch was — a file for the
owner, not an edit.

The route runs today without either change: `te/index.html` asks for `var(--te, var(--accent))`,
so it falls back to the platform accent until the token exists. What is missing without the
patch is the **portal entry** — `CFG.ROUTES` has no `TE` row, so no one can reach the route from
«Есеп жолы» at all.

---

## 1 · `core/core.js` — one row in `CFG.ROUTES`

Add after the `AR` row:

```js
['AR','Көбейту мен бөлу','ar/','live','2–5'],
['TE','Теңдеулер','te/','live','1–4'],          // ← add this line
```

`'1–4'` matches the stage table: TE-01…04 are G1, TE-05…08 G2, TE-09…12 G3, TE-13…20 G4.
`'live'` is correct: the Kazakh stage names and card text passed a native reading pass on
2026-09-20, so nothing is waiting behind a `'draft'` status.

---

## 2 · `core/ui.css` — a route colour and its pressed shade

`--te` and `--te-d` in both blocks, beside the other four.

**The hue is a real choice, not a detail, so here are both candidates rather than one guess.**
Taken already: WP teal-blue 195°, PV blue 220°, AR purple 265°, FR rose 338°, `--good` green
145°, `--bad`/`--tulip` red 5–8°, `--gold` amber 40°. The comment next to `--ar` records why
green was ruled out — *"--good is green and the map would blur passed/current"* — and that
objection rules out the whole 130–175° band for a new route too.

### Candidate A — ochre / clay (recommended)

```css
/* light, line 16-17 */
--te:#A5642A; --te-d:#7E4C1F;
/* dark, line 35-36 */
--te:#D9954E; --te-d:#A9713A;
```

Clearly not green and clearly not red. **Trade-off: in dark mode `#D9954E` sits fairly near
`--gold:#E6B347`**, which draws the stars. They differ in hue (32° vs 43°) and saturation, and
they never appear on the same element, but if that reads as too close, use B.

### Candidate B — deep teal

```css
/* light */  --te:#0F6E6A; --te-d:#0A514E;
/* dark  */  --te:#4FB8B2; --te-d:#3A8A85;
```

Further from `--gold`, but 175° is next door to `--good` at 145° — exactly the blur the `--ar`
comment warns about, just milder. **A is the safer of the two.**

---

## Checking it

1. `core/check.html` for the tokens.
2. Open `te/` — the map should draw in the new colour, and the station discs should be
   distinguishable from the green passed ones and from the gold stars at a glance, in both
   themes and on a phone.
3. `node te/_selfcheck.js` → `0 failures` (does not cover these two files; it only asserts that
   every `var(--token)` the route uses exists in `core/ui.css`, which is why it passes today —
   the fallback in `index.html` is not scanned).

## Nothing else is waiting

The self-check is green, the Kazakh text has been read by a native speaker, and the route folder
is complete. These two lines in `core/` are the only thing between the route and the portal.
