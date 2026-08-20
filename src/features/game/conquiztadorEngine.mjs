import {
  answerEstimation,
  answerMultipleChoice,
  BOT_DIFFICULTIES,
  chooseExpansionTerritory,
  chooseWarTarget,
} from './conquiztadorBot.mjs';
import { TERRITORIES } from './conquiztadorMap.mjs';
import {
  ACQUISITIONS,
  GAME_RULES,
  PHASES,
  STEPS,
} from './conquiztadorRules.mjs';
import {
  BATTLE_QUESTIONS,
  ESTIMATE_QUESTIONS,
} from './conquestQuestions.mjs';

export const GAME_STATE_VERSION = 2;
export const HUMAN_PLAYER_ID = 'human';

const PLAYER_IDS = [HUMAN_PLAYER_ID, 'knight', 'magister'];
const PLAYER_ID_SET = new Set(PLAYER_IDS);
const PLAYER_STAT_KEYS = [
  'answers',
  'correctAnswers',
  'estimationAnswers',
  'estimationWins',
  'successfulAttacks',
  'successfulDefenses',
  'eliminatedPlayers',
];
const VALID_STEPS_BY_PHASE = Object.freeze({
  [PHASES.BASE_SELECTION]: new Set([STEPS.SELECT_TERRITORY]),
  [PHASES.EXPANSION]: new Set([
    STEPS.SELECT_TERRITORY,
    STEPS.QUESTION,
    STEPS.BOT_THINKING,
    STEPS.RESULT,
  ]),
  [PHASES.DISTRIBUTION]: new Set([
    STEPS.QUESTION,
    STEPS.SELECT_TERRITORY,
    STEPS.RESULT,
  ]),
  [PHASES.WAR]: new Set([
    STEPS.TRANSITION,
    STEPS.SELECT_TERRITORY,
    STEPS.CONFIRM_ATTACK,
    STEPS.QUESTION,
    STEPS.TIEBREAK,
    STEPS.BOT_THINKING,
    STEPS.RESULT,
  ]),
  [PHASES.FINISHED]: new Set([STEPS.TIEBREAK, STEPS.SUMMARY]),
});
const TERRITORY_DEFINITIONS = new Map(
  TERRITORIES.map(territory => [territory.id, territory])
);

export class GameRuleError extends Error {
  constructor(message, code = 'ILLEGAL_ACTION') {
    super(message);
    this.name = 'GameRuleError';
    this.code = code;
  }
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function normalizePlayerName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  return name.slice(0, 24) || 'Игрок';
}

function playerById(state, playerId) {
  return state.players.find(player => player.id === playerId) || null;
}

function territoryById(state, territoryId) {
  return state.territories.find(territory => territory.id === territoryId) || null;
}

function currentPlayer(state) {
  return state.players[state.currentPlayerIndex] || null;
}

function assertRule(condition, message, code) {
  if (!condition) throw new GameRuleError(message, code);
}

