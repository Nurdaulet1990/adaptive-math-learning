/* Есеп жолы · core/figs.js v1.0 — shared drawings for every route.
   API: renderFig(type, params) → HTML string. Colours come from ui.css variables, so figures follow light/dark themes.
   Types: objects, objects_rows, array, bar, bars, unit_bar, diff_bar, bar_equal, bar_compare, dist, table3, table, short_note, meet, same, frac, pct, clock.
   Param formats are documented next to each function. Owner: platform owner — routes add their own drawings in <route>/figs.js. */
(function(){
'use strict';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
function emojiRow(label, spec, icon){
  // spec: "4" | "4+2" | "6-3" | "?"
  let html='<div class="emoji-row">'+(label?'<span class="lbl">'+esc(label)+'</span>':'');
  if(spec==='?'){ html+='<span class="q">?</span>'; return html+'</div>'; }
  const m=spec.match(/^(\d+)(?:([+\-])(\d+))?$/); if(!m) return html+esc(spec)+'</div>';
  const a=+m[1], op=m[2], b=m[3]?+m[3]:0;
  const lim=x=>Math.min(x,24);
  if(op==='-'){ for(let i=0;i<lim(a);i++) html+='<span class="'+(i>=a-b?'x':'')+'">'+icon+'</span>'; }
  else { for(let i=0;i<lim(a);i++) html+='<span>'+icon+'</span>'; if(op==='+') for(let i=0;i<lim(b);i++) html+='<span class="hi">'+icon+'</span>'; }
  return html+'</div>';
}
function figObjects(fp){ const [icon,a,b,op]=fp.split(';'); const A=+a,B=+b;
  if(op==='-') return emojiRow('', A+'-'+B, icon);
  return '<div class="emoji-row">'+emojiRow('',String(A),icon).replace(/^<div class="emoji-row">|<\/div>$/g,'')+'<span class="plus">+</span>'+emojiRow('',String(B),icon).replace(/^<div class="emoji-row">|<\/div>$/g,'')+'</div>'; }
function figObjectsRows(fp){ const parts=fp.split(';'); const icon=parts[0]; return parts.slice(1).map(p=>{ const [l,s]=p.split(':'); return emojiRow(l,s,icon); }).join(''); }
function figArray(fp){ const [icon,r,c]=fp.split(';'); let h=''; for(let i=0;i<+r;i++) h+=emojiRow('',String(+c),icon); return h; }
const SVG=(w,h,inner)=>`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,sans-serif" font-weight="800" font-size="15">${inner}</svg>`;
function brace(x1,x2,y,label,below=true){ const mid=(x1+x2)/2, d=below?1:-1; return `<path d="M${x1},${y} q0,${8*d} 8,${8*d} L${mid-6},${y+8*d} q6,0 6,${6*d} q0,${-6*d} 6,${-6*d} L${x2-8},${y+8*d} q8,0 8,${-8*d}" fill="none" stroke="var(--stroke)" stroke-width="1.5"/><text x="${mid}" y="${y+(below?30:-18)}" text-anchor="middle" fill="var(--ink)">${esc(label)}</text>`; }
function figBar(fp){ // "34;28;?" or "9x3;?" (equal arcs)
  const parts=fp.split(';'); let total=parts.pop(); const segs=[];
  parts.forEach(p=>{ const m=p.match(/^(\d+)x(\d+)$/); if(m){ for(let i=0;i<+m[2];i++) segs.push(+m[1]); } else segs.push(p); });
  const nums=segs.map(s=>isNaN(+s)?null:+s); const known=nums.filter(x=>x!==null);
  const W=320, H=90, x0=20; const widths=nums.map(n=>n===null?Math.max(50,W*0.3):Math.max(34,(n/(known.reduce((a,b)=>a+b,0)||1))*(W-40)));
  const sum=widths.reduce((a,b)=>a+b,0); const scale=(W-40)/sum; let x=x0, inner='';
  segs.forEach((s,i)=>{ const w=widths[i]*scale; inner+=`<rect x="${x}" y="20" width="${w}" height="30" fill="${i%2?'var(--seg2)':'var(--seg1)'}" stroke="var(--stroke)" stroke-width="1.5"/><text x="${x+w/2}" y="41" text-anchor="middle" fill="var(--ink)">${esc(s)}</text>`; x+=w; });
  inner+=brace(x0,x,52,total);
  return SVG(W,H,inner);
}
function figBars(fp){ // "1-қатар:24;2-қатар:24,+6;3-қатар:?;Барлығы:?"   segments may be "4x6" (4 groups of 6)
  const rows=fp.split(';').map(r=>{ const i=r.indexOf(':'); return [r.slice(0,i),r.slice(i+1)]; });
  const totalRow=rows.find(r=>/Барлығы|Барлығында/i.test(r[0])); const data=rows.filter(r=>r!==totalRow);
  const nums=[]; data.forEach(([l,v])=>{ const parts=v.split(','); let base=isNaN(+parts[0])?null:+parts[0]; let groups=null; const gm=parts[0].match(/^(\d+)x(\d+)$/); if(gm){ groups=[+gm[1],+gm[2]]; base=groups[0]*groups[1]; } let delta=0; parts.slice(1).forEach(p=>{ const m=p.match(/^([+\-])(\d+)$/); if(m) delta+=(m[1]==='+'?1:-1)*+m[2]; }); nums.push({label:l,base,delta,groups,raw:v}); });
  const maxv=Math.max(...nums.map(n=>(n.base||0)+Math.max(0,n.delta)),10);
  /* The total's brace lives to the RIGHT of the bars, so the bars have to stop short of the edge and
     leave it room. They used to run to W−20 while the brace was drawn at W−14 and its label pinned to
     W−2 with text-anchor="end" — so the label sat on top of the bars and ran off the viewBox: «63 кг»
     was simply not on the screen. The gutter is reserved before anything is scaled. (2026-09-22) */
  const W=340, rowH=42, H=rowH*data.length+ (totalRow?36:8), lx=110;
  const RG=totalRow?78:20, scale=(W-lx-RG)/maxv; let inner='';
  nums.forEach((n,i)=>{ const y=8+i*rowH; inner+=`<text x="${lx-8}" y="${y+20}" text-anchor="end" fill="var(--ink)" font-size="14">${esc(n.label)}</text>`;
    if(n.base===null){ inner+=`<rect x="${lx}" y="${y}" width="${Math.max(60,maxv*scale*0.5)}" height="28" fill="none" stroke="var(--stroke)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${lx+Math.max(60,maxv*scale*0.5)/2}" y="${y+20}" text-anchor="middle" fill="var(--ink)">?</text>`; return; }
    const bw=n.base*scale;
    if(n.groups){ const [g,k]=n.groups, gw=k*scale; for(let j=0;j<g;j++) inner+=`<rect x="${lx+j*gw}" y="${y}" width="${gw}" height="28" fill="${i%2?'var(--seg2)':'var(--seg1)'}" stroke="var(--stroke)" stroke-width="1.5"/><text x="${lx+j*gw+gw/2}" y="${y+20}" text-anchor="middle" fill="var(--ink)" font-size="13">${k}</text>`; }
    else inner+=`<rect x="${lx}" y="${y}" width="${bw}" height="28" fill="${i%2?'var(--seg2)':'var(--seg1)'}" stroke="var(--stroke)" stroke-width="1.5"/><text x="${lx+bw/2}" y="${y+20}" text-anchor="middle" fill="var(--ink)">${n.base}</text>`;
    if(n.delta>0){ const dw=n.delta*scale; inner+=`<rect x="${lx+bw}" y="${y}" width="${dw}" height="28" fill="none" stroke="var(--stroke)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${lx+bw+dw/2}" y="${y+20}" text-anchor="middle" fill="var(--ink)" font-size="13">+${n.delta}</text>`; }
    if(n.delta<0){ const dw=-n.delta*scale; inner+=`<rect x="${lx+bw-dw}" y="${y}" width="${dw}" height="28" fill="var(--fig)" stroke="var(--stroke)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${lx+bw-dw/2}" y="${y+20}" text-anchor="middle" fill="var(--ink)" font-size="13">−${-n.delta}</text>`; }
  });
  if(totalRow){ const y=8+data.length*rowH-14, bx=W-RG+10;
    inner+=`<path d="M${bx},8 q8,0 8,8 L${bx+8},${y/2} q0,6 6,6 q-6,0 -6,6 L${bx+8},${y} q0,8 -8,8" fill="none" stroke="var(--stroke)" stroke-width="1.5"/><text x="${bx+20}" y="${y/2+14}" text-anchor="start" fill="var(--ink)" font-size="13">${esc(totalRow[1])}</text>`; }
  return SVG(W,H,inner);
}
function figUnitBar(fp){ // "Дана:1;Әсем:3;Барлығы:8"
  const rows=fp.split(';').map(r=>{ const i=r.indexOf(':'); return [r.slice(0,i),r.slice(i+1)]; });
  const tot=rows.find(r=>/Барлығы/i.test(r[0])); const data=rows.filter(r=>r!==tot);
  const maxu=Math.max(...data.map(r=>+r[1])); const W=340,lx=100,uw=Math.min(60,(W-lx-30)/maxu),rowH=42; let inner='';
  data.forEach(([l,u],i)=>{ const y=8+i*rowH; inner+=`<text x="${lx-8}" y="${y+20}" text-anchor="end" fill="var(--ink)" font-size="14">${esc(l)}</text>`; for(let k=0;k<+u;k++) inner+=`<rect x="${lx+k*uw}" y="${y}" width="${uw}" height="28" fill="${i%2?'var(--seg2)':'var(--seg1)'}" stroke="var(--stroke)" stroke-width="1.5"/>`; });
  const H=8+data.length*rowH+(tot?8:0); if(tot){ const y=data.length*rowH; inner+=`<path d="M${lx+maxu*uw+6},8 q8,0 8,8 L${lx+maxu*uw+14},${y/2} q0,6 6,6 q-6,0 -6,6 L${lx+maxu*uw+14},${y} q0,8 -8,8" fill="none" stroke="var(--stroke)" stroke-width="1.5"/><text x="${lx+maxu*uw+26}" y="${y/2+14}" fill="var(--ink)" font-size="13">${esc(tot[1])}</text>`; }
  return SVG(W,H,inner);
}
function figDiffBar(fp){ // "2-қорап:?;1-қорап:?,+2;Барлығы:10"
  const rows=fp.split(';').map(r=>{ const i=r.indexOf(':'); return [r.slice(0,i),r.slice(i+1)]; });
  const tot=rows.find(r=>/Барлығы/i.test(r[0])); const data=rows.filter(r=>r!==tot);
  const W=340,lx=100,base=120,rowH=42; let inner='';
  data.forEach(([l,v],i)=>{ const y=8+i*rowH; const m=v.match(/,\+(\d+)/); inner+=`<text x="${lx-8}" y="${y+20}" text-anchor="end" fill="var(--ink)" font-size="14">${esc(l)}</text><rect x="${lx}" y="${y}" width="${base}" height="28" fill="${i%2?'var(--seg2)':'var(--seg1)'}" stroke="var(--stroke)" stroke-width="1.5"/><text x="${lx+base/2}" y="${y+20}" text-anchor="middle" fill="var(--ink)">?</text>`;
    if(m){ inner+=`<rect x="${lx+base}" y="${y}" width="70" height="28" fill="var(--whole)" stroke="var(--stroke)" stroke-width="1.5"/><text x="${lx+base+35}" y="${y+20}" text-anchor="middle" fill="var(--ink)" font-size="13">${m[1]}</text>`; } });
  const H=8+data.length*rowH+8; if(tot){ const y=data.length*rowH; const bx=lx+base+80; inner+=`<path d="M${bx},8 q8,0 8,8 L${bx+8},${y/2} q0,6 6,6 q-6,0 -6,6 L${bx+8},${y} q0,8 -8,8" fill="none" stroke="var(--stroke)" stroke-width="1.5"/><text x="${bx+20}" y="${y/2+14}" fill="var(--ink)" font-size="13">${esc(tot[1])}</text>`; }
  return SVG(W,H,inner);
}
function figBarEqual(fp){ // "18;6;?"  or "18;?;3"
  const [total,n,each]=fp.split(';'); const W=320,x0=20; let inner='';
  const cell=(x,w,i)=>`<rect x="${x}" y="20" width="${w}" height="30" fill="${i%2?'var(--seg2)':'var(--seg1)'}" stroke="var(--stroke)" stroke-width="1.5"/><text x="${x+w/2}" y="41" text-anchor="middle" fill="var(--ink)" font-size="13">${esc(each)}</text>`;
  if(isNaN(+n)){
    /* HOW MANY cells is the question. This used to draw exactly four — so "18 ; ? ; 3" showed 4 cells of 3 under a
       brace of 18 (a picture of 12), the drawn count matched the answer only when the answer happened to be 4, and
       "4" sat among the choices as a decoy the picture voted for. Now: two cells, a dashed gap of unknown length, a last cell. */
    const w=56; inner+=cell(x0,w,0)+cell(x0+w,w,1)+cell(W-20-w,w,0)
      +`<rect x="${x0+2*w}" y="20" width="${W-40-3*w}" height="30" fill="none" stroke="var(--stroke)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W/2}" y="41" text-anchor="middle" fill="var(--muted)" font-size="16">…</text>`
      +`<text x="${W/2}" y="14" text-anchor="middle" fill="var(--muted)" font-size="13">? қорап</text>`;
  } else { const N=+n, w=(W-40)/N; for(let i=0;i<N;i++) inner+=cell(x0+i*w,w,i); }
  inner+=brace(x0,W-20,52,total);
  return SVG(W,92,inner);
}
function figBarCompare(fp){ const [a,n]=fp.split(';'); return figUnitBar(`Кішісі:1;Үлкені:${n};Барлығы:`).replace('Барлығы:','') + '<div class="note center">1 бөлік = '+esc(a)+'</div>'; }
function figDist(fp){ const [v,t,s]=fp.split(';'); const W=340; let inner=`<line x1="30" y1="46" x2="310" y2="46" stroke="var(--stroke)" stroke-width="2"/><polygon points="310,46 300,40 300,52" fill="var(--stroke)"/><text x="170" y="24" text-anchor="middle" fill="var(--accent)">${esc(v)}</text><text x="40" y="70" fill="var(--muted)" font-size="13">${esc(t)}</text><text x="300" y="70" text-anchor="end" fill="var(--ink)">${esc(s)}</text>`; return SVG(W,80,inner); }
function figTable3(fp){ const rows=fp.split(';').map(r=>{ const i=r.indexOf(':'); return [r.slice(0,i),r.slice(i+1)]; }); return '<table class="t3"><tr>'+rows.map(r=>'<th>'+esc(r[0])+'</th>').join('')+'</tr><tr>'+rows.map(r=>'<td>'+esc(r[1])+'</td>').join('')+'</tr></table>'; }
function figShortNote(fp){ return '<div class="short">'+fp.split(';').map(esc).join('\n')+'</div>'; }
function figMeet(fp){ // "60 км/сағ;40 км/сағ;3 сағ;? км"  (toward each other) — 4th = total distance or "?"
  const [v1,v2,t,s]=fp.split(';'); const W=340; let inner=`<line x1="20" y1="56" x2="320" y2="56" stroke="var(--stroke)" stroke-width="2"/>
  <circle cx="20" cy="56" r="4" fill="var(--stroke)"/><circle cx="320" cy="56" r="4" fill="var(--stroke)"/><circle cx="170" cy="56" r="5" fill="var(--gold)" stroke="var(--stroke)"/>
  <path d="M30,40 L120,40" stroke="var(--accent)" stroke-width="2.5"/><polygon points="120,40 110,34 110,46" fill="var(--accent)"/><text x="75" y="30" text-anchor="middle" fill="var(--accent)" font-size="14">${esc(v1)}</text>
  <path d="M310,40 L220,40" stroke="var(--bad)" stroke-width="2.5"/><polygon points="220,40 230,34 230,46" fill="var(--bad)"/><text x="265" y="30" text-anchor="middle" fill="var(--bad)" font-size="14">${esc(v2)}</text>
  <text x="170" y="80" text-anchor="middle" fill="var(--muted)" font-size="13">${esc(t)}</text>`+brace(20,320,90,s||'?');
  return SVG(W,130,inner); }
function figSame(fp){ // "60 км/сағ;40 км/сағ;3 сағ;?" (same direction from one point; gap = ?)
  const [v1,v2,t,s]=fp.split(';'); const W=340; let inner=`<line x1="20" y1="60" x2="320" y2="60" stroke="var(--stroke)" stroke-width="2"/><circle cx="20" cy="60" r="4" fill="var(--stroke)"/>
  <path d="M20,34 L290,34" stroke="var(--accent)" stroke-width="2.5"/><polygon points="290,34 280,28 280,40" fill="var(--accent)"/><text x="150" y="24" text-anchor="middle" fill="var(--accent)" font-size="14">${esc(v1)}</text>
  <path d="M20,86 L180,86" stroke="var(--bad)" stroke-width="2.5"/><polygon points="180,86 170,80 170,92" fill="var(--bad)"/><text x="100" y="106" text-anchor="middle" fill="var(--bad)" font-size="14">${esc(v2)}</text>
  <text x="300" y="106" text-anchor="end" fill="var(--muted)" font-size="13">${esc(t)}</text>
  <rect x="180" y="52" width="110" height="16" fill="none" stroke="var(--stroke)" stroke-dasharray="4 3"/><text x="235" y="65" text-anchor="middle" fill="var(--ink)" font-size="13">${esc(s||'?')}</text>`;
  return SVG(W,116,inner); }
function figFrac(fp){ // "5;2;30;?"  b parts, a shaded, whole label, part label ("?" where unknown)
  const [b,a,whole,part]=fp.split(';'); const B=+b,A=+a; const W=320,x0=20,w=(W-40)/B; let inner='';
  for(let i=0;i<B;i++) inner+=`<rect x="${x0+i*w}" y="34" width="${w}" height="30" fill="${i<A?'var(--seg1)':'var(--card)'}" stroke="var(--stroke)" stroke-width="1.5"/>`;
  inner+=brace(x0,x0+A*w,30,part,false)+brace(x0,W-20,66,whole);
  return SVG(W,110,inner); }
function figPct(fp){ // "3;20 оқушы;?" → 10 cells (10% each), first n shaded, whole label, part label
  const [n,whole,part]=fp.split(';'); const N=+n; const W=320,x0=20,w=(W-40)/10; let inner='';
  for(let i=0;i<10;i++) inner+=`<rect x="${x0+i*w}" y="34" width="${w}" height="30" fill="${i<N?'var(--seg2)':'var(--card)'}" stroke="var(--stroke)" stroke-width="1.5"/><text x="${x0+i*w+w/2}" y="54" text-anchor="middle" fill="var(--muted)" font-size="10">10%</text>`;
  inner+=brace(x0,x0+N*w,30,part,false)+brace(x0,W-20,66,whole);
  return SVG(W,110,inner); }
function figTable(fp){ // "Бағасы|Саны|Құны;200 тг|3|?;250 тг|2|?" — first row is the header
  const rows=fp.split(';').map(r=>r.split('|')); return '<table class="t3"><tr>'+rows[0].map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr>'+rows.slice(1).map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</table>'; }
function figClock(fp){ // "3;? сағ;7"  start hour, label, end hour — number line of hours
  const [a,lbl,b]=fp.split(';'); const A=+a,B=+b; const W=320,x0=20,w=(W-40)/12; let inner=`<line x1="${x0}" y1="52" x2="${W-20}" y2="52" stroke="var(--stroke)" stroke-width="2"/>`;
  for(let h=0;h<=12;h++){ inner+=`<line x1="${x0+h*w}" y1="46" x2="${x0+h*w}" y2="58" stroke="var(--stroke)"/><text x="${x0+h*w}" y="74" text-anchor="middle" fill="var(--muted)" font-size="11">${h}</text>`; }
  inner+=`<circle cx="${x0+A*w}" cy="52" r="5" fill="var(--accent)"/><circle cx="${x0+B*w}" cy="52" r="5" fill="var(--bad)"/>`+brace(x0+A*w,x0+B*w,32,lbl,false);
  return SVG(W,84,inner); }
function renderFig(fig,fp){
  try{
    switch(fig){
      case 'meet': return figMeet(fp);
      case 'same': return figSame(fp);
      case 'frac': return figFrac(fp);
      case 'pct': return figPct(fp);
      case 'table': return figTable(fp);
      case 'clock': return figClock(fp);
      case 'objects': return figObjects(fp);
      case 'objects_rows': return figObjectsRows(fp);
      case 'array': return figArray(fp);
      case 'bar': return figBar(fp);
      case 'bars': return figBars(fp);
      case 'unit_bar': return figUnitBar(fp);
      case 'diff_bar': return figDiffBar(fp);
      case 'bar_equal': return figBarEqual(fp);
      case 'bar_compare': return figBarCompare(fp);
      case 'dist': return figDist(fp);
      case 'table3': return figTable3(fp);
      case 'short_note': return figShortNote(fp);
      default: return '';
    }
  }catch(e){ return ''; }
}
window.renderFig=renderFig; window.emojiRow=emojiRow;
})();
