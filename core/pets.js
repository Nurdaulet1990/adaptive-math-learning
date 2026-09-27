/* Есеп жолы · core/pets.js — the eight companions, drawn. Owner: platform owner.

   The pupil still CHOOSES an emoji (Core.AVATARS, stored in state._ava and on every device already), but nothing
   shows the emoji any more: each one maps to a drawing here. An emoji is a font glyph — a fox on a school Android
   tablet, an iPad and a Windows PC are three different foxes, and a glyph cannot blink, think or jump. A drawing
   is the same everywhere and has moods.

     Pets.svg(ava, {mood, size, head})   → '<svg …>' ; ava = the emoji ('🦊') or the kind ('fox')
       mood: 'idle' | 'think' | 'happy'   head: true = head only (lists, chips, the login picker)
     Pets.kind(ava) → 'fox' …            Pets.name(ava) → 'Түлкі' …

   Pure strings, no DOM, no network: the file is also loaded by node in tests/pets.js. */
(function (root) {
  'use strict';
  const KIND = { '🦊': 'fox', '🐻': 'bear', '🐣': 'chick', '🐬': 'dolphin', '🦉': 'owl', '🐯': 'tiger', '🐢': 'turtle', '🦋': 'butterfly' };
  const NAME = { fox: 'Түлкі', bear: 'Аю', chick: 'Балапан', dolphin: 'Дельфин', owl: 'Үкі', tiger: 'Жолбарыс', turtle: 'Тасбақа', butterfly: 'Көбелек' };
  const INK = '#2B1D14';
  const kind = a => KIND[a] || (NAME[a] ? a : 'fox');

  /* eyes for a mood, at (x,y) radius r, in whatever coordinate system the caller is in */
  function eye(x, y, r, mood) {
    if (mood === 'happy') return `<path d="M${x - r - 1} ${y + 1}q${r + 1} ${-(r + 3)} ${2 * r + 2} 0" fill="none" stroke="${INK}" stroke-width="${Math.max(2, r * 0.8)}" stroke-linecap="round"/>`;
    const dx = mood === 'think' ? r * 0.45 : 0, dy = mood === 'think' ? -r * 0.45 : 0;
    return `<circle cx="${x + dx}" cy="${y + dy}" r="${r}" fill="${INK}"/><circle cx="${x + dx + r * 0.35}" cy="${y + dy - r * 0.4}" r="${r * 0.36}" fill="#fff"/>`;
  }
  const HL = '<ellipse cx="24" cy="19" rx="8" ry="3.5" fill="#fff" opacity=".32"/>';   // the top-left shine that makes a flat head read as round

  /* heads on a 60×60 grid */
  const HEAD = {
    fox: m => `<path d="M12 22L9 3L25 13Z" fill="#E8762C"/><path d="M48 22L51 3L35 13Z" fill="#E8762C"/><path d="M13 19L11 8L21 14Z" fill="${INK}"/><path d="M47 19L49 8L39 14Z" fill="${INK}"/><ellipse cx="30" cy="33" rx="21" ry="18" fill="#E8762C"/><path d="M30 51C21 49 11 42 11 35C18 39 24 37 30 40C36 37 42 39 49 35C49 42 39 49 30 51Z" fill="#FFF4E4"/>${eye(22, 31, 3, m)}${eye(38, 31, 3, m)}<ellipse cx="30" cy="41" rx="3.4" ry="2.4" fill="${INK}"/>${HL}`,
    bear: m => `<circle cx="14" cy="15" r="8" fill="#8B5A3C"/><circle cx="46" cy="15" r="8" fill="#8B5A3C"/><circle cx="14" cy="15" r="4" fill="#D9A77F"/><circle cx="46" cy="15" r="4" fill="#D9A77F"/><circle cx="30" cy="33" r="21" fill="#8B5A3C"/><path d="M12 40C18 52 42 52 48 40C42 48 18 48 12 40Z" fill="#6E4630"/><ellipse cx="30" cy="40" rx="10" ry="8" fill="#E8C9A6"/><ellipse cx="30" cy="36.5" rx="4" ry="3" fill="${INK}"/>${eye(21, 28, 2.8, m)}${eye(39, 28, 2.8, m)}${HL}`,
    owl: m => `<path d="M11 18L14 4L22 14Z" fill="#8A5E35"/><path d="M49 18L46 4L38 14Z" fill="#8A5E35"/><circle cx="30" cy="33" r="21" fill="#A8743F"/><path d="M14 44C20 54 40 54 46 44C40 50 20 50 14 44Z" fill="#8A5E35"/><circle cx="21" cy="30" r="8.5" fill="#FFF4E4"/><circle cx="39" cy="30" r="8.5" fill="#FFF4E4"/>${eye(21, 30, 4.2, m)}${eye(39, 30, 4.2, m)}<path d="M26 37L34 37L30 44Z" fill="#F0B43A"/>${HL}`,
    tiger: m => `<circle cx="14" cy="15" r="7" fill="#F08C2A"/><circle cx="46" cy="15" r="7" fill="#F08C2A"/><circle cx="14" cy="15" r="3.4" fill="${INK}"/><circle cx="46" cy="15" r="3.4" fill="${INK}"/><circle cx="30" cy="33" r="21" fill="#F08C2A"/><path d="M24 13l2 7M30 12v8M36 13l-2 7M9 30h7M44 30h7M10 37h6M44 37h6" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="30" cy="41" rx="11" ry="8" fill="#FFF4E4"/><ellipse cx="30" cy="37.5" rx="4" ry="3" fill="#E0685E"/>${eye(22, 29, 2.8, m)}${eye(38, 29, 2.8, m)}${HL}`,
    turtle: m => `<ellipse cx="30" cy="48" rx="24" ry="10" fill="#3F8A4C"/><path d="M10 48q20-14 40 0" fill="none" stroke="#2F6B3A" stroke-width="2"/><circle cx="30" cy="29" r="18" fill="#7CC36E"/><path d="M14 36C20 46 40 46 46 36C40 42 20 42 14 36Z" fill="#5FAE5A"/>${eye(23, 27, 2.8, m)}${eye(37, 27, 2.8, m)}<path d="M25 36q5 4 10 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>${HL}`,
    chick: m => `<path d="M28 10q2-8 6-4q-1 4-4 6Z" fill="#F0B43A"/><circle cx="30" cy="33" r="21" fill="#F6D24A"/><path d="M12 42C18 52 42 52 48 42C42 48 18 48 12 42Z" fill="#E3B92F"/>${eye(22, 30, 2.8, m)}${eye(38, 30, 2.8, m)}<path d="M25 36L35 36L30 43Z" fill="#F08C2A"/>${HL}`,
    dolphin: m => `<path d="M44 12q10 2 10 10q-5-5-12-4Z" fill="#3A87BD"/><ellipse cx="28" cy="33" rx="20" ry="19" fill="#4FA3D9"/><ellipse cx="45" cy="39" rx="11" ry="7" fill="#4FA3D9"/><ellipse cx="30" cy="42" rx="14" ry="8" fill="#D8EEFA"/>${eye(26, 29, 3, m)}<path d="M36 42q8 3 14 -1" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>${HL}`,
    butterfly: m => `<ellipse cx="17" cy="22" rx="13" ry="12" fill="#C75B9B"/><ellipse cx="43" cy="22" rx="13" ry="12" fill="#C75B9B"/><ellipse cx="19" cy="42" rx="10" ry="9" fill="#8E5BC7"/><ellipse cx="41" cy="42" rx="10" ry="9" fill="#8E5BC7"/><circle cx="17" cy="22" r="4.5" fill="#F6D24A"/><circle cx="43" cy="22" r="4.5" fill="#F6D24A"/><rect x="27" y="14" width="6" height="36" rx="3" fill="${INK}"/><path d="M28 14q-4-8-8-9M32 14q4-8 8-9" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>${m === 'happy' ? '<path d="M27 26q3 3 6 0" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>' : ''}`,
  };
  /* bodies on a 100×100 grid: body colour, belly colour, feet colour */
  const BODY = { bear: ['#8B5A3C', '#E8C9A6', '#6E4630'], owl: ['#A8743F', '#E8D2B0', '#F0B43A'], tiger: ['#F08C2A', '#FFF4E4', INK],
                 turtle: ['#3F8A4C', '#7CC36E', '#5FAE5A'], chick: ['#F6D24A', '#FBE7A0', '#F08C2A'], dolphin: ['#4FA3D9', '#D8EEFA', '#3A87BD'] };

  function fox(m) {
    const eyes = m === 'happy' ? `<path d="M34 41q5-7 10 0M56 41q5-7 10 0" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`
      : eye(39 + (m === 'think' ? 1.5 : 0), 40 - (m === 'think' ? 2 : 0), 4.4, 'idle') + eye(61 + (m === 'think' ? 1.5 : 0), 40 - (m === 'think' ? 2 : 0), 4.4, 'idle');
    const mouth = m === 'happy' ? `<path d="M43 55q7 9 14 0z" fill="${INK}"/>` : `<path d="M45 56q5 5 10 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    const arms = m === 'happy' ? '<path d="M30 70q-12-8-10-20M70 70q12-8 10-20" stroke="#E8762C" stroke-width="8" fill="none" stroke-linecap="round"/>' : '';
    return '<path d="M68 80C92 78 99 56 88 43C86 60 78 67 62 70Z" fill="#E8762C"/><path d="M88 43C97 52 95 63 90 67C90 58 88 50 83 46Z" fill="#FFF4E4"/>'
      + `${arms}<ellipse cx="50" cy="77" rx="22" ry="19" fill="#E8762C"/><ellipse cx="50" cy="81" rx="12" ry="12" fill="#FFF4E4"/>`
      + '<path d="M30 84C34 94 66 94 70 84C64 90 36 90 30 84Z" fill="#C85F1F"/>'
      + `<ellipse cx="40" cy="95" rx="7" ry="4" fill="${INK}"/><ellipse cx="60" cy="95" rx="7" ry="4" fill="${INK}"/>`
      + '<path d="M28 30L23 5L45 20Z" fill="#E8762C"/><path d="M72 30L77 5L55 20Z" fill="#E8762C"/>'
      + `<path d="M29 26L26 12L39 20Z" fill="${INK}"/><path d="M71 26L74 12L61 20Z" fill="${INK}"/>`
      + '<ellipse cx="50" cy="40" rx="27" ry="23" fill="#E8762C"/>'
      + '<path d="M50 64C38 62 25 52 25 43C34 48 42 46 50 50C58 46 66 48 75 43C75 52 62 62 50 64Z" fill="#FFF4E4"/>'
      + `${eyes}<ellipse cx="50" cy="51" rx="4.2" ry="3" fill="${INK}"/>${mouth}`
      + '<ellipse cx="31" cy="50" rx="4" ry="2.4" fill="#F4A09A" opacity=".75"/><ellipse cx="69" cy="50" rx="4" ry="2.4" fill="#F4A09A" opacity=".75"/>'
      + '<ellipse cx="41" cy="26" rx="10" ry="4.5" fill="#fff" opacity=".3"/>';
  }
  function body(k, m) {
    if (k === 'fox') return fox(m);
    if (k === 'butterfly') return `<g transform="translate(8,10) scale(1.4)">${HEAD.butterfly(m)}</g>`;   // it flies: no body, just wings
    const [c, b, f] = BODY[k];
    const arms = m === 'happy' ? `<path d="M30 70q-12-8-10-20M70 70q12-8 10-20" stroke="${c}" stroke-width="8" fill="none" stroke-linecap="round"/>` : '';
    return `${arms}<ellipse cx="50" cy="76" rx="22" ry="19" fill="${c}"/><ellipse cx="50" cy="81" rx="12" ry="12" fill="${b}"/>`
      + `<ellipse cx="40" cy="95" rx="7" ry="4" fill="${f}"/><ellipse cx="60" cy="95" rx="7" ry="4" fill="${f}"/>`
      + `<g transform="translate(18,4) scale(1.07)">${HEAD[k](m)}</g>`;
  }
  function svg(ava, o) {
    o = o || {}; const k = kind(ava), m = o.mood || 'idle', s = o.size || 64;
    return o.head
      ? `<svg class="pet pet-head" width="${s}" height="${s}" viewBox="0 0 60 60" aria-hidden="true" focusable="false">${HEAD[k](m)}</svg>`
      : `<svg class="pet" width="${s}" height="${s}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${body(k, m)}</svg>`;
  }
  root.Pets = { svg, kind, name: a => NAME[kind(a)], KINDS: Object.keys(NAME), EMOJI: Object.keys(KIND) };
})(typeof window !== 'undefined' ? window : globalThis);
