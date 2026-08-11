import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWatched } from '../api';
import { useApp } from '../app/AppContext';
import CheeseWheel from './CheeseWheel';

const HISTORY_EVENTS = [
  'rating-updated',
  'watched-added',
  'watched-deleted',
  'movie-updated',
];

const SERAPHIM_EYES = [
  { x: 50.28, y: 15.24, size: 7.15, delay: '-1.2s' },
  { x: 40.67, y: 23.36, size: 5.15, delay: '-5.8s' },
  { x: 59.82, y: 23.35, size: 5.15, delay: '-3.1s' },
  { x: 33.31, y: 36.5, size: 5.75, delay: '-8.4s' },
  { x: 66.8, y: 36.37, size: 5.75, delay: '-6.7s' },
];

const LANDING_DUST = [
  { x: '-34%', drift: '-42px', lift: '-38px', size: '8.5%', delay: '0.02s' },
  { x: '-27%', drift: '-28px', lift: '-61px', size: '6.2%', delay: '0.12s' },
  { x: '-19%', drift: '-18px', lift: '-44px', size: '9.4%', delay: '0.04s' },
  { x: '-10%', drift: '-10px', lift: '-72px', size: '5.8%', delay: '0.18s' },
  { x: '-2%', drift: '-4px', lift: '-48px', size: '10.2%', delay: '0s' },
  { x: '8%', drift: '9px', lift: '-68px', size: '6.5%', delay: '0.14s' },
  { x: '16%', drift: '18px', lift: '-46px', size: '9.2%', delay: '0.06s' },
  { x: '25%', drift: '31px', lift: '-64px', size: '6%', delay: '0.16s' },
  { x: '33%', drift: '44px', lift: '-39px', size: '8.2%', delay: '0.08s' },
];