function assertValidSave(condition, message = 'Сохранение повреждено.') {
  assertRule(condition, message, 'INVALID_SAVE');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isKnownPlayerId(value, nullable = false) {
  return (nullable && value === null) || PLAYER_ID_SET.has(value);
}

function isKnownTerritoryId(value, nullable = false) {
  return (nullable && value === null) || TERRITORY_DEFINITIONS.has(value);
}

function isValidSavedQuestion(question) {
  if (!isRecord(question) || typeof question.id !== 'string' || !question.id) return false;
  if (!['MULTIPLE_CHOICE', 'ESTIMATION'].includes(question.type)) return false;
  if (!isNonNegativeInteger(question.sequence) || question.sequence < 1) return false;
  if (question.type === 'MULTIPLE_CHOICE') {
    return Array.isArray(question.answers)
      && question.answers.length === 4
      && question.answers.every(answer => typeof answer === 'string' && answer.length > 0)
      && Number.isInteger(question.correctAnswer)
      && question.correctAnswer >= 0
      && question.correctAnswer < question.answers.length;
  }
  return Number.isFinite(question.correctValue);
}

function isValidSavedPlayer(player, expectedId) {
  if (!isRecord(player) || player.id !== expectedId) return false;
  if (typeof player.name !== 'string' || !player.name.trim()) return false;
  if (typeof player.color !== 'string' || !player.color) return false;
  if (!['HUMAN', 'BOT'].includes(player.type)) return false;
  if (expectedId === HUMAN_PLAYER_ID && player.type !== 'HUMAN') return false;
  if (expectedId !== HUMAN_PLAYER_ID && player.type !== 'BOT') return false;
  if (!isKnownTerritoryId(player.baseTerritoryId, true)) return false;
  if (!isNonNegativeInteger(player.castleTowers) || player.castleTowers > GAME_RULES.CASTLE_TOWERS) return false;
  if (!isNonNegativeInteger(player.bonusScore) || typeof player.eliminated !== 'boolean') return false;
  if (!isRecord(player.stats)) return false;
  return PLAYER_STAT_KEYS.every(key => isNonNegativeInteger(player.stats[key]));
}

function isValidSavedTerritory(territory) {
  if (!isRecord(territory) || !isKnownTerritoryId(territory.id)) return false;
  if (!isKnownPlayerId(territory.ownerId, true) || !isKnownPlayerId(territory.baseOwnerId, true)) return false;
  if (![null, ...Object.values(ACQUISITIONS)].includes(territory.acquisition)) return false;
  if (!isNonNegativeInteger(territory.value) || typeof territory.isBase !== 'boolean') return false;
  return territory.isBase
    ? territory.baseOwnerId !== null
    : territory.baseOwnerId === null;
}

function assertTurn(state, playerId) {
  const player = currentPlayer(state);
  assertRule(player?.id === playerId, 'Сейчас ход другого игрока.', 'WRONG_TURN');
  assertRule(!player.eliminated, 'Этот игрок уже выбыл.', 'PLAYER_ELIMINATED');
  return player;
}

function nextRandom(state) {
  const previous = Number(state.rngState) >>> 0;
  const next = ((previous * 1664525) + 1013904223) >>> 0;
  state.rngState = next;
  return next / 4294967296;
}

function randomInt(state, maximum) {
  if (maximum <= 1) return 0;
  return Math.floor(nextRandom(state) * maximum);
}

function shuffle(state, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(state, index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomCallback(state) {
  return () => nextRandom(state);
}

function addEvent(state, text, kind = 'info') {
  state.eventSequence = (Number(state.eventSequence) || 0) + 1;
  state.eventLog.unshift({
    id: state.eventSequence,
    kind,
    text,
  });
  state.eventLog = state.eventLog.slice(0, 20);
}

function normalizeQuestion(question, type) {
  if (type === 'ESTIMATION') {
    return {
      ...question,
      type,
      text: question.text || question.prompt,
      correctValue: Number(question.correctValue ?? question.answer),
    };
  }
  return {
    ...question,
    type,
    text: question.text || question.prompt,
    answers: question.answers || question.options,
    correctAnswer: Number(question.correctAnswer ?? question.correctIndex),
  };
}

function drawQuestion(state, type) {
  const bank = type === 'ESTIMATION' ? ESTIMATE_QUESTIONS : BATTLE_QUESTIONS;
  let available = bank.filter(question => !state.usedQuestionIds.includes(question.id));
  if (available.length === 0) {
    const bankIds = new Set(bank.map(question => question.id));
    state.usedQuestionIds = state.usedQuestionIds.filter(id => !bankIds.has(id));
    available = [...bank];
  }
  assertRule(available.length > 0, 'Банк вопросов пуст.', 'EMPTY_QUESTION_BANK');
  const question = normalizeQuestion(available[randomInt(state, available.length)], type);
  state.usedQuestionIds.push(question.id);
  state.questionSequence = (Number(state.questionSequence) || 0) + 1;
  state.questionDeadlineAt = Date.now() + state.questionDurationMs;
  return {
    ...question,
    sequence: state.questionSequence,
  };
}

function isNeighbor(firstId, secondId) {
  return Boolean(TERRITORY_DEFINITIONS.get(firstId)?.neighbors.includes(secondId));
}

function ownedTerritoryIds(state, playerId) {
  return state.territories
    .filter(territory => territory.ownerId === playerId)
    .map(territory => territory.id);
}

function neutralTerritories(state) {
  return state.territories.filter(territory => territory.ownerId === null);
}

function standingCastleOwner(state, territory) {
  if (!territory?.isBase || !territory.baseOwnerId) return null;
  const baseOwner = playerById(state, territory.baseOwnerId);
  if (!baseOwner || baseOwner.eliminated || baseOwner.castleTowers <= 0) return null;
  return territory.ownerId === baseOwner.id ? baseOwner : null;
}

function mapDistance(fromId, toId) {
  if (fromId === toId) return 0;
  const visited = new Set([fromId]);
  let frontier = [fromId];
  let distance = 0;
  while (frontier.length > 0) {
    distance += 1;
    const nextFrontier = [];
    for (const territoryId of frontier) {
      for (const neighborId of TERRITORY_DEFINITIONS.get(territoryId)?.neighbors || []) {
        if (neighborId === toId) return distance;
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        nextFrontier.push(neighborId);
      }
    }
    frontier = nextFrontier;
  }
  return Number.MAX_SAFE_INTEGER;
}

function botDifficulty(player) {
  return player.difficulty || BOT_DIFFICULTIES.NORMAL;
}

function makeBotMultipleChoice(state, player, question) {
  const response = answerMultipleChoice(
    question,
    botDifficulty(player),
    randomCallback(state)
  );
  return {
    answerIndex: Number(response.answerIndex),
    responseMs: Number(response.responseMs),
  };
}

function makeBotEstimation(state, player, question) {
  const response = answerEstimation(
    question,
    botDifficulty(player),
    randomCallback(state)
  );
  return {
    value: Number(response.value ?? response.answer),
    responseMs: Number(response.responseMs),
  };
}

function correctMultipleChoiceIndex(question) {
  return Number(question.correctAnswer ?? question.correctIndex);
}

function correctEstimationValue(question) {
  return Number(question.correctValue ?? question.answer);
}

function recordMultipleChoice(player, response, question) {
  player.stats.answers += 1;
  response.correct = Number(response.answerIndex) === correctMultipleChoiceIndex(question);
  if (response.correct) player.stats.correctAnswers += 1;
}

function scoreEstimateResponse(response, correctValue) {
  const finite = Number.isFinite(response.value);
  return {
    ...response,
    difference: finite ? Math.abs(response.value - correctValue) : null,
    sortDifference: finite ? Math.abs(response.value - correctValue) : Number.MAX_SAFE_INTEGER,
  };
}

function rankEstimateResponses(state, responses, question) {
  const correctValue = correctEstimationValue(question);
  return Object.entries(responses)
    .map(([playerId, response]) => {
      const scored = scoreEstimateResponse(response, correctValue);
      return {
        playerId,
        playerName: playerById(state, playerId)?.name || playerId,
        value: Number.isFinite(scored.value) ? scored.value : null,
        responseMs: scored.responseMs,
        difference: scored.difference,
        sortDifference: scored.sortDifference,
      };
    })
    .sort((first, second) => (
      first.sortDifference - second.sortDifference
      || first.responseMs - second.responseMs
      || PLAYER_IDS.indexOf(first.playerId) - PLAYER_IDS.indexOf(second.playerId)
    ))
    .map(({ sortDifference, ...entry }) => entry);
}

export function rankEstimationAnswers(correctValue, answers) {
  const target = Number(correctValue);
  assertRule(Number.isFinite(target), 'Правильное значение должно быть числом.', 'INVALID_QUESTION');
  return answers
    .map((entry, index) => ({
      ...entry,
      _index: index,
      difference: Number.isFinite(Number(entry.value))
        ? Math.abs(Number(entry.value) - target)
        : null,
    }))
    .sort((first, second) => (
      (first.difference ?? Number.MAX_SAFE_INTEGER)
      - (second.difference ?? Number.MAX_SAFE_INTEGER)
      || Number(first.responseMs || 0) - Number(second.responseMs || 0)
      || first._index - second._index
    ))
    .map(({ _index, ...entry }) => entry);
}

function territoryRuntime(definition) {
  return {
    id: definition.id,
    ownerId: null,
    acquisition: null,
    value: 0,
    isBase: false,
    baseOwnerId: null,
  };
}

export function createGame({
  playerName = 'Игрок',
  questionDurationMs = GAME_RULES.QUESTION_TIME_MS,
  seed = Date.now(),
} = {}) {
  const normalizedSeed = (Number(seed) >>> 0) || 1;
  const normalizedQuestionDuration = Number(questionDurationMs);
  assertRule(
    Number.isInteger(normalizedQuestionDuration)
      && normalizedQuestionDuration >= 250
      && normalizedQuestionDuration <= 60_000,
    'Некорректная длительность вопроса.',
    'INVALID_CONFIGURATION'
  );
  return {
    version: GAME_STATE_VERSION,
    id: `cq-${normalizedSeed.toString(36)}`,
    status: 'ACTIVE',
    phase: PHASES.BASE_SELECTION,
    step: STEPS.SELECT_TERRITORY,
    round: 1,
    currentPlayerIndex: 0,
    players: [
      {
        id: HUMAN_PLAYER_ID,
        name: normalizePlayerName(playerName),
        type: 'HUMAN',
        difficulty: null,
        color: '#3977d6',
        baseTerritoryId: null,
        castleTowers: 0,
        bonusScore: 0,
        eliminated: false,
        stats: {
          answers: 0,
          correctAnswers: 0,
          estimationAnswers: 0,
          estimationWins: 0,
          successfulAttacks: 0,
          successfulDefenses: 0,
          eliminatedPlayers: 0,
        },
      },
      {
        id: 'knight',
        name: 'Бот Рыцарь',
        type: 'BOT',
        difficulty: BOT_DIFFICULTIES.NORMAL,
        color: '#c74b50',
        baseTerritoryId: null,
        castleTowers: 0,
        bonusScore: 0,
        eliminated: false,
        stats: {
          answers: 0,
          correctAnswers: 0,
          estimationAnswers: 0,
          estimationWins: 0,
          successfulAttacks: 0,
          successfulDefenses: 0,
          eliminatedPlayers: 0,
        },
      },
      {
        id: 'magister',
        name: 'Бот Магистр',
        type: 'BOT',
        difficulty: BOT_DIFFICULTIES.HARD,
        color: '#2f8a62',
        baseTerritoryId: null,
        castleTowers: 0,
        bonusScore: 0,
        eliminated: false,
        stats: {
          answers: 0,
          correctAnswers: 0,
          estimationAnswers: 0,
          estimationWins: 0,
          successfulAttacks: 0,
          successfulDefenses: 0,
          eliminatedPlayers: 0,
        },
      },
    ],
    territories: TERRITORIES.map(territoryRuntime),
    activeQuestion: null,
    questionDurationMs: normalizedQuestionDuration,
    questionDeadlineAt: null,
    selectedTerritoryId: null,
    pendingDistributionWinnerId: null,
    battle: null,
    result: null,
    usedQuestionIds: [],
    eventLog: [],
    eventSequence: 0,
    questionSequence: 0,
    rngState: normalizedSeed,
    winnerId: null,
    finishedReason: null,
    finalTiebreak: null,
    lastChangedTerritoryId: null,
  };
}

export function restoreGame(rawState) {
  assertValidSave(isRecord(rawState));
  assertValidSave(rawState.version === GAME_STATE_VERSION, 'Версия сохранения устарела.');
  assertValidSave(typeof rawState.id === 'string' && rawState.id.length > 0);
  assertValidSave(['ACTIVE', 'FINISHED'].includes(rawState.status));
  assertValidSave(Object.values(PHASES).includes(rawState.phase), 'Неизвестная фаза сохранения.');
  assertValidSave(
    Object.values(STEPS).includes(rawState.step)
      && VALID_STEPS_BY_PHASE[rawState.phase]?.has(rawState.step),
    'Некорректный этап сохранения.'
  );
  assertValidSave(isNonNegativeInteger(rawState.round));
  assertValidSave(
    Number.isInteger(rawState.currentPlayerIndex)
      && rawState.currentPlayerIndex >= 0
      && rawState.currentPlayerIndex < PLAYER_IDS.length
  );
  assertValidSave(
    Number.isInteger(rawState.questionDurationMs)
      && rawState.questionDurationMs >= 250
      && rawState.questionDurationMs <= 60_000
  );
  assertValidSave(
    rawState.questionDeadlineAt === null
      || (Number.isInteger(rawState.questionDeadlineAt) && rawState.questionDeadlineAt > 0)
  );

  assertValidSave(
    Array.isArray(rawState.players)
      && rawState.players.length === PLAYER_IDS.length
      && rawState.players.every((player, index) => isValidSavedPlayer(player, PLAYER_IDS[index])),
    'Некорректные игроки.'
  );
  assertValidSave(
    Array.isArray(rawState.territories)
      && rawState.territories.length === TERRITORIES.length
      && rawState.territories.every(isValidSavedTerritory)
      && new Set(rawState.territories.map(territory => territory.id)).size === TERRITORIES.length,
    'Некорректная карта сохранения.'
  );
  const savedTerritoryIds = new Set(rawState.territories.map(territory => territory.id));
  assertValidSave(
    TERRITORIES.every(territory => savedTerritoryIds.has(territory.id)),
    'Карта сохранения неполна.'
  );

  for (const player of rawState.players) {
    if (player.baseTerritoryId === null) {
      assertValidSave(
        rawState.phase === PHASES.BASE_SELECTION
          && player.castleTowers === 0
          && !player.eliminated,
        'Вне выбора базы каждый игрок должен иметь замок.'
      );
      continue;
    }
    const base = rawState.territories.find(territory => territory.id === player.baseTerritoryId);
    assertValidSave(
      base?.isBase && base.baseOwnerId === player.id,
      'Некорректный замок в сохранении.'
    );
    if (player.eliminated) {
      assertValidSave(
        player.castleTowers === 0
          && !rawState.territories.some(territory => territory.ownerId === player.id),
        'У выбывшего игрока не может быть целого замка или земель.'
      );
    } else {
      assertValidSave(
        player.castleTowers > 0 && base.ownerId === player.id,
        'Действующий замок должен принадлежать своему игроку.'
      );
    }
  }

  const currentSavedPlayer = rawState.players[rawState.currentPlayerIndex];
  if (rawState.step === STEPS.BOT_THINKING) {
    assertValidSave(currentSavedPlayer.type === 'BOT', 'Ход бота назначен игроку.');
  }
  if (
    (rawState.phase === PHASES.EXPANSION
      && [STEPS.SELECT_TERRITORY, STEPS.QUESTION].includes(rawState.step))
    || (rawState.phase === PHASES.WAR
      && [STEPS.SELECT_TERRITORY, STEPS.CONFIRM_ATTACK].includes(rawState.step))
  ) {
    assertValidSave(currentSavedPlayer.type === 'HUMAN', 'Ход игрока назначен боту.');
  }

  for (const territory of rawState.territories) {
    if (territory.ownerId === null) {
      assertValidSave(
        territory.acquisition === null
          && territory.value === 0
          && !territory.isBase,
        'Некорректная нейтральная территория.'
      );
      continue;
    }
    assertValidSave(territory.acquisition !== null && territory.value > 0);
    if (territory.acquisition === ACQUISITIONS.BASE) {
      assertValidSave(territory.isBase && territory.value === GAME_RULES.BASE_VALUE);
    } else if (territory.acquisition === ACQUISITIONS.EXPANSION) {
      assertValidSave(territory.value === GAME_RULES.EXPANSION_VALUE);
    } else if (territory.acquisition === ACQUISITIONS.DISTRIBUTION) {
      assertValidSave(territory.value === GAME_RULES.DISTRIBUTION_VALUE);
    } else if (territory.acquisition === ACQUISITIONS.CONQUEST) {
      assertValidSave([
        GAME_RULES.CONQUEST_VALUE,
        GAME_RULES.DESTROYED_CASTLE_VALUE,
      ].includes(territory.value));
    }
  }

  assertValidSave(isKnownTerritoryId(rawState.selectedTerritoryId, true));
  assertValidSave(isKnownTerritoryId(rawState.lastChangedTerritoryId, true));
  assertValidSave(isKnownPlayerId(rawState.pendingDistributionWinnerId, true));
  if (rawState.phase === PHASES.DISTRIBUTION && rawState.step === STEPS.SELECT_TERRITORY) {
    assertValidSave(
      rawState.pendingDistributionWinnerId === HUMAN_PLAYER_ID,
      'В сохранении не указан победитель распределения.'
    );
  }
  assertValidSave(isKnownPlayerId(rawState.winnerId, true));
  assertValidSave(isNonNegativeInteger(rawState.eventSequence));
  assertValidSave(isNonNegativeInteger(rawState.questionSequence));
  assertValidSave(
    Number.isInteger(rawState.rngState)
      && rawState.rngState >= 0
      && rawState.rngState <= 0xFFFFFFFF
  );
  assertValidSave(
    Array.isArray(rawState.usedQuestionIds)
      && rawState.usedQuestionIds.every(id => typeof id === 'string' && id.length > 0)
      && new Set(rawState.usedQuestionIds).size === rawState.usedQuestionIds.length
  );
  assertValidSave(
    Array.isArray(rawState.eventLog)
      && rawState.eventLog.every(entry => (
        isRecord(entry)
        && isNonNegativeInteger(entry.id)
        && typeof entry.kind === 'string'
        && typeof entry.text === 'string'
      ))
  );

  assertValidSave(rawState.activeQuestion === null || isValidSavedQuestion(rawState.activeQuestion));
  if ([STEPS.QUESTION, STEPS.TIEBREAK].includes(rawState.step)) {
    assertValidSave(
      isValidSavedQuestion(rawState.activeQuestion)
        && Number.isInteger(rawState.questionDeadlineAt),
      'В сохранении отсутствует вопрос или его таймер.'
    );
  }
  assertValidSave(rawState.result === null || isRecord(rawState.result));
  if ([STEPS.RESULT, STEPS.TRANSITION].includes(rawState.step)) {
    assertValidSave(
      isRecord(rawState.result)
        && typeof rawState.result.context === 'string'
        && typeof rawState.result.type === 'string'
        && typeof rawState.result.title === 'string'
        && typeof rawState.result.message === 'string',
      'Некорректный результат хода в сохранении.'
    );
  }

  assertValidSave(rawState.battle === null || isRecord(rawState.battle));
  const requiresSavedBattle = rawState.phase === PHASES.WAR && (
    [STEPS.QUESTION, STEPS.TIEBREAK].includes(rawState.step)
    || (rawState.step === STEPS.RESULT && rawState.result?.type !== 'skipped')
  );
  if (requiresSavedBattle) {
    assertValidSave(
      isRecord(rawState.battle)
        && isKnownPlayerId(rawState.battle.attackerId)
        && isKnownPlayerId(rawState.battle.defenderId)
        && rawState.battle.attackerId !== rawState.battle.defenderId
        && isKnownTerritoryId(rawState.battle.territoryId)
        && isValidSavedQuestion(rawState.battle.question)
        && isRecord(rawState.battle.responses),
      'Некорректная битва в сохранении.'
    );
    const participantIds = new Set([
      rawState.battle.attackerId,
      rawState.battle.defenderId,
    ]);
    const participantIdList = [...participantIds];
    const botParticipantIds = participantIdList.filter(playerId => (
      rawState.players.find(player => player.id === playerId)?.type === 'BOT'
    ));
    assertValidSave(
      Object.entries(rawState.battle.responses).every(([playerId, response]) => (
        participantIds.has(playerId)
        && isRecord(response)
        && Number.isInteger(response.answerIndex)
        && Number.isFinite(response.responseMs)
      )),
      'Некорректные ответы в битве.'
    );
    const expectedPrimaryResponseIds = rawState.step === STEPS.QUESTION
      ? botParticipantIds
      : participantIdList;
    assertValidSave(
      participantIds.has(HUMAN_PLAYER_ID)
        || rawState.step === STEPS.RESULT,
      'Битва без игрока не может ожидать ответа.'
    );
    assertValidSave(
      Object.keys(rawState.battle.responses).length === expectedPrimaryResponseIds.length
        && expectedPrimaryResponseIds.every(playerId => (
          Object.prototype.hasOwnProperty.call(rawState.battle.responses, playerId)
        )),
      'В битве отсутствует обязательный ответ.'
    );
    if (rawState.battle.tieBreakResponses !== null) {
      assertValidSave(
        isRecord(rawState.battle.tieBreakResponses)
          && Object.entries(rawState.battle.tieBreakResponses).every(([playerId, response]) => (
            participantIds.has(playerId)
            && isRecord(response)
            && (response.value === null || Number.isFinite(response.value))
            && Number.isFinite(response.responseMs)
          )),
        'Некорректные ответы дополнительного вопроса.'
      );
    }
    if (rawState.step === STEPS.TIEBREAK) {
      assertValidSave(
        participantIds.has(HUMAN_PLAYER_ID)
          && isValidSavedQuestion(rawState.battle.tieBreakQuestion)
          && rawState.battle.tieBreakQuestion.type === 'ESTIMATION'
          && isRecord(rawState.battle.tieBreakResponses)
          && Object.keys(rawState.battle.tieBreakResponses).length === botParticipantIds.length
          && botParticipantIds.every(playerId => (
            Object.prototype.hasOwnProperty.call(rawState.battle.tieBreakResponses, playerId)
          )),
        'Некорректное состояние дополнительного вопроса.'
      );
    }
  }
  if (rawState.step === STEPS.CONFIRM_ATTACK) {
    assertValidSave(rawState.phase === PHASES.WAR && rawState.selectedTerritoryId !== null);
  }

  assertValidSave(rawState.finalTiebreak === null || isRecord(rawState.finalTiebreak));
  if (rawState.phase === PHASES.FINISHED && rawState.step === STEPS.TIEBREAK) {
    assertValidSave(
      rawState.status === 'ACTIVE'
        && isRecord(rawState.finalTiebreak)
        && Array.isArray(rawState.finalTiebreak.finalistIds)
        && rawState.finalTiebreak.finalistIds.length >= 2
        && rawState.finalTiebreak.finalistIds.every(id => isKnownPlayerId(id))
        && isRecord(rawState.finalTiebreak.responses),
      'Некорректный финальный вопрос в сохранении.'
    );
  }
  if (rawState.step === STEPS.SUMMARY) {
    assertValidSave(
      rawState.phase === PHASES.FINISHED
        && rawState.status === 'FINISHED'
        && rawState.winnerId !== null,
      'Некорректные итоги в сохранении.'
    );
  } else {
    assertValidSave(rawState.status === 'ACTIVE' && rawState.winnerId === null);
  }
  return cloneState(rawState);
}

export function getPlayer(state, playerId) {
  return playerById(state, playerId);
}

export function getTerritory(state, territoryId) {
  return territoryById(state, territoryId);
}

export function getCurrentPlayer(state) {
  return currentPlayer(state);
}

export function getPlayerTerritoryCount(state, playerId) {
  return state.territories.filter(territory => territory.ownerId === playerId).length;
}

export function getPlayerScore(state, playerId) {
  const player = playerById(state, playerId);
  if (!player) return 0;
  return state.territories
    .filter(territory => territory.ownerId === playerId)
    .reduce((total, territory) => total + Number(territory.value || 0), player.bonusScore);
}

export function getActivePlayers(state) {
  return state.players.filter(player => !player.eliminated);
}

export function isStandingCastle(state, territoryId) {
  return Boolean(standingCastleOwner(state, territoryById(state, territoryId)));
}

export function getLegalBaseTerritoryIds(state, playerId) {
  const player = playerById(state, playerId);
  if (!player || player.eliminated || player.baseTerritoryId) return [];
  const existingBases = state.territories.filter(territory => territory.isBase);
  const neutral = neutralTerritories(state);
  if (existingBases.length === 0) return neutral.map(territory => territory.id);
  return neutral
    .filter(candidate => existingBases.every(base => !isNeighbor(candidate.id, base.id)))
    .map(territory => territory.id);
}

function chooseBotBase(state, playerId) {
  let legalIds = getLegalBaseTerritoryIds(state, playerId);
  if (legalIds.length === 0) legalIds = neutralTerritories(state).map(territory => territory.id);
  const baseIds = state.territories.filter(territory => territory.isBase).map(territory => territory.id);
  return [...legalIds]
    .map(territoryId => {
      const definition = TERRITORY_DEFINITIONS.get(territoryId);
      const distance = baseIds.length > 0
        ? Math.min(...baseIds.map(baseId => mapDistance(territoryId, baseId)))
        : 0;
      return {
        territoryId,
        score: (distance * 100) + (definition?.neighbors.length || 0) + nextRandom(state),
      };
    })
    .sort((first, second) => second.score - first.score)[0]?.territoryId;
}

function assignBase(state, playerId, territoryId) {
  const player = playerById(state, playerId);
  const territory = territoryById(state, territoryId);
  territory.ownerId = playerId;
  territory.acquisition = ACQUISITIONS.BASE;
  territory.value = GAME_RULES.BASE_VALUE;
  territory.isBase = true;
  territory.baseOwnerId = playerId;
  player.baseTerritoryId = territoryId;
  player.castleTowers = GAME_RULES.CASTLE_TOWERS;
  addEvent(state, `${player.name} основал замок в земле «${TERRITORY_DEFINITIONS.get(territoryId).name}».`, 'castle');
}

export function selectBase(state, playerId, territoryId) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.BASE_SELECTION, 'Выбор замков уже завершён.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.SELECT_TERRITORY, 'Сейчас нельзя выбрать замок.', 'WRONG_STEP');
  assertTurn(next, playerId);
  assertRule(playerId === HUMAN_PLAYER_ID, 'Замки ботов выбираются автоматически.', 'BOT_ACTION');
  assertRule(
    getLegalBaseTerritoryIds(next, playerId).includes(territoryId),
    'Здесь нельзя построить замок.',
    'ILLEGAL_TERRITORY'
  );

  assignBase(next, playerId, territoryId);
  for (const bot of next.players.filter(player => player.type === 'BOT')) {
    const botTerritoryId = chooseBotBase(next, bot.id);
    assertRule(botTerritoryId, 'Не удалось разместить замок бота.', 'MAP_CONFIGURATION');
    assignBase(next, bot.id, botTerritoryId);
  }

  next.phase = PHASES.EXPANSION;
  next.step = STEPS.SELECT_TERRITORY;
  next.round = 1;
  next.currentPlayerIndex = 0;
  next.selectedTerritoryId = null;
  addEvent(next, 'Начался захват нейтральных земель.', 'phase');
  return prepareExpansionTurn(next);
}

export function getLegalExpansionTerritoryIds(state, playerId) {
  const player = playerById(state, playerId);
  if (!player || player.eliminated) return [];
  const ownedIds = new Set(ownedTerritoryIds(state, playerId));
  return neutralTerritories(state)
    .filter(territory => (
      TERRITORY_DEFINITIONS.get(territory.id)?.neighbors.some(id => ownedIds.has(id))
    ))
    .map(territory => territory.id);
}

function makeSkipResult(state, context, player, message) {
  state.step = STEPS.RESULT;
  state.result = {
    context,
    type: 'skipped',
    playerId: player.id,
    title: 'Ход пропущен',
    message,
  };
  addEvent(state, `${player.name} пропускает ход: нет доступных целей.`);
  return state;
}

function prepareExpansionTurn(state) {
  const player = currentPlayer(state);
  if (!player) return state;
  const legalIds = getLegalExpansionTerritoryIds(state, player.id);
  if (legalIds.length === 0) {
    return makeSkipResult(
      state,
      'EXPANSION',
      player,
      'Рядом не осталось свободных земель.'
    );
  }
  state.step = player.type === 'BOT' ? STEPS.BOT_THINKING : STEPS.SELECT_TERRITORY;
  state.selectedTerritoryId = null;
  state.activeQuestion = null;
  state.result = null;
  return state;
}

function startExpansionQuestion(state, playerId, territoryId) {
  state.selectedTerritoryId = territoryId;
  state.activeQuestion = drawQuestion(state, 'MULTIPLE_CHOICE');
  state.step = STEPS.QUESTION;
  addEvent(
    state,
    `${playerById(state, playerId).name} претендует на землю «${TERRITORY_DEFINITIONS.get(territoryId).name}».`
  );
  return state;
}

export function selectExpansionTerritory(state, playerId, territoryId) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.EXPANSION, 'Сейчас не идёт захват земель.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.SELECT_TERRITORY, 'Сейчас нельзя выбрать землю.', 'WRONG_STEP');
  assertTurn(next, playerId);
  assertRule(
    getLegalExpansionTerritoryIds(next, playerId).includes(territoryId),
    'Можно выбрать только соседнюю нейтральную землю.',
    'ILLEGAL_TERRITORY'
  );
  return startExpansionQuestion(next, playerId, territoryId);
}

function resolveExpansionAnswer(state, playerId, answerIndex, responseMs) {
  const player = playerById(state, playerId);
  const question = state.activeQuestion;
  const response = {
    answerIndex: answerIndex !== null && answerIndex !== '' && Number.isInteger(Number(answerIndex))
      ? Number(answerIndex)
      : -1,
    responseMs: Number(responseMs) || GAME_RULES.QUESTION_TIME_MS,
  };
  recordMultipleChoice(player, response, question);
  const territory = territoryById(state, state.selectedTerritoryId);

  if (response.correct) {
    territory.ownerId = playerId;
    territory.acquisition = ACQUISITIONS.EXPANSION;
    territory.value = GAME_RULES.EXPANSION_VALUE;
    state.lastChangedTerritoryId = territory.id;
    addEvent(state, `${player.name} присоединил землю «${TERRITORY_DEFINITIONS.get(territory.id).name}».`, 'capture');
  } else {
    addEvent(state, `${player.name} не смог захватить землю «${TERRITORY_DEFINITIONS.get(territory.id).name}».`);
  }

  state.step = STEPS.RESULT;
  state.result = {
    context: 'EXPANSION',
    type: response.correct ? 'correct' : 'incorrect',
    playerId,
    territoryId: territory.id,
    title: response.correct ? 'Земля присоединена!' : 'Земля осталась нейтральной',
    message: response.correct
      ? `${TERRITORY_DEFINITIONS.get(territory.id).name} приносит ${GAME_RULES.EXPANSION_VALUE} очков.`
      : 'Ответ оказался неверным — захват не состоялся.',
    question,
    response,
  };
  return state;
}

export function submitExpansionAnswer(state, playerId, answerIndex, responseMs = 0) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.EXPANSION, 'Сейчас не идёт захват земель.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.QUESTION, 'На этот вопрос уже нельзя ответить.', 'WRONG_STEP');
  assertTurn(next, playerId);
  assertRule(playerId === HUMAN_PLAYER_ID, 'Ответ бота вычисляет игровой движок.', 'BOT_ACTION');
  return resolveExpansionAnswer(next, playerId, answerIndex, responseMs);
}

