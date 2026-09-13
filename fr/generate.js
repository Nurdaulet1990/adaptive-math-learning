/* fr/generate.js — question generators for the FR route. Owner: assistant.
   GENERATORS[type](params, lvl) → question (see core/runner.js header). Pure: no DOM, no Core.
   lvl 1 = concrete (shapes, small numbers), 2 = pictorial (bar/number line, bigger numbers), 3 = abstract (text only). */
'use strict';
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const shuffle=a=>a.slice().sort(()=>Math.random()-.5);
const range=(p,def)=>{ const r=p||def; return rnd(r[0],r[1]); };
const F=(n,d)=>`${n}/${d}`;
const shape=(d,n,lvl)=>lvl===1?pick([{type:'pie',d,n},{type:'bar',d,n}]):pick([{type:'grid',d,n},{type:'bar',d,n},{type:'pie',d,n}]);
/* build choices: values + HTML; correct first, then distinct distractors */
function fracChoices(correct, distractors){ const seen=new Set([correct.v]); const out=[correct]; for(const c of distractors){ if(!seen.has(c.v)&&out.length<4){ seen.add(c.v); out.push(c); } }
  const mixed=shuffle(out); return {choices:mixed.map(c=>c.v), choiceHTML:mixed.map(c=>c.h)}; }
const fc=(n,d)=>({v:F(n,d),h:fracHTML(n,d)});
const numChoices=(ans,ds)=>{ const s=new Set([ans]); ds.forEach(x=>{ if(x>0&&s.size<4) s.add(x); }); while(s.size<4) s.add(ans+rnd(1,5)); const arr=shuffle([...s]); return {choices:arr.map(String)}; };

