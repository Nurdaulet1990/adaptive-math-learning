/* te/figs.js — the one drawing core/figs.js cannot do: a core bar with one outer step.
   Everything else (bar, bar_equal) comes from core/figs.js — see MAP.md. */
'use strict';
const FIGS={
  /* {type:'wrap', core:'a+x'|'x+a'|'a-x'|'x-a', a, x, v, b, w:'o-b'|'b+o'|'o+b'|'b-o'|'o/b'|'b*o'|'o*b'|'b/o'} */
  wrap(f){
    const U=14, H=30, pad=10, esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const seg=(x,y,n,fill,lab)=>`<rect x="${x}" y="${y}" width="${n*U}" height="${H}" fill="${fill}" stroke="var(--stroke)" stroke-width="1.5"/><text x="${x+n*U/2}" y="${y+20}" text-anchor="middle" fill="var(--ink)" font-size="13">${esc(lab)}</text>`;
    const x0=24, y0=34; let inner='', w=f.v;
    /* the core, inside a tray — the tray says "all of this is one thing" */
    if(f.core==='a+x')      inner+=seg(x0,y0,f.a,'var(--seg2)',f.a)+seg(x0+f.a*U,y0,f.x,'var(--seg1)','x');
    else if(f.core==='x+a') inner+=seg(x0,y0,f.x,'var(--seg1)','x')+seg(x0+f.x*U,y0,f.a,'var(--seg2)',f.a);
    else if(f.core==='a-x') { inner+=seg(x0,y0,f.a,'var(--seg2)',f.a)+seg(x0+f.a*U,y0,f.x,'var(--card)','x'); w=f.a+f.x; }
    else                    { inner+=seg(x0,y0,f.a,'var(--seg2)',f.a)+seg(x0+f.a*U,y0,f.v-f.a,'var(--seg1)',f.v-f.a); }
    const W0=w*U;
    inner+=`<path d="M${x0-pad},${y0-6} v${H+10} a6,6 0 0 0 6,6 h${W0+2*pad-12} a6,6 0 0 0 6,-6 v-${H+10}" fill="none" stroke="var(--ink)" stroke-width="2.5" stroke-linecap="round"/>`;
    let x=x0+W0+pad+6, note='';
    if(f.w==='o-b'){ inner+=`<rect x="${x}" y="${y0}" width="${f.b*U}" height="${H}" fill="none" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${x+f.b*U/2}" y="${y0+20}" text-anchor="middle" fill="var(--bad)" font-size="13">−${f.b}</text>`; x+=f.b*U; }
    else if(f.w==='o+b'||f.w==='b+o'){ inner+=seg(x,y0,f.b,'var(--whole)',f.b); x+=f.b*U; }
    else if(f.w==='b-o'){ note='Тұтас топ алынды'; }
    else if(f.w==='o/b'){ note=`${f.b} тең бөлікке бөлінді`; }
    else if(f.w==='b*o'||f.w==='o*b'){ note=`${f.b} рет қайталанды`; }
    else if(f.w==='b/o'){ note='Осындай топтарға бөлінді'; }
    if(note) inner+=`<text x="${x0}" y="${y0+H+30}" fill="var(--muted)" font-size="13">${esc(note)}</text>`;
    const W=Math.max(300,x+20);
    return `<svg viewBox="0 0 ${W} ${note?110:86}" width="${W}" height="${note?110:86}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,sans-serif" font-weight="800"><text x="${x0-pad}" y="20" fill="var(--muted)" font-size="12">жақша ішіндегі тұтас</text>${inner}</svg>`;
  }
};
