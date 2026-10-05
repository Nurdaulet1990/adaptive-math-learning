/* wp/families.js — problem-structure families (WP families restructure, 2026-10). Owner: Nurdaulet.
   A family = one bar-model shape. The scaffold (Сурет → Берілгені → Шешуі → Мәтін) fades PER FAMILY:
   every new family in a stage starts again at the grade's lowest scaffold level, so a pupil always meets
   a new problem structure with the bar model first.
   FAMILIES[stage] = [{id, name, tpls:[template ids]}, …] in teaching order. Template ids are stable (bank.js). */
'use strict';
const FAMILIES={
 'WP-01':[  /* owner, 2026-10-05: join and take-away are learnt apart first; «same bar, other unknown» is met in review and the mixed test */
  {id:'ADD',name:'Қосу · бөліктерден бүтін', tpls:['TP-01-01','TP-01-09','TP-01-02','TP-01-17','TP-01-23']},
  {id:'SUB',name:'Азайту · бүтіннен бөлік',  tpls:['TP-01-03','TP-01-10','TP-01-11','TP-01-12','TP-01-13','TP-01-14','TP-01-16','TP-01-24','TP-01-25']},
  {id:'CMP',name:'Салыстыру',                tpls:['TP-01-04','TP-01-15','TP-01-05','TP-01-06','TP-01-07','TP-01-08','TP-01-18','TP-01-19','TP-01-20','TP-01-21','TP-01-22']},
 ],
 'WP-02':[
  {id:'CHG',  name:'Өзгеріс белгісіз',   tpls:['TP-02-01','TP-02-04','TP-02-07','TP-02-03','TP-02-11']},
  {id:'START',name:'Алғашқысы белгісіз', tpls:['TP-02-02','TP-02-05','TP-02-06','TP-02-10','TP-02-08','TP-02-09']},
 ],
 'WP-03':[
  {id:'MUL', name:'Тең топтар · көбейту',  tpls:['TP-03-01','TP-03-04','TP-03-07','TP-03-08','TP-03-11','TP-03-13']},
  {id:'DIVP',name:'Бөлу · әрқайсысына',    tpls:['TP-03-05','TP-03-02','TP-03-10','TP-03-12','TP-03-14']},
  {id:'DIVQ',name:'Бөлу · топтап',         tpls:['TP-03-06','TP-03-03','TP-03-15']},
 ],
 'WP-04':[
  {id:'TIMES',name:'Неше есе?',            tpls:['TP-04-01','TP-04-07','TP-04-08','TP-04-11']},
  {id:'BIG',  name:'Есе артық → көбейту',  tpls:['TP-04-02','TP-04-06','TP-04-10','TP-04-04']},
  {id:'SMALL',name:'Есе кем → бөлу',       tpls:['TP-04-05','TP-04-03','TP-04-09']},
 ],
 'WP-05':[
  {id:'AS2', name:'Қосу-азайту · екі амал',     tpls:['TP-05-01','TP-05-05','TP-05-06','TP-05-07','TP-05-08','TP-05-09','TP-05-13']},
  {id:'MAS', name:'Көбейту мен қосу-азайту',    tpls:['TP-05-02','TP-05-03','TP-05-04','TP-05-10']},
  {id:'DAS', name:'Бөлу мен қосу-азайту',       tpls:['TP-05-11','TP-05-12']},
 ],
 'WP-06':[
  {id:'CHAIN',name:'Тізбекті салыстыру',   tpls:['TP-06-01','TP-06-02','TP-06-03','TP-06-04','TP-06-06']},
  {id:'MIX',  name:'Күрделі салыстыру',    tpls:['TP-06-05','TP-06-07','TP-06-08']},
 ],
 'WP-07':[
  {id:'PQC', name:'Баға · саны · құны',    tpls:['TP-07-01','TP-07-05','TP-07-02','TP-07-03','TP-07-06']},
  {id:'TWO', name:'Екі тауар',             tpls:['TP-07-07','TP-07-11','TP-07-10']},
  {id:'SAME',name:'Бірдей шама',           tpls:['TP-07-04','TP-07-08','TP-07-09']},
 ],
 'WP-08':[
  {id:'SUMX', name:'Қосындысы мен есесі',   tpls:['TP-08-01','TP-08-03','TP-08-06']},
  {id:'SUMD', name:'Қосындысы мен айырымы', tpls:['TP-08-02','TP-08-04','TP-08-07','TP-08-09']},
  {id:'DIFX', name:'Айырымы мен есесі',     tpls:['TP-08-05','TP-08-08']},
 ],
 'WP-09':[
  {id:'SVT', name:'Жылдамдық · уақыт · қашықтық', tpls:['TP-09-01','TP-09-02','TP-09-03','TP-09-07','TP-09-08','TP-09-09']},
  {id:'WORK',name:'Өнімділік · уақыт · жұмыс',    tpls:['TP-09-04','TP-09-05','TP-09-06','TP-09-10']},
 ],
 'WP-10':[
  {id:'MEET', name:'Қарама-қарсы қозғалыс', tpls:['TP-10-01','TP-10-02','TP-10-05']},
  {id:'CHASE',name:'Бір бағытта · қуып жету',tpls:['TP-10-03','TP-10-06']},
  {id:'JOINT',name:'Бірлесіп жұмыс',        tpls:['TP-10-04','TP-10-07']},
  {id:'FLOW', name:'Ағыспен · ағысқа қарсы',tpls:['TP-10-08','TP-10-09']},
 ],
 'WP-11':[
  {id:'PART', name:'Бөлшектен бөлік табу',      tpls:['TP-11-01','TP-11-03','TP-11-05','TP-11-06','TP-11-07','TP-11-09']},
  {id:'WHOLE',name:'Бөлік арқылы бүтін табу',   tpls:['TP-11-02','TP-11-04','TP-11-08']},
 ],
 'WP-12':[
  {id:'SUM2', name:'Екі қосынды',  tpls:['TP-12-01','TP-12-03','TP-12-04']},
  {id:'DIF2', name:'Екі айырма',   tpls:['TP-12-02','TP-12-05','TP-12-06']},
 ],
 'WP-13':[
  {id:'PCT', name:'Пайыздан бөлік табу',      tpls:['TP-13-01','TP-13-02','TP-13-03','TP-13-05','TP-13-07','TP-13-08','TP-13-09']},
  {id:'BASE',name:'Пайызды / бүтінді табу',   tpls:['TP-13-04','TP-13-06']},
 ],
};
/* how many right in a row to leave each scaffold level (owner, 2026-10): L1→L2 6 · L2→L3 6 · L3→L4 5 · L4 done 5 */
const FAM_NEED={1:6,2:6,3:5,4:5};
const FAM_REVIEW=0.2;   /* share of practice questions drawn from an already finished family (review) */
const FAM_TEST_PER=3;   /* mixed stage test: questions per family */
function famsOf(st){ return FAMILIES[st]||[]; }
function famOfTpl(tplId){ for(const st in FAMILIES){ for(const f of FAMILIES[st]){ if(f.tpls.includes(tplId)) return f.id; } } return null; }
function famName(st,fid){ const f=famsOf(st).find(x=>x.id===fid); return f?f.name:fid; }
