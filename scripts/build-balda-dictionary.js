'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [, , sourceArgument, outputArgument] = process.argv;
if (!sourceArgument || !outputArgument) {
  console.error('Usage: node scripts/build-balda-dictionary.js <nouns.csv> <output.txt>');
  process.exit(1);
}

const sourcePath = path.resolve(sourceArgument);
const outputPath = path.resolve(outputArgument);
const rows = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/u);
const header = rows.shift()?.split('\t') || [];
const bareIndex = header.indexOf('bare');
if (bareIndex < 0) throw new Error('The OpenRussian TSV export has no bare column');

const words = new Set();
for (const row of rows) {
  if (!row) continue;
  const word = String(row.split('\t')[bareIndex] || '')
    .trim()
    .toLocaleUpperCase('ru-RU');
  if (/^[А-ЯЁ]{2,25}$/u.test(word)) words.add(word);
}

const sortedWords = [...words].sort((first, second) => first.localeCompare(second, 'ru'));
const preamble = [
  '# Russian noun lemmas derived from OpenRussian.org',
  '# Source: https://github.com/Badestrand/russian-dictionary/blob/master/nouns.csv',
  '# License: CC BY-SA 4.0; see OPENRUSSIAN-LICENSE.txt',
  `# Entries: ${sortedWords.length}`,
];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${[...preamble, ...sortedWords].join('\n')}\n`, 'utf8');
console.log(`Wrote ${sortedWords.length} Russian nouns to ${outputPath}`);
