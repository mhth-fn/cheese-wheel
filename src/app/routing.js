const PAGE_PATHS = {
  conquiztador: '/conquiztador',
  games: '/games',
  'food-reviews': '/reviews/food',
  'movie-reviews': '/reviews',
  'music-reviews': '/reviews/music',
  sigame: '/sigame',
  vpn: '/vpn',
  watched: '/watched',
  'wine-reviews': '/reviews/wine',
  wheel: '/',
};

const PATH_PAGES = new Map([
  ['/conquiztador', 'conquiztador'],
  ['/games', 'games'],
  ['/food-reviews', 'food-reviews'],
  ['/reviews/food', 'food-reviews'],
  ['/movie-reviews', 'movie-reviews'],
  ['/reviews', 'movie-reviews'],
  ['/reviews/movies', 'movie-reviews'],
  ['/reviews/music', 'music-reviews'],
  ['/reviews/wine', 'wine-reviews'],
  ['/sigame', 'sigame'],
  ['/vpn', 'vpn'],
  ['/watched', 'watched'],
  ['/music-reviews', 'music-reviews'],
  ['/wine-reviews', 'wine-reviews'],
]);

export function pageFromLocation(pathname = window.location.pathname) {
  return PATH_PAGES.get(pathname) || 'wheel';
}

export function pathForPage(page) {
  return PAGE_PATHS[page] || PAGE_PATHS.wheel;
}

export function canVisitPage(page, session) {
  return page !== 'vpn' || Boolean(session?.user && !session.isGuest);
}
