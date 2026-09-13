/* fr/figs.js — fraction drawings for the FR route. Owner: assistant.
   FIGS[type](fig) → HTML/SVG string. Used by core/runner.js when a question has fig:{type,...}.
   Colours come from core/ui.css variables so light/dark themes work. */
'use strict';
const fracHTML=(n,d)=>`<span class="frac"><b>${n}</b><i>${d}</i></span>`;
const mixedHTML=(w,n,d)=>`<span class="mixed">${w}${fracHTML(n,d)}</span>`;
const FIGS={
  /* pie: {d, n, size?} — circle cut into d equal sectors, first n shaded */
  pie(f){ const d=f.d, n=f.n, S=f.size||120, c=S/2, r=c-4; let s=`<svg viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`;
    if(d===1) return s+`<circle cx="${c}" cy="${c}" r="${r}" fill="${n?'var(--seg1)':'var(--card)'}" stroke="var(--stroke)" stroke-width="2"/></svg>`;
    const a=2*Math.PI/d; for(let i=0;i<d;i++){ const a1=i*a-Math.PI/2, a2=(i+1)*a-Math.PI/2; const x1=c+r*Math.cos(a1),y1=c+r*Math.sin(a1),x2=c+r*Math.cos(a2),y2=c+r*Math.sin(a2); s+=`<path d="M${c},${c} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${a>Math.PI?1:0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${i<n?'var(--seg1)':'var(--card)'}" stroke="var(--stroke)" stroke-width="1.5"/>`; }
    return s+'</svg>'; },
  /* bar: {d, n, w?} — strip cut into d parts, first n shaded */
  bar(f){ const d=f.d,n=f.n,W=f.w||280,H=44,pw=W/d; let s=`<svg viewBox="0 0 ${W+4} ${H+4}" width="${W+4}" height="${H+4}">`; for(let i=0;i<d;i++) s+=`<rect x="${2+i*pw}" y="2" width="${pw}" height="${H}" fill="${i<n?'var(--seg2)':'var(--card)'}" stroke="var(--stroke)" stroke-width="1.5"/>`; return s+'</svg>'; },
  /* grid: {d, n} — square split into cells */
  grid(f){ const d=f.d,n=f.n,cols=Math.ceil(Math.sqrt(d)),rows=Math.ceil(d/cols),S=120,cw=S/cols,ch=S/rows; let s=`<svg viewBox="0 0 ${S+4} ${S+4}" width="${S+4}" height="${S+4}">`; for(let i=0;i<d;i++){ const r=Math.floor(i/cols),c=i%cols; s+=`<rect x="${2+c*cw}" y="${2+r*ch}" width="${cw}" height="${ch}" fill="${i<n?'var(--seg1)':'var(--card)'}" stroke="var(--stroke)" stroke-width="1.5"/>`; } return s+'</svg>'; },
  /* twobars: {d1,n1,d2,n2, label1?, label2?} — two strips one under another (compare / equivalent) */
  twobars(f){ const W=280,H=36,g=14; const row=(d,n,y,lab)=>{ const pw=W/d; let s=''; for(let i=0;i<d;i++) s+=`<rect x="${2+i*pw}" y="${y}" width="${pw}" height="${H}" fill="${i<n?(y<50?'var(--seg1)':'var(--seg2)'):'var(--card)'}" stroke="var(--stroke)" stroke-width="1.5"/>`; if(lab) s+=`<text x="${W+10}" y="${y+H/2+5}" font-size="14" font-weight="800" fill="var(--ink)">${lab}</text>`; return s; };
    return `<svg viewBox="0 0 ${W+60} ${2*H+g+6}" width="${W+60}" height="${2*H+g+6}" font-family="Nunito,sans-serif">${row(f.d1,f.n1,2,f.label1||'')}${row(f.d2,f.n2,2+H+g,f.label2||'')}</svg>`; },
  /* numberline: {d, n, showPoint?, showLabels?} — 0..1 split into d parts; point at n/d when showPoint */
  numberline(f){ const d=f.d,W=320,x0=20,step=W/d; let s=`<svg viewBox="0 0 ${W+40} 80" width="${W+40}" height="80" font-family="Nunito,sans-serif"><line x1="${x0}" y1="40" x2="${x0+W}" y2="40" stroke="var(--stroke)" stroke-width="3"/>`;
    for(let i=0;i<=d;i++){ const x=x0+i*step; s+=`<line x1="${x}" y1="30" x2="${x}" y2="50" stroke="var(--stroke)" stroke-width="2"/>`; if(i===0||i===d) s+=`<text x="${x}" y="70" text-anchor="middle" font-size="15" font-weight="800" fill="var(--ink)">${i===0?0:1}</text>`; else if(f.showLabels) s+=`<text x="${x}" y="68" text-anchor="middle" font-size="11" font-weight="800" fill="var(--muted)">${i}/${d}</text>`; }
    if(f.showPoint!==false&&f.n!==undefined) s+=`<circle cx="${x0+f.n*step}" cy="40" r="8" fill="var(--bad)" stroke="var(--card)" stroke-width="2"/>`;
    return s+'</svg>'; },
  /* circles: {whole, rem, d} — `whole` full pies + one pie with `rem` of d shaded (mixed numbers) */
  circles(f){ let h='<div class="row" style="align-items:center;gap:8px;justify-content:center">'; for(let i=0;i<f.whole;i++) h+=FIGS.pie({d:f.d,n:f.d,size:72}); if(f.rem) h+=FIGS.pie({d:f.d,n:f.rem,size:72}); return h+'</div>'; },
  /* groups: {total, d, icon} — total objects arranged in d equal rows (part of a number) */
  groups(f){ const per=f.total/f.d; let h=''; for(let r=0;r<f.d;r++){ h+='<div class="emoji-row">'; for(let i=0;i<per;i++) h+=`<span class="${r===0?'hi':''}">${f.icon||'🍎'}</span>`; h+='</div>'; } return h; },
};
