/* fr/stages.js — FR (Бөлшектер) stage table.  ROUTE_CONVENTION.md §3.
 *
 * Graded the way fact-fluency programmes grade (Rocket Math), which for
 * fractions is FOUR SEPARATE FACT TRACKS rather than one chain — identifying
 * fractions, equivalent fractions, factors & primes, fraction/decimal
 * equivalents.  The ⚡ stations ARE those tracks; everything between them is
 * the concept work that feeds them.  A ⚡ station's pool is cumulative: every
 * fact its track has taught so far, with the new ones held at ≥40% so they are
 * not diluted away (FR_UTIL.pickFluency).
 *
 * What makes a fraction item hard is NOT the size of the denominator.
 * 3/10 + 4/10 is easier than 1/4 + 1/4, because the second one has to be
 * reduced.  So the ladder is graded by REDUCING, COMMON DENOMINATOR,
 * CROSSING ONE and BORROWING — the same move as the column-multiplication
 * block in ar/stages.js, which is graded by carrying and interior zeros rather
 * than by digit count.  generate.js enforces the class of every item through
 * FR_UTIL (needsReduce / crossesOne / lcdKind / reduceSteps / carriesFrac /
 * needsBorrow), so an item from a later class never shows up in an earlier
 * station.  _selfcheck.js asserts that station by station.
 *
 * That grading exposes one ordering trap, and it is why FR-24 exists: adding
 * with a common denominator is a Grade-4 skill while reducing is Grade-5, so
 * FR-05/15/16/17 FORCE an already-lowest-terms result — operands included —
 * and the sum that needs reducing comes back as its own station AFTER the
 * reducing track, where its one new difficulty is reducing and nothing else.
 *
 * ⚠ IDS ARE NOT IN ARRAY ORDER, and that is deliberate.  This route was already
 * live when the ladder was rebuilt, so §3 had closed: the seven stations that
 * existed keep the ids they hold, at the position their content belongs to, and
 * the 43 new ones take FR-08…FR-50.  ar/stages.js could keep numeric and array
 * order identical because it was renumbered BEFORE going live; that moment had
 * already passed here.  Array order is what core/runner.js walks (finishTest →
 * STAGES[i+1]; the diagnostic places by index), so the ladder is still exactly
 * the order below.
 *
 *   kept id   was                          now sits at   as
 *   FR-01     Боялған бөлік                 row  2        (unchanged)
 *   FR-04     Сан сәулесіндегі бөлшек       row  3        (unchanged)
 *   FR-07     Санның бөлігін табу           row  4        narrowed to 1/d; k/d moved to FR-38
 *   FR-06     Аралас сандар                 row  8        renamed Бұрыс ↔ аралас, now both ways
 *   FR-02     Бөлшектерді салыстыру         row 10        narrowed to same denominator; same numerator → FR-13
 *   FR-05     Қосу және азайту              row 13        narrowed to addition under 1, lowest terms
 *   FR-03     Тең бөлшектер                 row 20        (unchanged)
 * Every one of the seven NARROWS; none is repointed at different content, so a
 * pupil who has passed one has passed something at least as hard.
 *
 * ⚠ CFG.ROUTES in core/core.js says FR covers '3–5'.  This ladder ends in Grade
 * 6 (fraction × and ÷ are 6-сынып in the KZ programme) → it wants '3–6'.
 */
