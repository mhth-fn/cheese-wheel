#!/usr/bin/env node
'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const authorByStorageKey = new Map([
  ['e7365eac-6c05-44e3-bf2d-b7617b85636a.siq', 'Asrie1'],
  ['55697cc4-acfd-48ec-a25b-0cfdc9110c8e.siq', 'Antoine Dielman'],
  ['dfa0da7a-d827-422f-b6ed-6f4a4bb02ca0.siq', 'Алистер Кроули'],
  ['d489a1ec-da98-40bb-96ea-d08b005104ee.siq', 'Apostle_Pharisee'],
  ['3e4aab14-e19a-42d9-803c-9530cb28ee82.siq', 'Алистер Кроули'],
  ['f3fb5d43-648a-4484-9e1c-97fb58319999.siq', 'Алистер Кроули'],
  ['43f1b68e-4b76-4090-9b11-eb927eac9a4a.siq', 'Пажилая Гарганзола'],
  ['00c46dfd-aa8a-4ebe-91c3-8d926fe75a3b.siq', 'Алистер Кроули'],
  ['57925b89-a7f6-4739-88a6-54e1ea62c552.siq', 'Алистер Кроули'],
  ['3dbb0372-a71f-4db2-bb4c-bc491c0c31d6.siq', 'Алистер Кроули'],
  ['157c0724-02a2-43c3-b180-518bedefb8d8.siq', 'Алистер Кроули'],
  ['55049d10-a34e-4516-8237-c1149110bfcf.siq', 'Алистер Кроули'],
  ['b159c504-ac80-4cd2-8a5c-11d09ce21416.siq', 'Алистер Кроули'],
  ['40513ffd-add1-4a75-a68e-274ba44ef7b9.siq', 'Алистер Кроули'],
  ['79160045-e34e-4ad0-9f71-b02b0348d02d.siq', 'Алистер Кроули'],
  ['0b60369c-2226-4c2c-a25e-360bc6b66480.siq', 'Алистер Кроули'],
  ['49b56bc2-27a4-4a40-a400-7d1ead5027a3.siq', 'Алистер Кроули'],
  ['4232517d-9182-4736-a5ed-1b3fa2c77985.siq', 'Алистер Кроули'],
  ['6513313f-ab79-477f-9121-ce74b954749c.siq', 'Алистер Кроули'],
  ['aa740dcc-97fe-4301-96af-dd3f5d70d7f2.siq', 'Day M'],
  ['3b8aa8e1-4c63-44ef-8e84-fe8ff87bb050.siq', 'Sm1le'],
  ['aa036779-87b4-4429-9309-13c153b0f253.siq', 'Sm1le'],
  ['11c7b9bc-bdb6-4145-bf83-fec41abfe088.siq', 'Alex'],
  ['794dc7bd-0d77-4afc-8c09-5aed6443369f.siq', 'Алистер Кроули'],
  ['1c369424-46f6-4bb1-a79e-1a4bed553c98.siq', 'Катенька'],
  ['f0800b3a-ef47-4ce6-a92d-d47caa7196f6.siq', 'Sm1le'],
  ['8167043e-340c-4594-b14c-d8490981f579.siq', 'Алистер Кроули'],
  ['00e865b6-8093-4cdd-b030-28c2cb30db5a.siq', 'Фликер'],
]);

const unattributedStorageKeys = new Set([
  '8b582962-778f-47b8-8fa6-66b952463d0c.siq',
  '3a1961f5-1681-4956-a52c-f99d363c054d.siq',
  '022b6318-7a0f-471f-bb3f-af4e2c9324fd.siq',
]);

function fail(message) {
  throw new Error(message);
}

const databaseArg = process.argv.find(argument => (
  !argument.startsWith('--')
  && argument !== process.argv[0]
  && argument !== process.argv[1]
));
if (!databaseArg) {
  console.error(
    'Usage: node scripts/backfill-sigame-author-tags.js '
    + '/path/to/cheese_wheel.db [--apply]'
  );
  process.exit(1);
}

const databasePath = path.resolve(databaseArg);
const apply = process.argv.includes('--apply');
const db = new Database(databasePath, { readonly: !apply, fileMustExist: true });

try {
  const packs = db.prepare(`
    SELECT id, title, storage_key
    FROM sigame_packs
    ORDER BY id
  `).all();

  const unknownPacks = packs.filter(pack => (
    !authorByStorageKey.has(pack.storage_key)
    && !unattributedStorageKeys.has(pack.storage_key)
  ));
  if (unknownPacks.length > 0) {
    fail(`Packs without an author decision: ${JSON.stringify(unknownPacks)}`);
  }

  for (const storageKey of authorByStorageKey.keys()) {
    if (!packs.some(pack => pack.storage_key === storageKey)) {
      fail(`Pack with storage key ${storageKey} is missing`);
    }
  }

  const selected = packs.filter(pack => authorByStorageKey.has(pack.storage_key));
  if (!apply) {
    console.log(
      `Validated ${selected.length} attributed packs; `
      + `${unattributedStorageKeys.size} packs have no reliable author metadata.`
    );
  } else {
    const updateAuthor = db.prepare(`
      UPDATE sigame_packs
      SET pack_author = ?
      WHERE id = ?
    `);
    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO sigame_pack_tags (pack_id, tag)
      VALUES (?, ?)
    `);

    db.transaction(() => {
      for (const pack of selected) {
        const author = authorByStorageKey.get(pack.storage_key);
        updateAuthor.run(author, pack.id);
        insertTag.run(pack.id, author);
      }
    })();

    const tooManyTags = db.prepare(`
      SELECT pack_id, COUNT(*) AS tag_count
      FROM sigame_pack_tags
      GROUP BY pack_id
      HAVING COUNT(*) > 9
    `).all();
    if (tooManyTags.length > 0) {
      fail(`Packs exceed the nine-tag limit: ${JSON.stringify(tooManyTags)}`);
    }

    const missingAuthorTags = db.prepare(`
      SELECT p.id, p.title, p.pack_author
      FROM sigame_packs p
      LEFT JOIN sigame_pack_tags t
        ON t.pack_id = p.id AND t.tag = p.pack_author COLLATE NOCASE
      WHERE p.pack_author IS NOT NULL AND t.pack_id IS NULL
    `).all();
    if (missingAuthorTags.length > 0) {
      fail(`Missing author tags after update: ${JSON.stringify(missingAuthorTags)}`);
    }

    console.log(
      `Added author tags to ${selected.length} packs in ${databasePath}; `
      + `${unattributedStorageKeys.size} packs left unattributed.`
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