export function resolveBotExpansion(state) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.EXPANSION, 'Сейчас не идёт захват земель.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.BOT_THINKING, 'Бот сейчас не выбирает землю.', 'WRONG_STEP');
  const bot = currentPlayer(next);
  assertRule(bot?.type === 'BOT', 'Сейчас ход пользователя.', 'WRONG_TURN');
  const legalIds = getLegalExpansionTerritoryIds(next, bot.id);
  if (legalIds.length === 0) {
    return makeSkipResult(next, 'EXPANSION', bot, 'Рядом не осталось свободных земель.');
  }
  const territoryId = chooseExpansionTerritory({
    legalIds,
    map: TERRITORIES,
    state: next,
    playerId: bot.id,
    random: randomCallback(next),
  }) || legalIds[randomInt(next, legalIds.length)];
  startExpansionQuestion(next, bot.id, territoryId);
  const response = makeBotMultipleChoice(next, bot, next.activeQuestion);
  return resolveExpansionAnswer(next, bot.id, response.answerIndex, response.responseMs);
}

function beginDistribution(state) {
  if (neutralTerritories(state).length === 0) return beginWar(state);
  state.phase = PHASES.DISTRIBUTION;
  state.step = STEPS.QUESTION;
  state.round = (state.phase === PHASES.DISTRIBUTION ? Number(state.round) || 0 : 0) + 1;
  state.currentPlayerIndex = 0;
  state.selectedTerritoryId = null;
  state.pendingDistributionWinnerId = null;
  state.battle = null;
  state.result = null;
  state.activeQuestion = drawQuestion(state, 'ESTIMATION');
  addEvent(state, 'Оставшиеся земли разыгрываются числовым вопросом.', 'question');
  return state;
}

