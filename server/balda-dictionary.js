'use strict';

const fs = require('node:fs');
const path = require('node:path');

const dictionaryPath = path.join(__dirname, 'data', 'balda-nouns.txt');
const initialWordsPath = path.join(__dirname, 'data', 'balda-start-words.txt');

function loadWordFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .filter(line => !line.trim().startsWith('#'))
    .flatMap(line => line.trim().split(/\s+/u))
    .filter(Boolean);
}

function loadBuiltInBaldaWords() {
  return loadWordFile(dictionaryPath);
}

function loadBaldaInitialWords() {
  return loadWordFile(initialWordsPath);
}

module.exports = {
  dictionaryPath,
  initialWordsPath,
  loadBaldaInitialWords,
  loadBuiltInBaldaWords,
};
