'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const enginePromise = import(pathToFileURL(
  path.join(root, 'src', 'features', 'game', 'conquiztadorEngine.mjs')
).href);
const mapPromise = import(pathToFileURL(
  path.join(root, 'src', 'features', 'game', 'conquiztadorMap.mjs')
).href);
const rulesPromise = import(pathToFileURL(
  path.join(root, 'src', 'features', 'game', 'conquiztadorRules.mjs')
).href);
const questionsPromise = import(pathToFileURL(
  path.join(root, 'src', 'features', 'game', 'conquestQuestions.mjs')
).href);

async function createStartedGame(seed = 17) {
  const engine = await enginePromise;
  let state = engine.createGame({ playerName: 'Сергей', seed });
  state = engine.selectBase(state, engine.HUMAN_PLAYER_ID, 'northwatch');
  return { engine, state };
}

async function createWarGame({ castle = false } = {}) {
  const { engine, state: started } = await createStartedGame(33);
  const { ACQUISITIONS, GAME_RULES, PHASES, STEPS } = await rulesPromise;
  const state = JSON.parse(JSON.stringify(started));
  const knight = state.players.find(player => player.id === 'knight');
  const previousBase = state.territories.find(territory => territory.id === knight.baseTerritoryId);
  if (previousBase) {
    previousBase.isBase = false;
    previousBase.baseOwnerId = null;
    previousBase.value = GAME_RULES.EXPANSION_VALUE;
    previousBase.acquisition = ACQUISITIONS.EXPANSION;
  }

  const target = state.territories.find(territory => territory.id === 'frostpeak');
  target.ownerId = 'knight';
  target.value = castle ? GAME_RULES.BASE_VALUE : GAME_RULES.EXPANSION_VALUE;
  target.acquisition = castle ? ACQUISITIONS.BASE : ACQUISITIONS.EXPANSION;
  target.isBase = castle;
  target.baseOwnerId = castle ? 'knight' : null;
  if (castle) {
    knight.baseTerritoryId = target.id;
    knight.castleTowers = GAME_RULES.CASTLE_TOWERS;
  }

  state.phase = PHASES.WAR;
  state.step = STEPS.SELECT_TERRITORY;
  state.round = 1;
  state.currentPlayerIndex = 0;
  state.activeQuestion = null;
  state.selectedTerritoryId = null;
  state.battle = null;
  state.result = null;
  return { engine, state };
}

function setBotAnswer(state, correct) {
  const question = state.battle.question;
  const correctIndex = question.correctAnswer;
  state.battle.responses.knight = {
    answerIndex: correct ? correctIndex : (correctIndex + 1) % 4,
    responseMs: 2_000,
  };
}

test('карта содержит 18 связанных территорий с симметричными границами', async () => {
  const { TERRITORIES, validateMapDefinition } = await mapPromise;
  const validation = validateMapDefinition(TERRITORIES);
  assert.equal(TERRITORIES.length, 18);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  for (const territory of TERRITORIES) {
    for (const neighborId of territory.neighbors) {
      const neighbor = TERRITORIES.find(entry => entry.id === neighborId);
      assert.ok(neighbor.neighbors.includes(territory.id));
    }
  }
});

test('выбор базы даёт 1000 очков, три башни и разносит замки ботов', async () => {
  const engine = await enginePromise;
  const { GAME_RULES, PHASES } = await rulesPromise;
  let state = engine.createGame({ playerName: 'Сергей', seed: 7 });
  assert.throws(
    () => engine.selectBase(state, engine.HUMAN_PLAYER_ID, 'missing-land'),
    error => error.code === 'ILLEGAL_TERRITORY'
  );
  state = engine.selectBase(state, engine.HUMAN_PLAYER_ID, 'northwatch');
  const human = engine.getPlayer(state, engine.HUMAN_PLAYER_ID);
  const base = engine.getTerritory(state, human.baseTerritoryId);
  assert.equal(base.ownerId, human.id);
  assert.equal(base.value, GAME_RULES.BASE_VALUE);
  assert.equal(base.isBase, true);
  assert.equal(human.castleTowers, 3);
  assert.equal(state.phase, PHASES.EXPANSION);

  const { TERRITORY_BY_ID } = await mapPromise;
  for (const first of state.players) {
    for (const second of state.players) {
      if (first.id >= second.id) continue;
      assert.equal(
        TERRITORY_BY_ID[first.baseTerritoryId].neighbors.includes(second.baseTerritoryId),
        false,
        `${first.baseTerritoryId} borders ${second.baseTerritoryId}`
      );
    }
  }
});