function advanceExpansionTurn(state) {
  state.currentPlayerIndex += 1;
  if (state.currentPlayerIndex >= state.players.length) {
    state.currentPlayerIndex = 0;
    state.round += 1;
  }
  state.selectedTerritoryId = null;
  state.activeQuestion = null;
  state.result = null;
  if (state.round > GAME_RULES.EXPANSION_ROUNDS) {
    state.round = 0;
    return beginDistribution(state);
  }
  return prepareExpansionTurn(state);
}

export function getLegalDistributionTerritoryIds(state, playerId) {
  const player = playerById(state, playerId);
  if (!player || player.eliminated) return [];
  return neutralTerritories(state).map(territory => territory.id);
}

function assignDistributionTerritory(state, playerId, territoryId) {
  const territory = territoryById(state, territoryId);
  const player = playerById(state, playerId);
  territory.ownerId = playerId;
  territory.acquisition = ACQUISITIONS.DISTRIBUTION;
  territory.value = GAME_RULES.DISTRIBUTION_VALUE;
  state.lastChangedTerritoryId = territoryId;
  addEvent(state, `${player.name} получил землю «${TERRITORY_DEFINITIONS.get(territoryId).name}» по итогам оценки.`, 'capture');
}

export function submitDistributionAnswer(state, playerId, value, responseMs = 0) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.DISTRIBUTION, 'Сейчас не идёт распределение земель.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.QUESTION, 'На этот вопрос уже нельзя ответить.', 'WRONG_STEP');
  assertRule(playerId === HUMAN_PLAYER_ID, 'Ответ бота вычисляет игровой движок.', 'BOT_ACTION');
  const human = playerById(next, HUMAN_PLAYER_ID);
  assertRule(human && !human.eliminated, 'Игрок выбыл из партии.', 'PLAYER_ELIMINATED');

  const responses = {
    [HUMAN_PLAYER_ID]: {
      value: value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null,
      responseMs: Number(responseMs) || GAME_RULES.QUESTION_TIME_MS,
    },
  };
  for (const bot of next.players.filter(player => player.type === 'BOT' && !player.eliminated)) {
    responses[bot.id] = makeBotEstimation(next, bot, next.activeQuestion);
  }
  for (const player of getActivePlayers(next)) player.stats.estimationAnswers += 1;

  const ranking = rankEstimateResponses(next, responses, next.activeQuestion);
  const winner = playerById(next, ranking[0].playerId);
  winner.stats.estimationWins += 1;
  next.pendingDistributionWinnerId = winner.id;

  let capturedTerritoryId = null;
  if (winner.type === 'BOT') {
    const legalIds = getLegalDistributionTerritoryIds(next, winner.id);
    capturedTerritoryId = chooseExpansionTerritory({
      legalIds,
      map: TERRITORIES,
      state: next,
      playerId: winner.id,
      random: randomCallback(next),
    }) || legalIds[randomInt(next, legalIds.length)];
    assignDistributionTerritory(next, winner.id, capturedTerritoryId);
    next.pendingDistributionWinnerId = null;
  }

  next.step = STEPS.RESULT;
  next.result = {
    context: 'DISTRIBUTION',
    type: 'estimation-result',
    title: `${winner.name} ближе всех`,
    message: capturedTerritoryId
      ? `Земля «${TERRITORY_DEFINITIONS.get(capturedTerritoryId).name}» присоединена.`
      : 'Выберите одну из подсвеченных нейтральных земель.',
    winnerId: winner.id,
    capturedTerritoryId,
    correctValue: correctEstimationValue(next.activeQuestion),
    ranking,
    question: next.activeQuestion,
  };
  addEvent(next, `${winner.name} победил в числовом вопросе.`, 'question');
  return next;
}

