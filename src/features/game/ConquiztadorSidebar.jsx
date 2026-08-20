import {
  getCurrentPlayer,
  getPlayerScore,
  getPlayerTerritoryCount,
} from './conquiztadorEngine.mjs';
import { GAME_RULES, PHASES } from './conquiztadorRules.mjs';

function CastleTowers({ player }) {
  if (!player.baseTerritoryId) return <span className="cq-no-castle">замок не выбран</span>;
  return (
    <span
      className="cq-castle-status"
      aria-label={`Башни замка: ${player.castleTowers} из ${GAME_RULES.CASTLE_TOWERS}`}
    >
      <span aria-hidden="true">♜</span>
      {Array.from({ length: GAME_RULES.CASTLE_TOWERS }, (_, index) => (
        <i
          key={index}
          className={index < player.castleTowers ? 'is-standing' : 'is-destroyed'}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function territoryLabel(count) {
  const modulo100 = count % 100;
  const modulo10 = count % 10;
  if (modulo100 >= 11 && modulo100 <= 14) return 'территорий';
  if (modulo10 === 1) return 'территория';
  if (modulo10 >= 2 && modulo10 <= 4) return 'территории';
  return 'территорий';
}

export function ScoreBoard({ state }) {
  const turnPlayer = getCurrentPlayer(state);
  return (
    <section className="cq-scoreboard" aria-label="Счёт игроков">
      {state.players.map(player => {
        const activeTurn = state.phase !== PHASES.FINISHED && turnPlayer?.id === player.id;
        const territoryCount = getPlayerTerritoryCount(state, player.id);
        return (
          <article
            key={player.id}
            className={`cq-player-card${activeTurn ? ' is-current' : ''}${player.eliminated ? ' is-eliminated' : ''}`}
            style={{ '--player-color': player.color }}
          >
            <span className="cq-player-shield" aria-hidden="true">◆</span>
            <div className="cq-player-info">
              <strong>{player.name}</strong>
              <span>
                {territoryCount} {territoryLabel(territoryCount)} ·{' '}
                {getPlayerScore(state, player.id).toLocaleString('ru-RU')} очков
              </span>
            </div>
            {player.eliminated ? (
              <span className="cq-eliminated-label">уничтожен</span>
            ) : (
              <CastleTowers player={player} />
            )}
          </article>
        );
      })}
    </section>
  );
}

export function EventLog({ state }) {
  return (
    <section className="cq-event-log cq-panel">
      <h2>Летопись</h2>
      {state.eventLog.length > 0 ? (
        <ol>
          {state.eventLog.slice(0, 5).map(event => (
            <li key={event.id} className={`is-${event.kind}`}>
              {event.text}
            </li>
          ))}
        </ol>
      ) : (
        <p>История королевства только начинается.</p>
      )}
    </section>
  );
}

export default function ConquiztadorSidebar({ state }) {
  return (
    <aside className="cq-sidebar">
      <ScoreBoard state={state} />
      <EventLog state={state} />
      <details className="cq-rules cq-panel">
        <summary>Краткие правила</summary>
        <ol>
          <li>Расширяйтесь только в соседние свободные земли.</li>
          <li>В войне атакуйте территории у общей границы.</li>
          <li>Три победы подряд могут разрушить все башни замка.</li>
          <li>Побеждает последнее королевство или лидер после {GAME_RULES.WAR_ROUNDS} раундов.</li>
        </ol>
      </details>
    </aside>
  );
}
