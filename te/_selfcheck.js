/* te/_selfcheck.js — §14 hand-off self-check. Not shipped. Run: node te/_selfcheck.js
   isCorrect/norm/fracVal are copied VERBATIM from core/core.js (§14.4 — do not copy from ar/). */
'use strict';
const fs=require('fs'), path=require('path'), root=path.join(__dirname,'..');
const norm=s=>String(s??'').trim().replace(/\s+/g,' ').replace(',','.').replace(/\s*%$/,'').toLowerCase();
function fracVal(s){ let m=String(s).match(/^(-?)(\d+)\s+(\d+)\/(\d+)$/); if(m){ const w=+m[2],n=+m[3],d=+m[4]; return d?(m[1]==='-'?-1:1)*(w+n/d):NaN; }
  m=String(s).match(/^(-?)(\d+)\/(\d+)$/); if(m){ const n=+m[2],d=+m[3]; return d?(m[1]==='-'?-1:1)*n/d:NaN; } return NaN; }
function isCorrect(q,given){
  const a=norm(given), b=norm(q&&q.ans);
  if(!a||!b) return false; if(a===b) return true;
  const fa=fracVal(a), fb=fracVal(b); if(Number.isFinite(fa)&&Number.isFinite(fb)) return Math.abs(fa-fb)<1e-9;
  if(/^-?\d+(\.\d+)?$/.test(b)){ const m=a.match(/-?\d+(\.\d+)?/); if(m) return Math.abs(parseFloat(m[0])-parseFloat(b))<1e-9; }
  const na=a.match(/-?\d+(\.\d+)?/g)||[], nb=b.match(/-?\d+(\.\d+)?/g)||[];
  return nb.length>0 && na.length===nb.length && na.every((v,i)=>Math.abs(parseFloat(v)-parseFloat(nb[i]))<1e-9);
}
const src=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
const bundle=['stages.js','figs.js','icons.js','bank.js','generate.js'].map(src).join('\n');
const M=new Function(bundle+'\n;return{STAGES:typeof STAGES!=="undefined"?STAGES:null,GENERATORS:typeof GENERATORS!=="undefined"?GENERATORS:null,FIGS:typeof FIGS!=="undefined"?FIGS:{},ICONS:typeof ICONS!=="undefined"?ICONS:{},CARDS:typeof CARDS!=="undefined"?CARDS:{}}')();
const S=M.STAGES, G=M.GENERATORS, FG=M.FIGS, IC=M.ICONS, CD=M.CARDS;
if(!S||!G){ console.log('STAGES or GENERATORS missing — route would throw on load'); process.exit(1); }
let fail=0; const bad=(m)=>{fail++;console.log('  ✗ '+m);};
const ok=(m)=>console.log('  ✓ '+m);

console.log('\n1 · ids');
{ const seen=new Set(); let e=0;
  S.forEach(r=>{ if(!/^TE-\d\d$/.test(r[0])) {bad('bad id '+r[0]);e++;} if(seen.has(r[0])){bad('dup '+r[0]);e++;} seen.add(r[0]); });
  if(!e) ok(S.length+' ids, all XX-nn, unique'); }

console.log('2 · generator / card / icon per stage');
{ let e=0; S.forEach(r=>{ if(!G[r[2]]) {bad(r[0]+' has no generator ('+r[2]+') — the diagnostic would mark it passed for free, §3');e++;}
    if(!CD[r[0]]) {bad(r[0]+' has no teaching card');e++;} if(!IC[r[0]]) {bad(r[0]+' has no icon');e++;} });
  if(!e) ok('every stage has generator + card + icon'); }

console.log('3–5 · 400 draws per stage per level');
{ let e=0;
  S.forEach(r=>{ const [id,,type,params]=r;
    for(const lvl of [1,2,3]){ let got=0;
      for(let i=0;i<400;i++){ let q=null; try{ q=G[type](params,lvl); }catch(err){ bad(id+' lvl'+lvl+' threw: '+err.message); e++; break; }
        if(!q) continue; got++;
        if(!q.stem||!q.ans){ bad(id+' lvl'+lvl+' missing stem/ans'); e++; break; }
        const kind=q.kind||((q.choices&&q.choices.length)?'choice':'input');
        if(!['choice','input','custom'].includes(kind)){ bad(id+' bad kind'); e++; break; }
        if(kind==='choice'){
          if(!(q.choices.length===3||q.choices.length===4)){ bad(id+' lvl'+lvl+' has '+q.choices.length+' choices'); e++; break; }
          if(!q.choices.some(c=>isCorrect(q,c))){ bad(id+' lvl'+lvl+' answer not among choices: '+q.stem+' → '+q.ans); e++; break; }
          let dup=false; for(let m=0;m<q.choices.length;m++) for(let n=m+1;n<q.choices.length;n++)
            if(isCorrect({ans:q.choices[m]},q.choices[n])) dup=true;
          if(dup){ bad(id+' lvl'+lvl+' two choices compare equal: '+q.choices.join('/')); e++; break; }
        }
        /* Deliberate deviation from §6, owner decision 2026-09-20: this route KEEPS the picture
           at level 3 instead of hiding it in `hfig`. A bare «6 · x = 96» is the symbol drilling
           the route exists to avoid, so the check is inverted — the picture must be there. */
        if(lvl===3&&!q.fig&&type!=='notation'){ bad(id+' lvl3 has no fig — level 3 keeps the picture on the item'); e++; break; }
      }
      if(got<40){ bad(id+' lvl'+lvl+' produced only '+got+'/400 questions'); e++; }
    }});
  if(!e) ok('all generators valid at all three levels'); }