export function selectDistributionTerritory(state, playerId, territoryId) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.DISTRIBUTION, 'Сейчас не идёт распределение земель.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.SELECT_TERRITORY, 'Сейчас нельзя выбрать землю.', 'WRONG_STEP');
  assertRule(next.pendingDistributionWinnerId === playerId, 'Эту землю выбирает другой игрок.', 'WRONG_TURN');
  assertRule(playerId === HUMAN_PLAYER_ID, 'Землю бота выбирает игровой движок.', 'BOT_ACTION');
  assertRule(
    getLegalDistributionTerritoryIds(next, playerId).includes(territoryId),
    'Эта нейтральная земля сейчас недоступна.',
    'ILLEGAL_TERRITORY'
  );
  assignDistributionTerritory(next, playerId, territoryId);
  next.pendingDistributionWinnerId = null;
  next.step = STEPS.RESULT;
  next.result = {
    context: 'DISTRIBUTION_CAPTURE',
    type: 'distribution-capture',
    title: 'Земля присоединена!',
    message: `${TERRITORY_DEFINITIONS.get(territoryId).name} приносит ${GAME_RULES.DISTRIBUTION_VALUE} очков.`,
    winnerId: playerId,
    capturedTerritoryId: territoryId,
  };
  return next;
}

export function getLegalAttackTerritoryIds(state, attackerId) {
  const attacker = playerById(state, attackerId);
  if (!attacker || attacker.eliminated) return [];
  const ownedIds = new Set(ownedTerritoryIds(state, attackerId));
  return state.territories
    .filter(territory => {
      if (!territory.ownerId || territory.ownerId === attackerId) return false;
      const defender = playerById(state, territory.ownerId);
      if (!defender || defender.eliminated) return false;
      return TERRITORY_DEFINITIONS.get(territory.id)?.neighbors.some(id => ownedIds.has(id));
    })
    .map(territory => territory.id);
}

