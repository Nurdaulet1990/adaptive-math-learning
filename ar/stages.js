/* ar/stages.js — AR (Көбейту мен бөлу) stage table.
 * ROUTE_CONVENTION.md §3.  Ids are NEVER renumbered or reused once live.
 *
 * Graded the way fact-fluency programmes grade (Rocket Math): small cumulative
 * increments, never a whole table at once, and practice with correction before
 * any timed test. One stage per × table in the Kazakh textbook order
 * (2 → 5 → 10 → 3 → 4 → 6 → 7 → 8 → 9); each carries a `review` list so earlier
 * tables keep coming back inside the new one. ⚡ stages are drills: lvl 1–2
 * practise WITH the correction procedure, lvl 3 is the timed test.
 * Үлестірімділік sits before the hard tables because breaking 7 × 8 into
 * 5 × 8 + 2 × 8 is the tool for learning them.
 *
 * Division is its own block AFTER × is automatic (AR-17), mirroring the same
 * divisor groups — Rocket Math's reasoning is that you should not be learning
 * two operations at once.
 *
 * The column-multiplication block (AR-24…29, AR-32…35) is graded the same way,
 * by what actually makes a column hard — CARRYING and INTERIOR ZEROS — not by
 * digit count: 234 × 2 is easier than 78 × 9. Each station adds exactly one new
 * difficulty, and the generator enforces the class (carriesOf / hasInnerZero in
 * generate2.js), so an item from a later class never appears in an earlier one.
 *
 * Renumbered BEFORE the route went live — the only moment §3 leaves free, and
 * what §9's "send the STAGES table before building" exists to create. Array
 * order is what core/runner.js walks (finishTest → STAGES[i+1]; the diagnostic
 * places by index), so numeric order and array order are kept identical.
 */
