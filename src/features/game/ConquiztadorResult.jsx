import { getPlayer } from './conquiztadorEngine.mjs';

function formatAnswer(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number.isFinite(Number(value))
    ? Number(value).toLocaleString('ru-RU')
    : '—';
}

function EstimationRanking({ ranking }) {
  if (!Array.isArray(ranking)) return null;
  return (
    <div className="cq-ranking">
      <div className="cq-ranking-head" aria-hidden="true">
        <span>Игрок</span>
        <span>Ответ</span>
        <span>Разница</span>
      </div>
      {ranking.map((entry, index) => (
        <div className={index === 0 ? 'is-winner' : ''} key={entry.playerId}>
          <strong>{index + 1}. {entry.playerName}</strong>
          <span>{formatAnswer(entry.value)}</span>
          <span>{entry.difference === null ? '—' : formatAnswer(entry.difference)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ConquiztadorResult({ result, state }) {
  if (!result) return null;
  const dramatic = ['kingdom-fallen', 'phase-transition'].includes(result.type);
  const question = result.question;
  const answers = question?.answers || question?.options;
  const correctIndex = Number(question?.correctAnswer ?? question?.correctIndex);
  const attacker = result.attackerId ? getPlayer(state, result.attackerId) : null;
  const defender = result.defenderId ? getPlayer(state, result.defenderId) : null;

  return (
    <div className={`cq-overlay cq-result-overlay${dramatic ? ' is-dramatic' : ''}`}>
      <section
        className={`cq-result-card is-${result.type}`}
        role="status"
        aria-live="assertive"
      >
        <span className="cq-result-emblem" aria-hidden="true">
          {result.type === 'correct' || result.type === 'territory-captured' ? '⚔' : null}
          {result.type === 'tower-destroyed' ? '♜' : null}
          {result.type === 'kingdom-fallen' ? '♛' : null}
          {result.type === 'defense-held' ? '◈' : null}
          {result.type === 'incorrect' ? '×' : null}
          {result.type === 'phase-transition' ? '⚔' : null}
          {result.type === 'estimation-result' ? '◎' : null}
          {result.type === 'distribution-capture' ? '◆' : null}
        </span>
        <h2>{result.title}</h2>
        <p>{result.message}</p>

        {result.correctValue !== null
          && result.correctValue !== undefined
          && Number.isFinite(Number(result.correctValue)) && (
          <p className="cq-correct-reveal">
            Правильный ответ: <strong>{formatAnswer(result.correctValue)}</strong>
          </p>
        )}
        {answers?.[correctIndex] !== undefined && (
          <p className="cq-correct-reveal">
            Правильный ответ: <strong>{answers[correctIndex]}</strong>
          </p>
        )}
        {attacker && defender && (
          <div className="cq-duel-summary">
            <span style={{ '--duel-color': attacker.color }}>{attacker.name}</span>
            <b aria-hidden="true">vs</b>
            <span style={{ '--duel-color': defender.color }}>{defender.name}</span>
          </div>
        )}
        <EstimationRanking ranking={result.ranking} />
        <small>Игра продолжится автоматически…</small>
      </section>
    </div>
  );
}
