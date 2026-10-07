/* pv/fluency.js — the fluency ladder for +/− within 10 and 20 (owner's design, claude/pv-fluency-proposal.md, 2026-10-01).
   Loaded by pv/index.html after its own script (and after pv/facts.js, which holds the fact tables) and before
   bridge.js; it adds levels f1…fsr (table in index.html) and runs them. Why: a level passed by a run of eight with the blocks there to count could not tell a child who counts
   from one who knows the facts. Rocket Math's answer, carried over: small groups of facts, each learned with a
   strategy and then proven in a ONE-MINUTE ROUND, timed per fact, with the earlier groups mixed in (cumulative
   review); a missed fact is corrected with the picture — four picture questions per miss — before another try.

   One level, three phases (state.flu.phase):
     learn — strategy card + the picture (ten-frame / cubes / rods), a run of FLU.learnRun right (the legacy run
             counter, so showFeedback / «Келесі» / the header all work unchanged);
     round — FLU.round facts without the picture, FLU.newInRound from this level + the rest from passed levels,
             each with a shrinking bar (no seconds shown); a timeout is a miss («Тағы жылдамырақ!»); the full fact
             is shown after every miss; pass = FLU.pass right;
     fix   — FLU.fixPer picture questions for every fact missed in the round: the missed fact once, then other
             facts of the same level (different questions, never the same one over and over — owner); at most
             FLU.fixMax, mixed. The level is never replayed whole.
   Then the legacy showLevelComplete (which bridge.js wraps to record the stage test) shows the result; its
   «Қайталау» leads straight back into the round.

   FLU.gate=false is the first week: the round is run, logged and corrected, but the level passes regardless, so the
   seconds can be read off the teacher page before the line is drawn. Flip it to true to make the round the pass. */
