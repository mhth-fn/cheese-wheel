import { imdbMovieUrl, kinopoiskMovieUrl } from './movieLinks.mjs';

export default function MovieExternalLinks({ movie, compact = false, className = '' }) {
  const title = movie?.title || movie?.alternative_title;
  if (!title) return null;

  const classes = [
    'movie-external-links',
    compact ? 'is-compact' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} role="group" aria-label={`Найти фильм «${title}»`}>
      <a
        className="movie-external-link is-kinopoisk"
        href={kinopoiskMovieUrl(movie)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Найти фильм «${title}» на Кинопоиске`}
      >
        <span aria-hidden="true">{compact ? 'КП' : 'Кинопоиск'}</span>
      </a>
      <a
        className="movie-external-link is-imdb"
        href={imdbMovieUrl(movie)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Найти фильм «${title}» на IMDb`}
      >
        <span aria-hidden="true">IMDb</span>
      </a>
    </div>
  );
}