console.log('6 · ≥6 distinct level-3 items out of 10 draws, 200 trials');
{ let e=0; S.forEach(r=>{ const [id,,type,params]=r; let worst=99;
    for(let t=0;t<200;t++){ const s=new Set();
      for(let i=0;i<10;i++){ const q=G[type](params,3); if(q) s.add(q.stem+'|'+q.ans); }
      worst=Math.min(worst,s.size); }
    if(worst<6){ bad(id+' worst draw yielded '+worst+' distinct items (<6 → level test refuses to open)'); e++; }
    else if(worst<10) console.log('    · '+id+' worst '+worst+'/10 — passes, but short tests cost stars (§9)');
  }); if(!e) ok('every stage clears the ≥6 floor'); }

console.log('7 · forbidden APIs');
{ let e=0; ['stages.js','figs.js','icons.js','bank.js','generate.js'].forEach(f=>{ const t=src(f);
    [/\balert\s*\(/,/\bconfirm\s*\(/,/\bprompt\s*\(/,/localStorage/,/sessionStorage/,/indexedDB/,/\bfetch\s*\(/]
      .forEach(rx=>{ if(rx.test(t)){ bad(f+' uses '+rx); e++; } }); });
  if(!e) ok('no alert/confirm/prompt, no storage, no fetch'); }

console.log('8 · CSS tokens exist in core/ui.css');
{ const css=fs.readFileSync(path.join(root,'core/ui.css'),'utf8');
  const have=new Set((css.match(/--[a-z0-9-]+/g)||[]));
  let e=0; ['figs.js','icons.js','generate.js','bank.js'].forEach(f=>{ const t=src(f);
    (t.match(/var\(\s*(--[a-z0-9-]+)/g)||[]).forEach(m=>{ const tok=m.replace(/var\(\s*/,'');
      if(!have.has(tok)){ bad(f+' uses '+tok+' which is not in core/ui.css'); e++; } }); });
  if(!e) ok('every var(--token) exists'); }

console.log('9 · index.html');
{ const h=src('index.html'); let e=0;
  ['core/core.js','core/figs.js','core/map.js','core/runner.js'].forEach(f=>{ if(!h.includes(f)){bad('index.html does not load '+f);e++;} });
  if(!h.includes('class="app"')){bad('missing class="app"');e++;}
  if(!/notranslate/.test(h)){bad('missing notranslate meta');e++;}
  if(h.includes('core-stub.js')){bad('loads core-stub.js');e++;}
  if(!e) ok('index.html loads the four core files, app shell, notranslate, no stub'); }

console.log('10 · wrapper stages (TE-09…16): the answer solves the equation, all four cores appear, the picture is drawable, the steps compute');
{ const ev=(txt,x)=>{ const js=txt.replace(/x-ті тап\.?/,'').replace(/−/g,'-').replace(/·/g,'*').replace(/:/g,'/').replace(/x/g,'('+x+')').split('='); return Math.abs(Function('return ('+js[0]+')')()-Function('return ('+js[1]+')')())<1e-9; };
  const num=t=>{ try{ return Function('return ('+String(t).replace(/−/g,'-').replace(/·/g,'*').replace(/:/g,'/')+')')(); }catch(_){ return NaN; } };   // words instead of a computation → NaN → reported, not thrown
  let e=0; S.filter(r=>/^wrap_/.test(r[2])).forEach(r=>{ const cores={}; let wrong=0,multi=0,badfig=0,badstep=0;
    for(const lvl of [1,2,3]) for(let i=0;i<1500;i++){ const q=G[r[2]](r[3],lvl); const x=+q.ans; cores[q.fig.core]=(cores[q.fig.core]||0)+1;
      if(!ev(q.stem,x)) wrong++;
      for(let y=0;y<=60;y++) if(y!==x){ let okY=false; try{ okY=ev(q.stem,y); }catch(_){ } if(okY){ multi++; break; } }
      const svg=FG.wrap(q.fig); if(/NaN|undefined|width="-|width="0"/.test(svg)) badfig++;
      if(!(q.steps&&q.steps.length===2&&num(q.steps[0].expr)===+q.steps[0].val&&num(q.steps[1].expr)===+q.steps[1].val&&q.steps[1].val===q.ans)) badstep++; }
    const miss=['a+x','x+a','a-x','x-a'].filter(c=>!cores[c]);
    if(wrong||multi||badfig||badstep||miss.length){ e++; bad(`${r[0]}: wrong key ${wrong} · second solution ${multi} · undrawable figure ${badfig} · step that does not compute ${badstep} · cores never drawn: ${miss.join(', ')||'—'}`); } });
  if(!e) ok('8 stages × 3 levels × 1500: every key solves its equation and is the only solution in 0…60; all four cores occur; no negative/zero/NaN widths; both guided steps evaluate to their value and the last one is the answer'); }

console.log('11 · bar_equal with an unknown number of cells does not draw a number of cells');
{ const vm=require('vm'), ctx={window:{},console}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root,'core','figs.js'),'utf8')+';this.renderFig=typeof renderFig!=="undefined"?renderFig:window.renderFig;',ctx);
  const svg=ctx.renderFig('bar_equal','18;?;3'), cells=(svg.match(/<rect[^>]*fill="var\(--seg[12]\)"/g)||[]).length, known=(ctx.renderFig('bar_equal','18;6;?').match(/<rect[^>]*fill="var\(--seg[12]\)"/g)||[]).length;
  if(cells===3&&/stroke-dasharray/.test(svg)&&known===6) ok('"18;?;3" → two cells, a dashed gap, a last cell; "18;6;?" still draws its 6 cells'); else bad(`bar_equal: unknown count drew ${cells} solid cells (dashed gap: ${/stroke-dasharray/.test(svg)}), known count drew ${known}/6`); }

console.log('\n'+(fail?('FAILURES: '+fail):'0 failures')+'\n');
process.exit(fail?1:0);
