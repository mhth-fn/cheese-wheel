import MovieReviewsSection from './MovieReviewsSection';

export default function MovieReviewsPage() {
  return (
    <div className="reviews-page">
      <div className="reviews-page-header">
        <p>Кино после титров</p>
        <h2 className="reviews-title">Обзоры на кино</h2>
        <span>Начните вводить название: можно выбрать просмотренный фильм или указать любой другой.</span>
      </div>
      <MovieReviewsSection />
    </div>
  );
}