const GENERATORS={
  /* FR-01 shaded part → fraction */
  shade(p,lvl){
    const d=lvl===1?rnd(2,6):lvl===2?rnd(4,Math.max(6,(p.d||[2,10])[1])):range(p.d,[3,10]); const n=rnd(1,d-1);
    const q={ans:F(n,d), ansHTML:fracHTML(n,d), h1:'Бөлімі — барлық тең бөлік саны. Алымы — боялған бөлік саны.',
      steps:[{label:'Бөлімі',expr:'барлық бөлік саны',val:String(d)},{label:'Алымы',expr:'боялған бөлік саны',val:String(n)}],
      expl:`Барлығы ${d} тең бөлік, оның ${n}-і боялған → ${n}/${d}.`};
    if(lvl<3){ q.stem='Боялған бөлікті білдіретін бөлшекті таңда.'; q.fig=shape(d,n,lvl); Object.assign(q,fracChoices(fc(n,d),[fc(d-n,d),fc(n,d+1),fc(Math.min(n+1,d),d),fc(d,n)])); }
    else { q.stem=`Фигура ${d} тең бөлікке бөлінген, оның ${n} бөлігі боялған. Боялған бөлікті бөлшекпен жаз (мысалы 2/5).`; q.kind='input'; q.hfig={type:'bar',d,n}; }
    return q; },

  /* FR-02 compare: same denominator (lvl1-2) or same numerator (lvl3 sometimes) */
  compare(p,lvl){
    let d1,d2,n1,n2; const sameNum=lvl===3&&Math.random()<0.5;
    if(sameNum){ n1=n2=rnd(1,4); d1=rnd(n1+1,9); do{ d2=rnd(n1+1,12); }while(d2===d1); }
    else { d1=d2=lvl===1?rnd(3,8):range(p.d,[3,12]); n1=rnd(1,d1-1); n2=rnd(1,d1-1); if(lvl===1&&n1===n2) n2=n1===1?2:n1-1; }
    const v1=n1/d1,v2=n2/d2; const ans=v1>v2?'>':v1<v2?'<':'=';
    const q={stem:'Бос орынға тиісті белгіні таңда.', exprHTML:`${fracHTML(n1,d1)}<span class="q">?</span>${fracHTML(n2,d2)}`, kind:'choice', choices:['>','<','='], ans,
      h1:sameNum?'Алымдары бірдей: бөлімі кіші болса — бөлік үлкен, демек бөлшек үлкен.':'Бөлімдері бірдей: алымы үлкені — үлкен бөлшек.',
      h2:sameNum?`Бөлімдерін салыстыр: ${d1} және ${d2}`:`Алымдарын салыстыр: ${n1} және ${n2}`,
      expl:sameNum?`Бөлімі ${d1<d2?d1:d2} кіші → бөлігі үлкен: ${n1}/${d1} ${ans} ${n2}/${d2}.`:`Бөлімдері бірдей (${d1}). ${n1} ${ans} ${n2}, демек ${n1}/${d1} ${ans} ${n2}/${d2}.`};
    if(lvl===1) q.fig={type:'twobars',d1,n1,d2,n2}; else if(lvl===2) q.hfig={type:'twobars',d1,n1,d2,n2};
    return q; },

  /* FR-03 equivalent fractions n1/d1 = ?/d2 */
  equiv(p,lvl){
    const d1=lvl===1?rnd(2,4):range(p.d,[2,8]); const n1=rnd(1,d1-1); const k=lvl===1?2:range(p.k,[2,4]); const n2=n1*k,d2=d1*k;
    const askDen=lvl===3&&Math.random()<0.4; const ans=askDen?String(d2):String(n2);
    const q={stem:'Сұрақ белгісінің орнындағы санды тап.', exprHTML:askDen?`${fracHTML(n1,d1)} = <span class="frac"><b>${n2}</b><i class="q">?</i></span>`:`${fracHTML(n1,d1)} = <span class="frac"><b class="q">?</b><i>${d2}</i></span>`, ans,
      h1:'Алымы мен бөлімін бір санға көбейтсең, бөлшектің мәні өзгермейді.',
      steps:askDen?[{label:'Неше есе үлкейді',expr:`${n2} : ${n1}`,val:String(k)},{label:'Бөлімі',expr:`${d1} · ${k}`,val:String(d2)}]:[{label:'Неше есе үлкейді',expr:`${d2} : ${d1}`,val:String(k)},{label:'Алымы',expr:`${n1} · ${k}`,val:String(n2)}],
      expl:`${d1} → ${d2}: ${k} есе үлкейді. Алымын да ${k}-ге көбейтеміз: ${n1} · ${k} = ${n2}. ${n1}/${d1} = ${n2}/${d2}.`};
    if(lvl===1){ q.fig={type:'twobars',d1,n1,d2,n2}; }
    else if(lvl===2){ q.fig={type:'bar',d:d1,n:n1}; q.hfig={type:'twobars',d1,n1,d2,n2}; } else q.hfig={type:'twobars',d1,n1,d2,n2};
    if(lvl<3) Object.assign(q,numChoices(n2,[n2+1,Math.max(1,n2-1),n2+k,n1+k])); else q.kind='input';
    return q; },

  /* FR-04 number line: read a point (lvl1), place a point (lvl2, custom), text (lvl3) */
  numberline(p,lvl){
    const d=lvl===1?rnd(3,6):range(p.d,[3,10]); const n=rnd(1,d-1);
    const q={ans:F(n,d), ansHTML:fracHTML(n,d), h1:`0 мен 1 арасы ${d} тең бөлікке бөлінген, әр бөлік — 1/${d}. Нүктеге дейін неше бөлік?`,
      steps:[{label:'Бөлімі (бөлік саны)',expr:'0 мен 1 арасындағы бөлік саны',val:String(d)},{label:'Алымы',expr:'0-ден нүктеге дейінгі бөлік саны',val:String(n)}], expl:`Әр бөлік 1/${d}, нүкте ${n}-ші белгіде → ${n}/${d}.`};
    if(lvl===1){ q.stem='Сан сәулесіндегі нүкте қай бөлшекті көрсетеді?'; q.fig={type:'numberline',d,n,showLabels:d<=6}; Object.assign(q,fracChoices(fc(n,d),[fc(n+1,d),fc(Math.max(1,n-1),d),fc(n,d+1),fc(d-n,d)])); }
    else if(lvl===2){ q.stem=`Нүктені жылжытып, сәуледе ${n}/${d} бөлшегін белгіле.`; q.kind='custom'; q.hfig={type:'numberline',d,n:undefined,showPoint:false,showLabels:true};
      q.mount=(el,submit)=>{ let cur=0; const draw=()=>{ el.innerHTML=`<div class="fig" id="nlbox">${FIGS.numberline({d,n:cur,showLabels:false})}</div><div class="row"><span class="note" style="flex:1;align-self:center">Таңдалған: ${fracHTML(cur,d)}</span><button class="btn" id="nlok">Жауапты тексеру</button></div>`;
          const svg=el.querySelector('svg'); const move=ev=>{ const r=svg.getBoundingClientRect(); const x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left; const scale=r.width/(360); const pos=Math.round((x/scale-20)/(320/d)); const v=Math.max(0,Math.min(d,pos)); if(v!==cur){ cur=v; draw(); } };
          svg.style.cursor='pointer'; svg.onclick=move; svg.ontouchmove=e=>{ e.preventDefault(); move(e); }; el.querySelector('#nlok').onclick=()=>submit(F(cur,d)); }; draw(); }; }
    else { q.stem=`0 мен 1 арасы ${d} тең бөлікке бөлінген. 0-ден бастап ${n}-ші белгі қай бөлшекті көрсетеді? (жауапты 2/5 түрінде жаз)`; q.kind='input'; q.hfig={type:'numberline',d,n,showLabels:true}; }
    return q; },

  /* FR-05 add / subtract with the same denominator */
  addsub(p,lvl){
    const d=lvl===1?rnd(3,8):range(p.d,[4,15]); const add=Math.random()<0.5; let n1,n2,res;
    if(add){ n1=rnd(1,d-2); n2=rnd(1,d-1-n1); res=n1+n2; } else { n1=rnd(2,d-1); n2=rnd(1,n1-1); res=n1-n2; }
    const op=add?'+':'−';
    const q={stem:add?'Қосындыны тап.':'Айырманы тап.', exprHTML:`${fracHTML(n1,d)}<span>${op}</span>${fracHTML(n2,d)}<span>=</span><span class="q">?</span>`, ans:F(res,d), ansHTML:fracHTML(res,d),
      h1:'Бөлімдері бірдей: бөлімі сол күйінде қалады, тек алымдарын '+(add?'қосамыз':'азайтамыз')+'.', steps:[{label:'Алымы',expr:`${n1} ${op} ${n2}`,val:String(res)}],
      expl:`${n1}/${d} ${op} ${n2}/${d} = (${n1} ${op} ${n2})/${d} = ${res}/${d}.`};
    if(lvl===1){ q.fig={type:'twobars',d1:d,n1,d2:d,n2,label1:`${n1}/${d}`,label2:`${n2}/${d}`}; }
    else q.hfig={type:'twobars',d1:d,n1,d2:d,n2,label1:`${n1}/${d}`,label2:`${n2}/${d}`};
    if(lvl<3) Object.assign(q,fracChoices(fc(res,d),[fc(res,2*d),fc(add?res+1:res-1||res+1,d),fc(add?n1:n1+n2,d),fc(res,d-1)])); else q.kind='input';
    return q; },

  /* FR-06 improper → mixed */
  mixed(p,lvl){
    const d=lvl===1?rnd(2,4):range(p.d,[3,8]); const whole=lvl===1?rnd(1,2):range(p.w,[1,5]); const rem=rnd(1,d-1); const top=whole*d+rem;
    const q={stem:'Бұрыс бөлшекті аралас сан түрінде жаз.', exprHTML:`${fracHTML(top,d)}<span>=</span><span class="q">?</span>`, ans:`${whole} ${rem}/${d}`, ansHTML:mixedHTML(whole,rem,d),
      h1:`${top}-де неше толық ${d} бар? Қалдығы — бөлшек бөлігінің алымы.`,
      steps:[{label:'Бүтін бөлігі',expr:`${top} : ${d} (толық бүтіндер)`,val:String(whole)},{label:'Қалдығы',expr:`${top} − ${whole} · ${d}`,val:String(rem)}],
      expl:`${top} : ${d} = ${whole} (қалдық ${rem}). Демек ${top}/${d} = ${whole} ${rem}/${d}.`};
    if(lvl===1) q.fig={type:'circles',whole,rem,d}; else q.hfig={type:'circles',whole,rem,d};
    if(lvl<3){ const mc=(w,n)=>({v:`${w} ${n}/${d}`,h:mixedHTML(w,n,d)}); Object.assign(q,fracChoices(mc(whole,rem),[mc(whole+1,rem),mc(whole,rem===1?Math.min(2,d-1):1),mc(rem,Math.min(whole,d-1)),mc(whole-1>0?whole-1:whole+2,rem)])); }
    else q.kind='input';
    return q; },

  /* FR-07 fraction of a number */
  part_of(p,lvl){
    const d=lvl===1?rnd(2,4):range(p.d,[2,8]); const k=lvl===1?rnd(2,4):range(p.k,[2,9]); const total=d*k; const m=lvl===3?rnd(1,d-1):1; const ans=k*m;
    const item=pick([['алма','🍎'],['кәмпит','🍬'],['шар','🎈'],['кітап','📚'],['қалам','✏️']]);
    const fr=m===1?`1/${d}`:`${m}/${d}`;
    const q={stem:`${item[0].charAt(0).toUpperCase()+item[0].slice(1)} ${total} дана. Оның ${fr} бөлігі берілді. Неше ${item[0]} берілді?`, ans:String(ans),
      h1:`Алдымен ${total}-ді ${d} тең бөлікке бөл — бір бөлігі шығады.${m>1?` Сосын ${m} бөлікті ал.`:''}`,
      steps:m===1?[{label:'Бір бөлігі',expr:`${total} : ${d}`,val:String(k)}]:[{label:'Бір бөлігі',expr:`${total} : ${d}`,val:String(k)},{label:`${m} бөлігі`,expr:`${k} · ${m}`,val:String(ans)}],
      expl:`${total} : ${d} = ${k}${m>1?`, ${k} · ${m} = ${ans}`:''}. Жауабы: ${ans} ${item[0]}.`};
    if(lvl===1) q.fig={type:'groups',total,d,icon:item[1]}; else if(lvl===2) q.fig={type:'bar_equal',fp:`${total};${d};?`}; else q.hfig={type:'bar_equal',fp:`${total};${d};?`};
    if(lvl<3) Object.assign(q,numChoices(ans,[ans+1,Math.max(1,ans-1),ans*2,total-ans])); else q.kind='input';
    return q; },
};