function beginWar(state) {
  state.phase = PHASES.WAR;
  state.step = STEPS.TRANSITION;
  state.round = 1;
  state.currentPlayerIndex = 0;
  state.selectedTerritoryId = null;
  state.pendingDistributionWinnerId = null;
  state.activeQuestion = null;
  state.battle = null;
  state.result = {
    context: 'WAR_TRANSITION',
    type: 'phase-transition',
    title: '⚔ ВОЙНА ⚔',
    message: 'Нейтральных земель не осталось. Начинается борьба за королевство.',
  };
  addEvent(state, 'Началась война за королевство.', 'phase');
  return state;
}

function prepareWarTurn(state) {
  if (getActivePlayers(state).length <= 1) return finishGame(state, 'LAST_KINGDOM');
  if (state.round > GAME_RULES.WAR_ROUNDS) return finishGame(state, 'ROUND_LIMIT');

  let guard = 0;
  while (currentPlayer(state)?.eliminated && guard < state.players.length) {
    state.currentPlayerIndex += 1;
    if (state.currentPlayerIndex >= state.players.length) {
      state.currentPlayerIndex = 0;
      state.round += 1;
    }
    guard += 1;
  }
  if (state.round > GAME_RULES.WAR_ROUNDS) return finishGame(state, 'ROUND_LIMIT');

  const player = currentPlayer(state);
  const legalIds = getLegalAttackTerritoryIds(state, player.id);
  state.selectedTerritoryId = null;
  state.activeQuestion = null;
  state.battle = null;
  state.result = null;
  if (legalIds.length === 0) {
    return makeSkipResult(state, 'WAR', player, 'Нет соседних вражеских земель.');
  }
  state.step = player.type === 'BOT' ? STEPS.BOT_THINKING : STEPS.SELECT_TERRITORY;
  addEvent(state, `Ход армии: ${player.name}.`);
  return state;
}

function advanceWarTurn(state) {
  state.currentPlayerIndex += 1;
  if (state.currentPlayerIndex >= state.players.length) {
    state.currentPlayerIndex = 0;
    state.round += 1;
  }
  state.selectedTerritoryId = null;
  state.activeQuestion = null;
  state.battle = null;
  state.result = null;
  return prepareWarTurn(state);
}

export function selectAttackTerritory(state, playerId, territoryId) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.WAR, 'Сейчас нельзя атаковать.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.SELECT_TERRITORY, 'Сейчас нельзя выбрать цель.', 'WRONG_STEP');
  assertTurn(next, playerId);
  assertRule(playerId === HUMAN_PLAYER_ID, 'Цель бота выбирает игровой движок.', 'BOT_ACTION');
  assertRule(
    getLegalAttackTerritoryIds(next, playerId).includes(territoryId),
    'Можно атаковать только соседнюю вражескую землю.',
    'ILLEGAL_TERRITORY'
  );
  next.selectedTerritoryId = territoryId;
  next.step = STEPS.CONFIRM_ATTACK;
  return next;
}

export function cancelAttack(state, playerId) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.WAR && next.step === STEPS.CONFIRM_ATTACK, 'Нечего отменять.', 'WRONG_STEP');
  assertTurn(next, playerId);
  next.selectedTerritoryId = null;
  next.step = STEPS.SELECT_TERRITORY;
  return next;
}

function startBattleQuestion(state, attackerId, territoryId, continued = false) {
  const target = territoryById(state, territoryId);
  const defenderId = target.ownerId;
  const existingBattle = continued ? state.battle : null;
  const question = drawQuestion(state, 'MULTIPLE_CHOICE');
  const responses = {};
  for (const playerId of [attackerId, defenderId]) {
    const player = playerById(state, playerId);
    if (player.type === 'BOT') responses[playerId] = makeBotMultipleChoice(state, player, question);
  }
  state.battle = {
    attackerId,
    defenderId,
    territoryId,
    castleAssault: Boolean(standingCastleOwner(state, target)),
    chainWins: existingBattle?.chainWins || 0,
    question,
    responses,
    tieBreakQuestion: null,
    tieBreakResponses: null,
  };
  state.activeQuestion = question;
  state.selectedTerritoryId = territoryId;
  state.step = STEPS.QUESTION;
  addEvent(
    state,
    `${playerById(state, attackerId).name} атакует «${TERRITORY_DEFINITIONS.get(territoryId).name}».`,
    'attack'
  );
  return state;
}

export function confirmAttack(state, playerId) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.WAR, 'Сейчас нельзя атаковать.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.CONFIRM_ATTACK, 'Сначала выберите цель.', 'WRONG_STEP');
  assertTurn(next, playerId);
  assertRule(
    getLegalAttackTerritoryIds(next, playerId).includes(next.selectedTerritoryId),
    'Цель больше недоступна.',
    'ILLEGAL_TERRITORY'
  );
  return startBattleQuestion(next, playerId, next.selectedTerritoryId);
}

function beginTieBreak(state) {
  const question = drawQuestion(state, 'ESTIMATION');
  const responses = {};
  for (const playerId of [state.battle.attackerId, state.battle.defenderId]) {
    const player = playerById(state, playerId);
    if (player.type === 'BOT') responses[playerId] = makeBotEstimation(state, player, question);
  }
  state.battle.tieBreakQuestion = question;
  state.battle.tieBreakResponses = responses;
  state.activeQuestion = question;
  state.step = STEPS.TIEBREAK;
  addEvent(state, 'Оба соперника правы — исход решит числовой вопрос.', 'question');
  return state;
}

