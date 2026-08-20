import { MAP_GRID, TERRITORIES } from './conquiztadorMap.mjs';
import { GAME_RULES } from './conquiztadorRules.mjs';

function castleOwner(state, territoryState) {
  if (!territoryState.isBase || !territoryState.baseOwnerId) return null;
  const player = state.players.find(entry => entry.id === territoryState.baseOwnerId);
  if (!player || player.eliminated || player.castleTowers <= 0) return null;
  return territoryState.ownerId === player.id ? player : null;
}

function territoryLabel(definition, territoryState, owner, castle) {
  const ownerName = owner?.name || 'нейтральная земля';
  const castleText = castle
    ? `, замок ${castle.castleTowers} из ${GAME_RULES.CASTLE_TOWERS} башен`
    : '';
  return `${definition.name}, владелец: ${ownerName}, стоимость: ${territoryState.value}${castleText}`;
}

export default function ConquiztadorBoard({
  legalIds = [],
  onSelect,
  selectedId,
  state,
}) {
  const legal = new Set(legalIds);
  const runtime = new Map(state.territories.map(territory => [territory.id, territory]));
  const players = new Map(state.players.map(player => [player.id, player]));
  const hasLegalChoices = legal.size > 0;

  return (
    <section className="cq-map-frame cq-panel" aria-label="Карта королевства Аврора">
      <div className="cq-map-compass" aria-hidden="true">
        <span>С</span><i /><small>Ю</small>
      </div>
      <div
        className="cq-map"
        style={{
          '--map-columns': MAP_GRID.columns,
          '--map-rows': MAP_GRID.rows,
        }}
      >
        {TERRITORIES.map((definition, index) => {
          const territoryState = runtime.get(definition.id);
          const owner = players.get(territoryState.ownerId) || null;
          const castle = castleOwner(state, territoryState);
          const selectable = legal.has(definition.id);
          const changed = state.lastChangedTerritoryId === definition.id;
          const classNames = [
            'cq-territory',
            owner ? 'is-owned' : 'is-neutral',
            selectable ? 'is-legal' : '',
            selectedId === definition.id ? 'is-selected' : '',
            hasLegalChoices && !selectable ? 'is-muted' : '',
            castle ? 'has-castle' : '',
            changed ? 'is-changing' : '',
          ].filter(Boolean).join(' ');
          const shape = definition.shape || 'polygon(4% 5%, 96% 2%, 100% 90%, 8% 100%, 0 42%)';

          return (
            <button
              key={definition.id}
              className={classNames}
              type="button"
              aria-disabled={!selectable ? 'true' : undefined}
              aria-pressed={selectedId === definition.id}
              aria-label={territoryLabel(definition, territoryState, owner, castle)}
              tabIndex={selectable ? 0 : -1}
              onClick={() => selectable && onSelect?.(definition.id)}
              style={{
                gridArea: definition.gridArea,
                clipPath: shape,
                '--territory-color': owner?.color || '#9f9680',
                '--territory-delay': `${index * 18}ms`,
              }}
            >
              <span className="cq-territory-text">{definition.name}</span>
              <span className="cq-territory-value">{territoryState.value || '—'}</span>
              {castle && (
                <span className="cq-map-castle" aria-hidden="true">
                  <b>♜</b>
                  <span>
                    {Array.from({ length: GAME_RULES.CASTLE_TOWERS }, (_, towerIndex) => (
                      <i
                        key={towerIndex}
                        className={towerIndex < castle.castleTowers ? 'is-standing' : ''}
                      />
                    ))}
                  </span>
                </span>
              )}
              <span className="cq-territory-tooltip" role="tooltip">
                <strong>{definition.name}</strong>
                <span>Владелец: {owner?.name || 'нейтральная'}</span>
                {castle && <span>Замок: {castle.castleTowers} / {GAME_RULES.CASTLE_TOWERS} башни</span>}
                <span>Стоимость: {territoryState.value || 0}</span>
                {hasLegalChoices && !selectable && <em>Сейчас недоступна</em>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cq-map-legend" aria-label="Легенда карты">
        {state.players.map(player => (
          <span key={player.id} style={{ '--legend-color': player.color }}>
            <i /> {player.name}
          </span>
        ))}
        <span style={{ '--legend-color': '#9f9680' }}><i /> Нейтральная</span>
      </div>
    </section>
  );
}