(function (root) {
  'use strict';

  var STAGES = [
    // id       name (Kazakh)                    type          params                                                              prereq                    grade
    // ── Үлес: what a fraction is
    ['FR-08', 'Үлес пен тең бөлік', 'part', { d: [2, 8] }, [], '3'],
    ['FR-01', 'Боялған бөлік', 'shade', { d: [2, 8], kinds: ['proper'], whole: true }, ['FR-08'], '3'],
    ['FR-04', 'Сан сәулесіндегі бөлшек', 'numberline', { d: [3, 10] }, ['FR-01'], '3'],
    ['FR-07', 'Санның бөлігін табу', 'part_of', { d: [2, 8], k: [2, 9], num: 1 }, ['FR-01'], '3'],
    ['FR-09', '⚡ Жаттығу · оқу', 'frspeed', { pool: 'read', d: [2, 6], kinds: ['proper'], mastery: 'fluency' }, ['FR-04', 'FR-07'], '3'],
    // ── Бөлшек түрлері.  Track 13 mixes proper/improper/whole/mixed on purpose.
    ['FR-10', 'Дұрыс, бұрыс бөлшек', 'shade', { d: [2, 8], kinds: ['proper', 'improper'] }, ['FR-09'], '4'],
    ['FR-11', 'Аралас санды оқу', 'shade', { w: [1, 4], d: [2, 8], kinds: ['mixed'] }, ['FR-10'], '4'],
    ['FR-06', 'Бұрыс ↔ аралас', 'mixed', { w: [1, 5], d: [3, 8], dir: 'both' }, ['FR-11'], '4'],
    ['FR-12', '⚡ Жылдамдық · оқу', 'frspeed', { pool: 'read', d: [2, 12], kinds: ['proper', 'improper', 'mixed', 'whole'], mastery: 'fluency' }, ['FR-06'], '4'],
    // ── Салыстыру.  same_num is the one кпр.html never had, and it carries the
    //    single biggest misconception in fractions: bigger denominator, smaller piece.
    ['FR-02', 'Бөлімдері бірдей', 'compare', { mode: 'same_den', d: [3, 12] }, ['FR-12'], '4'],
    ['FR-13', 'Алымдары бірдей', 'compare', { mode: 'same_num', d: [2, 12] }, ['FR-02'], '4'],
    ['FR-14', 'Жартыға салыстыру', 'compare', { mode: 'half', d: [2, 12], sort: true }, ['FR-13'], '4'],
    // ── Қосу/азайту, бөлімдері бірдей.  reduce:false is load-bearing — see header.
    ['FR-05', 'Бөлімдері бірдей қосу', 'addsub', { op: '+', reduce: false, cross: 'under', d: [4, 15] }, ['FR-02'], '4'],
    ['FR-15', 'Бүтінге дейін қосу', 'addsub', { op: '+', reduce: false, cross: 'exact', d: [4, 12] }, ['FR-05'], '4'],
    ['FR-16', 'Бөлімдері бірдей азайту', 'addsub', { op: '-', reduce: false, d: [4, 15] }, ['FR-15'], '4'],
    ['FR-17', 'Бүтіннен азайту', 'addsub', { op: '-', from: 'whole', d: [3, 12] }, ['FR-16'], '4'],
    // ── Бөлгіштер мен жай сандар (Track 15).  The tool for reducing, so it comes
    //    BEFORE reducing — the same reasoning that puts Үлестірімділік before ×6–9.
    ['FR-18', 'Бөлгіштер жұбы', 'factors', { n: [12, 60] }, ['FR-17', 'AR-22'], '5'],
    ['FR-19', 'Жай және құрама сан', 'prime', { n: [2, 50] }, ['FR-18'], '5'],
    ['FR-20', '⚡ ЕҮОБ пен ЕКОЕ', 'frspeed', { pool: 'gcf_lcm', a: [2, 12], b: [2, 12], mastery: 'fluency' }, ['FR-19'], '5'],
    // ── Мәндес бөлшектер (Track 14).  'irreducible' is a real item type, not a decoy.
    ['FR-03', 'Тең бөлшектер', 'equiv', { mode: 'expand', d: [2, 8], k: [2, 4] }, ['FR-20'], '5'],
    ['FR-21', 'Қысқарту · бір қадам', 'equiv', { mode: 'reduce1', d: [2, 12] }, ['FR-03'], '5'],
    ['FR-22', 'Қысқарту · ЕҮОБ-пен', 'equiv', { mode: 'reduce_gcf', d: [4, 24] }, ['FR-21'], '5'],
    ['FR-23', 'Қысқартылмайтын бөлшек', 'equiv', { mode: 'irreducible', d: [2, 24] }, ['FR-22'], '5'],
    ['FR-24', '⚡ Мәндес бөлшектер', 'frspeed', { pool: 'equiv', d: [2, 24], dir: 'both', mastery: 'fluency' }, ['FR-23'], '5'],
    // ── Back to the common denominator, now that reducing exists.
    ['FR-25', 'Қысқартуы бар қосынды', 'addsub', { op: '+-', reduce: true, d: [4, 15], review: ['no_reduce'] }, ['FR-24', 'FR-16'], '5'],
    ['FR-26', 'Бұрыс қосынды · аралас', 'addsub', { op: '+', cross: 'over', d: [3, 10], review: ['exact'] }, ['FR-25', 'FR-06'], '5'],
    // ── Ортақ бөлім.  Three classes, one per station: multiple → coprime → LCM.
    ['FR-27', 'Еселік бөлімге келтіру', 'lcd', { kind: 'multiple', d: [2, 12] }, ['FR-26'], '5'],
    ['FR-28', 'Өзара жай бөлімдер', 'lcd', { kind: 'coprime', d: [2, 9], review: ['multiple'] }, ['FR-27'], '5'],
    ['FR-29', 'ЕКОБ-қа келтіру', 'lcd', { kind: 'general', d: [4, 12], review: ['multiple', 'coprime'] }, ['FR-28'], '5'],
    ['FR-30', '⚡ Ортақ бөлімді табу', 'frspeed', { pool: 'lcd', d: [2, 12], mastery: 'fluency' }, ['FR-29'], '5'],
    // ── Әртүрлі бөлімдер
    ['FR-31', 'Еселік бөлімдерді қосу', 'addsub_d', { op: '+', kind: 'multiple', d: [2, 12] }, ['FR-30'], '5'],
    ['FR-32', 'Әртүрлі бөлімдерді қосу', 'addsub_d', { op: '+', kind: 'general', d: [4, 12], review: ['multiple'] }, ['FR-31'], '5'],
    ['FR-33', 'Әртүрлі бөлім · азайту', 'addsub_d', { op: '-', kind: 'general', d: [4, 12], review: ['multiple'] }, ['FR-32'], '5'],
    // ── Аралас сандар.  carry / borrow are the only new things in FR-35 and FR-37.
    ['FR-34', 'Аралас санды қосу', 'mixed_ar', { op: '+', carry: false, d: [3, 10] }, ['FR-33'], '5'],
    ['FR-35', 'Бүтінге көшу', 'mixed_ar', { op: '+', carry: true, d: [3, 10], review: ['no_carry'] }, ['FR-34'], '5'],
    ['FR-36', 'Аралас санды азайту', 'mixed_ar', { op: '-', borrow: false, d: [3, 10] }, ['FR-35'], '5'],
    ['FR-37', 'Бүтінді бөлшектеу', 'mixed_ar', { op: '-', borrow: true, d: [3, 10], review: ['no_borrow'] }, ['FR-36'], '5'],
    ['FR-38', 'Санның бөлшегін табу', 'part_of', { d: [2, 10], k: [2, 9], num: [2, 9] }, ['FR-37', 'FR-07'], '5'],
    // ── Ондық бөлшек (Track 16).  Place value itself is AR-38's business.
    ['FR-39', 'Ондық үлес', 'dec', { mode: 'tenths' }, ['FR-24', 'AR-38'], '5'],
    ['FR-40', 'Жүздік үлес', 'dec', { mode: 'hundredths', review: ['tenths'] }, ['FR-39'], '5'],
    ['FR-41', 'Бөлшек — бөлу амалы', 'dec', { mode: 'as_division' }, ['FR-40', 'AR-39'], '5'],
    ['FR-42', '⚡ Бөлшек ↔ ондық', 'frspeed', { pool: 'dec', dir: 'both', mastery: 'fluency' }, ['FR-41'], '5'],
    ['FR-43', 'Бөлшек пен ондық', 'compare', { mode: 'dec' }, ['FR-42'], '5'],
    // ── Көбейту.  Needs × to be automatic first, hence AR-17.
    ['FR-44', 'Бөлшекті санға көбейту', 'mul', { mode: 'by_int' }, ['FR-38', 'AR-17'], '6'],
    ['FR-45', 'Бөлшекті көбейту', 'mul', { mode: 'frac', reduce: false }, ['FR-44'], '6'],
    ['FR-46', 'Көбейтіп қысқарту', 'mul', { mode: 'frac', reduce: true, review: ['no_reduce'] }, ['FR-45', 'FR-22'], '6'],
    ['FR-47', 'Аралас санды көбейту', 'mul', { mode: 'mixed' }, ['FR-46', 'FR-06'], '6'],
    // ── Бөлу.  Measurement meaning first — "how many 1/4 are in 3" is the only one
    //    a child can see; the reciprocal rule lands last, on top of it.
    ['FR-48', 'Санды үлеске бөлу', 'div', { mode: 'int_by_unit' }, ['FR-47'], '6'],
    ['FR-49', 'Бөлшекті санға бөлу', 'div', { mode: 'frac_by_int' }, ['FR-48'], '6'],
    ['FR-50', 'Өзара кері сан', 'div', { mode: 'frac_by_frac', review: ['int_by_unit', 'frac_by_int'] }, ['FR-49'], '6']
  ];

  root.STAGES = STAGES;
})(typeof window !== 'undefined' ? window : this);
