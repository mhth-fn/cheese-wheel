import { lazy, Suspense, useRef } from 'react';

const MovieReviewsPage = lazy(() => import('./MovieReviewsPage'));
const WineReviewsPage = lazy(() => import('./WineReviewsPage'));

const REVIEW_KINDS = [
  { key: 'movies', icon: '🎬', label: 'Кино' },
  { key: 'wine', icon: '🍷', label: 'Вино' },
];

function JournalLoading() {
  return (
    <div className="reviews-journal-loading" role="status" aria-live="polite">
      Загружаем обзоры…
    </div>
  );
}

export default function ReviewsJournalPage({ kind = 'movies', onKindChange }) {
  const tabRefs = useRef({});

  const selectKind = (nextKind, moveFocus = false) => {
    if (nextKind !== kind) onKindChange(nextKind);
    if (moveFocus) {
      window.requestAnimationFrame(() => tabRefs.current[nextKind]?.focus());
    }
  };

  const handleKeyDown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = REVIEW_KINDS.findIndex(item => item.key === kind);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? REVIEW_KINDS.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + REVIEW_KINDS.length)
          % REVIEW_KINDS.length;
    selectKind(REVIEW_KINDS[nextIndex].key, true);
  };

  const activeTabId = `reviews-${kind}-tab`;
  const activePanelId = `reviews-${kind}-panel`;

  return (
    <main className="reviews-journal">
      <header className="reviews-journal-header">
        <p>Впечатления после встречи</p>
        <h1>Обзоры</h1>
        <span>Все рецензии на кино и заметки о вине — в одном дневнике.</span>
      </header>

      <div
        className="reviews-journal-tabs"
        role="tablist"
        aria-label="Вид обзоров"
        onKeyDown={handleKeyDown}
      >
        {REVIEW_KINDS.map(item => {
          const selected = item.key === kind;
          return (
            <button
              key={item.key}
              ref={node => { tabRefs.current[item.key] = node; }}
              id={`reviews-${item.key}-tab`}
              className={`reviews-journal-tab${selected ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`reviews-${item.key}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectKind(item.key)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </div>

      <section
        key={kind}
        id={activePanelId}
        className="reviews-journal-panel"
        role="tabpanel"
        aria-labelledby={activeTabId}
        tabIndex={0}
      >
        <Suspense fallback={<JournalLoading />}>
          {kind === 'wine'
            ? <WineReviewsPage embedded />
            : <MovieReviewsPage embedded />}
        </Suspense>
      </section>
    </main>
  );
}
