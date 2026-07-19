import { useState, useEffect, useCallback } from 'react';
import { fetchStats } from '../api';

function pluralFilms(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'фильм';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'фильма';
  return 'фильмов';
}

function RatedMovieCard({ label, movie, tone }) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value stat-card-title" title={movie?.title}>
        {movie?.title || 'Пока нет оценок'}
      </div>
      <div className="stat-card-sub">
        {movie?.avg_rating != null ? `Средняя ${Number(movie.avg_rating).toFixed(1)}` : 'Появится после первой оценки'}
      </div>
    </article>
  );
}

export default function StatsPanel({ refreshKey }) {
  const [stats, setStats] = useState(null);
  const [state, setState] = useState('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetchStats();
      setStats(response);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [refreshKey, load]);

  if (state === 'loading' && !stats) {
    return (
      <div className="stats-panel stats-loading" aria-live="polite">
        {[1, 2, 3, 4].map(item => <div key={item} className="stat-card skeleton" />)}
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

  return (
    <section className="stats-panel" aria-label="Статистика просмотренных фильмов">
      <article className="stat-card total" title="Количество фильмов в общей истории">
        <div className="stat-card-label">Просмотрено вместе</div>
        <div className="stat-card-value">{stats.total_watched}</div>
        <div className="stat-card-sub">{pluralFilms(stats.total_watched)}</div>
      </article>
      <RatedMovieCard label="Лучший фильм" movie={stats.top_rated} tone="best" />
      <RatedMovieCard label="Самый спорный" movie={stats.lowest_rated} tone="lowest" />
      <article className="stat-card averages" title="Среднее арифметическое только по выставленным оценкам">
        <div className="stat-card-label">Средние оценки</div>
        <div className="stats-users">
          {stats.per_user_avg.map(user => (
            <div key={user.name} className="stats-user-item">
              <span className="stats-user-name">{user.name}</span>
              <span className="stats-user-avg">{user.avg_rating ?? '—'}</span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
