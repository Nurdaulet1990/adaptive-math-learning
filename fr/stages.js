/* fr/stages.js — FR (Бөлшектер) stage table. Owner: assistant (fractions author).
   Row: [id, Kazakh name, generator type (key in GENERATORS), params, prereq, grade]. Ids are never renumbered. */
const STAGES = [
 ['FR-01','Боялған бөлік',            'shade',      {d:[2,10]},          [],        '3'],
 ['FR-02','Бөлшектерді салыстыру',    'compare',    {d:[3,12]},          ['FR-01'], '3'],
 ['FR-03','Тең бөлшектер',            'equiv',      {d:[2,8],k:[2,4]},   ['FR-02'], '4'],
 ['FR-04','Сан сәулесіндегі бөлшек',  'numberline', {d:[3,10]},          ['FR-01'], '3–4'],
 ['FR-05','Қосу және азайту',         'addsub',     {d:[4,15]},          ['FR-02'], '4'],
 ['FR-06','Аралас сандар',            'mixed',      {d:[3,8],w:[1,5]},   ['FR-05'], '4–5'],
 ['FR-07','Санның бөлігін табу',      'part_of',    {d:[2,8],k:[2,9]},   ['FR-01'], '3–4'],
];
