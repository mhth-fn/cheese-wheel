import { useState, useEffect, useCallback } from 'react';
import { fetchStats } from '../api';

export default function StatsPanel({ refreshKey }) {
  const [stats, setStats] = useState(null);

  const load = useCallback(() => {
    fetchStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [refreshKey, load]);

  if (!stats) return null;

  return (
    <div className="stats-panel">
      <div className="stat-card">
        <div className="stat-card-value">{stats.total_watched}</div>
        <div className="stat-card-label">Просмотрено фильмов</div>
      </div>
      <div className="stat-card">
        <div className="stat-card-value stat-card-title">{stats.top_rated?.title || '—'}</div>
        <div className="stat-card-label">Лучший фильм</div>
      </div>
      <div className="stat-card">
        <div className="stat-card-value stat-card-title">{stats.lowest_rated?.title || '—'}</div>
        <div className="stat-card-label">Худший фильм</div>
      </div>
      <div className="stat-card">
        <div className="stats-users">
          {stats.per_user_avg.map(u => (
            <div key={u.name} className="stats-user-item">
              <span className="stats-user-name">{u.name}</span>
              <span className="stats-user-avg">{u.avg_rating ?? '—'}</span>
            </div>
          ))}
        </div>
        <div className="stat-card-label" style={{ marginTop: 8 }}>Средние оценки</div>
      </div>
    </div>
  );
}