function transferEliminatedKingdom(state, defenderId, attackerId, baseTerritoryId) {
  for (const territory of state.territories) {
    if (territory.ownerId !== defenderId) continue;
    territory.ownerId = attackerId;
    if (territory.id === baseTerritoryId) {
      territory.acquisition = ACQUISITIONS.CONQUEST;
      territory.value = GAME_RULES.BASE_VALUE;
    }
  }
}

function resolveBattleWinner(state, winnerId, viaTiebreak = false, ranking = null) {
  const battle = state.battle;
  const attacker = playerById(state, battle.attackerId);
  const defender = playerById(state, battle.defenderId);
  const target = territoryById(state, battle.territoryId);
  const defenderCorrect = Boolean(battle.responses[battle.defenderId]?.correct);
  const attackerWon = winnerId === attacker.id;
  const castleOwner = standingCastleOwner(state, target);
  let type;
  let title;
  let message;
  let continueCastleBattle = false;

  if (attackerWon) {
    attacker.stats.successfulAttacks += 1;
    if (castleOwner) {
      defender.castleTowers = Math.max(0, defender.castleTowers - 1);
      battle.chainWins += 1;
      state.lastChangedTerritoryId = target.id;
      if (defender.castleTowers > 0) {
        type = 'tower-destroyed';
        title = 'Башня разрушена!';
        message = `У замка ${defender.name} осталось башен: ${defender.castleTowers} / ${GAME_RULES.CASTLE_TOWERS}. Атака продолжается.`;
        continueCastleBattle = true;
        addEvent(state, `${attacker.name} разрушил башню замка ${defender.name}.`, 'castle');
      } else {
        type = 'kingdom-fallen';
        title = '⚔ КОРОЛЕВСТВО ПАЛО ⚔';
        message = `${defender.name} потерял замок. Все земли переходят ${attacker.name}.`;
        defender.eliminated = true;
        attacker.stats.eliminatedPlayers += 1;
        transferEliminatedKingdom(state, defender.id, attacker.id, target.id);
        addEvent(state, `${attacker.name} уничтожил королевство ${defender.name}.`, 'elimination');
      }
    } else {
      type = 'territory-captured';
      title = `${TERRITORY_DEFINITIONS.get(target.id).name} захвачен!`;
      message = `${attacker.name} получает землю стоимостью ${GAME_RULES.CONQUEST_VALUE} очков.`;
      target.ownerId = attacker.id;
      target.acquisition = ACQUISITIONS.CONQUEST;
      target.value = GAME_RULES.CONQUEST_VALUE;
      state.lastChangedTerritoryId = target.id;
      addEvent(state, `${attacker.name} захватил землю «${TERRITORY_DEFINITIONS.get(target.id).name}».`, 'capture');
    }
  } else {
    defender.stats.successfulDefenses += 1;
    const bonus = defenderCorrect ? GAME_RULES.DEFENSE_BONUS : 0;
    defender.bonusScore += bonus;
    type = 'defense-held';
    title = 'Защита устояла';
    message = bonus > 0
      ? `${defender.name} сохраняет землю и получает +${bonus} очков за правильный ответ.`
      : `${defender.name} сохраняет землю.`;
    addEvent(state, `${defender.name} отбил атаку на «${TERRITORY_DEFINITIONS.get(target.id).name}».`, 'defense');
  }

  state.activeQuestion = null;
  state.step = STEPS.RESULT;
  state.result = {
    context: 'WAR',
    type,
    title,
    message,
    attackerId: attacker.id,
    defenderId: defender.id,
    winnerId,
    territoryId: target.id,
    attackerWon,
    defenderCorrect,
    continueCastleBattle,
    castleTowers: defender.castleTowers,
    question: battle.question,
    responses: battle.responses,
    tieBreakQuestion: battle.tieBreakQuestion,
    tieBreakResponses: battle.tieBreakResponses,
    viaTiebreak,
    correctValue: viaTiebreak
      ? correctEstimationValue(battle.tieBreakQuestion)
      : null,
    ranking: viaTiebreak ? ranking : null,
  };
  return state;
}

function resolvePrimaryBattle(state) {
  const battle = state.battle;
  const attackerResponse = battle.responses[battle.attackerId];
  const defenderResponse = battle.responses[battle.defenderId];
  assertRule(attackerResponse && defenderResponse, 'Не все соперники ответили.', 'MISSING_ANSWER');
  const attacker = playerById(state, battle.attackerId);
  const defender = playerById(state, battle.defenderId);
  recordMultipleChoice(attacker, attackerResponse, battle.question);
  recordMultipleChoice(defender, defenderResponse, battle.question);

  if (attackerResponse.correct && defenderResponse.correct) {
    beginTieBreak(state);
    if (attacker.type === 'BOT' && defender.type === 'BOT') {
      attacker.stats.estimationAnswers += 1;
      defender.stats.estimationAnswers += 1;
      const ranking = rankEstimateResponses(state, state.battle.tieBreakResponses, state.activeQuestion);
      playerById(state, ranking[0].playerId).stats.estimationWins += 1;
      return resolveBattleWinner(state, ranking[0].playerId, true, ranking);
    }
    return state;
  }

  const winnerId = attackerResponse.correct && !defenderResponse.correct
    ? battle.attackerId
    : battle.defenderId;
  return resolveBattleWinner(state, winnerId, false);
}

export function submitWarAnswer(state, playerId, answerIndex, responseMs = 0) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.WAR, 'Сейчас не идёт битва.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.QUESTION, 'На этот вопрос уже нельзя ответить.', 'WRONG_STEP');
  assertRule(playerId === HUMAN_PLAYER_ID, 'Ответ бота вычисляет игровой движок.', 'BOT_ACTION');
  assertRule(
    [next.battle?.attackerId, next.battle?.defenderId].includes(playerId),
    'Игрок не участвует в этой битве.',
    'NOT_IN_BATTLE'
  );
  assertRule(!next.battle.responses[playerId], 'Ответ уже принят.', 'ALREADY_ANSWERED');
  next.battle.responses[playerId] = {
    answerIndex: answerIndex !== null && answerIndex !== '' && Number.isInteger(Number(answerIndex))
      ? Number(answerIndex)
      : -1,
    responseMs: Number(responseMs) || GAME_RULES.QUESTION_TIME_MS,
  };
  return resolvePrimaryBattle(next);
}

export function submitWarTieBreak(state, playerId, value, responseMs = 0) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.WAR, 'Сейчас не идёт битва.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.TIEBREAK, 'Сейчас нет числовой дуэли.', 'WRONG_STEP');
  assertRule(playerId === HUMAN_PLAYER_ID, 'Ответ бота вычисляет игровой движок.', 'BOT_ACTION');
  assertRule(
    [next.battle?.attackerId, next.battle?.defenderId].includes(playerId),
    'Игрок не участвует в этой битве.',
    'NOT_IN_BATTLE'
  );
  assertRule(!next.battle.tieBreakResponses[playerId], 'Ответ уже принят.', 'ALREADY_ANSWERED');
  next.battle.tieBreakResponses[playerId] = {
    value: value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null,
    responseMs: Number(responseMs) || GAME_RULES.QUESTION_TIME_MS,
  };
  for (const participantId of [next.battle.attackerId, next.battle.defenderId]) {
    playerById(next, participantId).stats.estimationAnswers += 1;
  }
  const ranking = rankEstimateResponses(next, next.battle.tieBreakResponses, next.activeQuestion);
  playerById(next, ranking[0].playerId).stats.estimationWins += 1;
  return resolveBattleWinner(next, ranking[0].playerId, true, ranking);
}

