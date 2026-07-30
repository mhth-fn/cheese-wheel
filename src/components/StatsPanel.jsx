import { useState, useEffect, useCallback } from 'react';
import { fetchStats } from '../api';

function pluralFilms(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'фильм';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'фильма';
  return 'фильмов';
}

function commonFilmsLabel(value) {
  return value % 10 === 1 && value % 100 !== 11
    ? `${value} общий фильм`
    : `${value} общих ${pluralFilms(value)}`;
}

function RatedMovieCard({
  label,
  movie,
  movies,
  tone,
  ratingLabel = 'Средняя',
  emptyTitle = 'Пока нет оценок',
  emptySub = 'Появится после первой оценки',
}) {
  const movieList = Array.isArray(movies) ? movies : movie ? [movie] : [];
  const visibleMovies = movieList.slice(0, 3);
  const hiddenCount = Math.max(0, movieList.length - visibleMovies.length);
  const rating = movieList[0]?.avg_rating;
  const hasSeveralMovies = movieList.length > 1;

  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-card-label">{label}</div>
      <div
        className={`stat-card-value ${hasSeveralMovies ? 'stat-card-titles' : 'stat-card-title'}`}
        title={movieList.map(item => item.title).join(', ') || emptyTitle}
      >
        {hasSeveralMovies ? (
          <>
            {visibleMovies.map(item => (
              <span key={item.id ?? item.title} className="stat-card-title-item">{item.title}</span>
            ))}
            {hiddenCount > 0 && <span className="stat-card-more">Ещё {hiddenCount}</span>}
          </>
        ) : (
          movieList[0]?.title || emptyTitle
        )}
      </div>
      <div className="stat-card-sub">
        {rating != null
          ? `${ratingLabel} ${Number(rating).toFixed(1)}${hasSeveralMovies ? ` · ${movieList.length} ${pluralFilms(movieList.length)}` : ''}`
          : emptySub}
      </div>
    </article>
  );
}

function formatDifference(value) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function RatingMatchCard({ label, pair, tone, personal = false }) {
  const description = 'Средняя абсолютная разница оценок по фильмам, которые оценили оба участника';

  return (
    <article className={`stat-card rating-match ${tone}`} title={description}>
      <div className="stat-card-label">{label}</div>
      {pair ? (
        <>
          {personal ? (
            <div className="stat-card-value stat-personal-match-name">
              {pair.second_user}
            </div>
          ) : (
            <div
              className="stat-card-value stat-match-users"
              aria-label={`${pair.first_user} и ${pair.second_user}`}
            >
              <span className="stat-match-name">{pair.first_user}</span>
              <span className="stat-match-symbol" aria-hidden="true">↔</span>
              <span className="stat-match-name">{pair.second_user}</span>
            </div>
          )}
          <div className="stat-card-sub">
            Средняя разница: {formatDifference(pair.average_difference)}
            {' · '}
            {commonFilmsLabel(pair.common_movies)}
          </div>
        </>
      ) : (
        <>
          <div className="stat-card-value stat-match-empty">Пока нет пары</div>
          <div className="stat-card-sub">
            {personal ? 'Нужны общие оценки хотя бы с одним участником' : 'Нужны оценки одного фильма от двух участников'}
          </div>
        </>
      )}
    </article>
  );
}