test('экспансия захватывает соседнюю землю только за правильный ответ', async () => {
  const { engine, state: started } = await createStartedGame();
  const { GAME_RULES } = await rulesPromise;
  const legalId = engine.getLegalExpansionTerritoryIds(started, engine.HUMAN_PLAYER_ID)[0];
  let state = engine.selectExpansionTerritory(started, engine.HUMAN_PLAYER_ID, legalId);
  const correct = state.activeQuestion.correctAnswer;
  state = engine.submitExpansionAnswer(state, engine.HUMAN_PLAYER_ID, correct, 500);
  assert.equal(engine.getTerritory(state, legalId).ownerId, engine.HUMAN_PLAYER_ID);
  assert.equal(engine.getTerritory(state, legalId).value, GAME_RULES.EXPANSION_VALUE);

  const second = await createStartedGame(19);
  const wrongId = second.engine.getLegalExpansionTerritoryIds(
    second.state,
    second.engine.HUMAN_PLAYER_ID
  )[0];
  let wrongState = second.engine.selectExpansionTerritory(
    second.state,
    second.engine.HUMAN_PLAYER_ID,
    wrongId
  );
  wrongState = second.engine.submitExpansionAnswer(
    wrongState,
    second.engine.HUMAN_PLAYER_ID,
    (wrongState.activeQuestion.correctAnswer + 1) % 4,
    500
  );
  assert.equal(second.engine.getTerritory(wrongState, wrongId).ownerId, null);
});

test('числовой вопрос выбирает ближайший ответ, затем более быстрый', async () => {
  const { rankEstimationAnswers } = await enginePromise;
  const ranking = rankEstimationAnswers(100, [
    { playerId: 'a', value: 90, responseMs: 1_000 },
    { playerId: 'b', value: 102, responseMs: 7_000 },
    { playerId: 'c', value: 150, responseMs: 500 },
  ]);
  assert.equal(ranking[0].playerId, 'b');
  assert.equal(ranking[0].difference, 2);

  const tie = rankEstimationAnswers(100, [
    { playerId: 'slow', value: 98, responseMs: 4_000 },
    { playerId: 'fast', value: 102, responseMs: 2_000 },
  ]);
  assert.equal(tie[0].playerId, 'fast');
});

test('победитель распределения может выбрать любую оставшуюся нейтральную землю', async () => {
  const { engine, state } = await createStartedGame(808);
  const neutralIds = state.territories
    .filter(territory => territory.ownerId === null)
    .map(territory => territory.id);
  assert.deepEqual(
    new Set(engine.getLegalDistributionTerritoryIds(state, engine.HUMAN_PLAYER_ID)),
    new Set(neutralIds)
  );
});

test('adjacency разрешает соседнюю атаку и запрещает дальнюю или свою землю', async () => {
  const { engine, state } = await createWarGame();
  const legal = engine.getLegalAttackTerritoryIds(state, engine.HUMAN_PLAYER_ID);
  assert.ok(legal.includes('frostpeak'));
  assert.ok(!legal.includes('gull_peninsula'));
  assert.throws(
    () => engine.selectAttackTerritory(state, engine.HUMAN_PLAYER_ID, 'gull_peninsula'),
    error => error.code === 'ILLEGAL_TERRITORY'
  );
  assert.throws(
    () => engine.selectAttackTerritory(state, engine.HUMAN_PLAYER_ID, 'northwatch'),
    error => error.code === 'ILLEGAL_TERRITORY'
  );
});

