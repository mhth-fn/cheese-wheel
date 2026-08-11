# Словарь для «Балды»

`balda-nouns.txt` содержит нормальные формы русских существительных из открытого набора данных [OpenRussian.org](https://github.com/Badestrand/russian-dictionary). Исходный файл `nouns.csv` опубликован командой OpenRussian под лицензией Creative Commons Attribution-ShareAlike 4.0 International.

Для игры из поля `bare` взяты слова длиной от 2 до 25 букв, состоящие только из русского алфавита. Производный файл создаётся скриптом:

```sh
node scripts/build-balda-dictionary.js nouns.csv server/data/balda-nouns.txt
```

Полный текст лицензии сохранён в `OPENRUSSIAN-LICENSE.txt`.
