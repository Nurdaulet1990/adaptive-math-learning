/* wp/generate.js — template engine for WP: word lists, Kazakh case endings, variable binding, filling.
   Pure: no DOM, no Core. Entry point: generate(tpl) → question object or null. Owner: Nurdaulet.
   Template fields (from bank.js): id, stage, lvl, diff, qtype, vars, cons, stem, alt[], ans, dis, mids, fig, fp, h1, h2, expl, hfig, hfp, steps[] */
'use strict';
const NAMES = [
 ['Айгүл','Айгүлде','Айгүлден','Айгүлге'],['Дана','Данада','Данадан','Данаға'],['Марат','Маратта','Мараттан','Маратқа'],
 ['Ерлан','Ерланда','Ерланнан','Ерланға'],['Сәкен','Сәкенде','Сәкеннен','Сәкенге'],['Әсем','Әсемде','Әсемнен','Әсемге'],
 ['Болат','Болатта','Болаттан','Болатқа'],['Аружан','Аружанда','Аружаннан','Аружанға'],['Санжар','Санжарда','Санжардан','Санжарға'],
 ['Алия','Алияда','Алиядан','Алияға'],['Нұрлан','Нұрланда','Нұрланнан','Нұрланға'],['Камила','Камилада','Камиладан','Камилаға'],
 ['Тимур','Тимурда','Тимурдан','Тимурға'],['Айдос','Айдоста','Айдостан','Айдосқа'],['Әсет','Әсетте','Әсеттен','Әсетке'],
 ['Мәдина','Мәдинада','Мәдинадан','Мәдинаға'],['Сырым','Сырымда','Сырымнан','Сырымға'],['Әлия','Әлияда','Әлиядан','Әлияға'],
];
// item: nom, emoji, ACC, ABL, DAT, category (obj|food|animal|bird|plant), GEN, ADD (came/got), TAKE (left/given), BE (existence verb)
const ITEMS = [
 ['алма','🍎','алманы','алмадан','алмаға','food','алманың','әкелінді','сатылды','бар'],
 ['алмұрт','🍐','алмұртты','алмұрттан','алмұртқа','food','алмұрттың','әкелінді','сатылды','бар'],
 ['шар','🎈','шарды','шардан','шарға','obj','шардың','әкелінді','ұшып кетті','бар'],
 ['кітап','📚','кітапты','кітаптан','кітапқа','obj','кітаптың','әкелінді','берілді','тұр'],
 ['қалам','✏️','қаламды','қаламнан','қаламға','obj','қаламның','әкелінді','берілді','бар'],
 ['гүл','🌸','гүлді','гүлден','гүлге','plant','гүлдің','отырғызылды','үзілді','өсіп тұр'],
 ['балық','🐟','балықты','балықтан','балыққа','animal','балықтың','жүзіп келді','жүзіп кетті','жүзіп жүр'],
 ['кәмпит','🍬','кәмпитті','кәмпиттен','кәмпитке','food','кәмпиттің','әкелінді','таратылды','бар'],
 ['дәптер','📒','дәптерді','дәптерден','дәптерге','obj','дәптердің','әкелінді','берілді','бар'],
 ['доп','⚽','допты','доптан','допқа','obj','доптың','әкелінді','алынды','жатыр'],
 ['құс','🐦','құсты','құстан','құсқа','bird','құстың','ұшып келді','ұшып кетті','жүр'],
 ['көбелек','🦋','көбелекті','көбелектен','көбелекке','bird','көбелектің','ұшып келді','ұшып кетті','ұшып жүр'],
 ['банан','🍌','бананды','бананнан','бананға','food','бананның','әкелінді','сатылды','бар'],
 ['жұлдыз','⭐','жұлдызды','жұлдыздан','жұлдызға','obj','жұлдыздың','жапсырылды','түсіп қалды','бар'],
 ['печенье','🍪','печеньені','печеньеден','печеньеге','food','печеньенің','пісірілді','таратылды','бар'],
 ['үйрек','🦆','үйректі','үйректен','үйрекке','bird','үйректің','келді','кетті','жүр'],
 ['тауық','🐔','тауықты','тауықтан','тауыққа','bird','тауықтың','келді','кетті','жүр'],
 ['қоян','🐇','қоянды','қояннан','қоянға','animal','қоянның','келді','кетті','отыр'],
 ['сәбіз','🥕','сәбізді','сәбізден','сәбізге','food','сәбіздің','жиналды','сатылды','бар'],
 ['қияр','🥒','қиярды','қиярдан','қиярға','food','қиярдың','жиналды','сатылды','бар'],
];
// goods with price: nom, emoji, ACC, ABL, DAT, GEN
const GOODS = [
 ['дәптер','📒','дәптерді','дәптерден','дәптерге','дәптердің'],['қалам','✏️','қаламды','қаламнан','қаламға','қаламның'],['өшіргіш','🧽','өшіргішті','өшіргіштен','өшіргішке','өшіргіштің'],
 ['сызғыш','📏','сызғышты','сызғыштан','сызғышқа','сызғыштың'],['альбом','📔','альбомды','альбомнан','альбомға','альбомның'],['шар','🎈','шарды','шардан','шарға','шардың'],
 ['самса','🥟','самсаны','самсадан','самсаға','самсаның'],['балмұздақ','🍦','балмұздақты','балмұздақтан','балмұздаққа','балмұздақтың'],
 ['кітап','📚','кітапты','кітаптан','кітапқа','кітаптың'],['ойыншық','🧸','ойыншықты','ойыншықтан','ойыншыққа','ойыншықтың'],
];
// containers: nom, LOC, DAT, ABL, GEN, plural-DAT, plural-LOC, LOC-adjective (қораптағы)
const CONTAINERS = [
 ['қорап','қорапта','қорапқа','қораптан','қораптың','қораптарға','қораптарда','қораптағы'],['себет','себетте','себетке','себеттен','себеттің','себеттерге','себеттерде','себеттегі'],
 ['сөре','сөреде','сөреге','сөреден','сөренің','сөрелерге','сөрелерде','сөредегі'],['жәшік','жәшікте','жәшікке','жәшіктен','жәшіктің','жәшіктерге','жәшіктерде','жәшіктегі'],
 ['қапшық','қапшықта','қапшыққа','қапшықтан','қапшықтың','қапшықтарға','қапшықтарда','қапшықтағы'],['ыдыс','ыдыста','ыдысқа','ыдыстан','ыдыстың','ыдыстарға','ыдыстарда','ыдыстағы'],
];
// moving subjects: nom, GEN, verb-past, verb-future
const MOVERS = [
 ['Автобус','автобустың','жүрді','жүреді'],['Пойыз','пойыздың','жүрді','жүреді'],['Автокөлік','автокөліктің','жүрді','жүреді'],['Жүк көлігі','жүк көлігінің','жүрді','жүреді'],['Мотоциклші','мотоциклшінің','жүрді','жүреді'],
];
// workers (efficiency): nom, unit-item, GEN, unit-ACC
const WORKERS = [
 ['Шебер','бөлшек','шебердің','бөлшекті'],['Станок','бөлшек','станоктың','бөлшекті'],['Тігінші','көйлек','тігіншінің','көйлекті'],['Наубайшы','бәліш','наубайшының','бәлішті'],['Жұмысшы','кірпіш','жұмысшының','кірпішті'],['Принтер','бет','принтердің','бетті'],
];
const CITIES = ['Астана','Алматы','Шымкент','Қарағанды','Ақтөбе','Тараз','Павлодар','Өскемен','Семей','Атырау','Қостанай','Қызылорда'];
const DAYS = [['дүйсенбі','сейсенбі'],['сейсенбі','сәрсенбі'],['сәрсенбі','бейсенбі'],['бейсенбі','жұма'],['таңертең','кешке'],['кеше','бүгін'],['бірінші күні','екінші күні']];
/* ── Kazakh endings on numerals ── */
const DAT = {1:'-ге',2:'-ге',3:'-ке',4:'-ке',5:'-ке',6:'-ға',7:'-ге',8:'-ге',9:'-ға',10:'-ға',20:'-ға',30:'-ға',40:'-қа',50:'-ге',60:'-қа',70:'-ке',80:'-ге',90:'-ға',100:'-ге',1000:'-ға'};
function datSuffix(n){ n=Math.abs(n); if(n%10) return DAT[n%10]; if(n%100) return DAT[n%100]; if(n%1000) return DAT[n%1000]||DAT[100]; return DAT[1000]; }
const POSS_SMALL={1:'-еуі',2:'-еуі',3:'-еуі',4:'-еуі',5:'-еуі',6:'-ауы',7:'-еуі'};
const POSS_D={0:'',1:'-і',2:'-сі',3:'-і',4:'-і',5:'-і',6:'-сы',7:'-сі',8:'-і',9:'-ы'};
const POSS_T={10:'-ы',20:'-сы',30:'-ы',40:'-ы',50:'-і',60:'-ы',70:'-і',80:'-і',90:'-ы',100:'-і',1000:'-ы'};
function possSuffix(n){ n=Math.abs(n); if(n<=7&&n>=1) return POSS_SMALL[n]; if(n%10) return POSS_D[n%10]; if(n%100) return POSS_T[n%100]; if(n%1000) return POSS_T[100]; return POSS_T[1000]; }
const ABL_D={1:'-ден',2:'-ден',3:'-тен',4:'-тен',5:'-тен',6:'-дан',7:'-ден',8:'-ден',9:'-дан'};
const ABL_T={10:'-нан',20:'-дан',30:'-дан',40:'-тан',50:'-ден',60:'-тан',70:'-тен',80:'-нен',90:'-нан',100:'-ден'};
function ablSuffix(n){ n=Math.abs(n); if(n%10) return ABL_D[n%10]; if(n%100) return ABL_T[n%100]; return ABL_T[100]; }
const REDUP={2:'екі-екіден',3:'үш-үштен',4:'төрт-төрттен',5:'бес-бестен',6:'алты-алтыдан',7:'жеті-жетіден',8:'сегіз-сегізден',9:'тоғыз-тоғыздан',10:'он-оннан'};
const FRAC_WORD={'1/2':'жартысы','1/4':'ширегі','1/3':'үштен бірі','1/5':'бестен бірі','1/6':'алтыдан бірі','1/7':'жетіден бірі','1/8':'сегізден бірі','1/9':'тоғыздан бірі','1/10':'оннан бірі'};
const ORD={1:'бірінші',2:'екінші',3:'үшінші',4:'төртінші',5:'бесінші',6:'алтыншы',7:'жетінші',8:'сегізінші',9:'тоғызыншы',10:'оныншы'};

