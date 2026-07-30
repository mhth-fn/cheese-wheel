#!/usr/bin/env node
'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const movies = [
  [5, 'Питер ФМ', 'Питер FM', 'Piter FM', 2006, 'Оксана Бычкова'],
  [7, 'От заката до рассвета', 'От заката до рассвета', 'From Dusk till Dawn', 1996, 'Роберт Родригес'],
  [9, 'Видеодром', 'Видеодром', 'Videodrome', 1983, 'Дэвид Кроненберг'],
  [10, 'Пианистка', 'Пианистка', 'The Piano Teacher', 2001, 'Михаэль Ханеке'],
  [11, 'Хрусталев, машину', 'Хрусталёв, машину!', 'Khrustalyov, My Car!', 1998, 'Алексей Герман'],
  [12, 'Чужой', 'Чужой', 'Alien', 1979, 'Ридли Скотт'],
  [13, 'Воздушная тюрьма', 'Воздушная тюрьма', 'Con Air', 1997, 'Саймон Уэст'],
  [14, 'Варяг', 'Варяг', 'The Northman', 2022, 'Роберт Эггерс'],
  [15, 'Он снова здесь', 'Он снова здесь', "Look Who's Back", 2015, 'Давид Внендт'],
  [16, 'Битва титанов', 'Битва титанов', 'Clash of the Titans', 2010, 'Луи Летерье'],
  [17, 'Тачки', 'Тачки', 'Cars', 2006, 'Джон Лассетер'],
  [18, 'Эквилибриум', 'Эквилибриум', 'Equilibrium', 2002, 'Курт Уиммер'],
  [19, 'Наемный убийца', 'Наёмный убийца', 'The Killer', 1989, 'Джон Ву'],
  [20, 'Святые из Бундока', 'Святые из Бундока', 'The Boondock Saints', 1999, 'Трой Даффи'],
  [21, 'Побег из Нью-Йорка', 'Побег из Нью-Йорка', 'Escape from New York', 1981, 'Джон Карпентер'],
  [22, 'Счастливого Рождества, мистер Лоуренс', 'Счастливого Рождества, мистер Лоуренс', 'Merry Christmas, Mr. Lawrence', 1983, 'Нагиса Осима'],
  [23, 'Госпожа Кровавый Снег', 'Госпожа Кровавый Снег', 'Lady Snowblood', 1973, 'Тосия Фудзита'],
  [24, 'Экзистенция', 'Экзистенция', 'eXistenZ', 1999, 'Дэвид Кроненберг'],
  [25, 'Муха', 'Муха', 'The Fly', 1986, 'Дэвид Кроненберг'],
  [26, 'Плетеный человек', 'Плетёный человек', 'The Wicker Man', 1973, 'Робин Харди'],
  [27, 'Титан', 'Титан', 'Titane', 2021, 'Жюлия Дюкорно'],
  [28, 'Сказка для старых', 'Сказка для старых', 'A Fairy Tale for the Old', 2022, 'Фёдор Лавров, Роман Михайлов'],
  [29, 'Призрачная нить', 'Призрачная нить', 'Phantom Thread', 2017, 'Пол Томас Андерсон'],
  [30, 'Лакричная пицца', 'Лакричная пицца', 'Licorice Pizza', 2021, 'Пол Томас Андерсон'],
  [31, 'Крадущийся тигр, затаившийся дракон', 'Крадущийся тигр, затаившийся дракон', 'Crouching Tiger, Hidden Dragon', 2000, 'Энг Ли'],
  [32, 'Малышка на миллион', 'Малышка на миллион', 'Million Dollar Baby', 2004, 'Клинт Иствуд'],
  [33, 'Церемония', 'Церемония', 'The Ceremony (La Cérémonie)', 1995, 'Клод Шаброль'],
  [34, 'Бьютифул', 'Бьютифул', 'Biutiful', 2010, 'Алехандро Гонсалес Иньярриту'],
  [35, 'Дюна 1984', 'Дюна', 'Dune', 1984, 'Дэвид Линч'],
  [36, 'Я все еще здесь', 'Я всё ещё здесь', "I'm Still Here", 2010, 'Кейси Аффлек'],
  [37, 'Голый пистолет: из архивов Полицейского отряда!', 'Голый пистолет: Из архивов полицейского отряда!', 'The Naked Gun: From the Files of Police Squad!', 1988, 'Дэвид Цукер'],
  [38, 'С широко закрытыми глазами', 'С широко закрытыми глазами', 'Eyes Wide Shut', 1999, 'Стэнли Кубрик'],
  [39, 'Акира', 'Акира', 'Akira', 1988, 'Кацухиро Отомо'],
  [40, 'Адамовы яблоки', 'Адамовы яблоки', "Adam's Apples", 2005, 'Андерс Томас Йенсен'],
  [41, 'Качая железо', 'Качая железо', 'Pumping Iron', 1977, 'Джордж Батлер, Роберт Фиоре'],
  [42, 'На ярком солнце', 'На ярком солнце', 'Purple Noon', 1960, 'Рене Клеман'],
  [43, 'Исчезновение', 'Исчезновение', 'The Vanishing', 1988, 'Георг Слёйзер'],
  [44, 'Не грози южному централу', 'Не грози Южному Централу, попивая сок у себя в квартале', "Don't Be a Menace to South Central While Drinking Your Juice in the Hood", 1996, 'Пэрис Барклай'],
  [45, 'Лестница Иакова', 'Лестница Иакова', "Jacob's Ladder", 1990, 'Эдриан Лайн'],
  [46, 'Банши Инишерина', 'Банши Инишерина', 'The Banshees of Inisherin', 2022, 'Мартин Макдона'],
  [47, 'Белые чики', 'Белые цыпочки', 'White Chicks', 2004, 'Кинен Айвори Уэйанс'],
  [48, 'Джуниор', 'Джуниор', 'Junior', 1994, 'Айван Райтман'],
  [49, 'Близнецы', 'Близнецы', 'Twins', 1988, 'Айван Райтман'],
  [50, 'РРР', 'RRR: Рядом ревёт революция', 'RRR', 2022, 'С. С. Раджамули'],
  [52, 'Зеленый рыцарь', 'Зелёный рыцарь', 'The Green Knight', 2021, 'Дэвид Лоури'],
  [53, 'Вспомнить все', 'Вспомнить всё', 'Total Recall', 1990, 'Пол Верховен'],
  [54, 'Дорога', 'Дорога', 'The Road', 2009, 'Джон Хиллкоут'],
  [55, 'Мастер', 'Мастер', 'The Master', 2012, 'Пол Томас Андерсон'],
  [56, 'Хищник', 'Хищник', 'Predator', 1987, 'Джон Мактирнан'],
  [57, 'Тони Эрдман', 'Тони Эрдманн', 'Toni Erdmann', 2016, 'Марен Аде'],
  [58, 'Фейерверк', 'Фейерверк', 'Fireworks (Hana-bi)', 1997, 'Такэси Китано'],
  [59, 'Треугольник печали', 'Треугольник печали', 'Triangle of Sadness', 2022, 'Рубен Эстлунд'],
  [60, 'За пригоршню долларов', 'За пригоршню долларов', 'A Fistful of Dollars', 1964, 'Серджо Леоне'],
  [62, 'Закусочная на колесах', 'Закусочная на колёсах', 'Wheels on Meals', 1984, 'Саммо Хун'],
  [63, 'Европа', 'Европа', 'Europa', 1991, 'Ларс фон Триер'],
  [68, 'Взрыв из прошлого', 'Взрыв из прошлого', 'Blast from the Past', 1999, 'Хью Уилсон'],
  [91, 'Perfect blue', 'Идеальная грусть', 'Perfect Blue', 1997, 'Сатоси Кон'],
  [127, 'Дерсу Узала', 'Дерсу Узала', 'Dersu Uzala', 1975, 'Акира Куросава'],
  [128, 'Планета страха', 'Планета страха', 'Planet Terror', 2007, 'Роберт Родригес'],
  [129, '2046', '2046', '2046', 2004, 'Вонг Карвай'],
  [138, 'Свой среди чужих, чужой среди своих', 'Свой среди чужих, чужой среди своих', 'At Home Among Strangers, a Stranger Among His Own', 1974, 'Никита Михалков'],
  [141, 'Супергеройское кино', 'Супергеройское кино', 'Superhero Movie', 2008, 'Крэйг Мэйзин'],
  [142, 'Маяк', 'Маяк', 'The Lighthouse', 2019, 'Роберт Эггерс'],
  [144, 'Кинопроба (1999)', 'Кинопроба', 'Audition', 1999, 'Такаси Миике'],
  [147, 'Исцеление (1997)', 'Исцеление', 'Cure', 1997, 'Киёси Куросава'],
  [150, 'Wanted (2008)', 'Особо опасен', 'Wanted', 2008, 'Тимур Бекмамбетов'],
].map(([id, previousTitle, title, alternativeTitle, year, director]) => ({
  id,
  previousTitle,
  title,
  alternativeTitle,
  year,
  director,
}));

