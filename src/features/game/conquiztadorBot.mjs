import { CONQUIZTADOR_MAP } from './conquiztadorMap.mjs';
import { GAME_RULES, QUESTION_TYPES } from './conquiztadorRules.mjs';

export const BOT_DIFFICULTIES = Object.freeze({
  EASY: 'EASY',
  NORMAL: 'NORMAL',
  HARD: 'HARD',
});

// Alias used by callers that keep all difficulty enums under a short name.
export const DIFFICULTIES = BOT_DIFFICULTIES;

export const BOT_PROFILES = Object.freeze({
  [BOT_DIFFICULTIES.EASY]: Object.freeze({
    multipleChoiceAccuracy: 0.40,
    accuracyJitter: 0.04,
    estimationSpreadFactor: 1.10,
    responseTimeMinMs: 2_400,
    responseTimeMaxMs: 8_000,
  }),
  [BOT_DIFFICULTIES.NORMAL]: Object.freeze({
    multipleChoiceAccuracy: 0.65,
    accuracyJitter: 0.04,
    estimationSpreadFactor: 0.58,
    responseTimeMinMs: 1_600,
    responseTimeMaxMs: 6_500,
  }),
  [BOT_DIFFICULTIES.HARD]: Object.freeze({
    multipleChoiceAccuracy: 0.82,
    accuracyJitter: 0.04,
    estimationSpreadFactor: 0.27,
    responseTimeMinMs: 1_000,
    responseTimeMaxMs: 4_800,
  }),
});

// Omitting RNG remains deterministic. Production games pass their seeded game
// RNG, and tests can pass a fixed sequence without touching global state.
const MIDPOINT_RANDOM = () => 0.5;

function profileFor(difficulty) {
  const profile = BOT_PROFILES[difficulty];
  if (!profile) {
    throw new RangeError(`Unknown bot difficulty: ${String(difficulty)}`);
  }
  return profile;
}

function randomUnit(random) {
  const source = typeof random === 'function' ? random : MIDPOINT_RANDOM;
  const value = Number(source());
  if (!Number.isFinite(value)) {
    throw new TypeError('Bot random callback must return a finite number.');
  }
  // Seeded generators conventionally return [0, 1), but clamping also makes
  // boundary-value test callbacks safe.
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}

function randomBetween(min, max, random) {
  return Math.round(min + (max - min) * randomUnit(random));
}

function responseTime(profile, random) {
  return randomBetween(profile.responseTimeMinMs, profile.responseTimeMaxMs, random);
}

