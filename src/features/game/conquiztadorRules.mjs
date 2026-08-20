/** Authoritative phase state machine values. */
export const PHASES = Object.freeze({
  BASE_SELECTION: 'BASE_SELECTION',
  EXPANSION: 'EXPANSION',
  DISTRIBUTION: 'DISTRIBUTION',
  WAR: 'WAR',
  FINISHED: 'FINISHED',
});

/** Fine-grained UI/engine steps inside a phase. */
export const STEPS = Object.freeze({
  SELECT_TERRITORY: 'SELECT_TERRITORY',
  CONFIRM_ATTACK: 'CONFIRM_ATTACK',
  QUESTION: 'QUESTION',
  TIEBREAK: 'TIEBREAK',
  BOT_THINKING: 'BOT_THINKING',
  RESULT: 'RESULT',
  TRANSITION: 'TRANSITION',
  SUMMARY: 'SUMMARY',
});

/** How a territory entered its current owner's realm. */
export const ACQUISITIONS = Object.freeze({
  BASE: 'BASE',
  EXPANSION: 'EXPANSION',
  DISTRIBUTION: 'DISTRIBUTION',
  CONQUEST: 'CONQUEST',
});

export const QUESTION_TYPES = Object.freeze({
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  ESTIMATION: 'ESTIMATION',
});

/**
 * The only numeric rulebook used by the game engine and UI.
 *
 * A castle base is worth DESTROYED_CASTLE_VALUE to the player who destroys
 * it.  If that former base changes hands again, it is an ordinary conquest
 * and is explicitly reduced to RECAPTURED_BASE_VALUE.
 */
export const GAME_RULES = Object.freeze({
  BASE_VALUE: 1000,
  EXPANSION_VALUE: 200,
  DISTRIBUTION_VALUE: 300,
  CONQUEST_VALUE: 400,
  DESTROYED_CASTLE_VALUE: 1000,
  RECAPTURED_BASE_VALUE: 400,
  CASTLE_TOWERS: 3,
  DEFENSE_BONUS: 100,
  QUESTION_TIME_MS: 10_000,
  DEV_QUESTION_TIME_MS: 2_000,
  RESULT_DISPLAY_MS: 1_700,
  WAR_ROUNDS: 5,
  EXPANSION_ROUNDS: 3,
  BOT_DELAY_MS: 600,
  DEV_BOT_DELAY_MS: 100,
});

export const PHASE_SEQUENCE = Object.freeze([
  PHASES.BASE_SELECTION,
  PHASES.EXPANSION,
  PHASES.DISTRIBUTION,
  PHASES.WAR,
  PHASES.FINISHED,
]);

const ACQUISITION_VALUES = Object.freeze({
  [ACQUISITIONS.BASE]: GAME_RULES.BASE_VALUE,
  [ACQUISITIONS.EXPANSION]: GAME_RULES.EXPANSION_VALUE,
  [ACQUISITIONS.DISTRIBUTION]: GAME_RULES.DISTRIBUTION_VALUE,
  [ACQUISITIONS.CONQUEST]: GAME_RULES.CONQUEST_VALUE,
});

export function valueForAcquisition(acquisition) {
  const value = ACQUISITION_VALUES[acquisition];
  if (value === undefined) {
    throw new RangeError(`Unknown territory acquisition: ${String(acquisition)}`);
  }
  return value;
}

/**
 * Resolves the special castle rule without embedding a magic number in battle
 * code. `castleJustDestroyed` only applies to the blow that eliminates its
 * original owner; any later capture is worth the normal conquest value.
 */
export function valueForConquest({ castleJustDestroyed = false } = {}) {
  return castleJustDestroyed
    ? GAME_RULES.DESTROYED_CASTLE_VALUE
    : GAME_RULES.RECAPTURED_BASE_VALUE;
}

export function isGamePhase(value) {
  return PHASE_SEQUENCE.includes(value);
}

export function isGameStep(value) {
  return Object.values(STEPS).includes(value);
}

export function validateGameRules(rules = GAME_RULES) {
  const errors = [];
  const requiredPositiveIntegers = [
    'BASE_VALUE',
    'EXPANSION_VALUE',
    'DISTRIBUTION_VALUE',
    'CONQUEST_VALUE',
    'CASTLE_TOWERS',
    'QUESTION_TIME_MS',
    'DEV_QUESTION_TIME_MS',
    'WAR_ROUNDS',
    'EXPANSION_ROUNDS',
    'BOT_DELAY_MS',
    'DEV_BOT_DELAY_MS',
  ];

  for (const key of requiredPositiveIntegers) {
    if (!Number.isInteger(rules?.[key]) || rules[key] <= 0) {
      errors.push(`${key} must be a positive integer.`);
    }
  }

  if (rules?.DESTROYED_CASTLE_VALUE !== rules?.BASE_VALUE) {
    errors.push('DESTROYED_CASTLE_VALUE must preserve BASE_VALUE on castle destruction.');
  }
  if (rules?.RECAPTURED_BASE_VALUE !== rules?.CONQUEST_VALUE) {
    errors.push('RECAPTURED_BASE_VALUE must equal CONQUEST_VALUE.');
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function assertValidGameRules(rules = GAME_RULES) {
  const result = validateGameRules(rules);
  if (!result.valid) {
    throw new Error(`Invalid ConQUIZtador rules:\n${result.errors.join('\n')}`);
  }
  return true;
}

assertValidGameRules();

export default GAME_RULES;
