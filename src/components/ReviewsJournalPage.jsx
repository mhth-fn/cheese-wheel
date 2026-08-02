import { useRef } from 'react';
import MovieReviewsPage from './MovieReviewsPage';
import MusicReviewsPage from './MusicReviewsPage';
import WineReviewsPage from './WineReviewsPage';
import FoodReviewsPage from './FoodReviewsPage';

const REVIEW_KINDS = [
  { key: 'movies', label: 'Кино' },
  { key: 'wine', label: 'Вино' },
  { key: 'music', label: 'Музыка' },
  { key: 'food', label: 'Еда' },
];

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
        <span>Кино, вино, музыка и еда, которые хочется обсудить и передать друзьям.</span>
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
        {kind === 'wine' && <WineReviewsPage embedded />}
        {kind === 'music' && <MusicReviewsPage embedded />}
        {kind === 'food' && <FoodReviewsPage />}
        {kind === 'movies' && <MovieReviewsPage embedded />}
      </section>
    </main>
  );
}