function normalizeLegalIds(legalIds) {
  if (!Array.isArray(legalIds)) return [];
  const ids = legalIds
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
    .filter((id) => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

function toTerritoryMap(source) {
  if (source instanceof Map) return source;
  if (Array.isArray(source)) {
    return new Map(source.filter(Boolean).map((territory) => [territory.id, territory]));
  }
  if (source && typeof source === 'object') {
    return new Map(Object.entries(source));
  }
  return new Map();
}

function runtimeTerritoryMap(state) {
  const territories = state?.territories ?? state?.territoryState ?? state;
  return toTerritoryMap(territories);
}

function definitionTerritoryMap(map) {
  const territories = map?.territories ?? map ?? CONQUIZTADOR_MAP;
  return toTerritoryMap(territories);
}

function territoryOwner(territory) {
  return territory?.ownerId ?? territory?.owner ?? null;
}

function neighborsFor(territoryId, definitions, runtime) {
  const neighbors = definitions.get(territoryId)?.neighbors
    ?? runtime.get(territoryId)?.neighbors
    ?? [];
  return Array.isArray(neighbors) ? neighbors : [];
}

function playerList(state) {
  if (Array.isArray(state?.players)) return state.players;
  if (state?.players && typeof state.players === 'object') return Object.values(state.players);
  return [];
}

function ownerPlayerFor(territory, state) {
  const ownerId = territoryOwner(territory);
  return playerList(state).find((player) => player?.id === ownerId) ?? null;
}

function castleDetails(territoryId, runtimeTerritory, state) {
  const owner = ownerPlayerFor(runtimeTerritory, state);
  const explicitTowers = runtimeTerritory?.castleTowers ?? runtimeTerritory?.towers;
  const towers = Number.isFinite(explicitTowers)
    ? explicitTowers
    : owner?.castleTowers;
  const belongsToOwner = owner?.baseTerritoryId === territoryId && !owner?.eliminated;
  const isCastle = Boolean(runtimeTerritory?.isCastle || belongsToOwner);
  return {
    isCastle: isCastle && Number(towers) > 0,
    towers: Number.isFinite(Number(towers)) ? Number(towers) : GAME_RULES.CASTLE_TOWERS,
  };
}

export function answerMultipleChoice(
  question,
  difficulty = BOT_DIFFICULTIES.NORMAL,
  random = MIDPOINT_RANDOM,
) {
  const profile = profileFor(difficulty);
  const options = question?.options;
  const correctIndex = question?.correctIndex;
  if (!Array.isArray(options) || options.length < 2) {
    throw new TypeError('Multiple-choice question must contain at least two options.');
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    throw new RangeError('Multiple-choice question has an invalid correctIndex.');
  }

  const jitter = (randomUnit(random) * 2 - 1) * profile.accuracyJitter;
  const accuracy = Math.min(0.98, Math.max(0.02, profile.multipleChoiceAccuracy + jitter));
  const shouldAnswerCorrectly = randomUnit(random) < accuracy;
  let answerIndex = correctIndex;

  if (!shouldAnswerCorrectly) {
    const wrongIndexes = options
      .map((_, index) => index)
      .filter((index) => index !== correctIndex);
    answerIndex = wrongIndexes[Math.floor(randomUnit(random) * wrongIndexes.length)];
  }

  return Object.freeze({
    answerIndex,
    responseMs: responseTime(profile, random),
  });
}

export function answerEstimation(
  question,
  difficulty = BOT_DIFFICULTIES.NORMAL,
  random = MIDPOINT_RANDOM,
) {
  const profile = profileFor(difficulty);
  const correctValue = Number(question?.answer ?? question?.correctValue);
  if (!Number.isFinite(correctValue)) {
    throw new TypeError('Estimation question must contain a finite answer.');
  }

  const suppliedSpread = Number(question?.spread);
  const baseSpread = Number.isFinite(suppliedSpread) && suppliedSpread > 0
    ? suppliedSpread
    : Math.max(1, Math.abs(correctValue) * 0.25);
  // Averaging three samples gives believable answers clustered around the
  // truth while still allowing occasional large misses.
  const centeredNoise = ((randomUnit(random) + randomUnit(random) + randomUnit(random)) / 3) * 2 - 1;
  const error = centeredNoise * baseSpread * profile.estimationSpreadFactor;
  let value = Math.round(correctValue + error);
  if (correctValue >= 0) value = Math.max(0, value);

  return Object.freeze({
    value,
    responseMs: responseTime(profile, random),
  });
}

/** A public pure score helper used by deterministic strategy tests. */
export function scoreExpansionTerritory({ territoryId, map, state, playerId }) {
  const definitions = definitionTerritoryMap(map);
  const runtime = runtimeTerritoryMap(state);
  const neighbors = neighborsFor(territoryId, definitions, runtime);
  let neutralFrontier = 0;
  let rivalFrontier = 0;

  for (const neighborId of neighbors) {
    const ownerId = territoryOwner(runtime.get(neighborId));
    if (ownerId == null) neutralFrontier += 1;
    else if (ownerId !== playerId) rivalFrontier += 1;
  }

  // Opening new neutral borders matters most in expansion; degree is a small
  // centrality bonus and rival borders prepare the later war phase.
  return neutralFrontier * 3 + rivalFrontier * 1.25 + neighbors.length * 0.2;
}

export function chooseExpansionTerritory({
  legalIds,
  map = CONQUIZTADOR_MAP,
  state,
  playerId,
  random = MIDPOINT_RANDOM,
} = {}) {
  const candidates = normalizeLegalIds(legalIds);
  if (candidates.length === 0) return null;

  let bestId = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const territoryId of candidates) {
    const strategicScore = scoreExpansionTerritory({ territoryId, map, state, playerId });
    // A bounded taste for variety keeps the bot from replaying one exact route
    // without overpowering a clearly superior frontier position.
    const score = strategicScore + randomUnit(random) * 1.5;
    if (score > bestScore) {
      bestScore = score;
      bestId = territoryId;
    }
  }
  return bestId;
}

/** A public pure score helper used by deterministic strategy tests. */
export function scoreWarTerritory({ territoryId, map, state, playerId }) {
  const definitions = definitionTerritoryMap(map);
  const runtime = runtimeTerritoryMap(state);
  const territory = runtime.get(territoryId) ?? definitions.get(territoryId) ?? {};
  const neighbors = neighborsFor(territoryId, definitions, runtime);
  let onwardTargets = 0;
  let friendlySupport = 0;

  for (const neighborId of neighbors) {
    const ownerId = territoryOwner(runtime.get(neighborId));
    if (ownerId === playerId) friendlySupport += 1;
    else onwardTargets += 1;
  }

  const territoryValue = Number(territory.value) || 0;
  return onwardTargets * 2 + friendlySupport * 0.75 + neighbors.length * 0.35
    + Math.min(10, territoryValue / 200);
}

export function chooseWarTarget({
  legalIds,
  map = CONQUIZTADOR_MAP,
  state,
  playerId,
  random = MIDPOINT_RANDOM,
} = {}) {
  const candidates = normalizeLegalIds(legalIds);
  if (candidates.length === 0) return null;

  const runtime = runtimeTerritoryMap(state);
  const definitions = definitionTerritoryMap(map);
  const ranked = candidates.map((territoryId) => {
    const territory = runtime.get(territoryId) ?? definitions.get(territoryId) ?? {};
    const castle = castleDetails(territoryId, territory, state);
    const damagedCastle = castle.isCastle && castle.towers < GAME_RULES.CASTLE_TOWERS;
    return {
      territoryId,
      // Lexicographic priority guarantees: damaged castle > castle > land.
      priority: damagedCastle ? 3 : castle.isCastle ? 2 : 1,
      strategicScore: scoreWarTerritory({ territoryId, map, state, playerId }),
      towers: castle.towers,
    };
  });

  const highestPriority = Math.max(...ranked.map((candidate) => candidate.priority));
  const priorityGroup = ranked.filter((candidate) => candidate.priority === highestPriority);
  let best = priorityGroup[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of priorityGroup) {
    const damageBonus = candidate.priority === 3
      ? (GAME_RULES.CASTLE_TOWERS - candidate.towers) * 2
      : 0;
    const score = candidate.strategicScore + damageBonus + randomUnit(random) * 1.25;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best.territoryId;
}

export function validateBotProfiles(profiles = BOT_PROFILES) {
  const errors = [];
  const expectedAccuracy = {
    [BOT_DIFFICULTIES.EASY]: 0.40,
    [BOT_DIFFICULTIES.NORMAL]: 0.65,
    [BOT_DIFFICULTIES.HARD]: 0.82,
  };

  for (const difficulty of Object.values(BOT_DIFFICULTIES)) {
    const profile = profiles?.[difficulty];
    if (!profile) {
      errors.push(`Missing profile for ${difficulty}.`);
      continue;
    }
    if (profile.multipleChoiceAccuracy !== expectedAccuracy[difficulty]) {
      errors.push(`${difficulty} multiple-choice accuracy must be ${expectedAccuracy[difficulty]}.`);
    }
    if (!Number.isFinite(profile.accuracyJitter) || profile.accuracyJitter <= 0) {
      errors.push(`${difficulty} accuracyJitter must be positive.`);
    }
    if (!Number.isFinite(profile.estimationSpreadFactor) || profile.estimationSpreadFactor <= 0) {
      errors.push(`${difficulty} estimationSpreadFactor must be positive.`);
    }
    if (!Number.isInteger(profile.responseTimeMinMs) || !Number.isInteger(profile.responseTimeMaxMs)
      || profile.responseTimeMinMs < 1_000 || profile.responseTimeMaxMs > 8_000
      || profile.responseTimeMinMs > profile.responseTimeMaxMs) {
      errors.push(`${difficulty} response time must stay within 1-8 seconds.`);
    }
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function assertValidBotProfiles(profiles = BOT_PROFILES) {
  const result = validateBotProfiles(profiles);
  if (!result.valid) {
    throw new Error(`Invalid ConQUIZtador bot profiles:\n${result.errors.join('\n')}`);
  }
  return true;
}

/**
 * Stateful facade holding a bot's identity, difficulty and deterministic RNG.
 * Decision functions above remain available independently for engine tests.
 */
export class BotPlayer {
  constructor(config = {}, difficulty, random) {
    const normalized = typeof config === 'string'
      ? { name: config, difficulty, random }
      : config;

    this.id = normalized.id ?? null;
    this.name = normalized.name?.trim() || 'Бот';
    this.difficulty = normalized.difficulty ?? BOT_DIFFICULTIES.NORMAL;
    profileFor(this.difficulty);
    if (normalized.random != null && typeof normalized.random !== 'function') {
      throw new TypeError('BotPlayer random must be a function.');
    }
    this.random = normalized.random ?? MIDPOINT_RANDOM;
  }

  answerMultipleChoice(question) {
    return answerMultipleChoice(question, this.difficulty, this.random);
  }

  answerEstimation(question) {
    return answerEstimation(question, this.difficulty, this.random);
  }

  answerQuestion(question) {
    const type = question?.type;
    if (type === QUESTION_TYPES.MULTIPLE_CHOICE || Array.isArray(question?.options)) {
      return this.answerMultipleChoice(question);
    }
    if (type === QUESTION_TYPES.ESTIMATION
      || Number.isFinite(Number(question?.answer ?? question?.correctValue))) {
      return this.answerEstimation(question);
    }
    throw new TypeError('Unsupported question type for BotPlayer.');
  }

  chooseExpansionTerritory(context = {}) {
    return chooseExpansionTerritory({
      ...context,
      playerId: context.playerId ?? this.id,
      random: context.random ?? this.random,
    });
  }

  chooseWarTarget(context = {}) {
    return chooseWarTarget({
      ...context,
      playerId: context.playerId ?? this.id,
      random: context.random ?? this.random,
    });
  }
}

assertValidBotProfiles();

export default BotPlayer;