test('обычная битва покрывает захват, защиту, двойную ошибку и tie-break', async () => {
  const { GAME_RULES, STEPS } = await rulesPromise;

  let fixture = await createWarGame();
  let state = fixture.engine.selectAttackTerritory(fixture.state, 'human', 'frostpeak');
  state = fixture.engine.confirmAttack(state, 'human');
  setBotAnswer(state, false);
  state = fixture.engine.submitWarAnswer(state, 'human', state.battle.question.correctAnswer, 400);
  assert.equal(fixture.engine.getTerritory(state, 'frostpeak').ownerId, 'human');
  assert.equal(fixture.engine.getTerritory(state, 'frostpeak').value, GAME_RULES.CONQUEST_VALUE);

  fixture = await createWarGame();
  state = fixture.engine.selectAttackTerritory(fixture.state, 'human', 'frostpeak');
  state = fixture.engine.confirmAttack(state, 'human');
  setBotAnswer(state, true);
  state = fixture.engine.submitWarAnswer(
    state,
    'human',
    (state.battle.question.correctAnswer + 1) % 4,
    400
  );
  assert.equal(fixture.engine.getTerritory(state, 'frostpeak').ownerId, 'knight');
  assert.equal(fixture.engine.getPlayer(state, 'knight').bonusScore, GAME_RULES.DEFENSE_BONUS);

  fixture = await createWarGame();
  state = fixture.engine.selectAttackTerritory(fixture.state, 'human', 'frostpeak');
  state = fixture.engine.confirmAttack(state, 'human');
  setBotAnswer(state, false);
  state = fixture.engine.submitWarAnswer(
    state,
    'human',
    (state.battle.question.correctAnswer + 1) % 4,
    400
  );
  assert.equal(fixture.engine.getTerritory(state, 'frostpeak').ownerId, 'knight');
  assert.equal(fixture.engine.getPlayer(state, 'knight').bonusScore, 0);

  fixture = await createWarGame();
  state = fixture.engine.selectAttackTerritory(fixture.state, 'human', 'frostpeak');
  state = fixture.engine.confirmAttack(state, 'human');
  setBotAnswer(state, true);
  state = fixture.engine.submitWarAnswer(state, 'human', state.battle.question.correctAnswer, 400);
  assert.equal(state.step, STEPS.TIEBREAK);
  assert.equal(state.activeQuestion.type, 'ESTIMATION');
  const tieBreakValue = state.activeQuestion.correctValue;
  state = fixture.engine.submitWarTieBreak(state, 'human', tieBreakValue, 300);
  assert.equal(state.result.correctValue, tieBreakValue);
  assert.equal(state.result.ranking[0].playerId, 'human');
});

test('повреждение замка сохраняется, третья башня уничтожает игрока и передаёт земли', async () => {
  const fixture = await createWarGame({ castle: true });
  const { STEPS } = await rulesPromise;
  let state = fixture.state;
  const extraLand = state.territories.find(territory => territory.id === 'white_valley');
  extraLand.ownerId = 'knight';
  extraLand.value = 200;

  state = fixture.engine.selectAttackTerritory(state, 'human', 'frostpeak');
  state = fixture.engine.confirmAttack(state, 'human');
  setBotAnswer(state, false);
  state = fixture.engine.submitWarAnswer(state, 'human', state.battle.question.correctAnswer, 300);
  assert.equal(fixture.engine.getPlayer(state, 'knight').castleTowers, 2);
  assert.equal(state.result.continueCastleBattle, true);

  state = fixture.engine.advanceAfterResult(state);
  assert.equal(state.step, STEPS.QUESTION);
  setBotAnswer(state, true);
  state = fixture.engine.submitWarAnswer(
    state,
    'human',
    (state.battle.question.correctAnswer + 1) % 4,
    300
  );
  assert.equal(fixture.engine.getPlayer(state, 'knight').castleTowers, 2);

  state.phase = 'WAR';
  state.step = 'SELECT_TERRITORY';
  state.currentPlayerIndex = 0;
  state.result = null;
  state.battle = null;
  state.selectedTerritoryId = null;
  state = fixture.engine.selectAttackTerritory(state, 'human', 'frostpeak');
  state = fixture.engine.confirmAttack(state, 'human');
  setBotAnswer(state, false);
  state = fixture.engine.submitWarAnswer(state, 'human', state.battle.question.correctAnswer, 300);
  assert.equal(fixture.engine.getPlayer(state, 'knight').castleTowers, 1);

  state = fixture.engine.advanceAfterResult(state);
  setBotAnswer(state, false);
  state = fixture.engine.submitWarAnswer(state, 'human', state.battle.question.correctAnswer, 300);
  assert.equal(fixture.engine.getPlayer(state, 'knight').castleTowers, 0);
  assert.equal(fixture.engine.getPlayer(state, 'knight').eliminated, true);
  assert.equal(fixture.engine.getTerritory(state, 'frostpeak').ownerId, 'human');
  assert.equal(fixture.engine.getTerritory(state, 'frostpeak').value, 1000);
  assert.equal(fixture.engine.getTerritory(state, 'white_valley').ownerId, 'human');
});

test('итоговый score равен сумме территорий и отдельного бонуса', async () => {
  const engine = await enginePromise;
  const state = engine.createGame({ seed: 42 });
  state.players[0].bonusScore = 250;
  state.territories[0].ownerId = 'human';
  state.territories[0].value = 1000;
  state.territories[1].ownerId = 'human';
  state.territories[1].value = 400;
  assert.equal(engine.getPlayerScore(state, 'human'), 1650);
});