function fail(message) {
  console.error(message);
  process.exit(1);
}

const databaseArg = process.argv.find(argument => !argument.startsWith('--') && argument !== process.argv[0] && argument !== process.argv[1]);
if (!databaseArg) {
  fail('Usage: node scripts/backfill-movie-metadata.js /path/to/cheese_wheel.db [--apply]');
}

const databasePath = path.resolve(databaseArg);
const apply = process.argv.includes('--apply');
const db = new Database(databasePath, { readonly: !apply, fileMustExist: true });

try {
  const columns = new Set(db.prepare('PRAGMA table_info(movies)').all().map(column => column.name));
  for (const requiredColumn of ['alternative_title', 'director', 'year']) {
    if (!columns.has(requiredColumn)) {
      fail(`Missing movies.${requiredColumn}; start the updated server once before the backfill.`);
    }
  }

  const watched = db.prepare(`
    SELECT id, title
    FROM movies
    WHERE is_watched = 1
    ORDER BY id
  `).all();
  const metadataById = new Map(movies.map(movie => [movie.id, movie]));
  const uncovered = watched.filter(movie => !metadataById.has(Number(movie.id)));
  if (uncovered.length > 0) {
    fail(`Uncovered watched movies: ${uncovered.map(movie => `${movie.id}:${movie.title}`).join(', ')}`);
  }

  const watchedById = new Map(watched.map(movie => [Number(movie.id), movie]));
  for (const movie of movies) {
    const stored = watchedById.get(movie.id);
    if (!stored) fail(`Watched movie ${movie.id} is missing`);
    if (stored.title !== movie.previousTitle && stored.title !== movie.title) {
      fail(`Title mismatch for ${movie.id}: expected "${movie.previousTitle}", found "${stored.title}"`);
    }
  }

  if (!apply) {
    console.log(`Validated ${movies.length} watched movies. Re-run with --apply to update them.`);
    process.exit(0);
  }

  const updateMovie = db.prepare(`
    UPDATE movies
    SET title = ?, alternative_title = ?, year = ?, director = ?
    WHERE id = ? AND is_watched = 1
  `);
  const hasMovieReviews = db.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = 'movie_reviews'
  `).get();
  const updateLinkedReviews = hasMovieReviews
    ? db.prepare('UPDATE movie_reviews SET title = ? WHERE movie_id = ?')
    : null;

  db.transaction(() => {
    for (const movie of movies) {
      const result = updateMovie.run(
        movie.title,
        movie.alternativeTitle,
        movie.year,
        movie.director,
        movie.id
      );
      if (result.changes !== 1) fail(`Movie ${movie.id} was not updated`);
      updateLinkedReviews?.run(movie.title, movie.id);
    }
  })();

  const incomplete = db.prepare(`
    SELECT id, title
    FROM movies
    WHERE is_watched = 1
      AND (
        COALESCE(TRIM(alternative_title), '') = ''
        OR COALESCE(TRIM(director), '') = ''
        OR year IS NULL
      )
  `).all();
  if (incomplete.length > 0) {
    fail(`Incomplete watched movies after update: ${JSON.stringify(incomplete)}`);
  }

  console.log(`Updated ${movies.length} watched movies in ${databasePath}`);
} finally {
  db.close();
}
