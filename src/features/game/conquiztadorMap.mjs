/**
 * Static map data for ConQUIZtador.
 *
 * Geometry deliberately lives apart from runtime ownership/castle state.  The
 * UI may spread `grid` and `shape` into CSS styles, while the engine only needs
 * the stable ids and the adjacency graph.
 */

export const MAP_GRID = Object.freeze({
  columns: 12,
  rows: 8,
});

function geometry(rowStart, columnStart, shape) {
  const grid = Object.freeze({
    rowStart,
    columnStart,
    rowSpan: 2,
    columnSpan: 2,
  });

  return Object.freeze({
    grid,
    gridArea: `${rowStart} / ${columnStart} / span 2 / span 2`,
    shape,
  });
}

/**
 * CSS-grid placement and clip paths are kept separate so saved games never
 * need to persist presentation data.
 */
export const TERRITORY_GEOMETRY = Object.freeze({
  northwatch: geometry(1, 3, 'polygon(8% 18%, 53% 0, 100% 16%, 91% 91%, 48% 100%, 0 78%)'),
  frostpeak: geometry(1, 5, 'polygon(5% 13%, 46% 0, 96% 12%, 100% 82%, 57% 100%, 0 88%)'),
  aurora_plateau: geometry(1, 7, 'polygon(4% 15%, 55% 0, 100% 24%, 91% 100%, 9% 92%, 0 48%)'),
  dawn_cliffs: geometry(1, 9, 'polygon(2% 24%, 63% 0, 100% 32%, 88% 91%, 41% 100%, 0 73%)'),
  mist_coast: geometry(3, 1, 'polygon(18% 0, 100% 8%, 90% 92%, 35% 100%, 0 69%, 8% 30%)'),
  pine_march: geometry(3, 3, 'polygon(7% 4%, 94% 0, 100% 83%, 69% 100%, 0 91%, 3% 43%)'),
  white_valley: geometry(3, 5, 'polygon(1% 8%, 90% 0, 100% 42%, 91% 100%, 12% 92%, 0 55%)'),
  crownlands: geometry(3, 7, 'polygon(8% 0, 100% 10%, 91% 91%, 54% 100%, 0 88%, 3% 23%)'),
  amber_steppe: geometry(3, 9, 'polygon(4% 10%, 83% 0, 100% 33%, 94% 88%, 32% 100%, 0 79%)'),
  storm_cape: geometry(3, 11, 'polygon(0 12%, 72% 0, 100% 29%, 83% 100%, 27% 88%, 8% 55%)'),
  whisper_bay: geometry(5, 1, 'polygon(9% 0, 91% 8%, 100% 51%, 77% 100%, 22% 91%, 0 61%)'),
  oakheart: geometry(5, 3, 'polygon(3% 9%, 75% 0, 100% 18%, 91% 91%, 45% 100%, 0 84%)'),
  sun_meadow: geometry(5, 5, 'polygon(8% 0, 94% 5%, 100% 76%, 73% 100%, 2% 91%, 0 35%)'),
  iron_hills: geometry(5, 7, 'polygon(0 9%, 58% 0, 100% 22%, 89% 100%, 21% 92%, 4% 59%)'),
  dragon_pass: geometry(5, 9, 'polygon(9% 0, 93% 10%, 100% 55%, 78% 100%, 0 87%, 3% 29%)'),
  gull_peninsula: geometry(5, 11, 'polygon(0 12%, 73% 0, 100% 40%, 81% 79%, 94% 100%, 28% 91%, 5% 55%)'),
  willow_delta: geometry(7, 4, 'polygon(0 8%, 89% 0, 100% 49%, 78% 92%, 39% 100%, 8% 76%)'),
  pearl_isle: geometry(7, 7, 'polygon(16% 11%, 63% 0, 94% 25%, 100% 66%, 69% 100%, 21% 91%, 0 52%)'),
});

const TERRITORY_BLUEPRINTS = [
  ['northwatch', 'Северный дозор', ['frostpeak', 'pine_march', 'white_valley']],
  ['frostpeak', 'Морозный пик', ['northwatch', 'aurora_plateau', 'white_valley', 'crownlands']],
  ['aurora_plateau', 'Плато Сияния', ['frostpeak', 'dawn_cliffs', 'crownlands', 'amber_steppe']],
  ['dawn_cliffs', 'Утёсы Рассвета', ['aurora_plateau', 'amber_steppe', 'storm_cape']],
  ['mist_coast', 'Туманный берег', ['pine_march', 'whisper_bay', 'oakheart']],
  ['pine_march', 'Сосновая марка', ['northwatch', 'mist_coast', 'white_valley', 'oakheart', 'sun_meadow']],
  ['white_valley', 'Белая долина', ['northwatch', 'frostpeak', 'pine_march', 'crownlands', 'sun_meadow']],
  ['crownlands', 'Земли Короны', ['frostpeak', 'aurora_plateau', 'white_valley', 'amber_steppe', 'iron_hills']],
  ['amber_steppe', 'Янтарная степь', ['aurora_plateau', 'dawn_cliffs', 'crownlands', 'storm_cape', 'dragon_pass']],
  ['storm_cape', 'Грозовой мыс', ['dawn_cliffs', 'amber_steppe', 'gull_peninsula']],
  ['whisper_bay', 'Бухта Шёпота', ['mist_coast', 'oakheart']],
  ['oakheart', 'Дубовая чаща', ['mist_coast', 'pine_march', 'whisper_bay', 'sun_meadow', 'willow_delta']],
  ['sun_meadow', 'Солнечные луга', ['pine_march', 'white_valley', 'oakheart', 'iron_hills', 'willow_delta']],
  ['iron_hills', 'Железные холмы', ['crownlands', 'sun_meadow', 'dragon_pass', 'pearl_isle']],
  ['dragon_pass', 'Драконий перевал', ['amber_steppe', 'iron_hills', 'gull_peninsula', 'pearl_isle']],
  ['gull_peninsula', 'Чаечий полуостров', ['storm_cape', 'dragon_pass', 'pearl_isle']],
  ['willow_delta', 'Ивовая дельта', ['oakheart', 'sun_meadow', 'pearl_isle']],
  ['pearl_isle', 'Жемчужный остров', ['iron_hills', 'dragon_pass', 'gull_peninsula', 'willow_delta']],
];