export function resolveBotWarTurn(state) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.WAR, 'Сейчас не идёт война.', 'WRONG_PHASE');
  assertRule(next.step === STEPS.BOT_THINKING, 'Бот сейчас не выбирает цель.', 'WRONG_STEP');
  const bot = currentPlayer(next);
  assertRule(bot?.type === 'BOT', 'Сейчас ход пользователя.', 'WRONG_TURN');
  const legalIds = getLegalAttackTerritoryIds(next, bot.id);
  if (legalIds.length === 0) return makeSkipResult(next, 'WAR', bot, 'Нет соседних вражеских земель.');
  const territoryId = chooseWarTarget({
    legalIds,
    map: TERRITORIES,
    state: next,
    playerId: bot.id,
    random: randomCallback(next),
  }) || legalIds[randomInt(next, legalIds.length)];
  startBattleQuestion(next, bot.id, territoryId);
  const defender = playerById(next, next.battle.defenderId);
  if (defender.type === 'HUMAN') return next;
  return resolvePrimaryBattle(next);
}

function continueCastleBattle(state) {
  const { attackerId, territoryId } = state.battle;
  startBattleQuestion(state, attackerId, territoryId, true);
  const attacker = playerById(state, state.battle.attackerId);
  const defender = playerById(state, state.battle.defenderId);
  if (attacker.type === 'BOT' && defender.type === 'BOT') return resolvePrimaryBattle(state);
  return state;
}

function activeScoreLeaders(state) {
  const active = getActivePlayers(state);
  const scored = active.map(player => ({ player, score: getPlayerScore(state, player.id) }));
  const bestScore = Math.max(...scored.map(entry => entry.score));
  return scored.filter(entry => entry.score === bestScore).map(entry => entry.player);
}

function completeGame(state, winnerId, reason) {
  state.phase = PHASES.FINISHED;
  state.step = STEPS.SUMMARY;
  state.status = 'FINISHED';
  state.winnerId = winnerId;
  state.finishedReason = reason;
  state.activeQuestion = null;
  state.selectedTerritoryId = null;
  state.battle = null;
  state.result = null;
  state.finalTiebreak = null;
  addEvent(state, `${playerById(state, winnerId).name} победил в партии!`, 'victory');
  return state;
}

function resolveFinalTiebreak(state) {
  const ranking = rankEstimateResponses(
    state,
    state.finalTiebreak.responses,
    state.activeQuestion
  );
  playerById(state, ranking[0].playerId).stats.estimationWins += 1;
  return completeGame(state, ranking[0].playerId, 'FINAL_TIEBREAK');
}

function finishGame(state, reason) {
  const active = getActivePlayers(state);
  if (active.length === 1) return completeGame(state, active[0].id, reason);
  const leaders = activeScoreLeaders(state);
  if (leaders.length === 1) return completeGame(state, leaders[0].id, reason);

  const question = drawQuestion(state, 'ESTIMATION');
  const responses = {};
  for (const player of leaders) {
    player.stats.estimationAnswers += 1;
    if (player.type === 'BOT') responses[player.id] = makeBotEstimation(state, player, question);
  }
  state.phase = PHASES.FINISHED;
  state.step = STEPS.TIEBREAK;
  state.status = 'ACTIVE';
  state.activeQuestion = question;
  state.finalTiebreak = {
    finalistIds: leaders.map(player => player.id),
    responses,
    reason,
  };
  addEvent(state, 'Лидеры сравнялись по очкам. Победу решит числовой вопрос.', 'question');
  if (!leaders.some(player => player.type === 'HUMAN')) return resolveFinalTiebreak(state);
  return state;
}

export function submitFinalTieBreak(state, playerId, value, responseMs = 0) {
  const next = cloneState(state);
  assertRule(next.phase === PHASES.FINISHED && next.step === STEPS.TIEBREAK, 'Сейчас нет финального вопроса.', 'WRONG_PHASE');
  assertRule(playerId === HUMAN_PLAYER_ID, 'Ответ бота вычисляет игровой движок.', 'BOT_ACTION');
  assertRule(next.finalTiebreak.finalistIds.includes(playerId), 'Игрок не участвует в финале.', 'NOT_IN_BATTLE');
  assertRule(!next.finalTiebreak.responses[playerId], 'Ответ уже принят.', 'ALREADY_ANSWERED');
  next.finalTiebreak.responses[playerId] = {
    value: value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null,
    responseMs: Number(responseMs) || GAME_RULES.QUESTION_TIME_MS,
  };
  return resolveFinalTiebreak(next);
}

export function advanceAfterResult(state) {
  const next = cloneState(state);
  assertRule(next.step === STEPS.RESULT || next.step === STEPS.TRANSITION, 'Сейчас нечего продолжать.', 'WRONG_STEP');
  const context = next.result?.context;
  next.lastChangedTerritoryId = null;

  if (context === 'EXPANSION') return advanceExpansionTurn(next);
  if (context === 'DISTRIBUTION') {
    if (next.pendingDistributionWinnerId === HUMAN_PLAYER_ID) {
      next.step = STEPS.SELECT_TERRITORY;
      next.activeQuestion = null;
      next.result = null;
      return next;
    }
    next.activeQuestion = null;
    next.result = null;
    return neutralTerritories(next).length > 0 ? beginDistribution(next) : beginWar(next);
  }
  if (context === 'DISTRIBUTION_CAPTURE') {
    next.activeQuestion = null;
    next.result = null;
    return neutralTerritories(next).length > 0 ? beginDistribution(next) : beginWar(next);
  }
  if (context === 'WAR_TRANSITION') {
    next.result = null;
    return prepareWarTurn(next);
  }
  if (context === 'WAR') {
    if (next.result?.continueCastleBattle) {
      next.result = null;
      return continueCastleBattle(next);
    }
    if (getActivePlayers(next).length <= 1) return finishGame(next, 'LAST_KINGDOM');
    return advanceWarTurn(next);
  }
  throw new GameRuleError('Неизвестный результат хода.', 'INVALID_STATE');
}

export function devFillNeutralTerritories(state) {
  const next = cloneState(state);
  assertRule(next.status === 'ACTIVE', 'Партия уже завершена.', 'WRONG_PHASE');
  const active = getActivePlayers(next);
  for (const territory of neutralTerritories(next)) {
    const candidates = active.filter(player => (
      TERRITORY_DEFINITIONS.get(territory.id)?.neighbors.some(neighborId => (
        territoryById(next, neighborId)?.ownerId === player.id
      ))
    ));
    const owner = (candidates.length > 0 ? candidates : active)[randomInt(next, (candidates.length || active.length))];
    territory.ownerId = owner.id;
    territory.acquisition = ACQUISITIONS.DISTRIBUTION;
    territory.value = GAME_RULES.DISTRIBUTION_VALUE;
  }
  return beginWar(next);
}

export function devDamageEnemyCastle(state) {
  const next = cloneState(state);
  const targetPlayer = next.players.find(player => (
    player.id !== HUMAN_PLAYER_ID && !player.eliminated && player.castleTowers > 0
  ));
  assertRule(targetPlayer, 'Нет доступного вражеского замка.', 'NO_TARGET');
  targetPlayer.castleTowers = Math.max(1, targetPlayer.castleTowers - 1);
  addEvent(next, `Dev: замок ${targetPlayer.name} повреждён.`, 'castle');
  return next;
}

export function getQuestionTimeMs(devMode = false) {
  return devMode ? GAME_RULES.DEV_QUESTION_TIME_MS : GAME_RULES.QUESTION_TIME_MS;
}

export function getBotDelayMs(devMode = false) {
  return devMode ? GAME_RULES.DEV_BOT_DELAY_MS : GAME_RULES.BOT_DELAY_MS;
}

export const ConquiztadorGameEngine = Object.freeze({
  createGame,
  restoreGame,
  selectBase,
  selectExpansionTerritory,
  submitExpansionAnswer,
  resolveBotExpansion,
  submitDistributionAnswer,
  selectDistributionTerritory,
  selectAttackTerritory,
  cancelAttack,
  confirmAttack,
  submitWarAnswer,
  submitWarTieBreak,
  resolveBotWarTurn,
  submitFinalTieBreak,
  advanceAfterResult,
  getLegalBaseTerritoryIds,
  getLegalExpansionTerritoryIds,
  getLegalDistributionTerritoryIds,
  getLegalAttackTerritoryIds,
  getPlayerScore,
  rankEstimationAnswers,
});
