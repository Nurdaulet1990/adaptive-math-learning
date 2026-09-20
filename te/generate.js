/* te/generate.js — question generators for the TE route (Теңдеулер). Owner: assistant.
   GENERATORS[type](params, lvl) → question. Pure: no DOM, no Core, no state.
   lvl 1 = concrete (bar you can read off, small numbers, choices)
   lvl 2 = pictorial (bar, bigger numbers, choices)
   lvl 3 = abstract (numbers live IN THE STEM — startTest dedupes by stem+ans, see fr/generate.js FR-02) */
'use strict';
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const shuffle=a=>a.slice().sort(()=>Math.random()-.5);
const R=(p,d)=>{const r=p||d;return rnd(r[0],r[1]);};

/* four distinct values, answer included; distractors are the common wrong methods */
function numChoices(ans,ds){
  const s=[ans]; for(const d of ds){ if(d>0&&!s.includes(d)&&s.length<4) s.push(d); }
  let k=1; while(s.length<4){ if(!s.includes(ans+k)) s.push(ans+k); k++; }
  return {kind:'choice', choices:shuffle(s).map(String)};
}
/* R4 (ours): the answer must not equal any number printed in the stem */
const clean=(x,...printed)=>x>1&&!printed.includes(x);

/* every search below runs until all constraints hold — a generator that returns null often
   starves startTest: it dedupes 10 draws and refuses to open the test below 6 distinct items. */
const tries=(fn,n)=>{ for(let i=0;i<(n||300);i++){ const r=fn(); if(r) return r; } return null; };
const CORES=['a+x','x+a','a-x','x-a'];
/* Level 1 is the concrete level (§6) and, on the core stages, it is WORDLESS: a grade-1 pupil
   who cannot yet read a word problem can still see that the sealed cup and the loose blocks
   balance. The stem is the same two tokens on every level-1 item — read once, then recognised.
   `stem` is a required field and startTest dedupes by stem+ans, but that only bites at level 3,
   which keeps its numbers in the stem. */
const ASK='«?» — қанша?';
const H_BAL='Екі табақтан бірдей шаршыларды алып таста.';
const BAL=(l,r,cross)=>({type:'bal',l,r,cross:cross||0});
function coreOf(kind,a,x){
  if(kind==='a+x') return {txt:`(${a} + x)`, v:a+x, span:a+x};
  if(kind==='x+a') return {txt:`(x + ${a})`, v:a+x, span:a+x};
  if(kind==='a-x') return {txt:`(${a+x} − x)`, v:a, span:a+x};
  return {txt:`(x − ${a})`, v:x-a, span:x};
}


function addPairs(lvl){
  const out=[];
  const push=(a,x)=>{ if(a!==x&&clean(x,a,a+x)) out.push([a,x]); };
  const cap=lvl===1?12:20;
  for(let a=2;a<=cap-2;a++) for(let x=2;a+x<=cap;x++) push(a,x);
  if(lvl===3) for(let a=10;a<=80;a+=10) for(let x=10;a+x<=100;x+=10) push(a,x);
  return out;
}
function mulPairs(lvl){
  const out=[]; const gmax=lvl===1?4:lvl===2?6:9, vmax=lvl===1?5:lvl===2?9:20, tmax=lvl===3?100:36;
  for(let g=2;g<=gmax;g++) for(let v=2;v<=vmax;v++) if(g!==v&&g*v<=tmax) out.push([g,v]);
  return out;
}