(function (root) {
  'use strict';

  var STAGES = [
    // id       name (Kazakh)                       type          params                                          prereq                      grade
    ['AR-01', 'Тең топтар', 'groups', { g: [2, 5], n: [2, 5] }, [], '2'],
    ['AR-02', 'Қосудан көбейтуге', 'rep_add', { n: [2, 9], k: [2, 5] }, ['AR-01'], '2'],
    ['AR-03', 'Қатар мен баған · ауыстырымдылық', 'array', { r: [2, 9], c: [2, 9] }, ['AR-02'], '2'],
    ['AR-04', 'Кесте 2', 'table', { k: [2], review: [] }, ['AR-03'], '2'],
    ['AR-05', 'Кесте 5', 'table', { k: [5], review: [2] }, ['AR-04'], '2'],
    ['AR-06', 'Кесте 10', 'table', { k: [10], review: [2, 5] }, ['AR-05'], '2'],
    ['AR-07', '⚡ Жаттығу 2·5·10', 'speed', { k: [2, 5, 10] }, ['AR-06'], '2'],
    ['AR-08', 'Тең бөлу · екі мағына', 'share', { tot: [6, 50], g: [2, 10] }, ['AR-07'], '2'],
    ['AR-09', 'Кесте 3', 'table', { k: [3], review: [2, 5, 10] }, ['AR-07'], '3'],
    ['AR-10', 'Кесте 4', 'table', { k: [4], review: [2, 3, 5, 10] }, ['AR-09'], '3'],
    ['AR-11', '⚡ Жаттығу 3·4', 'speed', { k: [2, 3, 4, 5, 10] }, ['AR-10'], '3'],
    ['AR-12', 'Үлестірімділік', 'distrib', { a: [6, 9], b: [6, 9] }, ['AR-11'], '3'],
    ['AR-13', 'Кесте 6', 'table', { k: [6], review: [2, 3, 4, 5, 10] }, ['AR-12'], '3'],
    ['AR-14', 'Кесте 7', 'table', { k: [7], review: [2, 3, 4, 5, 6, 10] }, ['AR-13'], '3'],
    ['AR-15', 'Кесте 8', 'table', { k: [8], review: [2, 3, 4, 5, 6, 7, 10] }, ['AR-14'], '3'],
    ['AR-16', 'Кесте 9', 'table', { k: [9], review: [2, 3, 4, 5, 6, 7, 8, 10] }, ['AR-15'], '3'],
    ['AR-17', '⚡ Жылдамдық ×', 'speed', { k: [2, 3, 4, 5, 6, 7, 8, 9, 10] }, ['AR-16'], '3'],
    ['AR-18', 'Бөлу кестесі · кері амалдар', 'divfact', { k: [2, 5, 10], review: [] }, ['AR-08', 'AR-17'], '3'],
    ['AR-19', 'Бөлу 3, 4', 'divfact', { k: [3, 4], review: [2, 5, 10] }, ['AR-18'], '3'],
    ['AR-20', 'Бөлу 6, 7', 'divfact', { k: [6, 7], review: [2, 3, 4, 5, 10] }, ['AR-19'], '3'],
    ['AR-21', 'Бөлу 8, 9', 'divfact', { k: [8, 9], review: [2, 3, 4, 5, 6, 7, 10] }, ['AR-20'], '3'],
    ['AR-22', '⚡ Жылдамдық ÷', 'speed', { k: [2, 3, 4, 5, 6, 7, 8, 9, 10], op: 'div' }, ['AR-21'], '3'],
    ['AR-23', 'Қалдықпен бөлу', 'remainder', { d: [2, 9], tot: [10, 60] }, ['AR-22'], '3'],
    // ── Бағаналап көбейту. Split by what actually makes a column hard —
    // carrying and interior zeros — not by digit count: 234 × 2 is easier than
    // 78 × 9. One new difficulty per station, exactly as the fact ladder above.
    ['AR-24', 'Бағанаға жазу (1 × 1 таңба)', 'mul_col', { dig: 1, b: [2, 9] }, ['AR-17'], '3'],
    ['AR-25', '2 таңба × 1 — ауысусыз', 'mul_col', { dig: 2, carry: 'none' }, ['AR-24'], '3'],
    ['AR-26', '2 таңба × 1 — бір ауысу', 'mul_col', { dig: 2, carry: 'one' }, ['AR-25'], '3'],
    ['AR-27', '3 таңба × 1 — ауысусыз', 'mul_col', { dig: 3, carry: 'none' }, ['AR-26'], '4'],
    ['AR-28', '3 таңба × 1 — көп ауысу', 'mul_col', { dig: 3, carry: 'many' }, ['AR-27'], '4'],
    ['AR-29', 'Ішінде нөлі бар сан × 1', 'mul_col', { dig: 3, zero: true }, ['AR-28'], '4'],
    // ── Бөлу: 1 таңбалы бөлгіш, сосын цифр таңдау
    ['AR-30', 'Баған түрінде бөлу (÷ 1 таңба)', 'div_long', { a: [24, 999], b: [2, 9] }, ['AR-23', 'AR-26'], '4'],
    ['AR-31', 'Бөліндінің цифрын таңдау', 'estimate', { a: [100, 999], b: [11, 99] }, ['AR-30'], '4'],
    // ── Көп таңбалы × көп таңбалы, сол принциппен жіктелген
    ['AR-32', '2 × 2 таңба — ауысусыз', 'mul_col2', { ad: 2, bd: 2, carry: 'none' }, ['AR-29'], '4'],
    ['AR-33', '2 × 2 таңба — ауысумен', 'mul_col2', { ad: 2, bd: 2, carry: 'some' }, ['AR-32'], '4'],
    ['AR-34', '3 таңба × 2 таңба', 'mul_col2', { ad: 3, bd: 2, carry: 'some' }, ['AR-33'], '4'],
    ['AR-35', 'Көбейткіште нөл бар', 'mul_col2', { ad: 2, bd: 3, zero: true }, ['AR-34'], '4'],
    // ── Көп таңбалы бөлгіш
    ['AR-36', 'Екі таңбалы санға бөлу', 'div_long2', { b: [11, 99] }, ['AR-31', 'AR-33'], '4'],
    ['AR-37', 'Үш таңбалы санға бөлу', 'div_long2', { b: [101, 999] }, ['AR-36'], '5'],
    // ── Ондық бөлшектер
    ['AR-38', 'Ондық бөлшек', 'dec_pv', { dp: [1, 2] }, ['AR-37'], '5'],
    ['AR-39', 'Ондық бөлінді', 'div_dec', { exact: true, dp: [1, 2] }, ['AR-36', 'AR-38'], '5'],
    ['AR-40', 'Дөңгелектеп бөлу', 'div_round', { dp: 2 }, ['AR-39'], '5'],
    ['AR-41', 'Ондық санға бөлу', 'div_by_dec', { dp: [1, 2] }, ['AR-40'], '5']
  ];

  root.STAGES = STAGES;
})(typeof window !== 'undefined' ? window : this);