test('движок отклоняет ход не того игрока и повторный ответ', async () => {
  const { engine, state: started } = await createStartedGame();
  const legalId = engine.getLegalExpansionTerritoryIds(started, 'human')[0];
  assert.throws(
    () => engine.selectExpansionTerritory(started, 'knight', legalId),
    error => error.code === 'WRONG_TURN'
  );
  let state = engine.selectExpansionTerritory(started, 'human', legalId);
  state = engine.submitExpansionAnswer(state, 'human', state.activeQuestion.correctAnswer, 100);
  assert.throws(
    () => engine.submitExpansionAnswer(state, 'human', 0, 100),
    error => error.code === 'WRONG_STEP'
  );
});

test('JSON-сохранение восстанавливает карту, счёт, башни и текущий вопрос', async () => {
  const { engine, state: started } = await createStartedGame(505);
  const targetId = engine.getLegalExpansionTerritoryIds(started, 'human')[0];
  let state = engine.selectExpansionTerritory(started, 'human', targetId);
  const restored = engine.restoreGame(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.territories, state.territories);
  assert.deepEqual(restored.players, state.players);
  assert.equal(restored.activeQuestion.id, state.activeQuestion.id);
  assert.equal(restored.questionDeadlineAt, state.questionDeadlineAt);
  assert.ok(restored.questionDeadlineAt > Date.now());
  assert.equal(restored.rngState, state.rngState);
  assert.throws(
    () => engine.restoreGame({ ...state, version: 999 }),
    error => error.code === 'INVALID_SAVE'
  );
  assert.throws(
    () => engine.restoreGame({ ...state, players: [null, null, null] }),
    error => error.code === 'INVALID_SAVE'
  );
  assert.throws(
    () => engine.restoreGame({
      ...state,
      territories: state.territories.map((territory, index) => (
        index === 1 ? { ...territory, id: state.territories[0].id } : territory
      )),
    }),
    error => error.code === 'INVALID_SAVE'
  );
  assert.throws(
    () => engine.restoreGame({ ...state, step: 'UNKNOWN_STEP' }),
    error => error.code === 'INVALID_SAVE'
  );
  assert.throws(
    () => engine.restoreGame({ ...state, step: 'BOT_THINKING' }),
    error => error.code === 'INVALID_SAVE'
  );
  const neutralTerritoryId = state.territories.find(territory => territory.ownerId === null).id;
  assert.throws(
    () => engine.restoreGame({
      ...state,
      territories: state.territories.map(territory => (
        territory.id === neutralTerritoryId
          ? { ...territory, ownerId: 'human', acquisition: null, value: 0 }
          : territory
      )),
    }),
    error => error.code === 'INVALID_SAVE'
  );

  const eliminatedStillOwnsLand = JSON.parse(JSON.stringify(started));
  const eliminatedKnight = eliminatedStillOwnsLand.players.find(player => player.id === 'knight');
  eliminatedKnight.eliminated = true;
  eliminatedKnight.castleTowers = 0;
  assert.throws(
    () => engine.restoreGame(eliminatedStillOwnsLand),
    error => error.code === 'INVALID_SAVE'
  );

  const activeWithoutCastle = JSON.parse(JSON.stringify(started));
  const activeKnight = activeWithoutCastle.players.find(player => player.id === 'knight');
  activeKnight.baseTerritoryId = null;
  activeKnight.castleTowers = 0;
  assert.throws(
    () => engine.restoreGame(activeWithoutCastle),
    error => error.code === 'INVALID_SAVE'
  );

  const distributionWithoutWinner = JSON.parse(JSON.stringify(started));
  distributionWithoutWinner.phase = 'DISTRIBUTION';
  distributionWithoutWinner.step = 'SELECT_TERRITORY';
  distributionWithoutWinner.pendingDistributionWinnerId = null;
  assert.throws(
    () => engine.restoreGame(distributionWithoutWinner),
    error => error.code === 'INVALID_SAVE'
  );

  let battleState = engine.devFillNeutralTerritories(started);
  battleState = engine.advanceAfterResult(battleState);
  const attackTargetId = engine.getLegalAttackTerritoryIds(battleState, 'human')[0];
  battleState = engine.selectAttackTerritory(battleState, 'human', attackTargetId);
  battleState = engine.confirmAttack(battleState, 'human');
  const defenderId = battleState.battle.defenderId;

  const battleWithoutBotAnswer = JSON.parse(JSON.stringify(battleState));
  delete battleWithoutBotAnswer.battle.responses[defenderId];
  assert.throws(
    () => engine.restoreGame(battleWithoutBotAnswer),
    error => error.code === 'INVALID_SAVE'
  );

  const bothCorrectBattle = JSON.parse(JSON.stringify(battleState));
  bothCorrectBattle.battle.responses[defenderId].answerIndex = bothCorrectBattle.activeQuestion.correctAnswer;
  const tieBreakState = engine.submitWarAnswer(
    bothCorrectBattle,
    'human',
    bothCorrectBattle.activeQuestion.correctAnswer,
    100
  );
  tieBreakState.battle.tieBreakResponses = null;
  assert.throws(
    () => engine.restoreGame(tieBreakState),
    error => error.code === 'INVALID_SAVE'
  );
});

