/* te/figs.js — the drawings core/figs.js cannot do:
     bal  — a two-pan balance (level 1 of the core stages: no words at all)
     ubar — the part-part-whole bar in countable unit squares (level 1 of the subtractive cores)
     grp  — equal groups with the count asked (level 1 where a balance cannot hold the unknown)
     wrap — a core bar with one outer step
   Everything else (bar, bar_equal) comes from core/figs.js — see MAP.md. */
'use strict';
const ESC=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const FIGS={

  /* {type:'bal', l:{b,c}, r:{b,c}, cross}
       b = solid blocks (known)   c = sealed cups (the unknown, drawn with «?»)
       cross = pair off this many blocks per pan — the hint picture
     A pan may hold only known blocks and a KNOWN number of whole cups, and nothing may be
     taken off it. That rule is why the subtractive cores and TE-06/TE-07 use ubar and grp
     instead — see MAP.md. */
  bal(f){
    const W=340, H=178, U=18, GAP=4, PER=5;
    const BEAM=24, PAN=132, CX=[95,245];
    const blk=(x,y,crossed)=>`<rect x="${x}" y="${y}" width="${U}" height="${U}" rx="3" fill="var(--seg1)" stroke="var(--stroke)" stroke-width="1.5"/>`
      +(crossed?`<line x1="${x+3}" y1="${y+3}" x2="${x+U-3}" y2="${y+U-3}" stroke="var(--muted)" stroke-width="2"/><line x1="${x+U-3}" y1="${y+3}" x2="${x+3}" y2="${y+U-3}" stroke="var(--muted)" stroke-width="2"/>`:'');
    const cup=(x,y)=>`<path d="M${x-2},${y+4} h${U+4} l-3,${U-4} h-${U-2} z" fill="var(--seg2)" stroke="var(--stroke)" stroke-width="1.5" stroke-linejoin="round"/>`
      +`<rect x="${x-4}" y="${y-1}" width="${U+8}" height="6" rx="2" fill="var(--ink)"/>`
      +`<text x="${x+U/2}" y="${y+17}" text-anchor="middle" fill="var(--ink)" font-size="14">?</text>`;
    const pan=(cx,p,cross)=>{
      const list=[];
      for(let i=0;i<(p.b||0);i++) list.push(n=>blk(n.x,n.y,i<cross));
      for(let i=0;i<(p.c||0);i++) list.push(n=>cup(n.x,n.y));
      const rows=[]; for(let i=0;i<list.length;i+=PER) rows.push(list.slice(i,i+PER));
      rows.reverse();                    /* full rows sit at the bottom, the short one on top */
      /* the hanger is drawn first so the blocks stack on top of it, not under a line */
      let out=`<line x1="${cx}" y1="${BEAM}" x2="${cx}" y2="${PAN-6}" stroke="var(--stroke)" stroke-width="1.5"/>`;
      rows.forEach((row,ri)=>{
        const y=PAN-8-(rows.length-ri)*(U+GAP)+GAP, w=row.length*(U+GAP)-GAP, x0=cx-w/2;
        row.forEach((draw,ci)=>{ out+=draw({x:x0+ci*(U+GAP), y}); });
      });
      return out+`<path d="M${cx-56},${PAN-6} h112 l-14,14 h-84 z" fill="var(--card)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>`;
    };
    const inner=`<line x1="${CX[0]}" y1="${BEAM}" x2="${CX[1]}" y2="${BEAM}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>`
      +`<line x1="170" y1="${BEAM}" x2="170" y2="164" stroke="var(--ink)" stroke-width="4"/>`
      +`<path d="M150,172 h40 l-14,-10 h-12 z" fill="var(--ink)"/>`
      +pan(CX[0],f.l||{},f.cross||0)+pan(CX[1],f.r||{},f.cross||0);
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,sans-serif" font-weight="800">${inner}</svg>`;
  },

  /* {type:'ubar', segs:[n|'?', …], total} — the part-part-whole bar in COUNTABLE unit squares,
     the same blocks the balance uses. A segment given as '?' is drawn as a lidded strip.
     `total` on the brace: a number = the whole is known (the lid mark), '?' = the whole itself
     is the unknown (the empty label). Level-1 form of `bar`; level 2 keeps the proportional one. */
  ubar(f){
    const U=18, GAP=4, PER=12, y0=26;
    const cells=[];
    (f.segs||[f.a,f.b]).forEach((n,si)=>{ if(n==='?') cells.push('?'); else for(let i=0;i<n;i++) cells.push(si?'b':'a'); });
    const cols=Math.min(cells.length,PER), rows=Math.ceil(cells.length/PER);
    /* width first, then centre: a four-square bar left-aligned in a 300-wide box looks like a
       mistake next to the balance, which fills its box. */
    const contentW=(cells.indexOf('?')>=0?(cols-1)*(U+GAP)+U*3:cols*(U+GAP)-GAP);
    const W=Math.max(300,contentW+40), x0=(W-contentW)/2;
    let inner='';
    cells.forEach((c,i)=>{
      const x=x0+(i%PER)*(U+GAP), y=y0+Math.floor(i/PER)*(U+GAP);
      if(c==='?') inner+=`<rect x="${x}" y="${y+4}" width="${U*3}" height="${U-4}" rx="3" fill="var(--seg2)" stroke="var(--stroke)" stroke-width="1.5"/>`
        +`<rect x="${x-2}" y="${y-1}" width="${U*3+4}" height="6" rx="2" fill="var(--ink)"/>`
        +`<text x="${x+U*1.5}" y="${y+18}" text-anchor="middle" fill="var(--ink)" font-size="17">?</text>`;
      else inner+=`<rect x="${x}" y="${y}" width="${U}" height="${U}" rx="3" fill="${c==='a'?'var(--seg1)':'var(--seg2)'}" stroke="var(--stroke)" stroke-width="1.5"/>`;
    });
    const R=x0+contentW, bot=y0+rows*(U+GAP)-GAP;
    inner+=`<path d="M${x0},${bot+8} v6 h${contentW} v-6 M${(x0+R)/2},${bot+14} v5" fill="none" stroke="var(--stroke)" stroke-width="1.5"/>`
      +`<text x="${(x0+R)/2}" y="${bot+38}" text-anchor="middle" fill="var(--ink)" font-size="21">${ESC(f.total)}</text>`;
    const H=bot+48;
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,sans-serif" font-weight="800">${inner}</svg>`;
  },

  /* {type:'grp', g, v, total, ask:'g'|'v'}  — g boxes of v, brace below = total.
     ask:'g' puts «?» on the bracket that counts the boxes; ask:'v' puts «?» inside each box. */
  grp(f){
    const g=f.g, v=f.v, PER=Math.min(g,4), BW=64, BH=44, GAP=10;
    const cols=Math.min(g,PER), rows=Math.ceil(g/PER);
    const W=Math.max(300, cols*(BW+GAP)+40), x0=(W-(cols*(BW+GAP)-GAP))/2, y0=36;
    let inner='';
    for(let i=0;i<g;i++){
      const r=Math.floor(i/PER), c=i%PER, x=x0+c*(BW+GAP), y=y0+r*(BH+GAP);
      inner+=`<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="6" fill="var(--seg1)" stroke="var(--stroke)" stroke-width="1.5"/>`;
      if(f.ask==='v') inner+=`<text x="${x+BW/2}" y="${y+29}" text-anchor="middle" fill="var(--ink)" font-size="17">?</text>`;
      else { const d=Math.min(v,9), per=Math.ceil(d/3);
        for(let k=0;k<d;k++) inner+=`<circle cx="${x+14+(k%3)*18}" cy="${y+13+Math.floor(k/3)*(per>2?12:14)}" r="5" fill="var(--seg2)" stroke="var(--stroke)" stroke-width="1.2"/>`;
        if(v>9) inner+=`<text x="${x+BW-12}" y="${y+BH-6}" text-anchor="middle" fill="var(--ink)" font-size="12">${v}</text>`; }
    }
    const bot=y0+rows*(BH+GAP)-GAP, R=x0+cols*(BW+GAP)-GAP;
    inner+=`<path d="M${x0},${bot+8} v6 h${R-x0} v-6 M${(x0+R)/2},${bot+14} v5" fill="none" stroke="var(--stroke)" stroke-width="1.5"/>`
      +`<text x="${(x0+R)/2}" y="${bot+38}" text-anchor="middle" fill="var(--ink)" font-size="21">${ESC(f.total)}</text>`;
    if(f.ask==='g') inner+=`<path d="M${x0},${y0-10} v-6 h${R-x0} v6" fill="none" stroke="var(--accent)" stroke-width="1.5"/>`
      +`<text x="${(x0+R)/2}" y="${y0-18}" text-anchor="middle" fill="var(--accent)" font-size="21">?</text>`;
    const H=bot+48;
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,sans-serif" font-weight="800">${inner}</svg>`;
  },

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
