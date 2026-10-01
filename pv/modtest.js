/* pv/modtest.js — the module test, PV's «Түсіну» levels (u1…u5), rebuilt (owner, 2026-10-01).
   Loaded by pv/index.html after fluency.js and before bridge.js.

   It was five text questions of one kind, passed by a run of four — easier than any level in the module it was
   supposed to close, and blind to most of them. Now it is the module's exit: TWO text questions from EVERY level of
   the module (the counting, place-value and comparison questions of the placement bank, the fluency ladder's own
   facts), no picture, no run. Pass = every question right. A miss sends the pupil back to the level it came from:
   that level is reopened (its `completed` is cleared, the map's current station moves there) and the test can only
   be taken again once every level of the module is complete. A pupil cannot open the test with a level missing. */
'use strict';
(function(){
const MT = { per: 2 };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const modOf = lv => MODULES.find(m => m.levels.some(l => l.id === lv));
const levelsOf = mod => mod.levels.filter(l => !l.retired && !COMP_LVL.has(l.id));
const missing = mod => levelsOf(mod).filter(l => !state.completed[l.id]);
const nameOf = lv => { for (const m of MODULES) { const l = m.levels.find(x => x.id === lv); if (l) return l.name; } return lv; };

function buildTest(mod) {
  const qs = [];
  for (const l of levelsOf(mod)) { const seen = new Set(); let guard = 0;
    while (seen.size < MT.per && guard++ < 40) { const q = genPlacementQ(l.id); if (seen.has(q.q)) continue; seen.add(q.q); qs.push({ lv: l.id, q: q.q, answer: q.answer }); } }
  return shuffle(qs);
}
function renderQ(ws) {
  const M = state.mt, item = M.qs[M.i];
  const qc = document.getElementById('qCount'); if (qc) qc.textContent = `тест ${M.i + 1}/${M.qs.length}`;
  const parts = item.q.split('= ?'); const inline = parts.length === 2;
  ws.innerHTML = `${inline ? `<div class="equation-row"><span>${esc(parts[0].trim())}</span><span>=</span><input type="number" class="eq-input" id="ans" placeholder="?" autofocus autocomplete="off"><button class="check-btn" style="font-size:18px;padding:8px 20px" id="mtGo">Тексеру</button></div>`
    : `<div class="prompt-card"><div class="question">${esc(item.q)}</div></div><div class="answer-area"><input type="number" class="answer-input" id="ans" placeholder="?" autofocus autocomplete="off"><button class="check-btn" id="mtGo">Тексеру</button></div>`}
    <div style="text-align:center;margin-top:4px"><span class="comp-badge">Модуль тесті</span></div>
    <div class="feedback" id="fb"></div>`;
  const inp = document.getElementById('ans'); inp.focus(); M.t0 = Date.now(); let done = false;
  const go = () => { if (done) return; const v = parseInt(inp.value); if (isNaN(v)) return; done = true; const ok = v === item.answer;
    inp.classList.add(ok ? 'correct' : 'wrong'); inp.disabled = true; document.getElementById('mtGo').disabled = true;
    M.res.push(ok); if (!ok && !M.wrong.includes(item.lv)) M.wrong.push(item.lv);
    const fb = document.getElementById('fb'); fb.className = 'feedback show ' + (ok ? 'correct' : 'wrong'); fb.textContent = ok ? '✓ Дұрыс' : `✗ Дұрыс жауап: ${item.answer}`;
    if (window.pvModLog) try { pvModLog({ test: state.level, lv: item.lv, q: item.q, ans: item.answer, given: String(v), ok, ms: Date.now() - M.t0, i: M.i, n: M.qs.length }); } catch (e) {}
    const nb = document.createElement('button'); nb.className = 'next-btn'; nb.style.marginTop = '12px'; nb.textContent = M.i + 1 < M.qs.length ? 'Келесі →' : 'Нәтиже →';
    nb.onclick = () => { M.i++; if (M.i < M.qs.length) renderQ(ws); else finish(ws); }; fb.parentElement.appendChild(nb); setTimeout(() => nb.focus(), 50); };
  document.getElementById('mtGo').onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
function finish(ws) {
  const M = state.mt; const hits = M.res.filter(Boolean).length; const pass = M.wrong.length === 0;
  /* the legacy result (bridge.js records it as the stage test, the legacy marks the level complete on a pass) */
  state.score = hits; state.questionNum = M.qs.length; state.streak = pass ? state.streakNeed : 0;
  showLevelComplete(ws);
  if (pass) { const line = ws.querySelector('p[style*="font-size:13px"]'); if (line) line.textContent = `Модуль тесті: ${hits}/${M.qs.length} — бәрі дұрыс.`; return; }
  /* a miss: the levels it came from are reopened, and the pupil continues from the first of them */
  M.wrong.forEach(lv => { delete state.completed[lv]; });
  const first = M.wrong.map(lv => getLevelGlobalIndex(lv)).sort((a, b) => a - b)[0];
  state.unlockedUpTo = first; saveProgress(); renderSidebar();
  const e = LEVEL_ORDER[first];
  ws.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:32px 16px">
      <div style="font-size:56px;margin-bottom:12px">📚</div>
      <h2 style="font-size:26px;font-family:'Fredoka'">Әзірге өтпеді</h2>
      <p style="font-size:17px;color:var(--text-dim);margin:10px 0">${hits} / ${M.qs.length} дұрыс</p>
      <p style="font-size:14px;margin:4px 0 14px">Қайта өту керек:</p>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">${M.wrong.map(lv => `<span style="background:var(--error-light);color:var(--error);border-radius:10px;padding:6px 12px;font-weight:700">${esc(nameOf(lv))}</span>`).join('')}</div>
      <p style="font-size:13px;color:var(--text-dim);margin:0 0 16px">Сол деңгейлерді қайта өт — сосын модуль тесті қайта ашылады.</p>
      <button class="next-btn" onclick="selectLevel('${e.moduleId}','${e.levelId}')">→ ${esc(nameOf(e.levelId))}</button></div>`;
  state.mt = null;
}

/* ── wiring ── */
const _sel = window.selectLevel; window.selectLevel = function(modId, lvlId) {
  if (COMP_LVL.has(lvlId)) {
    const mod = modOf(lvlId); const miss = missing(mod);
    if (miss.length) {   // the test is the module's exit: every level first
      state.module = modId; state.level = null; state.mt = null; renderSidebar();
      const main = document.getElementById('main'); if (!main) return; const e = LEVEL_ORDER[getLevelGlobalIndex(miss[0].id)];
      main.innerHTML = `<div class="welcome"><div style="font-size:56px;margin-bottom:12px">🔒</div><h2>Модуль тесті әлі жабық</h2>
        <p>Алдымен мына деңгейлерді өт:</p>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center;margin:10px 0 18px">${miss.map(l => `<span style="font-weight:700">${esc(l.name)}</span>`).join('')}</div>
        <button class="check-btn" style="font-size:16px;padding:12px 28px" onclick="selectLevel('${e.moduleId}','${e.levelId}')">→ ${esc(miss[0].name)}</button></div>`;
      const back = document.getElementById('pvback'); if (back) back.style.display = 'block';   // «← Карта» (bridge.js) stays reachable
      return;
    }
    state.mt = { qs: buildTest(mod), i: 0, res: [], wrong: [] };
  }
  return _sel.apply(this, arguments);
};
const _gen = window.generateQuestion; window.generateQuestion = function() {
  if (!COMP_LVL.has(state.level) || !state.mt) return _gen.apply(this, arguments);
  if (state.mt.i >= state.mt.qs.length) state.mt = { qs: buildTest(modOf(state.level)), i: 0, res: [], wrong: [] };   // «Қайталау» on the result screen
  state.fbShown = false; renderQ(document.getElementById('workspace'));
};
window.MT = MT;
})();
