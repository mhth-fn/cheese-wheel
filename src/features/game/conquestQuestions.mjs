const CATEGORIES = [
  'История',
  'География',
  'Наука',
  'Технологии',
  'Кино',
  'Литература',
  'Музыка',
  'Спорт',
  'Общие знания',
];

export const ESTIMATE_QUESTIONS = [
  {
    id: 'estimate-001',
    category: 'История',
    prompt: 'В каком году Юрий Гагарин совершил первый в истории полёт человека в космос?',
    answer: 1961,
    spread: 25,
    suffix: 'год',
  },
  {
    id: 'estimate-002',
    category: 'История',
    prompt: 'В каком году в Афинах открылись первые Олимпийские игры современности?',
    answer: 1896,
    spread: 30,
    suffix: 'год',
  },
  {
    id: 'estimate-003',
    category: 'История',
    prompt: 'Каким годом датируется первое летописное упоминание Москвы?',
    answer: 1147,
    spread: 100,
    suffix: 'год',
  },
  {
    id: 'estimate-004',
    category: 'История',
    prompt: 'В каком году традиционно датируют падение Западной Римской империи?',
    answer: 476,
    spread: 100,
    suffix: 'год',
  },
  {
    id: 'estimate-005',
    category: 'География',
    prompt: 'Какова приблизительная длина земного экватора в километрах?',
    answer: 40075,
    spread: 5000,
    suffix: 'км',
  },
  {
    id: 'estimate-006',
    category: 'География',
    prompt: 'Какова максимальная глубина озера Байкал в метрах?',
    answer: 1642,
    spread: 250,
    suffix: 'м',
  },
  {
    id: 'estimate-007',
    category: 'География',
    prompt: 'Какова официальная высота Эвереста по совместно объявленному Непалом и Китаем результату 2020 года, округлённая до целого метра?',
    answer: 8849,
    spread: 1000,
    suffix: 'м',
  },
  {
    id: 'estimate-008',
    category: 'География',
    prompt: 'По состоянию на 2026 год со сколькими государствами — членами ООН Россия имеет сухопутную границу?',
    answer: 14,
    spread: 4,
    suffix: 'стран',
  },
  {
    id: 'estimate-009',
    category: 'Наука',
    prompt: 'Сколько химических элементов имели утверждённые IUPAC названия по состоянию на 2026 год?',
    answer: 118,
    spread: 15,
    suffix: 'элементов',
  },
  {
    id: 'estimate-010',
    category: 'Наука',
    prompt: 'Какова скорость света в вакууме в километрах в секунду, округлённая до целого?',
    answer: 299792,
    spread: 50000,
    suffix: 'км/с',
  },
  {
    id: 'estimate-011',
    category: 'Наука',
    prompt: 'Сколько хромосом обычно содержится в соматической клетке человека?',
    answer: 46,
    spread: 8,
    suffix: 'хромосом',
  },
  {
    id: 'estimate-012',
    category: 'Наука',
    prompt: 'Сколько планет входит в Солнечную систему?',
    answer: 8,
    spread: 2,
    suffix: 'планет',
  },
  {
    id: 'estimate-013',
    category: 'Технологии',
    prompt: 'Сколько различных кодов содержит исходная семибитная таблица ASCII?',
    answer: 128,
    spread: 24,
    suffix: 'кодов',
  },
  {
    id: 'estimate-014',
    category: 'Технологии',
    prompt: 'В каком году Тим Бернерс-Ли представил первое предложение о Всемирной паутине?',
    answer: 1989,
    spread: 15,
    suffix: 'год',
  },
  {
    id: 'estimate-015',
    category: 'Технологии',
    prompt: 'Сколько битов содержит один байт?',
    answer: 8,
    spread: 2,
    suffix: 'битов',
  },
  {
    id: 'estimate-016',
    category: 'Технологии',
    prompt: 'С какого года отсчитывается время Unix?',
    answer: 1970,
    spread: 15,
    suffix: 'год',
  },
  {
    id: 'estimate-017',
    category: 'Кино',
    prompt: 'Сколько кадров в секунду составляет стандартная частота показа звукового кино?',
    answer: 24,
    spread: 6,
    suffix: 'кадра/с',
  },
  {
    id: 'estimate-018',
    category: 'Кино',
    prompt: 'В каком году братья Люмьер устроили в Париже свой знаменитый платный публичный кинопоказ?',
    answer: 1895,
    spread: 20,
    suffix: 'год',
  },
  {
    id: 'estimate-019',
    category: 'Кино',
    prompt: 'В каком году состоялась первая церемония вручения премии «Оскар»?',
    answer: 1929,
    spread: 20,
    suffix: 'год',
  },
  {
    id: 'estimate-020',
    category: 'Литература',
    prompt: 'Сколько завершённых глав входит в роман в стихах «Евгений Онегин»?',
    answer: 8,
    spread: 2,
    suffix: 'глав',
  },
  {
    id: 'estimate-021',
    category: 'Литература',
    prompt: 'В каком году впервые был опубликован роман «Сто лет одиночества»?',
    answer: 1967,
    spread: 20,
    suffix: 'год',
  },
  {
    id: 'estimate-022',
    category: 'Литература',
    prompt: 'На сколько частей традиционно делится «Божественная комедия» Данте?',
    answer: 3,
    spread: 1,
    suffix: 'части',
  },
  {
    id: 'estimate-023',
    category: 'Музыка',
    prompt: 'Сколько завершённых симфоний написал Людвиг ван Бетховен?',
    answer: 9,
    spread: 3,
    suffix: 'симфоний',
  },
  {
    id: 'estimate-024',
    category: 'Музыка',
    prompt: 'Сколько клавиш у стандартного современного концертного фортепиано?',
    answer: 88,
    spread: 12,
    suffix: 'клавиш',
  },
  {
    id: 'estimate-025',
    category: 'Музыка',
    prompt: 'Сколько различных ступеней содержит диатоническая гамма?',
    answer: 7,
    spread: 2,
    suffix: 'ступеней',
  },
  {
    id: 'estimate-026',
    category: 'Спорт',
    prompt: 'Какова официальная длина марафонской дистанции в метрах?',
    answer: 42195,
    spread: 5000,
    suffix: 'м',
  },
  {
    id: 'estimate-027',
    category: 'Спорт',
    prompt: 'Каково максимальное число игроков одной команды, одновременно находящихся на поле в футболе по правилам IFAB?',
    answer: 11,
    spread: 3,
    suffix: 'игроков',
  },
  {
    id: 'estimate-028',
    category: 'Спорт',
    prompt: 'Сколько переплетённых колец изображено на олимпийском символе?',
    answer: 5,
    spread: 2,
    suffix: 'колец',
  },
  {
    id: 'estimate-029',
    category: 'Общие знания',
    prompt: 'Сколько букв в современном русском алфавите?',
    answer: 33,
    spread: 5,
    suffix: 'буквы',
  },
  {
    id: 'estimate-030',
    category: 'Общие знания',
    prompt: 'Сколько минут содержится в одних сутках?',
    answer: 1440,
    spread: 240,
    suffix: 'минут',
  },
];