'use strict';
(function(){
const FLU = {
  ms: null,   // per fact, from pv/facts.js (PVFACTS.MS): within10 5000, within20 6000, place 8000
  round: 10, newInRound: 6, pass: 9, learnRun: 6, fixPer: 4, fixMax: 12,
  gate: false,
  order: ['f1','f2','f3','f4','fs1','fs2','fs3','f20n','fd','f9','f87','fs20n','fsd','fs98','fsr'],
  facts: {}, cards: {}, pic: {}, limit: {},
};
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const key = PVFACTS.key, ans = PVFACTS.ans;
/* the fact tables live in pv/facts.js (window.PVFACTS), shared with the daily review */
FLU.facts = PVFACTS.facts; FLU.pick = PVFACTS.pick; FLU.distinct = PVFACTS.distinct; FLU.ms = PVFACTS.MS;

/* ── per level: picture, time limit, strategy card ── */
const W10 = ['f1','f2','f3','f4','fs1','fs2','fs3'], W20 = ['fd','f9','f87','fsd','fs98','fsr'], PL = ['f20n','fs20n'];
W10.forEach(lv => { FLU.limit[lv] = () => PVFACTS.limitMs(lv); FLU.pic[lv] = f => renderDualCubes(f.a, f.b, f.op); });
W20.forEach(lv => { FLU.limit[lv] = () => PVFACTS.limitMs(lv); FLU.pic[lv] = f => renderTenFrame(f.a, f.b, f.op); });
PL.forEach(lv => { FLU.limit[lv] = () => PVFACTS.limitMs(lv); FLU.pic[lv] = f => renderDualWithTens(f.a, f.b, f.op); });
/* the picture for ANY fact (a correction may ask a fact of an earlier level, or an addition partner) */
FLU.picture = f => { const sum = f.op === '+' ? f.a + f.b : f.a; if (f.a >= 10 && f.op === '+' || f.b >= 10) return renderDualWithTens(f.a, f.b, f.op);
  if (sum <= 10) return renderDualCubes(f.a, f.b, f.op); if (f.op === '−' && f.a - f.b >= 10) return renderDualWithTens(f.a, f.b, f.op); return renderTenFrame(f.a, f.b, f.op); };
FLU.cards = {
  f1:  '«Бір артық»: 6 + 1 — алтыдан кейінгі сан, 7.',
  f2:  '«Екі артық»: 6 + 2 — алты, жеті, сегіз.',
  f3:  'Қос сандар: 4 + 4 = 8. Онға толықтыру: 3 + 7 = 10, 4 + 6 = 10.',
  f4:  'Қос санға жақын: 3 + 4 = 3 + 3 + 1 = 7.',
  fs1: '«Бір кем», «екі кем»: 7 − 1 — жетінің алдындағы сан, 6.',
  fs2: 'Қосуды ойла: 8 − 4 = ? → 4 + 4 = 8. 10 − 3 = ? → 3 + 7 = 10.',
  fs3: 'Қосуды ойла: 9 − 4 = ? → 4 + 5 = 9.',
  f20n: 'Ондық өзгермейді: 13 + 4 → 3 + 4 = 7, демек 17.',
  fd:  'Қос сандар: 7 + 7 = 14. Жақыны: 7 + 8 = 7 + 7 + 1 = 15.',
  f9:  'Онға толтыр: 9 + 4 = 9 + 1 + 3 = 13.',
  f87: 'Онға толтыр: 8 + 5 = 8 + 2 + 3 = 13. 7 + 4 = 7 + 3 + 1 = 11.',
  fs20n: 'Ондық өзгермейді: 17 − 5 → 7 − 5 = 2, демек 12.',
  fsd: 'Қосуды ойла: 14 − 7 = ? → 7 + 7 = 14.',
  fs98: 'Оннан ал: 13 − 9 → 10 − 9 = 1, 1 + 3 = 4.',
  fsr: 'Онға дейін, сосын қалғанын: 12 − 5 → 12 − 2 = 10, 10 − 3 = 7.',
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const factText = f => `${f.a} ${f.op} ${f.b}`;

/* ── styles ── */
const css = document.createElement('style'); css.textContent = `
.flu-card{background:var(--surface-alt,#f3f4f6);border-left:4px solid var(--accent,#6366f1);border-radius:10px;padding:10px 14px;margin:0 0 14px;font-size:15px;line-height:1.45}
.flu-card b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim,#6b7280);margin-bottom:2px}
.flu-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;font-family:'Space Mono',monospace;font-size:13px;color:var(--text-dim,#6b7280)}
.flu-dots{display:flex;gap:4px}.flu-dots i{width:10px;height:10px;border-radius:50%;background:var(--border,#e5e7eb)}.flu-dots i.ok{background:var(--success,#16a34a)}.flu-dots i.no{background:var(--error,#dc2626)}
.flu-bar{height:10px;border-radius:999px;background:var(--border,#e5e7eb);overflow:hidden;margin:0 0 18px}
.flu-bar i{display:block;height:100%;width:100%;background:var(--accent,#6366f1);transition:width linear;transition-duration:0ms}
.flu-bar.out i{background:var(--error,#dc2626)}
.flu-v{min-height:34px;margin-top:10px;font-family:'Fredoka',sans-serif;font-size:20px;text-align:center}
.flu-v.ok{color:var(--success,#16a34a)}.flu-v.no{color:var(--error,#dc2626)}
@media (prefers-reduced-motion:reduce){.flu-bar i{transition:none}}`;
document.head.appendChild(css);

/* ── phase: learn (and fix) — a picture question, verdict through the legacy feedback path ── */
function renderPictureQ(ws, f, card) {
  state.fluQ = { f, tries: 0 };   // not on state.flu: selectLevel (below) resets that after the first question is drawn
  ws.innerHTML = `${card ? `<div class="flu-card"><b>Әдіс</b>${esc(card)}</div>` : ''}
    <div class="equation-row"><span>${f.a}</span><span>${f.op}</span><span>${f.b}</span><span>=</span>
      <input type="number" class="eq-input" id="ans" placeholder="?" autofocus>
      <button class="check-btn" style="font-size:18px;padding:8px 20px" id="fluCheck">Тексеру</button></div>
    <div class="block-display pop-in" style="display:flex;justify-content:center;overflow-x:auto;padding:12px 0">${FLU.picture(f)}</div>
    <div class="feedback" id="fb"></div>`;
  const inp = document.getElementById('ans'); inp.addEventListener('keydown', e => { if (e.key === 'Enter') fluCheck(); }); inp.focus();
  document.getElementById('fluCheck').onclick = fluCheck;
}
/* A miss is corrected on the spot (owner, 2026-10-07: «做错了就只能按下一个键»). The legacy check showed
   «✗ Қайта ойланыңыз» and then only «Келесі» — think again, with no way to. Now: first miss → the box is
   cleared, «think again, look at the picture», one more go; second miss → the whole fact is shown and the pupil
   types the answer herself before she moves on. A question missed once counts as missed (the run restarts, the
   log says wrong) however it ends; only a first-try answer counts as right. The ⚡ round is not touched: it
   corrects nothing while it runs, by design. */
function fluCheck() {
  const Q = state.fluQ, inp = document.getElementById('ans'), fb = document.getElementById('fb');
  if (!Q || !inp || !fb || state.fbShown || inp.disabled) return;
  const v = parseInt(inp.value); if (isNaN(v)) return;
  const f = Q.f;
  if (v === f.ans) {
    inp.classList.remove('wrong'); inp.classList.add('correct'); inp.disabled = true;
    if (!Q.tries) return showFeedback(true);
    showFeedback(false, `Дұрыс жауап: ${f.ans}`);   // logged as a miss; the run starts again
    fb.className = 'feedback show wrong';
    fb.innerHTML = `✓ ${factText(f)} = ${f.ans} — енді дұрыс. Бірақ алғашқы жауап қате болды, қатар басынан басталады.`;
    return;
  }
  Q.tries++;
  inp.classList.remove('wrong'); void inp.offsetWidth; inp.classList.add('wrong'); inp.value = ''; inp.focus();
  fb.className = 'feedback show wrong'; void fb.offsetWidth; fb.classList.add('shake');
  fb.innerHTML = Q.tries === 1 ? '✗ Тағы бір ойлан — суретке қара.' : `Дұрысы: <b>${factText(f)} = ${f.ans}</b>. Енді өзің жаз.`;
}
window.genFluency = function(ws) {
  const S = state.flu; const lv = state.level;
  if (!S || S.lv !== lv) state.flu = { phase: 'learn', lv, seen: 0 };
  const F = state.flu;
  if (F.phase === 'fix') { const f = F.fix.queue[F.fix.i]; const qc = document.getElementById('qCount'); if (qc) qc.textContent = `түзету ${F.fix.i + 1}/${F.fix.queue.length}`;
    renderPictureQ(ws, f, F.fix.i === 0 ? 'Қате кеткен есеп — суретпен тағы бір рет.' : null); return; }
  F.phase = 'learn'; F.seen = (F.seen || 0) + 1;
  const qc = document.getElementById('qCount'); if (qc) qc.textContent = `қатарынан ${state.streak}/${state.streakNeed}`;
  renderPictureQ(ws, FLU.pick(lv), F.seen <= 3 ? FLU.cards[lv] : null);
};

/* ── phase: round ── */
function reviewPool(lv) { const i = FLU.order.indexOf(lv); const passed = FLU.order.slice(0, i).filter(id => state.completed[id]); return passed; }
function buildRound(lv) {
  const pool = reviewPool(lv); const own = FLU.distinct(lv, pool.length ? FLU.newInRound : FLU.round);
  const avoid = new Set(own.map(key)); const rev = [];
  if (pool.length) { let guard = 0; while (rev.length < FLU.round - own.length && guard++ < 100) { const id = pool[Math.floor(Math.random() * pool.length)]; const f = FLU.distinct(id, 1, avoid)[0]; if (f) { avoid.add(key(f)); rev.push(f); } } }
  return shuffle(own.concat(rev)).slice(0, FLU.round);
}
function startRound() {
  const F = state.flu; F.phase = 'round'; F.round = { qs: buildRound(state.level), i: 0, hits: 0, misses: [], ms: [], res: [] };
  const qc = document.getElementById('qCount'); if (qc) qc.textContent = '⚡ 0/' + FLU.round;
  roundQ();
}
function roundQ() {
  const F = state.flu, R = F.round, ws = document.getElementById('workspace'); if (!ws) return;
  if (R.i >= R.qs.length) return endRound();
  const f = R.qs[R.i], limit = FLU.limit[state.level](); R.t0 = Date.now(); R.done = false;
  const qc = document.getElementById('qCount'); if (qc) qc.textContent = `⚡ ${R.i}/${FLU.round}`;
  ws.innerHTML = `<div class="flu-head"><span>⚡ ${R.i + 1} / ${FLU.round}</span><span class="flu-dots">${R.qs.map((q, i) => `<i class="${i < R.i ? (R.res[i] ? 'ok' : 'no') : ''}"></i>`).join('')}</span></div>
    <div class="flu-bar" id="fluBar"><i></i></div>
    <div class="equation-row"><span>${f.a}</span><span>${f.op}</span><span>${f.b}</span><span>=</span>
      <input type="number" class="eq-input" id="ans" placeholder="?" autofocus autocomplete="off">
      <button class="check-btn" style="font-size:18px;padding:8px 20px" id="fluGo">Тексеру</button></div>
    <div class="flu-v" id="fluV"></div>`;
  const inp = document.getElementById('ans'); inp.focus();
  const settle = (ok, timeout) => { if (R.done) return; R.done = true; clearTimeout(R.timer); inp.disabled = true; document.getElementById('fluGo').disabled = true;
    const ms = Date.now() - R.t0; R.ms.push(ms); R.res[R.i] = ok ? 1 : 0;
    if (ok) R.hits++; else R.misses.push(f);
    const v = document.getElementById('fluV'); v.className = 'flu-v ' + (ok ? 'ok' : 'no');
    v.textContent = ok ? `${factText(f)} = ${f.ans} ✓` : (timeout ? `Тағы жылдамырақ! ${factText(f)} = ${f.ans}` : `${factText(f)} = ${f.ans}`);
    if (timeout) document.getElementById('fluBar').classList.add('out');
    if (window.pvFluLog) try { pvFluLog({ lv: state.level, fact: factText(f), ans: f.ans, given: timeout ? undefined : inp.value, ok, ms, timeout: !!timeout, i: R.i, n: FLU.round }); } catch (e) {}
    R.i++; setTimeout(roundQ, ok ? 600 : 1400); };
  const go = () => { const v = parseInt(inp.value); if (isNaN(v)) return; inp.classList.add(v === f.ans ? 'correct' : 'wrong'); settle(v === f.ans, false); };
  document.getElementById('fluGo').onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  const bar = document.querySelector('#fluBar i'); requestAnimationFrame(() => { bar.style.transitionDuration = limit + 'ms'; void bar.offsetWidth; bar.style.width = '0%'; });
  R.timer = setTimeout(() => settle(false, true), limit);
}
function endRound() {
  const F = state.flu, R = F.round; F.last = { hits: R.hits, n: R.qs.length, ms: R.ms.slice(), misses: R.misses.length, pass: R.hits >= FLU.pass };
  const qc = document.getElementById('qCount'); if (qc) qc.textContent = `⚡ ${R.hits}/${FLU.round}`;
  /* corrections first (owner, 2026-10-01: DIFFERENT questions, never the same one over and over, and no replay of
     the whole level): every missed fact comes back with the picture, then FLU.fixPer − 1 other facts of its own
     level, so a miss costs four picture questions of that kind; over FLU.fixMax questions they are mixed */
  const facts = []; R.misses.forEach(m => { if (!facts.some(x => key(x) === key(m))) facts.push(m); });
  if (facts.length) {
    let queue = facts.flatMap(f => { const lv = f.lv || state.level; const others = FLU.distinct(lv, FLU.fixPer - 1, new Set([key(f)]));
      return [f].concat(shuffle(others)).map(x => Object.assign({}, x, { ans: ans(x), lv })); });
    if (queue.length > FLU.fixMax) queue = shuffle(queue).slice(0, FLU.fixMax);
    F.phase = 'fix'; F.fix = { queue, i: 0 };
    const ws = document.getElementById('workspace'); genFluency(ws); return;
  }
  finishLevel();
}
function finishLevel() {
  const F = state.flu, L = F.last, ws = document.getElementById('workspace'); F.phase = 'done';
  /* the legacy result (bridge.js records it as the stage test): its pass is «the run is complete», so the run is
     set to what the round earned — or to a pass while the gate is off (FLU.gate=false, measuring only) */
  const pass = FLU.gate ? L.pass : true;
  state.score = L.hits; state.questionNum = L.n; state.streak = pass ? state.streakNeed : 0;
  showLevelComplete(ws);
  const sec = L.ms.length ? (L.ms.reduce((a, b) => a + b, 0) / 1000).toFixed(0) : '–';
  const med = L.ms.length ? (L.ms.slice().sort((a, b) => a - b)[Math.floor(L.ms.length / 2)] / 1000).toFixed(1) : '–';
  const line = ws.querySelector('p[style*="font-size:13px"]');
  if (line) line.innerHTML = `⚡ ${L.hits}/${L.n} · ${sec} с · бір есепке ${med} с · өту: ${FLU.pass}/${L.n}${FLU.gate ? '' : ' <span style="opacity:.7">(әзірге есепке алынбайды)</span>'}`;
  const bad = ws.querySelectorAll('p[style*="font-size:13px"]')[1]; if (bad) bad.textContent = 'Тағы бір рет көр — дәл осы жерден.';
  const again = ws.querySelector('button.check-btn'); if (again) again.textContent = '⚡ Тағы бір рет';
}

/* ── wiring into the legacy flow ── */
const _sel = window.selectLevel; window.selectLevel = function(modId, lvlId) {
  const r = _sel.apply(this, arguments);
  if (FLU_LVL.has(lvlId) && state.level === lvlId) { state.streakNeed = FLU.learnRun; state.streakCap = 9999; state.flu = { phase: 'learn', lv: lvlId, seen: 0 };
    const qc = document.getElementById('qCount'); if (qc) qc.textContent = `қатарынан 0/${FLU.learnRun}`; }
  return r; };
const _gen = window.generateQuestion; window.generateQuestion = function() {
  if (!FLU_LVL.has(state.level)) return _gen.apply(this, arguments);
  const F = state.flu;
  if (F && F.lv === state.level) {
    if (F.phase === 'round') return;                                       // the round draws its own questions
    if (F.phase === 'fix') { state.fbShown = false; F.fix.i++; if (F.fix.i < F.fix.queue.length) return genFluency(document.getElementById('workspace')); return finishLevel(); }
    if (F.phase === 'done') { state.fbShown = false; state.score = 0; state.total = 0; state.questionNum = 0; state.streak = 0; return startRound(); }
    if (F.phase === 'learn' && state.streak >= state.streakNeed) { state.fbShown = false; return startRound(); }
  }
  return _gen.apply(this, arguments);   // learn: the legacy path renders through genFluency (QUESTION_DISPATCH)
};
window.FLU = FLU;
})();