const GENERATORS={

/* TE-01…04 — one unknown in a two-part bar.
   The legal (a,x) set is enumerated and then drawn from UNIFORMLY. Rejection sampling with
   nested rnd() ranges is heavily biased toward small a, and startTest dedupes 10 draws: a
   183-item pool sampled unevenly still yielded only 6 distinct items in the worst case, which
   is startTest's floor. Uniform draws take that to 9. */



core_add(p,lvl){
  const pool=addPairs(lvl); if(!pool.length) return null;
  const f=p.form;
  const ok=pool.filter(([a,x])=>{
    if(f==='a+x'||f==='x+a') return clean(x,a,a+x);
    if(f==='a-x') return clean(x,a+x,a);
    return clean(a+x,a,x);
  });
  if(!ok.length) return null;
  const [a,x]=ok[Math.floor(Math.random()*ok.length)];
  let stem,ans,fig,expl,h1;
  if(f==='a+x'){ ans=x; fig={type:'bar',fp:`${a};?;${a+x}`};
    stem=`${a} + x = ${a+x}. x-ті тап.`; h1='Белгісіз қосылғыш = қосынды − белгілі қосылғыш.'; expl=`x = ${a+x} − ${a} = ${x}.`; }
  else if(f==='x+a'){ ans=x; fig={type:'bar',fp:`?;${a};${a+x}`};
    stem=`x + ${a} = ${a+x}. x-ті тап.`; h1='Белгісіз қосылғыш = қосынды − белгілі қосылғыш.'; expl=`x = ${a+x} − ${a} = ${x}.`; }
  else if(f==='a-x'){ const A=a+x; ans=x; fig={type:'bar',fp:`${a};?;${A}`};
    stem=`${A} − x = ${a}. x-ті тап.`; h1='Азайтқыш = азайғыш − айырма.'; expl=`x = ${A} − ${a} = ${x}.`; }
  else { const A=a+x; ans=A; fig={type:'bar',fp:`${a};${x};?`};
    stem=`x − ${a} = ${x}. x-ті тап.`; h1='Азайғыш = айырма + азайтқыш.'; expl=`x = ${x} + ${a} = ${A}.`; }
  const q={stem,ans:String(ans),h1,expl};
  if(lvl===1){
    /* level 1 carries NO sentence: the balance itself is the question (§ MAP "Деңгей 1"). */
    const A=a+x;
    if(f==='a+x'||f==='x+a'){ q.fig=BAL({b:a,c:1},{b:A}); q.hfig=BAL({b:a,c:1},{b:A},a); }
    else if(f==='a-x'){ q.fig=BAL({b:A},{b:a,c:1}); q.hfig=BAL({b:A},{b:a,c:1},a); }
    else { q.fig=BAL({c:1},{b:x,d:a}); q.hfig=BAL({c:1},{b:x,d:a}); }
    q.stem=ASK; q.h1=H_BAL;
    Object.assign(q,numChoices(ans,[ans+a,Math.abs(ans-a),ans+1,a]));
  }
  else if(lvl===2){ q.fig=fig; Object.assign(q,numChoices(ans,[ans+a,Math.abs(ans-a),ans+1,a])); }
  else { q.kind='input'; q.hfig=fig; }
  return q;
},

/* TE-05…08 — equal parts. Same uniform-draw treatment as core_add. */
core_mul(p,lvl){
  const f=p.form;
  const ok=mulPairs(lvl).filter(([g,v])=>{
    const T=g*v;
    if(f==='a*x') return clean(v,g,T);
    if(f==='x*a'||f==='a/x') return clean(g,v,T);
    return clean(T,g,v);
  });
  if(!ok.length) return null;
  const [g,v]=ok[Math.floor(Math.random()*ok.length)];
  const T=g*v; let stem,ans,fig,h1,expl;
  if(f==='a*x'){ ans=v; fig={type:'bar_equal',fp:`${T};${g};?`};
    stem=`${g} · x = ${T}. x-ті тап.`; h1='Белгісіз көбейткіш = көбейтінді : белгілі көбейткіш.'; expl=`x = ${T} : ${g} = ${v}.`; }
  else if(f==='x*a'){ ans=g; fig={type:'bar_equal',fp:`${T};?;${v}`};
    stem=`x · ${v} = ${T}. x-ті тап.`; h1='Белгісіз көбейткіш = көбейтінді : белгілі көбейткіш.'; expl=`x = ${T} : ${v} = ${g}.`; }
  else if(f==='a/x'){ ans=g; fig={type:'bar_equal',fp:`${T};?;${v}`};
    stem=`${T} : x = ${v}. x-ті тап.`; h1='Белгісіз бөлгіш = бөлінгіш : бөлінді.'; expl=`x = ${T} : ${v} = ${g}.`; }
  else { ans=T; fig={type:'bar_equal',fp:`?;${g};${v}`};
    stem=`x : ${g} = ${v}. x-ті тап.`; h1='Белгісіз бөлінгіш = бөлінді · бөлгіш.'; expl=`x = ${v} · ${g} = ${T}.`; }
  const q={stem,ans:String(ans),h1,expl};
  if(lvl===1){
    /* no sentence here either. a*x is the only multiplicative core a balance can hold:
       g sealed cups against T blocks. The other three ask for a count of groups or for the
       whole, which no pan can show — they use grp, the «?» sitting where the unknown is. */
    if(f==='a*x'){ q.fig=BAL({c:g},{b:T}); q.h1=H_BAL; }
    else if(f==='x/a'){ q.fig={type:'grp',g,v,total:'?'}; q.h1='Барлығын сана.'; }
    else { q.fig={type:'grp',g,v,total:T,ask:'g'}; q.h1='Қораптарды сана.'; }
    q.stem=ASK;
    Object.assign(q,numChoices(ans,[ans+g,ans*2,Math.max(1,ans-1),g+v]));
  }
  else if(lvl===2){ q.fig=fig; Object.assign(q,numChoices(ans,[ans+g,ans*2,Math.max(1,ans-1),g+v])); }
  else { q.kind='input'; q.hfig=fig; }
  return q;
},

/* TE-09,10,12,15 — a core wrapped in one +/− step */
wrap_add(p,lvl){
  const big=lvl===1?10:lvl===2?16:40;
  return tries(()=>{
    const kind=CORES[rnd(0,3)];
    const a=rnd(2,Math.min(9,big-3));
    const x=kind==='x-a'? a+rnd(2,big-a) : rnd(2,Math.min(big,14));
    const C=coreOf(kind,a,x); if(C.v<2) return null;
    const b=rnd(2,Math.min(9,big));
    let stem,c,shownOverride=null;
    if(p.w==='o-b'){ c=C.v-b; if(c<2) return null; stem=`${C.txt} − ${b} = ${c}. x-ті тап.`; }
    else if(p.w==='b+o'){ c=b+C.v; stem=`${b} + ${C.txt} = ${c}. x-ті тап.`; }
    else if(p.w==='o+b'){ c=C.v+b; stem=`${C.txt} + ${b} = ${c}. x-ті тап.`; }
    else { const T=b+C.v; stem=`${T} − ${C.txt} = ${b}. x-ті тап.`; c=b; shownOverride=[a,b,T,C.v]; }
    const shown=shownOverride||[a,b,c,C.v,kind==='a-x'?a+x:null].filter(Boolean);
    if(!clean(x,...shown)) return null;
    if(new Set(shown).size!==shown.length) return null;
    const q={stem, ans:String(x),
      h1:'Алдымен жақшаның сыртындағы амалды қайтар — жақшаның мәнін тап. Сосын ішін аш.',
      h2:`Жақшаның мәні = ${C.v}`,
      steps:[{label:'Жақшаның мәні',expr:'сыртын қайтар',val:String(C.v)},{label:'x',expr:'жақшаны аш',val:String(x)}],
      expl:`Жақшаның мәні ${C.v}. ${C.txt.replace(/[()]/g,'')} = ${C.v} → x = ${x}.`};
    const fig={type:'wrap',core:kind,a,x,v:C.v,b,w:p.w};
    if(lvl<3){ q.fig=fig; Object.assign(q,numChoices(x,[C.v,x+b,Math.abs(C.v-b),x+a])); }
    else { q.kind='input'; q.hfig=fig; }
    return q;
  });
},

/* TE-11,13,14,16 — a core wrapped in one ×/÷ step */
wrap_mul(p,lvl){
  const gmax=lvl===1?3:lvl===2?4:6, xmax=lvl===1?7:lvl===2?11:14;
  return tries(()=>{
    const kind=CORES[rnd(0,3)];
    const a=rnd(2,7);
    const x=kind==='x-a'? a+rnd(2,xmax) : rnd(2,xmax);
    const C=coreOf(kind,a,x); if(C.v<2) return null;
    const b=rnd(2,gmax);
    let stem,c,shownOverride=null;
    if(p.w==='o/b'){ if(C.v%b) return null; c=C.v/b; if(c<2) return null; stem=`${C.txt} : ${b} = ${c}. x-ті тап.`; }
    else if(p.w==='b*o'){ c=b*C.v; if(c>220) return null; stem=`${b} · ${C.txt} = ${c}. x-ті тап.`; }
    else if(p.w==='o*b'){ c=b*C.v; if(c>220) return null; stem=`${C.txt} · ${b} = ${c}. x-ті тап.`; }
    else { const T=b*C.v; if(T>220) return null; c=b; stem=`${T} : ${C.txt} = ${b}. x-ті тап.`; shownOverride=[a,b,T,C.v]; }
    const shown=shownOverride||[a,b,c,C.v,kind==='a-x'?a+x:null].filter(Boolean);
    if(!clean(x,...shown)) return null;
    if(new Set(shown).size!==shown.length) return null;
    const q={stem, ans:String(x),
      h1:'Алдымен жақшаның мәнін тап, сосын ішін аш.',
      h2:`Жақшаның мәні = ${C.v}`,
      steps:[{label:'Жақшаның мәні',expr:'сыртын қайтар',val:String(C.v)},{label:'x',expr:'жақшаны аш',val:String(x)}],
      expl:`Жақшаның мәні ${C.v}. ${C.txt.replace(/[()]/g,'')} = ${C.v} → x = ${x}.`};
    const fig={type:'wrap',core:kind,a,x,v:C.v,b,w:p.w};
    if(lvl<3){ q.fig=fig; Object.assign(q,numChoices(x,[C.v,C.v*b,x+a,Math.max(1,x-1)])); }
    else { q.kind='input'; q.hfig=fig; }
    return q;
  });
},

/* TE-17 — 3x means 3 · x. Answers are numbers on purpose: isCorrect compares the numbers in an
   answer, so "3 · x" and "3 : x" would grade as the same thing (§4 — distinct by value, not text). */
notation(p,lvl){
  return tries(()=>{
    const L=['x','y','a','b','k','m'][rnd(0,5)];
    const n=rnd(2,lvl===1?6:12), k=rnd(2,lvl===1?6:12);
    const mode=lvl===3?rnd(0,1):0;
    if(mode===0){
      if(n===k) return null;
      const q={stem:`${L} = ${k} болса, ${n}${L} нешеге тең?`, ans:String(n*k),
        h1:'Сан мен әріп қатар тұрса, арасында көбейту белгісі жасырын тұр.',
        h2:`${n}${L} = ${n} · ${L}`,
        expl:`${n}${L} = ${n} · ${L} = ${n} · ${k} = ${n*k}.`};
      if(lvl<3) Object.assign(q,numChoices(n*k,[n+k,k-n>0?k-n:n+1,n*k+n,n*k-n]));
      else q.kind='input';
      return q;
    }
    const m2=rnd(2,9); if(m2===n) return null;
    return {kind:'input', stem:`${n}${L} + ${m2}${L} өрнегін ықшамда. Нәтижедегі сан нешеге тең?`,
      ans:String(n+m2), h1:`${n}${L} — ${n} бөлік, ${m2}${L} — ${m2} бөлік.`,
      expl:`${n}${L} + ${m2}${L} = ${n+m2}${L}. Сан — ${n+m2}.`};
  });
},

/* TE-18,19 — like terms */
like_terms(p,lvl){
  return tries(()=>{
    const m=rnd(2,lvl===1?4:9), n=rnd(2,lvl===1?4:9); if(m===n) return null;
    const x=rnd(2,lvl===1?6:12);
    if(p.mode==='sum'){
      const k=lvl===1?rnd(4,20):R(p.k,[10,60]); const c=(m+n)*x+k;
      const shown=[m,n,k,c];
      if(!clean(x,...shown,m+n)) return null;
      if(new Set(shown).size!==shown.length) return null;
      const q={stem:`${m}x + ${n}x + ${k} = ${c}. x-ті тап.`, ans:String(x),
        h1:'Бірдей әріпті мүшелерді бірікті: барлығы неше бөлік?',
        h2:`${m}x + ${n}x = ${m+n}x`,
        steps:[{label:'Барлық бөлік',expr:`${m} + ${n}`,val:String(m+n)},{label:'x',expr:`(${c} − ${k}) : ${m+n}`,val:String(x)}],
        expl:`${m}x + ${n}x = ${m+n}x. ${m+n}x = ${c} − ${k} = ${(m+n)*x}. x = ${x}.`};
      if(lvl<3){ q.fig={type:'bar_equal',fp:`${(m+n)*x};${m+n};?`}; Object.assign(q,numChoices(x,[m+n,x+1,c-k,Math.max(1,x-1)])); }
      else q.kind='input';
      return q;
    }
    const mm=rnd(3,lvl===1?4:9), d=mm-1, c=rnd(2,lvl===1?5:12), T=d*x*c;
    const shown=[mm,T,c];
    if(T>20000) return null;
    if(!clean(x,...shown,d,d*x)) return null;
    if(new Set(shown).size!==shown.length) return null;
    const q={stem:`${T} : (${mm}x − x) = ${c}. x-ті тап.`, ans:String(x),
      h1:'Алдымен жақша ішіндегі бірдей мүшелерді бірікті. x — бұл 1x.',
      h2:`${mm}x − x = ${d}x`,
      steps:[{label:'Жақшаны бірікті',expr:`${mm} − 1`,val:String(d)},{label:'Жақшаның мәні',expr:`${T} : ${c}`,val:String(d*x)},{label:'x',expr:`${d*x} : ${d}`,val:String(x)}],
      expl:`${mm}x − x = ${d}x. ${T} : ${d}x = ${c} → ${d}x = ${d*x} → x = ${x}.`};
    if(lvl<3){ q.fig={type:'bar_equal',fp:`${d*x};${d};?`}; Object.assign(q,numChoices(x,[d,c,d*x,x+1])); }
    else q.kind='input';
    return q;
  });
},

/* TE-20 — two wrappers, peeled outside in */
dbl_wrap(p,lvl){
  return tries(()=>{
    const b=rnd(2,lvl===1?3:6), d=rnd(2,lvl===1?3:6); if(b===d) return null;
    const q0=lvl===1?rnd(3,9):lvl===2?rnd(5,20):rnd(10,90);
    const a=lvl===1?rnd(2,9):rnd(5,60);
    const inner=b*q0, x=inner-a, e=q0*d;
    if(x<2) return null;
    const shown=[a,b,d,e];
    if(!clean(x,...shown,q0,inner)) return null;
    if(new Set(shown).size!==shown.length) return null;
    const qq={stem:`(x + ${a}) : ${b} · ${d} = ${e}. x-ті тап.`, ans:String(x),
      h1:'Сырттан ішке қарай аш: ең соңғы амалды бірінші қайтар.',
      h2:`Ортаңғы мән = ${e} : ${d} = ${q0}`,
      steps:[{label:'Ортаңғы мән',expr:`${e} : ${d}`,val:String(q0)},{label:'Жақшаның мәні',expr:`${q0} · ${b}`,val:String(inner)},{label:'x',expr:`${inner} − ${a}`,val:String(x)}],
      expl:`${e} : ${d} = ${q0}. ${q0} · ${b} = ${inner}. x = ${inner} − ${a} = ${x}.`};
    if(lvl<3){ qq.fig={type:'bar',fp:`?;${a};${inner}`}; Object.assign(qq,numChoices(x,[inner,q0,x+a,Math.max(1,x-1)])); }
    else { qq.kind='input'; qq.hfig={type:'bar',fp:`?;${a};${inner}`}; }
    return qq;
  });
},
};