export default function StatsPanel({
  refreshKey,
  scope = 'all',
  comparisonScope = 'all',
  selectedUserIds = [],
}) {
  const [stats, setStats] = useState(null);
  const [state, setState] = useState('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetchStats(scope, comparisonScope, selectedUserIds);
      setStats(response);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [scope, comparisonScope, selectedUserIds]);

  useEffect(() => {
    load();
  }, [refreshKey, load]);

  if (state === 'loading' && !stats) {
    return (
      <div className="stats-panel stats-loading" aria-live="polite">
        {[1, 2, 3, 4].map(item => <div key={item} className="stat-card skeleton" />)}
        <div className="stats-match-grid">
          {[5, 6].map(item => <div key={item} className="stat-card skeleton" />)}
        </div>
      </div>
    );
  }

  if (state === 'error' && !stats) {
    return (
      <div className="stats-error surface" role="alert">
        <span>Статистика временно недоступна.</span>
        <button className="button-ghost" type="button" onClick={load}>Повторить</button>
      </div>
    );
  }

  const isPersonal = scope === 'personal';
  const isSelected = scope === 'selected';
  const personalTopMovies = isPersonal
    ? Array.isArray(stats.top_rated_movies)
      ? stats.top_rated_movies
      : stats.top_rated ? [stats.top_rated] : []
    : [];
  const personalLowestMovies = isPersonal
    ? Array.isArray(stats.lowest_rated_movies)
      ? stats.lowest_rated_movies
      : stats.lowest_rated ? [stats.lowest_rated] : []
    : [];
  const personalExtremesAreEqual = isPersonal && (
    stats.personal_extremes_equal === true
    || (
      personalTopMovies.length > 0
      && personalLowestMovies.length > 0
      && Number(personalTopMovies[0].avg_rating) === Number(personalLowestMovies[0].avg_rating)
    )
  );
  const hasOnePersonalMovie = isPersonal && Number(stats.total_watched) === 1;

  return (
    <section
      className={`stats-panel${scope === 'core' ? ' core-scope' : ''}${isPersonal ? ' personal-scope' : ''}${isSelected ? ' selected-scope' : ''}`}
      aria-label={
        isPersonal
          ? `Личная статистика ${stats.subject_name || ''}${comparisonScope === 'core' ? ' по основной пятёрке' : ''}`.trim()
          : isSelected
            ? 'Статистика выбранных участников'
          : scope === 'core'
            ? 'Статистика основной пятёрки'
            : 'Статистика просмотренных фильмов'
      }
    >
      <article
        className="stat-card total"
        title={
          isPersonal
            ? 'Количество просмотренных фильмов с вашей оценкой'
            : isSelected
              ? 'Фильмы с оценкой хотя бы одного выбранного участника'
            : scope === 'core'
              ? 'Фильмы с оценкой хотя бы одного участника основной пятёрки'
              : 'Количество фильмов в общей истории'
        }
      >
        <div className="stat-card-label">
          {isPersonal
            ? 'Оценено мной'
            : isSelected
              ? 'Фильмов с оценками'
              : scope === 'core'
                ? 'Оценено пятёркой'
                : 'Просмотрено вместе'}
        </div>
        <div className="stat-card-value">{stats.total_watched}</div>
        <div className="stat-card-sub">{pluralFilms(stats.total_watched)}</div>
      </article>
      <RatedMovieCard
        label={
          isPersonal
            ? personalExtremesAreEqual
              ? hasOnePersonalMovie ? 'Моя первая оценка' : 'Все на одной оценке'
              : personalTopMovies.length > 1 ? 'Мои фавориты' : 'Мой фаворит'
            : 'Лучший фильм'
        }
        movie={stats.top_rated}
        movies={isPersonal ? personalTopMovies : undefined}
        tone="best"
        ratingLabel={isPersonal ? 'Моя оценка' : 'Средняя'}
      />
      <RatedMovieCard
        label={
          isPersonal
            ? !personalExtremesAreEqual && personalLowestMovies.length > 1
              ? 'Не зашли'
              : 'Не зашло'
            : 'Худший фильм'
        }
        movie={stats.lowest_rated}
        movies={isPersonal ? personalExtremesAreEqual ? [] : personalLowestMovies : undefined}
        tone={isPersonal && personalExtremesAreEqual ? '' : 'lowest'}
        ratingLabel={isPersonal ? 'Моя оценка' : 'Средняя'}
        emptyTitle={
          personalExtremesAreEqual
            ? hasOnePersonalMovie ? 'Пока не с чем сравнить' : 'Нет отдельного аутсайдера'
            : 'Пока нет оценок'
        }
        emptySub={
          personalExtremesAreEqual
            ? hasOnePersonalMovie ? 'Оцените ещё один фильм' : 'Все ваши оценки одинаковые'
            : 'Появится после первой оценки'
        }
      />
      <article className="stat-card averages" title="Среднее арифметическое только по выставленным оценкам">
        <div className="stat-card-label">{isPersonal ? 'Моя средняя оценка' : 'Средние оценки'}</div>
        <div className="stats-users">
          {stats.per_user_avg.map(user => (
            <div key={user.name} className="stats-user-item">
              <span className="stats-user-name">{user.name}</span>
              <span className="stats-user-avg">{user.avg_rating ?? '—'}</span>
            </div>
          ))}
        </div>
      </article>
      <div className="stats-match-grid">
        <RatingMatchCard
          label={isPersonal ? 'Бестис' : 'На одной волне'}
          pair={stats.closest_rating_pair}
          tone="closest"
          personal={isPersonal}
        />
        <RatingMatchCard
          label={isPersonal ? 'Биф' : 'Разные вкусы'}
          pair={stats.furthest_rating_pair}
          tone="furthest"
          personal={isPersonal}
        />
      </div>
    </section>
  );
}
