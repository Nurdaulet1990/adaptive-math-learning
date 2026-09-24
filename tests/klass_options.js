// The class <select> that the login card and the portal both fill:  node tests/klass_options.js
//
// Worth its own file because it sits on the login card — a syntax slip in core.js here locks every child out
// of the site — and because the grouping is the only place the pupil ever sees the year. The school has a
// Samuryq and a Qyran in BOTH grade 2 and grade 3, so a flat list is four names that read almost alike.
//
// klassOptions is pulled straight out of core/core.js rather than copied here: a copy would keep passing
// after the real one changed.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };

const core = fs.readFileSync(path.join(ROOT, 'core/core.js'), 'utf8');
const src = /\n  function klassOptions\(list\)\{[\s\S]*?\n  \}\n/.exec(core);
T('klassOptions is still in core/core.js under that name', !!src);
const ctx = { esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) };
vm.createContext(ctx); vm.runInContext(src[0] + '\n', ctx);
const opts = list => ctx.klassOptions(list);

const school = ['1А', '2 QYRAN', '2 SAMURYQ', '3 QYRAN', '3 SAMURYQ'];
const h = opts(school);
T('one <optgroup> per year, in year order',
  (h.match(/<optgroup label="([^"]+)"/g) || []).join('|') === '<optgroup label="1-сынып"|<optgroup label="2-сынып"|<optgroup label="3-сынып"', h);
T('every class is still offered, none lost to the grouping',
  school.every(k => h.includes(`<option value="${k}">${k}</option>`)), h);
T('the two Samuryqs sit in different groups — that is the whole point',
  /label="2-сынып">.*?2 SAMURYQ.*?<\/optgroup>[\s\S]*?label="3-сынып">.*?3 SAMURYQ/.test(h), h);
T('every group is closed', (h.match(/<optgroup/g) || []).length === (h.match(/<\/optgroup>/g) || []).length);

T('a school with one year gets no heading saying so',
  opts(['3А', '3Ә']) === '<option value="3А">3А</option><option value="3Ә">3Ә</option>', opts(['3А', '3Ә']));
T('an old class with no year in its name is still listed, and last',
  /ARLAN[\s\S]*$/.test(opts(['2 QYRAN', 'ARLAN'])) && opts(['2 QYRAN', 'ARLAN']).indexOf('ARLAN') > opts(['2 QYRAN', 'ARLAN']).indexOf('QYRAN'),
  opts(['2 QYRAN', 'ARLAN']));
T('…and it is NOT wrapped in an <optgroup> labelled «null-сынып»', !/null|undefined|99-сынып/.test(opts(['2 QYRAN', 'ARLAN'])), opts(['2 QYRAN', 'ARLAN']));
T('a class name is escaped before it becomes HTML', !opts(['1А', '2 <b>x']).includes('<b>'), opts(['1А', '2 <b>x']));
T('an empty list gives an empty string, not «undefined»', opts([]) === '');

// and the two callers
T('the login card fills its <select> with it', /c_kl[\s\S]{0,400}klassOptions\(list\)/.test(core), '');
const portal = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
T('so does the portal card for a pupil with no class yet', /id="myKl"[\s\S]{0,200}Core\.klassOptions\(list\)/.test(portal), '');
T('klassOptions is on the public Core object, or the portal cannot reach it', /\bisCorrect, esc, klassOptions,/.test(core), '');

const failed = out.filter(x => !x).length;
console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
process.exit(failed ? 1 : 0);
