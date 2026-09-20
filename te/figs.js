/* te/figs.js — the drawings core/figs.js cannot do:
     bal  — a two-pan balance (level 1 of the core stages: no words at all)
     lid  — «8 − x = 3»: the whole known, one part under a lid (level 1 of TE-03)
     torn — «x − 3 = 6»: one unmarked strip, and the same strip torn in two (level 1 of TE-04)
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
     taken off it. That rule is why the subtractive cores use lid/torn and TE-06/TE-07 use grp
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

  /* Subtraction, from the signed-off visual grammar (《减法方程画法》, 2026-09-20).
     Two kinds of not-knowing, two marks, and they are deliberately NOT merged: the two forms
     fail differently, so the mark has to tell the child which move to make.

     {type:'lid', total, open} — «8 − x = 3». The whole is known and sits on the bracket above;
     part of it is under an opaque lid the child cannot lift, which is exactly why the answer has
     to come from the other sentence in the family. The lid overhangs the cells it covers — flush,
     it reads as "blacked-out cells" — carries a knob (a lid you could lift), and never takes a
     colour that means a quantity, because slate is this course's colour for "an object hiding
     something". Dots and cells stay countable: the open part is read, not measured. */
  lid(f){
    const W=340, CH=44, total=f.total, open=f.open, hid=total-open;
    const CW=Math.min(30,(W-56)/total), BW=total*CW, x0=(W-BW)/2, yC=56, yB=24;
    const R=x0+BW; let inner='';
    /* the bracket: the whole, known, above everything */
    inner+=`<path d="M${x0},${yB+6} V${yB-8} H${x0+BW/2-15} M${x0+BW/2+15},${yB-8} H${R} V${yB+6}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`
      +`<text x="${x0+BW/2}" y="${yB-1}" text-anchor="middle" fill="var(--accent)" font-size="19">${ESC(total)}</text>`;
    inner+=`<rect x="${x0}" y="${yC}" width="${BW}" height="${CH}" rx="7" fill="var(--card)" stroke="var(--stroke)" stroke-width="2.5"/>`;
    for(let i=1;i<total;i++) inner+=`<line x1="${x0+i*CW}" y1="${yC}" x2="${x0+i*CW}" y2="${yC+CH}" stroke="var(--line)" stroke-width="1.5"/>`;
    for(let i=hid;i<total;i++) inner+=`<circle cx="${x0+i*CW+CW/2}" cy="${yC+CH/2}" r="${Math.min(10,CW/2-3)}" fill="var(--seg1)" stroke="var(--stroke)" stroke-width="1.2"/>`;
    const lx=x0-6, lw=hid*CW+9, ly=yC-8, lh=CH+16;   /* 6 out, 3 in: a flush lid reads as blacked-out cells, but a deep overhang clips the first open dot */
    inner+=`<rect x="${lx+8}" y="${ly+lh}" width="${lw-16}" height="5" rx="2.5" fill="var(--ink)" opacity="0.16"/>`
      +`<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="9" fill="var(--muted)"/>`
      +`<rect x="${lx}" y="${ly}" width="${lw}" height="9" rx="4.5" fill="#fff" opacity="0.28"/>`
      +`<rect x="${lx+lw/2-15}" y="${ly-9}" width="30" height="10" rx="5" fill="var(--muted)"/>`
      +`<text x="${lx+lw/2}" y="${ly+lh/2+11}" text-anchor="middle" fill="var(--card)" font-size="30">x</text>`;
    const H=yC+CH+22;
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,sans-serif" font-weight="800">${inner}</svg>`;
  },

  /* {type:'torn', gone, left} — «x − 3 = 6». Here nothing is hidden: everything is on the table
     and only the whole has no name yet, so a lid would be a lie. The top strip carries the empty
     label INSIDE it and — the load-bearing rule — no cells, no dots, no number: it gives a length,
     never a count. Underneath, the same strip torn in two, the jags visibly interlocking, which is
     the whole argument that these two pieces were once that one strip. Taken-away on the left,
     left-over on the right, in the reading order of x − 3 = 6. Never reversed. */
  torn(f){
    const W=340, CH=52, JAG=9, GAP=9, gone=f.gone, left=f.left, total=gone+left;
    const CW=Math.min(30,(W-56-GAP)/total), BW=total*CW, x0=(W-BW-GAP)/2;
    const yT=18, TH=42, yB=yT+TH+26, xm=x0+gone*CW, xr=xm+GAP, R=xr+left*CW;
    const q=[0,1,2,3,4].map(i=>yB+i*(CH/4));
    let inner='';
    /* the whole: one unbroken strip, unmarked, with the empty label inside it */
    inner+=`<rect x="${x0}" y="${yT}" width="${BW+GAP}" height="${TH}" rx="6" fill="var(--accent-soft)" stroke="var(--stroke)" stroke-width="2.5"/>`
      +`<rect x="${x0+(BW+GAP)/2-25}" y="${yT+TH/2-16}" width="50" height="32" rx="9" fill="var(--card)" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="6 4"/>`
      +`<text x="${x0+(BW+GAP)/2}" y="${yT+TH/2+8}" text-anchor="middle" fill="var(--accent)" font-size="21">x</text>`;
    inner+=`<line x1="${xm+JAG/2}" y1="${yT+TH}" x2="${xm+JAG/2}" y2="${yB-8}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    /* the two pieces — the teeth of one are the gaps of the other */
    inner+=`<path d="M${x0},${q[0]} H${xm} L${xm+JAG},${q[1]} L${xm},${q[2]} L${xm+JAG},${q[3]} L${xm},${q[4]} H${x0} Z" fill="var(--card)" stroke="var(--stroke)" stroke-width="2.5" stroke-linejoin="round"/>`
      +`<path d="M${xr},${q[0]} H${R} V${q[4]} H${xr} L${xr+JAG},${q[3]} L${xr},${q[2]} L${xr+JAG},${q[1]} Z" fill="var(--card)" stroke="var(--stroke)" stroke-width="2.5" stroke-linejoin="round"/>`;
    const dot=(cx)=>`<circle cx="${cx}" cy="${yB+CH/2}" r="${Math.min(10,CW/2-3)}" fill="var(--seg1)" stroke="var(--stroke)" stroke-width="1.2"/>`;
    for(let i=1;i<gone;i++) inner+=`<line x1="${x0+i*CW}" y1="${q[0]}" x2="${x0+i*CW}" y2="${q[4]}" stroke="var(--line)" stroke-width="1.5"/>`;
    for(let i=0;i<gone;i++) inner+=dot(x0+i*CW+CW/2);
    for(let i=1;i<left;i++) inner+=`<line x1="${xr+i*CW}" y1="${q[0]}" x2="${xr+i*CW}" y2="${q[4]}" stroke="var(--line)" stroke-width="1.5"/>`;
    for(let i=0;i<left;i++) inner+=dot(xr+i*CW+CW/2);
    inner+=`<text x="${x0+gone*CW/2}" y="${q[4]+26}" text-anchor="middle" fill="var(--ink)" font-size="20">${gone}</text>`
      +`<text x="${xr+left*CW/2}" y="${q[4]+26}" text-anchor="middle" fill="var(--ink)" font-size="20">${left}</text>`;
    const H=q[4]+36;
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
    const x0=24, y0=34; let inner=''; const w=f.v;
    /* the core, inside a tray — the tray says "all of this is one thing", and it is always as wide as the
       bracket's VALUE, so whatever is drawn after it (+b, −b) adds up to the number on the right of the equation.
       Additive cores show their two parts. Subtractive cores are ONE block carrying their expression: the old
       drawing for (x − a) was  a | (v − a)  with v = x − a — a negative width whenever x < 2a, a printed number
       that is in no equation otherwise, and never an x anywhere in the picture. */
    const one=(txt)=>`<rect x="${x0}" y="${y0}" width="${w*U}" height="${H}" fill="var(--seg1)" stroke="var(--stroke)" stroke-width="1.5"/>`
      +`<text x="${x0+w*U/2}" y="${y0+20}" text-anchor="middle" fill="var(--ink)" font-size="13">${esc(txt)}</text>`;   // on a 2-unit block the label spills a few px — into the tray's own padding, never past it
    if(f.core==='a+x')      inner+=seg(x0,y0,f.a,'var(--seg2)',f.a)+seg(x0+f.a*U,y0,f.x,'var(--seg1)','x');
    else if(f.core==='x+a') inner+=seg(x0,y0,f.x,'var(--seg1)','x')+seg(x0+f.x*U,y0,f.a,'var(--seg2)',f.a);
    else if(f.core==='a-x') inner+=one(`${f.a+f.x} − x`);
    else                    inner+=one(`x − ${f.a}`);
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