/* phrasing variants per template (used when the template has no .alt of its own) */
const VARIANTS = {
 'TP-01-01':['{name_LOC} {a} {item} бар. Тағы {b} {item} алды. Барлығы неше {item} болды?','Себетте {a} {item} болды. Оған тағы {b} {item} салынды. Себетте барлығы неше {item} болды?','{name1_LOC} {a} {item}, ал {name2_LOC} {b} {item} бар. Екеуінде барлығы неше {item} бар?','{name} {a} {item} және тағы {b} {item} алды. {name} барлығы неше {item} алды?'],
 'TP-01-02':['{name_LOC} {a} {item} бар. Тағы {b} {item} алды. Барлығы неше {item} болды?','Дүкенге таңертең {a} {item}, ал түсте {b} {item} әкелінді. Дүкенге барлығы неше {item} әкелінді?','{name1} {a} {item}, ал {name2} {b} {item} жинады. Екеуі бірге неше {item} жинады?'],
 'TP-01-03':['{name_LOC} {a} {item} болды. {b} {item} берді. Неше {item} қалды?','Себетте {a} {item} болды. Оның {b}-і алынды. Себетте неше {item} қалды?','{name_LOC} {a} {item} болды. Ол {b} {item} досына сыйлады. {name_LOC} неше {item} қалды?'],
 'TP-01-04':['{name1_LOC} {a} {item}, ал {name2_LOC} {b} {item} бар. {name1_LOC} {name2_ABL} неше {item} артық?','{name1_LOC} {a} {item}, ал {name2_LOC} {b} {item} бар. {name2_LOC} {name1_ABL} неше {item} кем?','{name1} {a} {item}, ал {name2} {b} {item} жинады. {name1} {name2_ABL} қанша {item} артық жинады?'],
 'TP-01-05':['{name1_LOC} {a} {item} бар. {name2_LOC} {name1_ABL} {b} {item} артық. {name2_LOC} неше {item} бар?','{name1} {a} {item}, ал {name2} одан {b} {item} артық жинады. {name2} неше {item} жинады?','Бірінші сөреде {a} {item}, ал екіншісінде біріншіге қарағанда {b} {item} артық. Екінші сөреде неше {item} бар?'],
 'TP-01-06':['{name1_LOC} {a} {item} бар. {name2_LOC} {name1_ABL} {b} {item} кем. {name2_LOC} неше {item} бар?','{name1} {a} {item}, ал {name2} одан {b} {item} кем жинады. {name2} неше {item} жинады?','Бірінші қорапта {a} {item}, ал екіншісінде одан {b} {item} кем. Екінші қорапта неше {item} бар?'],
 'TP-02-01':['{name_LOC} {a} {item} болды. Тағы бірнеше {item} алғаннан кейін {c} {item} болды. {name} неше {item} алды?','Себетте {a} {item} болды. Оған тағы бірнеше {item} салғанда {c} {item} болды. Себетке неше {item} салынды?'],
 'TP-02-02':['{name_LOC} бірнеше {item} болды. {b} {item} бергеннен кейін {c} {item} қалды. Бастапқыда неше {item} болды?','Себетте бірнеше {item} болды. Оның {b}-і алынғанда, себетте {c} {item} қалды. Себетте бастапқыда неше {item} болған?'],
 'TP-03-01':['{name} {n} қорапқа {k} {item_ABL} салды. Барлығы неше {item} салды?','{n} қораптың әрқайсысында {k} {item_ABL} бар. Қораптарда барлығы неше {item} бар?','Әр себетте {k} {item_ABL} бар. {n} себетте неше {item} бар?'],
 'TP-03-02':['{total} {item_ACC} {n} балаға тең бөлді. Әр балаға неше {item} тиді?','{total} {item_ACC} {n} қорапқа теңдей бөліп салды. Әр қорапқа неше {item_ABL} салынды?'],
 'TP-03-03':['{total} {item_ACC} қораптарға салды, әр қорапқа {k} {item_ABL}. Неше қорап керек болды?','{total} {item_ACC} балаларға {k}-{k}ден үлестірді. Неше бала {item} алды?'],
 'TP-04-02':['{name1_LOC} {a} {item} бар. {name2_LOC} {name1_ABL} {n} есе артық. {name2_LOC} неше {item} бар?','{name1} {a} {item}, ал {name2} одан {n} есе артық {item} жинады. {name2} неше {item} жинады?'],
 'TP-04-03':['{name1_LOC} {b} {item} бар. {name2_LOC} {name1_ABL} {n} есе кем. {name2_LOC} неше {item} бар?','Дүкенде {b} {item} және одан {n} есе кем {item2} сатылды. Дүкенде неше {item2} сатылды?'],
 'TP-05-01':['{name_LOC} {a} {item} болды. {b} {item} берді, сосын тағы {c} {item} алды. Қазір {name_LOC} неше {item} бар?','Себетте {a} {item} болды. Оның {b}-і алынды, содан кейін тағы {c} {item} салынды. Себетте енді неше {item} болды?'],
 'TP-07-01':['Бір {item} {p} теңге тұрады. {name} {n} {item} сатып алды. {name} қанша теңге төледі?','{name} {p} теңгеден {n} {item} сатып алды. Ол барлығы қанша теңге төледі?'],
 'TP-09-01':['{vehicle} сағатына {v} км жылдамдықпен {t} сағат жүрді. Ол қанша километр жол жүрді?','{vehicle} {v} км/сағ жылдамдықпен қозғалды. {t} сағат ішінде ол қандай арақашықтықты жүріп өтеді?'],
};
const MIDS={'TP-05-01':['a-b'],'TP-05-02':['n*k'],'TP-05-03':['n1*k1','n2*k2'],'TP-05-04':['p1*n1','p2*n2']};

