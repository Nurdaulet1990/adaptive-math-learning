/* te/words.js — Kazakh wordlist for the level-1 situations.
   Names (nominative + locative) and items (nominative + emoji) are LIFTED VERBATIM from
   wp/generate.js, which is live and whose Kazakh has been through review. Routes cannot share
   files, so this is a copy; if a third route needs it, it belongs in core/ and that is an owner
   call. Only the two forms used here are kept — wp's table also carries ablative, dative,
   genitive and three verb forms.

   Numbers do not pluralise the noun in Kazakh (5 алма, not 5 алмалар), which is why the
   templates in generate.js place {item} straight after the count. */
'use strict';
const NAMES = [['Айгүл','Айгүлде'], ['Дана','Данада'], ['Марат','Маратта'], ['Ерлан','Ерланда'], ['Сәкен','Сәкенде'], ['Әсем','Әсемде'], ['Болат','Болатта'], ['Аружан','Аружанда'], ['Санжар','Санжарда'], ['Алия','Алияда'], ['Нұрлан','Нұрланда'], ['Камила','Камилада'], ['Тимур','Тимурда'], ['Айдос','Айдоста'], ['Әсет','Әсетте'], ['Мәдина','Мәдинада'], ['Сырым','Сырымда'], ['Әлия','Әлияда']];
const ITEMS = [['алма','🍎'], ['алмұрт','🍐'], ['шар','🎈'], ['кітап','📚'], ['қалам','✏️'], ['кәмпит','🍬'], ['дәптер','📒'], ['доп','⚽'], ['банан','🍌'], ['жұлдыз','⭐'], ['печенье','🍪'], ['сәбіз','🥕'], ['қияр','🥒']];