export const BATTLE_QUESTIONS = [
  {
    id: 'battle-001',
    category: 'История',
    prompt: 'Кто стал первым российским императором?',
    options: ['Иван IV', 'Пётр I', 'Екатерина II', 'Александр I'],
    correctIndex: 1,
  },
  {
    id: 'battle-002',
    category: 'История',
    prompt: 'В каком году завершилась Великая Отечественная война?',
    options: ['1943', '1944', '1945', '1946'],
    correctIndex: 2,
  },
  {
    id: 'battle-003',
    category: 'История',
    prompt: 'Какой древний город был погребён при извержении Везувия в 79 году?',
    options: ['Помпеи', 'Спарта', 'Карфаген', 'Микены'],
    correctIndex: 0,
  },
  {
    id: 'battle-004',
    category: 'История',
    prompt: 'Какая система письма возникла в древней Месопотамии?',
    options: ['Глаголица', 'Клинопись', 'Латиница', 'Деванагари'],
    correctIndex: 1,
  },
  {
    id: 'battle-005',
    category: 'История',
    prompt: 'На какой площади Санкт-Петербурга произошло восстание декабристов?',
    options: ['Дворцовая', 'Исаакиевская', 'Сенатская', 'Марсово поле'],
    correctIndex: 2,
  },
  {
    id: 'battle-006',
    category: 'История',
    prompt: 'В каком королевстве в 1215 году была скреплена печатью Великая хартия вольностей?',
    options: ['Франция', 'Англия', 'Испания', 'Португалия'],
    correctIndex: 1,
  },
  {
    id: 'battle-007',
    category: 'История',
    prompt: 'Как называлась столица Византийской империи?',
    options: ['Александрия', 'Антиохия', 'Константинополь', 'Карфаген'],
    correctIndex: 2,
  },
  {
    id: 'battle-008',
    category: 'История',
    prompt: 'В каком сражении Наполеон потерпел окончательное поражение?',
    options: ['При Аустерлице', 'При Ватерлоо', 'При Бородине', 'При Йене'],
    correctIndex: 1,
  },
  {
    id: 'battle-009',
    category: 'География',
    prompt: 'Какой город является столицей Австралии?',
    options: ['Сидней', 'Мельбурн', 'Канберра', 'Перт'],
    correctIndex: 2,
  },
  {
    id: 'battle-010',
    category: 'География',
    prompt: 'Какой океан крупнейший по площади?',
    options: ['Атлантический', 'Индийский', 'Северный Ледовитый', 'Тихий'],
    correctIndex: 3,
  },
  {
    id: 'battle-011',
    category: 'География',
    prompt: 'Какая река протекает через Каир?',
    options: ['Нил', 'Конго', 'Нигер', 'Замбези'],
    correctIndex: 0,
  },
  {
    id: 'battle-012',
    category: 'География',
    prompt: 'На каком материке расположена пустыня Сахара?',
    options: ['Азия', 'Африка', 'Южная Америка', 'Австралия'],
    correctIndex: 1,
  },
  {
    id: 'battle-013',
    category: 'География',
    prompt: 'Какой пролив разделяет Азию и Северную Америку?',
    options: ['Гибралтарский', 'Магелланов', 'Берингов', 'Малаккский'],
    correctIndex: 2,
  },
  {
    id: 'battle-014',
    category: 'География',
    prompt: 'Какой город является столицей Канады?',
    options: ['Торонто', 'Оттава', 'Монреаль', 'Ванкувер'],
    correctIndex: 1,
  },
  {
    id: 'battle-015',
    category: 'География',
    prompt: 'На каком материке протянулись Анды?',
    options: ['Африка', 'Евразия', 'Южная Америка', 'Северная Америка'],
    correctIndex: 2,
  },
  {
    id: 'battle-016',
    category: 'География',
    prompt: 'В какое море впадает Рейн?',
    options: ['Балтийское', 'Чёрное', 'Северное', 'Средиземное'],
    correctIndex: 2,
  },
  {
    id: 'battle-017',
    category: 'Наука',
    prompt: 'Какой химический символ обозначает золото?',
    options: ['Ag', 'Au', 'Fe', 'Zn'],
    correctIndex: 1,
  },
  {
    id: 'battle-018',
    category: 'Наука',
    prompt: 'Какой газ составляет большую часть земной атмосферы?',
    options: ['Кислород', 'Углекислый газ', 'Азот', 'Аргон'],
    correctIndex: 2,
  },
  {
    id: 'battle-019',
    category: 'Наука',
    prompt: 'Какую планету называют Красной планетой?',
    options: ['Венеру', 'Марс', 'Юпитер', 'Меркурий'],
    correctIndex: 1,
  },
  {
    id: 'battle-020',
    category: 'Наука',
    prompt: 'Как называется процесс образования органических веществ растениями с помощью света?',
    options: ['Дыхание', 'Брожение', 'Фотосинтез', 'Испарение'],
    correctIndex: 2,
  },
  {
    id: 'battle-021',
    category: 'Наука',
    prompt: 'Какой орган человека перекачивает кровь по сосудам?',
    options: ['Печень', 'Сердце', 'Лёгкие', 'Почки'],
    correctIndex: 1,
  },
  {
    id: 'battle-022',
    category: 'Наука',
    prompt: 'Какой минерал считается самым твёрдым по шкале Мооса?',
    options: ['Кварц', 'Корунд', 'Алмаз', 'Топаз'],
    correctIndex: 2,
  },
  {
    id: 'battle-023',
    category: 'Наука',
    prompt: 'В каких единицах СИ измеряют силу?',
    options: ['В джоулях', 'В ваттах', 'В ньютонах', 'В паскалях'],
    correctIndex: 2,
  },
  {
    id: 'battle-024',
    category: 'Наука',
    prompt: 'Как называется наименьшая электрически нейтральная частица химического элемента?',
    options: ['Атом', 'Протон', 'Электрон', 'Фотон'],
    correctIndex: 0,
  },
  {
    id: 'battle-025',
    category: 'Технологии',
    prompt: 'Какие две цифры используются в двоичной системе счисления?',
    options: ['0 и 1', '1 и 2', '0 и 2', '2 и 3'],
    correctIndex: 0,
  },
  {
    id: 'battle-026',
    category: 'Технологии',
    prompt: 'Кто создал Всемирную паутину?',
    options: ['Алан Тьюринг', 'Тим Бернерс-Ли', 'Деннис Ритчи', 'Стив Возняк'],
    correctIndex: 1,
  },
  {
    id: 'battle-027',
    category: 'Технологии',
    prompt: 'Какой компонент компьютера обычно называют центральным процессором?',
    options: ['RAM', 'SSD', 'CPU', 'GPU'],
    correctIndex: 2,
  },
  {
    id: 'battle-028',
    category: 'Технологии',
    prompt: 'Какой протокол защищает обычный веб-трафик HTTP шифрованием TLS?',
    options: ['FTP', 'HTTPS', 'SMTP', 'DHCP'],
    correctIndex: 1,
  },
  {
    id: 'battle-029',
    category: 'Технологии',
    prompt: 'Как расшифровывается сокращение QR в названии QR-кода?',
    options: ['Quick Response', 'Query Route', 'Quality Read', 'Quantum Record'],
    correctIndex: 0,
  },
  {
    id: 'battle-030',
    category: 'Технологии',
    prompt: 'Кто начал разработку ядра Linux?',
    options: ['Линус Торвальдс', 'Ричард Столлман', 'Билл Гейтс', 'Джеймс Гослинг'],
    correctIndex: 0,
  },
  {
    id: 'battle-031',
    category: 'Технологии',
    prompt: 'Какой формат растровых изображений использует сжатие без потерь?',
    options: ['PNG', 'MP3', 'MPEG', 'AAC'],
    correctIndex: 0,
  },
  {
    id: 'battle-032',
    category: 'Кино',
    prompt: 'Кто поставил фильм «Гражданин Кейн»?',
    options: ['Орсон Уэллс', 'Альфред Хичкок', 'Фрэнк Капра', 'Джон Форд'],
    correctIndex: 0,
  },
  {
    id: 'battle-033',
    category: 'Кино',
    prompt: 'Какая студия создала анимационный фильм «Мой сосед Тоторо»?',
    options: ['Pixar', 'Studio Ghibli', 'Aardman', 'DreamWorks'],
    correctIndex: 1,
  },
  {
    id: 'battle-034',
    category: 'Кино',
    prompt: 'Кто снял немой научно-фантастический фильм «Метрополис»?',
    options: ['Фриц Ланг', 'Чарли Чаплин', 'Фридрих Мурнау', 'Бастер Китон'],
    correctIndex: 0,
  },
  {
    id: 'battle-035',
    category: 'Кино',
    prompt: 'Какой актёр сыграл Нео в фильме «Матрица»?',
    options: ['Брэд Питт', 'Киану Ривз', 'Том Круз', 'Джонни Депп'],
    correctIndex: 1,
  },
  {
    id: 'battle-036',
    category: 'Кино',
    prompt: 'Какая организация вручает премию «Оскар»?',
    options: ['Академия кинематографических искусств и наук (AMPAS)', 'Каннский фестиваль', 'Гильдия режиссёров США', 'Британский институт кино'],
    correctIndex: 0,
  },
  {
    id: 'battle-037',
    category: 'Кино',
    prompt: 'Кто снял фильм «Броненосец „Потёмкин“»?',
    options: ['Сергей Эйзенштейн', 'Дзига Вертов', 'Всеволод Пудовкин', 'Александр Довженко'],
    correctIndex: 0,
  },
  {
    id: 'battle-038',
    category: 'Литература',
    prompt: 'Кто написал трагедию «Гамлет»?',
    options: ['Уильям Шекспир', 'Кристофер Марло', 'Бен Джонсон', 'Джон Мильтон'],
    correctIndex: 0,
  },
  {
    id: 'battle-039',
    category: 'Литература',
    prompt: 'Кто является автором романа «Война и мир»?',
    options: ['Иван Тургенев', 'Лев Толстой', 'Фёдор Достоевский', 'Иван Гончаров'],
    correctIndex: 1,
  },
  {
    id: 'battle-040',
    category: 'Литература',
    prompt: 'Кто создал образ Дон Кихота?',
    options: ['Лопе де Вега', 'Мигель де Сервантес', 'Франсиско де Кеведо', 'Педро Кальдерон'],
    correctIndex: 1,
  },
  {
    id: 'battle-041',
    category: 'Литература',
    prompt: 'Кто написал повесть «Маленький принц»?',
    options: ['Жюль Верн', 'Антуан де Сент-Экзюпери', 'Альбер Камю', 'Ромен Роллан'],
    correctIndex: 1,
  },
  {
    id: 'battle-042',
    category: 'Литература',
    prompt: 'Кто является автором романа «1984»?',
    options: ['Олдос Хаксли', 'Рэй Брэдбери', 'Джордж Оруэлл', 'Герберт Уэллс'],
    correctIndex: 2,
  },
  {
    id: 'battle-043',
    category: 'Литература',
    prompt: 'Кто написал роман «Мастер и Маргарита»?',
    options: ['Михаил Булгаков', 'Алексей Толстой', 'Андрей Платонов', 'Илья Ильф'],
    correctIndex: 0,
  },
  {
    id: 'battle-044',
    category: 'Музыка',
    prompt: 'Кто написал цикл концертов «Времена года»?',
    options: ['Иоганн Себастьян Бах', 'Антонио Вивальди', 'Георг Гендель', 'Йозеф Гайдн'],
    correctIndex: 1,
  },
  {
    id: 'battle-045',
    category: 'Музыка',
    prompt: 'Кто написал оперу «Волшебная флейта»?',
    options: ['Вольфганг Амадей Моцарт', 'Джузеппе Верди', 'Рихард Вагнер', 'Джоаккино Россини'],
    correctIndex: 0,
  },
  {
    id: 'battle-046',
    category: 'Музыка',
    prompt: 'Какая группа записала песню «Bohemian Rhapsody»?',
    options: ['The Beatles', 'Queen', 'Pink Floyd', 'Led Zeppelin'],
    correctIndex: 1,
  },
  {
    id: 'battle-047',
    category: 'Музыка',
    prompt: 'Кто является автором оркестрового произведения «Болеро»?',
    options: ['Клод Дебюсси', 'Морис Равель', 'Эрик Сати', 'Камиль Сен-Санс'],
    correctIndex: 1,
  },
  {
    id: 'battle-048',
    category: 'Музыка',
    prompt: 'Кто сочинил фортепианную сонату, известную как «Лунная»?',
    options: ['Франц Шуберт', 'Людвиг ван Бетховен', 'Фредерик Шопен', 'Ференц Лист'],
    correctIndex: 1,
  },
  {
    id: 'battle-049',
    category: 'Музыка',
    prompt: 'Кто написал музыку к балету «Лебединое озеро»?',
    options: ['Сергей Прокофьев', 'Пётр Чайковский', 'Игорь Стравинский', 'Арам Хачатурян'],
    correctIndex: 1,
  },
  {
    id: 'battle-050',
    category: 'Спорт',
    prompt: 'На каком покрытии проводят матчи Уимблдонского теннисного турнира?',
    options: ['На грунте', 'На траве', 'На паркете', 'На льду'],
    correctIndex: 1,
  },
  {
    id: 'battle-051',
    category: 'Спорт',
    prompt: 'Как называется счёт 40:40 в теннисном гейме?',
    options: ['Брейк', 'Тай-брейк', 'Ровно', 'Матчбол'],
    correctIndex: 2,
  },
  {
    id: 'battle-052',
    category: 'Спорт',
    prompt: 'Сколько очков приносит реализованный штрафной бросок в баскетболе?',
    options: ['Одно', 'Два', 'Три', 'Четыре'],
    correctIndex: 0,
  },
  {
    id: 'battle-053',
    category: 'Спорт',
    prompt: 'Как в шахматах называется нападение на короля?',
    options: ['Шах', 'Пат', 'Рокировка', 'Гамбит'],
    correctIndex: 0,
  },
  {
    id: 'battle-054',
    category: 'Спорт',
    prompt: 'Сколько сетов должна выиграть команда для победы в матче по волейболу в помещении по правилам FIVB?',
    options: ['Две', 'Три', 'Четыре', 'Пять'],
    correctIndex: 1,
  },
  {
    id: 'battle-055',
    category: 'Спорт',
    prompt: 'Какие два состязания объединяет биатлон?',
    options: ['Бег и плавание', 'Лыжную гонку и стрельбу', 'Велогонку и фехтование', 'Прыжки и метание'],
    correctIndex: 1,
  },
  {
    id: 'battle-056',
    category: 'Общие знания',
    prompt: 'Какое число записывается римскими цифрами XL?',
    options: ['30', '40', '50', '60'],
    correctIndex: 1,
  },
  {
    id: 'battle-057',
    category: 'Общие знания',
    prompt: 'Чему равен квадратный корень из 144?',
    options: ['10', '11', '12', '14'],
    correctIndex: 2,
  },
  {
    id: 'battle-058',
    category: 'Общие знания',
    prompt: 'Сколько сторон у восьмиугольника?',
    options: ['Шесть', 'Семь', 'Восемь', 'Девять'],
    correctIndex: 2,
  },
  {
    id: 'battle-059',
    category: 'Общие знания',
    prompt: 'Сколько цветов традиционно выделяют в радуге в русской культуре?',
    options: ['Пять', 'Шесть', 'Семь', 'Восемь'],
    correctIndex: 2,
  },
  {
    id: 'battle-060',
    category: 'Общие знания',
    prompt: 'Сколько граней у обычного игрального кубика?',
    options: ['Четыре', 'Шесть', 'Восемь', 'Двенадцать'],
    correctIndex: 1,
  },
  {
    id: 'battle-061',
    category: 'История',
    prompt: 'В каком году произошло восстание декабристов на Сенатской площади?',
    options: ['1812', '1825', '1837', '1855'],
    correctIndex: 1,
  },
  {
    id: 'battle-062',
    category: 'История',
    prompt: 'Под чьим первоначальным командованием в 1519 году отправилась экспедиция, впервые завершившая кругосветное плавание?',
    options: ['Христофора Колумба', 'Фернана Магеллана', 'Васко да Гамы', 'Джеймса Кука'],
    correctIndex: 1,
  },
  {
    id: 'battle-063',
    category: 'История',
    prompt: 'Как назывался торговый маршрут, связывавший Китай со Средиземноморьем?',
    options: ['Шёлковый путь', 'Янтарный путь', 'Путь специй', 'Королевская дорога'],
    correctIndex: 0,
  },
  {
    id: 'battle-064',
    category: 'История',
    prompt: 'Какую древнюю письменность помогла расшифровать надпись на Розеттском камне?',
    options: ['Египетские иероглифы', 'Скандинавские руны', 'Критское линейное письмо', 'Финикийский алфавит'],
    correctIndex: 0,
  },
  {
    id: 'battle-065',
    category: 'История',
    prompt: 'В каком сражении 1709 года армия Петра I победила войска Карла XII?',
    options: ['В Полтавской битве', 'В Ледовом побоище', 'В Куликовской битве', 'В Бородинском сражении'],
    correctIndex: 0,
  },
  {
    id: 'battle-066',
    category: 'География',
    prompt: 'Какая река протекает через Будапешт?',
    options: ['Рейн', 'Дунай', 'Висла', 'Сена'],
    correctIndex: 1,
  },
  {
    id: 'battle-067',
    category: 'География',
    prompt: 'Какая пустыня занимает значительную часть территории Ботсваны?',
    options: ['Атакама', 'Намиб', 'Калахари', 'Гоби'],
    correctIndex: 2,
  },
  {
    id: 'battle-068',
    category: 'География',
    prompt: 'Столицей какой страны является Лима?',
    options: ['Чили', 'Перу', 'Эквадор', 'Боливия'],
    correctIndex: 1,
  },
  {
    id: 'battle-069',
    category: 'География',
    prompt: 'На каком острове находится вулкан Этна?',
    options: ['Сардиния', 'Крит', 'Сицилия', 'Корсика'],
    correctIndex: 2,
  },
  {
    id: 'battle-070',
    category: 'География',
    prompt: 'Какое государство полностью окружено территорией Южно-Африканской Республики?',
    options: ['Лесото', 'Эсватини', 'Ботсвана', 'Намибия'],
    correctIndex: 0,
  },
  {
    id: 'battle-071',
    category: 'География',
    prompt: 'Какой океан омывает западное побережье Мексики?',
    options: ['Атлантический', 'Индийский', 'Северный Ледовитый', 'Тихий'],
    correctIndex: 3,
  },
  {
    id: 'battle-072',
    category: 'География',
    prompt: 'Какой город является столицей Новой Зеландии?',
    options: ['Окленд', 'Веллингтон', 'Крайстчерч', 'Данидин'],
    correctIndex: 1,
  },
  {
    id: 'battle-073',
    category: 'География',
    prompt: 'В какой стране находится гора Килиманджаро?',
    options: ['Кения', 'Танзания', 'Эфиопия', 'Уганда'],
    correctIndex: 1,
  },
  {
    id: 'battle-074',
    category: 'Наука',
    prompt: 'Какой химический элемент имеет символ Fe?',
    options: ['Фтор', 'Железо', 'Франций', 'Фермий'],
    correctIndex: 1,
  },
  {
    id: 'battle-075',
    category: 'Наука',
    prompt: 'Какая частица атома обладает отрицательным электрическим зарядом?',
    options: ['Протон', 'Нейтрон', 'Электрон', 'Фотон'],
    correctIndex: 2,
  },
  {
    id: 'battle-076',
    category: 'Наука',
    prompt: 'Как называется переход вещества из твёрдого состояния сразу в газообразное?',
    options: ['Конденсация', 'Сублимация', 'Плавление', 'Ионизация'],
    correctIndex: 1,
  },
  {
    id: 'battle-077',
    category: 'Наука',
    prompt: 'У какой планеты главные кольца обозначают буквами A, B и C?',
    options: ['Марс', 'Венера', 'Сатурн', 'Меркурий'],
    correctIndex: 2,
  },
  {
    id: 'battle-078',
    category: 'Наука',
    prompt: 'Какой орган человеческого тела вырабатывает инсулин?',
    options: ['Печень', 'Щитовидная железа', 'Поджелудочная железа', 'Селезёнка'],
    correctIndex: 2,
  },
  {
    id: 'battle-079',
    category: 'Наука',
    prompt: 'Как называется единица электрического сопротивления в СИ?',
    options: ['Вольт', 'Ом', 'Ампер', 'Ватт'],
    correctIndex: 1,
  },
  {
    id: 'battle-080',
    category: 'Наука',
    prompt: 'Какой газ растения поглощают из атмосферы во время фотосинтеза?',
    options: ['Кислород', 'Азот', 'Углекислый газ', 'Водород'],
    correctIndex: 2,
  },
  {
    id: 'battle-081',
    category: 'Наука',
    prompt: 'Какую реакцию при 25 °C имеет водный раствор с показателем pH ниже 7?',
    options: ['Кислую', 'Щелочную', 'Нейтральную', 'Только солевую'],
    correctIndex: 0,
  },
  {
    id: 'battle-082',
    category: 'Наука',
    prompt: 'Какой орган образует наружный покров тела и обычно считается крупнейшим органом человека?',
    options: ['Печень', 'Кожа', 'Лёгкие', 'Кишечник'],
    correctIndex: 1,
  },
  {
    id: 'battle-083',
    category: 'Технологии',
    prompt: 'Что обозначает сокращение HTML?',
    options: ['Язык гипертекстовой разметки', 'Протокол передачи файлов', 'Система управления базами данных', 'Формат сжатия изображений'],
    correctIndex: 0,
  },
  {
    id: 'battle-084',
    category: 'Технологии',
    prompt: 'Какая система преобразует доменные имена в IP-адреса?',
    options: ['FTP', 'DNS', 'USB', 'SMTP'],
    correctIndex: 1,
  },
  {
    id: 'battle-085',
    category: 'Технологии',
    prompt: 'Какой язык программирования создал Гвидо ван Россум?',
    options: ['Java', 'Python', 'Ruby', 'Swift'],
    correctIndex: 1,
  },
  {
    id: 'battle-086',
    category: 'Технологии',
    prompt: 'Какой вид компьютерной памяти обычно теряет данные после отключения питания?',
    options: ['Оперативная память', 'Твердотельный накопитель', 'Жёсткий диск', 'Флеш-память'],
    correctIndex: 0,
  },
  {
    id: 'battle-087',
    category: 'Технологии',
    prompt: 'Как называют вредоносную программу, которая маскируется под полезное приложение?',
    options: ['Компилятор', 'Троян', 'Драйвер', 'Браузер'],
    correctIndex: 1,
  },
  {
    id: 'battle-088',
    category: 'Технологии',
    prompt: 'Какой язык описывает внешний вид веб-страницы — цвета, шрифты и расположение элементов?',
    options: ['SQL', 'CSS', 'Bash', 'XML'],
    correctIndex: 1,
  },
  {
    id: 'battle-089',
    category: 'Технологии',
    prompt: 'Какую систему контроля версий Линус Торвальдс создал для разработки ядра Linux?',
    options: ['Git', 'Subversion', 'Mercurial', 'CVS'],
    correctIndex: 0,
  },
  {
    id: 'battle-090',
    category: 'Кино',
    prompt: 'Кто снял фильм «Солярис» 1972 года?',
    options: ['Андрей Тарковский', 'Эльдар Рязанов', 'Леонид Гайдай', 'Сергей Бондарчук'],
    correctIndex: 0,
  },
  {
    id: 'battle-091',
    category: 'Кино',
    prompt: 'Какой фильм первым получил «Оскар» за лучший полнометражный анимационный фильм?',
    options: ['«Шрек»', '«Корпорация монстров»', '«Ледниковый период»', '«Унесённые призраками»'],
    correctIndex: 0,
  },
  {
    id: 'battle-092',
    category: 'Кино',
    prompt: 'Кто сыграл капитана Джека Воробья в серии фильмов «Пираты Карибского моря»?',
    options: ['Орландо Блум', 'Джонни Депп', 'Джеффри Раш', 'Хью Джекман'],
    correctIndex: 1,
  },
  {
    id: 'battle-093',
    category: 'Кино',
    prompt: 'Как называется вымышленная африканская страна в фильмах о Чёрной Пантере?',
    options: ['Замунда', 'Ваканда', 'Геновия', 'Соковия'],
    correctIndex: 1,
  },
  {
    id: 'battle-094',
    category: 'Кино',
    prompt: 'Кто снял кинотрилогию «Властелин колец»?',
    options: ['Питер Джексон', 'Джеймс Кэмерон', 'Ридли Скотт', 'Джордж Лукас'],
    correctIndex: 0,
  },
  {
    id: 'battle-095',
    category: 'Кино',
    prompt: 'В каком фильме Марлон Брандо сыграл главу семьи Корлеоне?',
    options: ['«Крёстный отец»', '«Таксист»', '«Лицо со шрамом»', '«Славные парни»'],
    correctIndex: 0,
  },
  {
    id: 'battle-096',
    category: 'Кино',
    prompt: 'Какой актёр исполнил главную роль в фильме «Форрест Гамп»?',
    options: ['Том Хэнкс', 'Робин Уильямс', 'Кевин Костнер', 'Харрисон Форд'],
    correctIndex: 0,
  },
  {
    id: 'battle-097',
    category: 'Кино',
    prompt: 'Кто снял фильм «Парк юрского периода»?',
    options: ['Стивен Спилберг', 'Джеймс Кэмерон', 'Роберт Земекис', 'Рон Ховард'],
    correctIndex: 0,
  },
  {
    id: 'battle-098',
    category: 'Кино',
    prompt: 'Кто поставил анимационный фильм «Унесённые призраками»?',
    options: ['Мамору Осии', 'Хаяо Миядзаки', 'Сатоси Кон', 'Макото Синкай'],
    correctIndex: 1,
  },
  {
    id: 'battle-099',
    category: 'Литература',
    prompt: 'Кто написал роман «Отцы и дети»?',
    options: ['Иван Тургенев', 'Иван Гончаров', 'Николай Гоголь', 'Александр Герцен'],
    correctIndex: 0,
  },
  {
    id: 'battle-100',
    category: 'Литература',
    prompt: 'Как зовут капитана подводной лодки «Наутилус» в романах Жюля Верна?',
    options: ['Немо', 'Ахав', 'Грант', 'Сильвер'],
    correctIndex: 0,
  },
  {
    id: 'battle-101',
    category: 'Литература',
    prompt: 'Какое произведение Пушкина открывает пролог со строками о дубе у лукоморья?',
    options: ['«Руслан и Людмила»', '«Полтава»', '«Медный всадник»', '«Кавказский пленник»'],
    correctIndex: 0,
  },
  {
    id: 'battle-102',
    category: 'Литература',
    prompt: 'Кто является автором романа «Сто лет одиночества»?',
    options: ['Хорхе Луис Борхес', 'Габриэль Гарсиа Маркес', 'Марио Варгас Льоса', 'Пабло Неруда'],
    correctIndex: 1,
  },
  {
    id: 'battle-103',
    category: 'Литература',
    prompt: 'Под каким литературным именем публиковался Сэмюэл Клеменс?',
    options: ['Льюис Кэрролл', 'Марк Твен', 'О. Генри', 'Джек Лондон'],
    correctIndex: 1,
  },
  {
    id: 'battle-104',
    category: 'Литература',
    prompt: 'Кто написал роман-антиутопию «О дивный новый мир»?',
    options: ['Джордж Оруэлл', 'Рэй Брэдбери', 'Олдос Хаксли', 'Евгений Замятин'],
    correctIndex: 2,
  },
  {
    id: 'battle-105',
    category: 'Литература',
    prompt: 'Как зовут главного героя романа «Преступление и наказание»?',
    options: ['Родион Раскольников', 'Евгений Базаров', 'Григорий Печорин', 'Илья Обломов'],
    correctIndex: 0,
  },
  {
    id: 'battle-106',
    category: 'Музыка',
    prompt: 'Кто написал музыку к балету «Щелкунчик»?',
    options: ['Сергей Прокофьев', 'Пётр Чайковский', 'Игорь Стравинский', 'Николай Римский-Корсаков'],
    correctIndex: 1,
  },
  {
    id: 'battle-107',
    category: 'Музыка',
    prompt: 'Какой низкий деревянный духовой инструмент снабжён двойной тростью?',
    options: ['Флейта', 'Труба', 'Фагот', 'Кларнет'],
    correctIndex: 2,
  },
  {
    id: 'battle-108',
    category: 'Музыка',
    prompt: 'Какая группа записала альбом «The Dark Side of the Moon»?',
    options: ['Queen', 'Pink Floyd', 'Led Zeppelin', 'The Who'],
    correctIndex: 1,
  },
  {
    id: 'battle-109',
    category: 'Музыка',
    prompt: 'Как называется самый низкий основной тип мужского певческого голоса?',
    options: ['Тенор', 'Баритон', 'Контратенор', 'Бас'],
    correctIndex: 3,
  },
  {
    id: 'battle-110',
    category: 'Музыка',
    prompt: 'Сколько струн у стандартной классической гитары?',
    options: ['Четыре', 'Пять', 'Шесть', 'Семь'],
    correctIndex: 2,
  },
  {
    id: 'battle-111',
    category: 'Спорт',
    prompt: 'В каком виде спорта разыгрывается Кубок Дэвиса?',
    options: ['Гольф', 'Теннис', 'Регби', 'Хоккей'],
    correctIndex: 1,
  },
  {
    id: 'battle-112',
    category: 'Спорт',
    prompt: 'Какая шахматная фигура не может ходить назад?',
    options: ['Король', 'Ладья', 'Конь', 'Пешка'],
    correctIndex: 3,
  },
  {
    id: 'battle-113',
    category: 'Спорт',
    prompt: 'Какой баскетбольный бросок при попадании обычно приносит три очка?',
    options: ['Штрафной', 'Из-за трёхочковой линии', 'Из-под кольца', 'С линии штрафного круга'],
    correctIndex: 1,
  },
  {
    id: 'battle-114',
    category: 'Спорт',
    prompt: 'В каком виде спорта игроки ведут шайбу клюшками по льду?',
    options: ['Кёрлинг', 'Хоккей', 'Лакросс', 'Поло'],
    correctIndex: 1,
  },
  {
    id: 'battle-115',
    category: 'Общие знания',
    prompt: 'Какой язык является официальным языком Бразилии?',
    options: ['Испанский', 'Португальский', 'Французский', 'Итальянский'],
    correctIndex: 1,
  },
  {
    id: 'battle-116',
    category: 'Общие знания',
    prompt: 'Как называется прибор для измерения атмосферного давления?',
    options: ['Термометр', 'Барометр', 'Гигрометр', 'Амперметр'],
    correctIndex: 1,
  },
  {
    id: 'battle-117',
    category: 'Общие знания',
    prompt: 'Какой цвет получится при смешении синей и жёлтой гуаши?',
    options: ['Зелёный', 'Фиолетовый', 'Оранжевый', 'Коричневый'],
    correctIndex: 0,
  },
  {
    id: 'battle-118',
    category: 'Общие знания',
    prompt: 'Какой месяц назван в честь римского бога Януса?',
    options: ['Январь', 'Март', 'Июнь', 'Август'],
    correctIndex: 0,
  },
  {
    id: 'battle-119',
    category: 'Общие знания',
    prompt: 'Какой металл является основным компонентом классической бронзы?',
    options: ['Медь', 'Железо', 'Алюминий', 'Цинк'],
    correctIndex: 0,
  },
  {
    id: 'battle-120',
    category: 'Общие знания',
    prompt: 'Сколько суток содержит високосный год?',
    options: ['364', '365', '366', '367'],
    correctIndex: 2,
  },
];