function formatDate(value) {
  if (!value) return 'Без даты';
  const normalized = String(value).includes('T')
    ? String(value)
    : String(value).replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function movieRating(movie, currentUser) {
  const personalRating = currentUser?.id
    ? movie?.[`rating_${currentUser.id}`]
    : null;
  const rating = personalRating ?? movie?.avg_rating;
  return rating == null ? '—' : Number(rating).toFixed(1);
}

export default function SeraphimWheelHome({
  handleSpin,
  handleSpinComplete,
  isSpinning,
  movies,
  readinessText,
  refreshWheelData,
  spinDisabled,
  spinIsDisabled,
  spinPending,
  wheelReady,
  wheelRef,
  wheelStatusLoadState,
}) {
  const { currentUser, navigate, socket, winner } = useApp();
  const [history, setHistory] = useState([]);
  const [historyState, setHistoryState] = useState('loading');
  const oracleRef = useRef(null);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchWatched();
      if (!Array.isArray(data)) throw new Error('Некорректная история');
      setHistory(data);
      setHistoryState('ready');
    } catch {
      setHistoryState('error');
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!socket) return undefined;
    HISTORY_EVENTS.forEach(eventName => socket.on(eventName, loadHistory));
    return () => {
      HISTORY_EVENTS.forEach(eventName => socket.off(eventName, loadHistory));
    };
  }, [loadHistory, socket]);

  const currentYear = new Date().getFullYear();
  const todayMovie = history.find(movie => (
    String(movie.watched_at || movie.added_at || '').slice(0, 10) === localDateKey()
  ));
  const yearMovies = useMemo(() => history.filter(movie => (
    String(movie.watched_at || movie.added_at || '').startsWith(String(currentYear))
  )), [currentYear, history]);
  const ratedYearMovies = yearMovies.filter(movie => movie.avg_rating != null);
  const averageRating = ratedYearMovies.length
    ? ratedYearMovies.reduce((sum, movie) => sum + Number(movie.avg_rating), 0)
      / ratedYearMovies.length
    : null;
  const yearRatings = yearMovies.reduce(
    (total, movie) => total + Number(movie.ratings_count || 0),
    0
  );
  const latestMovies = history.slice(0, 6);

  const oracleStatus = isSpinning || spinPending
    ? 'Серафим выбирает…'
    : winner
      ? `Серафим выбрал: ${winner.title}`
      : readinessText || 'Серафим ждёт вашего решения';

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let pointerX = window.innerWidth / 2;
    let pointerY = window.innerHeight / 2;
    let animationFrame = null;

    const centerEyes = () => {
      oracleRef.current?.style.setProperty('--oracle-x', '0');
      oracleRef.current?.style.setProperty('--oracle-y', '0');
      oracleRef.current?.style.setProperty('--eye-look-x', '0px');
      oracleRef.current?.style.setProperty('--eye-look-y', '0px');
      oracleRef.current?.style.setProperty('--center-eye-look-x', '0px');
      oracleRef.current?.style.setProperty('--center-eye-look-y', '0px');
    };

    const updateEyes = () => {
      animationFrame = null;
      if (reducedMotion.matches || !oracleRef.current) {
        centerEyes();
        return;
      }
      const bounds = oracleRef.current.getBoundingClientRect();
      const rawX = (pointerX - (bounds.left + bounds.width / 2)) / (bounds.width * 0.48);
      const rawY = (pointerY - (bounds.top + bounds.height / 2)) / (bounds.height * 0.42);
      const x = Math.max(-1, Math.min(1, rawX));
      const y = Math.max(-1, Math.min(1, rawY));
      oracleRef.current.style.setProperty('--oracle-x', x.toFixed(3));
      oracleRef.current.style.setProperty('--oracle-y', y.toFixed(3));
      oracleRef.current.style.setProperty('--eye-look-x', `${(x * 1.4).toFixed(2)}px`);
      oracleRef.current.style.setProperty('--eye-look-y', `${(y * 1.05).toFixed(2)}px`);
      oracleRef.current.style.setProperty('--center-eye-look-x', `${(x * 3.6).toFixed(2)}px`);
      oracleRef.current.style.setProperty('--center-eye-look-y', `${(y * 2.7).toFixed(2)}px`);
    };

    const trackPointer = event => {
      if (event.pointerType === 'touch') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (animationFrame == null) animationFrame = window.requestAnimationFrame(updateEyes);
    };

    const handleMotionPreference = () => {
      if (reducedMotion.matches) centerEyes();
    };

    window.addEventListener('pointermove', trackPointer, { passive: true });
    window.addEventListener('blur', centerEyes);
    reducedMotion.addEventListener?.('change', handleMotionPreference);
    return () => {
      window.removeEventListener('pointermove', trackPointer);
      window.removeEventListener('blur', centerEyes);
      reducedMotion.removeEventListener?.('change', handleMotionPreference);
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <main className={`seraphim-home${isSpinning || spinPending ? ' is-awake' : ''}`}>
      <section className="seraphim-hero" aria-labelledby="seraphim-title">
        <aside className="seraphim-side seraphim-today">
          <div className="seraphim-panel-kicker">Сегодня</div>
          {todayMovie ? (
            <div className="seraphim-today-movie">
              <strong>{todayMovie.title}</strong>
              <span>Оценка: {movieRating(todayMovie, currentUser)}</span>
            </div>
          ) : (
            <>
              <strong>Ничего не смотрели</strong>
              <p>Самое время это исправить.</p>
              <button type="button" onClick={handleSpin} disabled={spinDisabled}>
                Крутить колесо
              </button>
            </>
          )}

          <div className="seraphim-year-stats" aria-label={`Статистика ${currentYear}`}>
            <div className="seraphim-panel-kicker">Статистика {currentYear}</div>
            <dl>
              <div>
                <dt>Просмотрено</dt>
                <dd>{yearMovies.length} <small>фильмов</small></dd>
              </div>
              <div>
                <dt>Средняя оценка</dt>
                <dd>{averageRating == null ? '—' : averageRating.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Выставлено оценок</dt>
                <dd>{yearRatings}</dd>
              </div>
            </dl>
          </div>
        </aside>

        <div className="seraphim-oracle-column">
          <p className="seraphim-incantation" id="seraphim-title">
            Серафим решает, что мы смотрим
          </p>
          <div
            ref={oracleRef}
            className="seraphim-oracle"
          >
            <div className="seraphim-aura" aria-hidden="true" />
            <div className="seraphim-floating-assembly">
              <div className="seraphim-art" aria-hidden="true">
                <div className="seraphim-art-body">
                <span className="seraphim-reference-wings">
                  {['upper-left', 'upper-right', 'lower-left', 'lower-right'].map(wing => (
                    <img
                      key={wing}
                      className={`seraphim-reference-wing is-${wing}`}
                      src="/assets/seraphim/seraphim-reference-frame-1280-v8.webp"
                      alt=""
                    />
                  ))}
                </span>
                <picture className="seraphim-art-core">
                  <source
                    type="image/webp"
                    srcSet="/assets/seraphim/seraphim-reference-frame-768-v8.webp 768w, /assets/seraphim/seraphim-reference-frame-1280-v8.webp 1280w, /assets/seraphim/seraphim-reference-frame-v8.webp 1493w"
                    sizes="(max-width: 700px) 98vw, (max-width: 1200px) 70vw, 52vw"
                  />
                  <img
                    src="/assets/seraphim/seraphim-reference-frame-1280-v8.webp"
                    alt=""
                    width="1493"
                    height="1054"
                    fetchPriority="high"
                  />
                </picture>
                <span className="seraphim-living-eyes">
                  {SERAPHIM_EYES.map((eye, index) => (
                    <i
                      key={index}
                      style={{
                        '--blink-delay': eye.delay,
                        '--eye-size': `${eye.size}%`,
                        '--eye-x': `${eye.x}%`,
                        '--eye-y': `${eye.y}%`,
                      }}
                    >
                      <img
                        className="seraphim-eye-state is-open"
                        src="/assets/seraphim/seraphim-reference-eye-open-v9.webp"
                        alt=""
                      />
                      <img
                        className="seraphim-eye-state is-half"
                        src="/assets/seraphim/seraphim-reference-eye-half-v9.webp"
                        alt=""
                      />
                      <img
                        className="seraphim-eye-state is-closed"
                        src="/assets/seraphim/seraphim-reference-eye-closed-v9.webp"
                        alt=""
                      />
                    </i>
                  ))}
                </span>
                <span className="seraphim-reference-fingers">
                  {['left', 'right'].flatMap(side => [1, 2, 3].map(finger => (
                    <img
                      key={`${side}-${finger}`}
                      className={`seraphim-reference-finger is-${side} is-finger-${finger}`}
                      src="/assets/seraphim/seraphim-reference-frame-1280-v8.webp"
                      alt=""
                    />
                  )))}
                  </span>
                </div>
              </div>
              <div className="seraphim-wheel-mount">
                {movies.length > 0 ? (
                  <>
                    <CheeseWheel
                      ref={wheelRef}
                      movies={movies}
                      onSpinComplete={handleSpinComplete}
                      theme="seraphim"
                    />
                    <button
                      type="button"
                      className={`seraphim-eye-button${spinPending ? ' is-pending' : ''}${isSpinning ? ' is-spinning' : ''}`}
                      onClick={handleSpin}
                      disabled={spinDisabled}
                      aria-label="Крутить колесо"
                      aria-busy={spinPending || isSpinning}
                      title={wheelReady ? 'Крутить колесо' : 'Сначала сформируйте колесо'}
                    >
                      <span
                        className="seraphim-center-eye-track"
                        style={{ '--blink-delay': '-3.9s' }}
                        aria-hidden="true"
                      >
                        <img
                          className="seraphim-center-eye-state is-open"
                          src="/assets/seraphim/seraphim-reference-center-eye-open-v9.webp"
                          alt=""
                          width="512"
                          height="512"
                        />
                        <img
                          className="seraphim-center-eye-state is-half"
                          src="/assets/seraphim/seraphim-reference-center-eye-half-v9.webp"
                          alt=""
                          width="512"
                          height="512"
                        />
                        <img
                          className="seraphim-center-eye-state is-closed"
                          src="/assets/seraphim/seraphim-reference-center-eye-closed-v9.webp"
                          alt=""
                          width="512"
                          height="512"
                        />
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="seraphim-wheel-empty" aria-live="polite">
                    <span aria-hidden="true" />
                    <strong>
                      {wheelStatusLoadState === 'loading'
                        ? 'Пробуждаем колесо'
                        : wheelReady ? 'Все фильмы просмотрены' : 'Колесо не готово'}
                    </strong>
                    {wheelStatusLoadState === 'error' && (
                      <button type="button" onClick={refreshWheelData}>Повторить</button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="seraphim-particles" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
            </div>
            <div className="seraphim-landing-dust" aria-hidden="true">
              <span />
              {LANDING_DUST.map((particle, index) => (
                <i
                  key={index}
                  style={{
                    '--dust-delay': particle.delay,
                    '--dust-drift': particle.drift,
                    '--dust-lift': particle.lift,
                    '--dust-size': particle.size,
                    '--dust-x': particle.x,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="seraphim-cta-wrap">
            <div className="seraphim-oracle-status" aria-live="polite">
              <span aria-hidden="true" />
              {oracleStatus}
            </div>
            <button
              type="button"
              className="seraphim-spin-cta"
              onClick={handleSpin}
              disabled={spinDisabled}
              aria-busy={spinPending || isSpinning}
            >
              {isSpinning || spinPending ? 'Серафим выбирает…' : 'Крутить колесо'}
            </button>
            <span className="seraphim-cta-note">Пусть выбор падёт на нас</span>
            {spinIsDisabled && (
              <span className="seraphim-disabled-note">Основное колесо отключено</span>
            )}
          </div>
        </div>

        <aside className="seraphim-side seraphim-rules">
          <div className="seraphim-panel-kicker">Правила колеса</div>
          <ul>
            <li>
              <span aria-hidden="true">◉</span>
              <div><strong>Серафим знает лучше</strong><small>Доверься общему выбору.</small></div>
            </li>
            <li>
              <span aria-hidden="true">☆</span>
              <div><strong>Оценки честные</strong><small>Ставим как есть.</small></div>
            </li>
            <li>
              <span aria-hidden="true">↯</span>
              <div><strong>Без повторов</strong><small>Просмотренное не вернётся в колесо.</small></div>
            </li>
            <li>
              <span aria-hidden="true">⌁</span>
              <div><strong>Результат общий</strong><small>Выбор сразу попадёт в историю.</small></div>
            </li>
          </ul>
        </aside>
      </section>

      <section className="seraphim-recent" aria-labelledby="seraphim-recent-title">
        <header>
          <div>
            <span aria-hidden="true">✣</span>
            <h2 id="seraphim-recent-title">Последние просмотры</h2>
          </div>
          <button type="button" onClick={() => navigate('watched')}>Смотреть все →</button>
        </header>

        {historyState === 'error' ? (
          <button className="seraphim-history-error" type="button" onClick={loadHistory}>
            История не загрузилась. Повторить
          </button>
        ) : latestMovies.length > 0 ? (
          <div className="seraphim-movie-strip">
            {latestMovies.map((movie, index) => (
              <button
                key={movie.id}
                className="seraphim-movie-card"
                style={{ '--movie-index': index }}
                type="button"
                onClick={() => navigate('watched')}
                aria-label={`${movie.title}, открыть просмотренные`}
              >
                <span className="seraphim-movie-symbol" aria-hidden="true">
                  {String(movie.title || '?').slice(0, 1)}
                </span>
                <span className="seraphim-movie-shade" />
                <strong>{movie.title}</strong>
                <small>{formatDate(movie.watched_at || movie.added_at)}</small>
                <em>★ {movieRating(movie, currentUser)}</em>
              </button>
            ))}
          </div>
        ) : (
          <p className="seraphim-history-empty">
            {historyState === 'loading' ? 'Открываем летопись…' : 'Летопись пока пуста.'}
          </p>
        )}
      </section>
    </main>
  );
}