test('банк содержит 150 валидных неповторяющихся вопросов всех категорий', async () => {
  const questions = await questionsPromise;
  const validation = questions.validateQuestionBank();
  assert.equal(validation.estimateCount, 30);
  assert.equal(validation.battleCount, 120);
  assert.equal(validation.totalCount, 150);
  assert.equal(validation.categories.length, 9);
});

test('одинаковый seed воспроизводит базы ботов и первый вопрос', async () => {
  const engine = await enginePromise;
  const play = () => {
    let state = engine.createGame({ seed: 987654 });
    state = engine.selectBase(state, 'human', 'crownlands');
    const targetId = engine.getLegalExpansionTerritoryIds(state, 'human')[0];
    state = engine.selectExpansionTerritory(state, 'human', targetId);
    return {
      bases: state.players.map(player => player.baseTerritoryId),
      questionId: state.activeQuestion.id,
      rngState: state.rngState,
    };
  };
  assert.deepEqual(play(), play());
});

test('полный UI-подобный цикл доходит от замка до итогового экрана', async () => {
  const engine = await enginePromise;
  const { PHASES, STEPS } = await rulesPromise;
  let state = engine.createGame({ playerName: 'Сергей', seed: 20260820 });
  state = engine.selectBase(state, 'human', 'crownlands');

  for (let guard = 0; guard < 600 && state.step !== STEPS.SUMMARY; guard += 1) {
    if (state.phase === PHASES.EXPANSION) {
      if (state.step === STEPS.SELECT_TERRITORY) {
        const targetId = engine.getLegalExpansionTerritoryIds(state, 'human')[0];
        state = engine.selectExpansionTerritory(state, 'human', targetId);
      } else if (state.step === STEPS.QUESTION) {
        state = engine.submitExpansionAnswer(
          state,
          'human',
          state.activeQuestion.correctAnswer,
          100
        );
      } else if (state.step === STEPS.BOT_THINKING) {
        state = engine.resolveBotExpansion(state);
      } else if (state.step === STEPS.RESULT) {
        state = engine.advanceAfterResult(state);
      }
      continue;
    }

    if (state.phase === PHASES.DISTRIBUTION) {
      if (state.step === STEPS.QUESTION) {
        state = engine.submitDistributionAnswer(
          state,
          'human',
          state.activeQuestion.correctValue,
          100
        );
      } else if (state.step === STEPS.SELECT_TERRITORY) {
        const targetId = engine.getLegalDistributionTerritoryIds(state, 'human')[0];
        state = engine.selectDistributionTerritory(state, 'human', targetId);
      } else if (state.step === STEPS.RESULT) {
        state = engine.advanceAfterResult(state);
      }
      continue;
    }

    if (state.phase === PHASES.WAR) {
      if (state.step === STEPS.TRANSITION || state.step === STEPS.RESULT) {
        state = engine.advanceAfterResult(state);
      } else if (state.step === STEPS.SELECT_TERRITORY) {
        const targetId = engine.getLegalAttackTerritoryIds(state, 'human')[0];
        state = engine.selectAttackTerritory(state, 'human', targetId);
      } else if (state.step === STEPS.CONFIRM_ATTACK) {
        state = engine.confirmAttack(state, 'human');
      } else if (state.step === STEPS.BOT_THINKING) {
        state = engine.resolveBotWarTurn(state);
      } else if (state.step === STEPS.QUESTION) {
        state = engine.submitWarAnswer(state, 'human', state.activeQuestion.correctAnswer, 100);
      } else if (state.step === STEPS.TIEBREAK) {
        state = engine.submitWarTieBreak(state, 'human', state.activeQuestion.correctValue, 100);
      }
      continue;
    }

    if (state.phase === PHASES.FINISHED && state.step === STEPS.TIEBREAK) {
      state = engine.submitFinalTieBreak(state, 'human', state.activeQuestion.correctValue, 100);
    }
  }

  assert.equal(state.phase, PHASES.FINISHED);
  assert.equal(state.step, STEPS.SUMMARY);
  assert.ok(state.winnerId);
  assert.equal(new Set(state.usedQuestionIds).size, state.usedQuestionIds.length);
  assert.ok(state.eventLog.length > 0);
});