export function validateQuestionBank() {
  const errors = [];
  const seenIds = new Set();
  const seenPrompts = new Set();
  const allowedCategories = new Set(CATEGORIES);

  const validateCommonFields = (question, collectionName) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      errors.push(`${collectionName}: вопрос должен быть объектом`);
      return false;
    }

    if (typeof question.id !== 'string' || question.id.trim() === '') {
      errors.push(`${collectionName}: у вопроса отсутствует непустой строковый id`);
    } else if (seenIds.has(question.id)) {
      errors.push(`${collectionName}: повторяющийся id ${question.id}`);
    } else {
      seenIds.add(question.id);
    }

    if (!allowedCategories.has(question.category)) {
      errors.push(`${question.id ?? collectionName}: неизвестная категория ${question.category}`);
    }

    if (typeof question.prompt !== 'string' || question.prompt.trim() === '') {
      errors.push(`${question.id ?? collectionName}: отсутствует текст вопроса`);
    } else {
      const normalizedPrompt = question.prompt.trim().toLocaleLowerCase('ru-RU');
      if (seenPrompts.has(normalizedPrompt)) {
        errors.push(`${question.id ?? collectionName}: повторяющаяся формулировка`);
      } else {
        seenPrompts.add(normalizedPrompt);
      }
    }

    return true;
  };

  ESTIMATE_QUESTIONS.forEach((question) => {
    if (!validateCommonFields(question, 'ESTIMATE_QUESTIONS')) return;

    if (!Number.isFinite(question.answer)) {
      errors.push(`${question.id}: answer должен быть конечным числом`);
    }
    if (!Number.isFinite(question.spread) || question.spread <= 0) {
      errors.push(`${question.id}: spread должен быть положительным числом`);
    }
    if ('suffix' in question && typeof question.suffix !== 'string') {
      errors.push(`${question.id}: suffix должен быть строкой`);
    }
  });

  BATTLE_QUESTIONS.forEach((question) => {
    if (!validateCommonFields(question, 'BATTLE_QUESTIONS')) return;

    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`${question.id}: options должен содержать ровно четыре варианта`);
      return;
    }

    if (question.options.some((option) => typeof option !== 'string' || option.trim() === '')) {
      errors.push(`${question.id}: все варианты должны быть непустыми строками`);
    }

    const uniqueOptions = new Set(question.options.map((option) => option.trim().toLocaleLowerCase('ru-RU')));
    if (uniqueOptions.size !== 4) {
      errors.push(`${question.id}: варианты ответа не должны повторяться`);
    }

    if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
      errors.push(`${question.id}: correctIndex должен быть целым числом от 0 до 3`);
    }
  });

  if (ESTIMATE_QUESTIONS.length < 30) {
    errors.push(`Нужно не менее 30 числовых вопросов, получено ${ESTIMATE_QUESTIONS.length}`);
  }
  if (BATTLE_QUESTIONS.length < 120) {
    errors.push(`Нужно не менее 120 вопросов с вариантами, получено ${BATTLE_QUESTIONS.length}`);
  }
  if (ESTIMATE_QUESTIONS.length + BATTLE_QUESTIONS.length < 150) {
    errors.push('Общий банк должен содержать не менее 150 вопросов');
  }

  const representedCategories = new Set(
    [...ESTIMATE_QUESTIONS, ...BATTLE_QUESTIONS].map((question) => question.category),
  );
  CATEGORIES.forEach((category) => {
    if (!representedCategories.has(category)) {
      errors.push(`В банке отсутствует категория «${category}»`);
    }
  });

  if (errors.length > 0) {
    throw new Error(`Некорректный банк вопросов:\n- ${errors.join('\n- ')}`);
  }

  return {
    estimateCount: ESTIMATE_QUESTIONS.length,
    battleCount: BATTLE_QUESTIONS.length,
    totalCount: ESTIMATE_QUESTIONS.length + BATTLE_QUESTIONS.length,
    categories: [...representedCategories],
  };
}
