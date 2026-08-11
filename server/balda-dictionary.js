'use strict';

const fs = require('node:fs');
const path = require('node:path');

const dictionaryPath = path.join(__dirname, 'data', 'balda-nouns.txt');

function loadBuiltInBaldaWords() {
  return fs.readFileSync(dictionaryPath, 'utf8')
    .split(/\r?\n/u)
    .map(word => word.trim())
    .filter(word => word && !word.startsWith('#'));
}

module.exports = { dictionaryPath, loadBuiltInBaldaWords };