/** Exactly eighteen immutable territories of the fictional Aurora Kingdom. */
export const CONQUIZTADOR_MAP = Object.freeze(TERRITORY_BLUEPRINTS.map(([id, name, neighbors]) => {
  const mapGeometry = TERRITORY_GEOMETRY[id];
  return Object.freeze({
    id,
    name,
    neighbors: Object.freeze([...neighbors]),
    grid: mapGeometry.grid,
    gridArea: mapGeometry.gridArea,
    shape: mapGeometry.shape,
  });
}));

// A short alias is convenient in the engine and keeps old saved-state adapters simple.
export const TERRITORIES = CONQUIZTADOR_MAP;

export const TERRITORY_BY_ID = Object.freeze(Object.fromEntries(
  CONQUIZTADOR_MAP.map((territory) => [territory.id, territory]),
));

export function getTerritoryDefinition(territoryId) {
  return TERRITORY_BY_ID[territoryId] ?? null;
}

export function areTerritoriesAdjacent(firstId, secondId) {
  return Boolean(TERRITORY_BY_ID[firstId]?.neighbors.includes(secondId));
}

/**
 * Returns every structural problem instead of failing on the first one, which
 * makes malformed custom/test maps much easier to diagnose.
 */
export function validateMapDefinition(map = CONQUIZTADOR_MAP, expectedSize = 18) {
  const errors = [];
  if (!Array.isArray(map)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['Map must be an array.']) });
  }

  if (map.length !== expectedSize) {
    errors.push(`Map must contain exactly ${expectedSize} territories; received ${map.length}.`);
  }

  const ids = new Set();
  for (const territory of map) {
    if (!territory || typeof territory !== 'object') {
      errors.push('Every territory must be an object.');
      continue;
    }
    if (typeof territory.id !== 'string' || territory.id.length === 0) {
      errors.push('Every territory must have a non-empty string id.');
    } else if (ids.has(territory.id)) {
      errors.push(`Duplicate territory id: ${territory.id}.`);
    } else {
      ids.add(territory.id);
    }
    if (typeof territory.name !== 'string' || territory.name.trim().length === 0) {
      errors.push(`Territory ${territory.id || '<unknown>'} must have a name.`);
    }
    if (!Array.isArray(territory.neighbors)) {
      errors.push(`Territory ${territory.id || '<unknown>'} must have a neighbors array.`);
    }
    const grid = territory.grid;
    if (!grid || !Number.isInteger(grid.rowStart) || !Number.isInteger(grid.columnStart)
      || !Number.isInteger(grid.rowSpan) || !Number.isInteger(grid.columnSpan)) {
      errors.push(`Territory ${territory.id || '<unknown>'} has invalid grid placement.`);
    }
    if (typeof territory.shape !== 'string' || !territory.shape.startsWith('polygon(')) {
      errors.push(`Territory ${territory.id || '<unknown>'} has invalid CSS shape.`);
    }
  }

  const byId = new Map(map.filter(Boolean).map((territory) => [territory.id, territory]));
  for (const territory of map) {
    if (!territory || !Array.isArray(territory.neighbors)) continue;
    const uniqueNeighbors = new Set();
    for (const neighborId of territory.neighbors) {
      if (neighborId === territory.id) {
        errors.push(`Territory ${territory.id} cannot border itself.`);
      } else if (!byId.has(neighborId)) {
        errors.push(`Territory ${territory.id} references unknown neighbor ${neighborId}.`);
      } else if (uniqueNeighbors.has(neighborId)) {
        errors.push(`Territory ${territory.id} repeats neighbor ${neighborId}.`);
      } else if (!byId.get(neighborId)?.neighbors?.includes(territory.id)) {
        errors.push(`Adjacency must be symmetric: ${territory.id} -> ${neighborId}.`);
      }
      uniqueNeighbors.add(neighborId);
    }
  }

  if (map.length > 0 && map[0]?.id) {
    const visited = new Set();
    const pending = [map[0].id];
    while (pending.length > 0) {
      const territoryId = pending.pop();
      if (visited.has(territoryId) || !byId.has(territoryId)) continue;
      visited.add(territoryId);
      pending.push(...(byId.get(territoryId).neighbors ?? []));
    }
    if (visited.size !== byId.size) {
      const unreachable = [...byId.keys()].filter((id) => !visited.has(id));
      errors.push(`Map graph is disconnected; unreachable: ${unreachable.join(', ')}.`);
    }
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function assertValidMapDefinition(map = CONQUIZTADOR_MAP, expectedSize = 18) {
  const result = validateMapDefinition(map, expectedSize);
  if (!result.valid) {
    throw new Error(`Invalid ConQUIZtador map:\n${result.errors.join('\n')}`);
  }
  return true;
}

// Fail fast during development if an edit breaks the authoritative map graph.
assertValidMapDefinition();

export default CONQUIZTADOR_MAP;