/* ── engine ── */
const rnd = (a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick = arr=>arr[Math.floor(Math.random()*arr.length)];
function parseVars(spec){
  const out=[];
  spec.split(';').forEach(s=>{ s=s.trim(); if(!s) return; const m=s.match(/^(\w+):(.+)$/); if(!m) return;
    const [_,name,rest]=m;
    if(rest.startsWith('=')) out.push({name,derive:rest.slice(1)});
    else if(/^[A-Z_]+$/.test(rest)) out.push({name,list:rest});
    else { const mm=rest.match(/^(\d+)-(\d+)(\|step(\d+))?$/); if(mm) out.push({name,lo:+mm[1],hi:+mm[2],step:mm[4]?+mm[4]:1}); }
  });
  return out;
}
function evalExpr(expr, env){
  const keys=Object.keys(env).filter(k=>/^[a-zA-Z_]\w*$/.test(k));
  try{ return Function(...keys, 'return ('+expr+');')(...keys.map(k=>env[k])); }catch(e){ return NaN; }
}
function takenOf(env,re){ return new Set(Object.keys(env).filter(k=>re.test(k)).map(k=>env[k])); }
function pickNew(arr,taken){ let w,guard=0; do{ w=pick(arr); guard++; }while(taken.has(w[0])&&guard<30); return w; }
function bindWords(env, name, list){
  const item=(w)=>{ env[name]=w[0]; env[name+'_emoji']=w[1]; env[name+'_ACC']=w[2]; env[name+'_ABL']=w[3]; env[name+'_DAT']=w[4]; env[name+'_cat']=w[5]; env[name+'_GEN']=w[6]; env[name+'_ADD']=w[7]; env[name+'_TAKE']=w[8]; env[name+'_BE']=w[9]; };
  if(list==='NAMES'){ const w=pickNew(NAMES,takenOf(env,/^name\d*$/)); env[name]=w[0]; env[name+'_LOC']=w[1]; env[name+'_ABL']=w[2]; env[name+'_DAT']=w[3]; }
  else if(list==='ITEMS'){ item(pickNew(ITEMS,takenOf(env,/^item\d*$/))); }
  else if(list==='FOOD'||list==='OBJ'||list==='LIVE'){ const pool=ITEMS.filter(i=>list==='FOOD'?i[5]==='food':list==='OBJ'?(i[5]==='obj'||i[5]==='food'):((i[5]==='animal'||i[5]==='bird')&&i[0]!=='балық')); item(pickNew(pool,takenOf(env,/^item\d*$/))); }
  else if(list==='GOODS'){ const w=pickNew(GOODS,takenOf(env,/^(item|good)\d*$/)); env[name]=w[0]; env[name+'_emoji']=w[1]; env[name+'_ACC']=w[2]; env[name+'_ABL']=w[3]; env[name+'_DAT']=w[4]; env[name+'_GEN']=w[5]; env[name+'_cat']='obj'; }
  else if(list==='CONTAINERS'){ const w=pickNew(CONTAINERS,takenOf(env,/^box\d*$/)); const cap=x=>x[0].toUpperCase()+x.slice(1); env[name]=w[0]; env[name+'_LOC']=w[1]; env[name+'_DAT']=w[2]; env[name+'_ABL']=w[3]; env[name+'_GEN']=w[4]; env[name+'_PLDAT']=w[5]; env[name+'_PLLOC']=w[6]; env[name+'_LOCADJ']=w[7]; env[name+'_Loc']=cap(w[1]); env[name+'_PLLoc']=cap(w[6]); env[name+'_LocAdj']=cap(w[7]); }
  else if(list==='VEHICLES'||list==='MOVERS'){ const w=pickNew(MOVERS,takenOf(env,/^(vehicle|mover)\d*$/)); env[name]=w[0]; env[name+'_GEN']=w[1]; env[name+'_V']=w[2]; env[name+'_VF']=w[3]; env[name+'_low']=w[0].toLowerCase(); }
  else if(list==='WORKERS'){ const w=pickNew(WORKERS,takenOf(env,/^worker\d*$/)); env[name]=w[0]; env[name+'_unit']=w[1]; env[name+'_GEN']=w[2]; env[name+'_unitACC']=w[3]; env[name+'_low']=w[0].toLowerCase(); }
  else if(list==='CITIES'){ const t=takenOf(env,/^city\d*$/); let c; do{ c=pick(CITIES);}while(t.has(c)); env[name]=c; }
  else if(list==='DAYS'){ const w=pick(DAYS); env[name]=w[0]; env[name+'2']=w[1]; }
}
function fmtNum(x){ if(typeof x!=='number') return String(x); if(Number.isInteger(x)) return String(x); return String(Math.round(x*100)/100).replace('.',','); }
function fill(s, env){
  return s.replace(/\{DAT_(\w+)\}/g,(m,v)=>datSuffix(env[v]))
          .replace(/\{POSS_(\w+)\}/g,(m,v)=>possSuffix(env[v]))
          .replace(/\{ABL_(\w+)\}/g,(m,v)=>ablSuffix(env[v]))
          .replace(/\{REDUP_(\w+)\}/g,(m,v)=>REDUP[env[v]]||(env[v]+'-'+env[v]+'ден'))
          .replace(/\{ORD_(\w+)\}/g,(m,v)=>ORD[env[v]]||env[v]+'-')
          .replace(/\{FRACW_(\w+)_(\w+)\}/g,(m,a,b)=>FRAC_WORD[env[a]+'/'+env[b]]||(env[b]+'ден '+env[a]))
          .replace(/\{(\w+)\}/g,(m,k)=>k in env?fmtNum(env[k]):m);
}
function generate(tpl){
  const vars=parseVars(tpl.vars);
  for(let attempt=0;attempt<60;attempt++){
    const env={};
    for(const v of vars){ if(v.list) bindWords(env,v.name,v.list); }
    for(const v of vars){ if(v.lo!==undefined){ const n=Math.floor((v.hi-v.lo)/v.step); env[v.name]=v.lo+v.step*rnd(0,n); } }
    for(const v of vars){ if(v.derive){ env[v.name]=evalExpr(v.derive,env); } }
    let ok=true;
    for(const c of tpl.cons.split(';')){ const t=c.trim(); if(!t) continue;
      if(t.includes('!=')){ const [x,y]=t.split('!=').map(s=>s.trim()); const vx=(x in env)?env[x]:evalExpr(x,env), vy=(y in env)?env[y]:evalExpr(y,env); if(vx===vy) {ok=false;break;} continue; }
      if(!evalExpr(t,env)) {ok=false;break;} }
    if(!ok) continue;
    const ans=evalExpr(tpl.ans,env); if(!Number.isFinite(ans)||ans<=0||!Number.isInteger(ans*100)) continue;
    env.ans=ans;
    const mids=tpl.mids?tpl.mids.split(';').map(s=>s.trim()).filter(Boolean):(MIDS[tpl.id]||[]); mids.forEach((e,i)=>{ env['m'+(i+1)]=evalExpr(e,env); });
    const stems=[tpl.stem].concat(tpl.alt||VARIANTS[tpl.id]||[]); const stemRaw=pick(stems);
    const need=new Set((stemRaw.match(/\{(\w+?)(?:_[A-Za-z]+)?\}/g)||[]).map(x=>x.replace(/[{}]/g,'').replace(/_(LOC|Loc|ABL|DAT|ACC|GEN|ADD|TAKE|BE|V|VF|low|unitACC|unit|emoji|cat)$/,'')));
    for(const b of need){ if(b in env) continue;
      if(/^name\d*$/.test(b)) bindWords(env,b,'NAMES'); else if(/^item\d*$/.test(b)) bindWords(env,b,'ITEMS'); else if(/^good\d*$/.test(b)) bindWords(env,b,'GOODS');
      else if(/^box\d*$/.test(b)) bindWords(env,b,'CONTAINERS'); else if(/^(vehicle|mover)\d*$/.test(b)) bindWords(env,b,'MOVERS'); else if(/^worker\d*$/.test(b)) bindWords(env,b,'WORKERS'); else if(/^city\d*$/.test(b)) bindWords(env,b,'CITIES'); else if(b==='day') bindWords(env,b,'DAYS'); }
    const stem=fill(stemRaw,env).replace(/(^|[.!?]\s+)(\S)/g,(m,p,c)=>p+c.toUpperCase());
    let choices=null;
    if(tpl.qtype==='选择'||Math.random()<0.35){
      const ds=new Set(); tpl.dis.split(';').forEach(d=>{ let [e,flag]=d.split('|').map(s=>s.trim()); let v=evalExpr(e,env); if(!Number.isFinite(v)) return; if(flag==='abs') v=Math.abs(v); if(flag==='pos'&&v<=0) return; v=Math.round(v*100)/100; if(v!==ans&&v>0) ds.add(v); });
      while(ds.size<3){ const v=ans+rnd(1,6)*(Math.random()<.5?1:-1); if(v>0&&v!==ans) ds.add(v); }
      choices=[...ds].slice(0,3).concat([ans]).sort(()=>Math.random()-.5).map(fmtNum);
    }
    return {id:tpl.id+'#'+Date.now().toString(36)+rnd(0,999),tpl:tpl.id,stage:tpl.stage,lvl:tpl.lvl,diff:tpl.diff,kind:'练习题',qtype:choices?'选择':'填数',
      stem,choices:choices||[],ans:fmtNum(ans),fig:tpl.fig,fp:fill(tpl.fp,env),h1:fill(tpl.h1,env),h2:fill(tpl.h2,env),expl:fill(tpl.expl,env),gen:true,
      hfig:tpl.hfig||'',hfp:fill(tpl.hfp||'',env),
      steps:(tpl.steps||[]).map(st=>({label:fill(st.label,env),expr:fill(st.expr,env),val:fmtNum(env[st.val])}))};
  }
  return null;
}
