import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useApp } from '../../app/AppContext';
import ConquiztadorBoard from './ConquiztadorBoard';
import ConquiztadorQuestion from './ConquiztadorQuestion';
import ConquiztadorResult from './ConquiztadorResult';
import ConquiztadorSidebar from './ConquiztadorSidebar';
import {
  advanceAfterResult,
  cancelAttack,
  confirmAttack,
  createGame,
  devDamageEnemyCastle,
  devFillNeutralTerritories,
  getActivePlayers,
  getBotDelayMs,
  getCurrentPlayer,
  getLegalAttackTerritoryIds,
  getLegalBaseTerritoryIds,
  getLegalDistributionTerritoryIds,
  getLegalExpansionTerritoryIds,
  getPlayer,
  getPlayerScore,
  getPlayerTerritoryCount,
  getQuestionTimeMs,
  getTerritory,
  HUMAN_PLAYER_ID,
  resolveBotExpansion,
  resolveBotWarTurn,
  restoreGame,
  selectAttackTerritory,
  selectBase,
  selectDistributionTerritory,
  selectExpansionTerritory,
  submitDistributionAnswer,
  submitExpansionAnswer,
  submitFinalTieBreak,
  submitWarAnswer,
  submitWarTieBreak,
} from './conquiztadorEngine.mjs';
import { TERRITORY_BY_ID } from './conquiztadorMap.mjs';
import { GAME_RULES, PHASES, STEPS } from './conquiztadorRules.mjs';

const SAVE_PREFIX = 'cheese-wheel:conquiztador:active:v1';
const HISTORY_PREFIX = 'cheese-wheel:conquiztador:history:v1';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(entry => (
    entry
    && typeof entry === 'object'
    && typeof entry.id === 'string'
    && typeof entry.date === 'string'
    && typeof entry.playerName === 'string'
    && Number.isInteger(entry.place)
    && Number.isFinite(entry.score)
  )).slice(0, 5);
}

function useModalFocus(onEscape) {
  const dialogRef = useRef(null);
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previouslyFocused = document.activeElement;
    const getFocusable = () => [...dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )].filter(element => !element.hidden);
    const frame = window.requestAnimationFrame(() => {
      const initial = dialog.querySelector('[data-dialog-initial]') || getFocusable()[0] || dialog;
      initial.focus();
    });
    const handleKeyDown = event => {
      if (event.key === 'Escape' && escapeRef.current) {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, []);

  return dialogRef;
}

function makeSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return Date.now() >>> 0;
}

function phaseTitle(state) {
  if (state.phase === PHASES.BASE_SELECTION) return 'Этап I · Выбор замка';
  if (state.phase === PHASES.EXPANSION) {
    return `Этап II · Захват земель · Раунд ${state.round} / ${GAME_RULES.EXPANSION_ROUNDS}`;
  }
  if (state.phase === PHASES.DISTRIBUTION) {
    const neutralCount = state.territories.filter(territory => territory.ownerId === null).length;
    return `Этап III · Распределение · Осталось ${neutralCount}`;
  }
  if (state.phase === PHASES.WAR) {
    return `Война · Раунд ${Math.min(state.round, GAME_RULES.WAR_ROUNDS)} / ${GAME_RULES.WAR_ROUNDS}`;
  }
  if (state.step === STEPS.TIEBREAK) return 'Финальный вопрос';
  return 'Итоги завоевания';
}

function instructionFor(state) {
  const turn = getCurrentPlayer(state);
  if (state.phase === PHASES.BASE_SELECTION) {
    return 'Выберите любую землю для своего замка. Боты построят базы на расстоянии.';
  }
  if (state.phase === PHASES.EXPANSION) {
    if (state.step === STEPS.BOT_THINKING) return `${turn.name} выбирает соседнюю землю…`;
    if (state.step === STEPS.SELECT_TERRITORY) return 'Ваш ход: выберите соседнюю нейтральную землю.';
    return `${turn.name} отвечает за право присоединить землю.`;
  }
  if (state.phase === PHASES.DISTRIBUTION) {
    if (state.step === STEPS.SELECT_TERRITORY) return 'Вы победили в оценке — выберите подсвеченную землю.';
    return 'Кто даст ближайшее число, тот получит одну оставшуюся землю.';
  }
  if (state.phase === PHASES.WAR) {
    if (state.step === STEPS.BOT_THINKING) return `${turn.name} готовит атаку…`;
    if (state.step === STEPS.SELECT_TERRITORY) return 'Ваш ход: выберите соседнюю вражескую территорию.';
    if (state.step === STEPS.CONFIRM_ATTACK) return 'Подтвердите цель атаки.';
    if (state.step === STEPS.TIEBREAK) return 'Оба соперника правы. Числовой вопрос решит исход.';
    return 'Атакующий и защитник отвечают на один вопрос.';
  }
  return '';
}

function sortedStandings(state) {
  return [...state.players].sort((first, second) => {
    if (first.id === state.winnerId) return -1;
    if (second.id === state.winnerId) return 1;
    return getPlayerScore(state, second.id) - getPlayerScore(state, first.id);
  });
}

function Lobby({ defaultName, history, onBack, onStart }) {
  const [name, setName] = useState(defaultName);
  return (
    <main className={`cq-lobby${history.length > 0 ? ' has-history' : ''}`}>
      <section className="cq-lobby-card cq-panel">
        <button className="cq-text-button cq-lobby-back" type="button" onClick={onBack}>
          ← На главную
        </button>
        <span className="cq-lobby-crown" aria-hidden="true">♛</span>
        <p className="cq-eyebrow">Карта · знания · стратегия</p>
        <h1>Con<span>QUIZ</span>tador</h1>
        <p className="cq-lobby-subtitle">
          Захватывай земли. Отвечай на вопросы. Уничтожай замки.
        </p>
        <label className="cq-name-field">
          <span>Ваше имя</span>
          <input
            type="text"
            maxLength="24"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Игрок"
            autoComplete="nickname"
          />
        </label>
        <div className="cq-lobby-roster" aria-label="Участники партии">
          <span><i className="is-human" />{name.trim() || 'Игрок'}<small>вы</small></span>
          <span><i className="is-knight" />Бот Рыцарь<small>normal</small></span>
          <span><i className="is-magister" />Бот Магистр<small>hard</small></span>
        </div>
        <button className="cq-start-button" type="button" onClick={() => onStart(name)}>
          Начать игру
        </button>
        <div className="cq-lobby-facts">
          <span><strong>18</strong> земель</span>
          <span><strong>3</strong> королевства</span>
          <span><strong>150+</strong> вопросов</span>
        </div>
      </section>
      {history.length > 0 && (
        <section className="cq-recent cq-panel">
          <h2>Последние походы</h2>
          <ol>
            {history.slice(0, 5).map(entry => (
              <li key={entry.id}>
                <span>{entry.date}</span>
                <strong>{entry.playerName}</strong>
                <b>{entry.place} место · {entry.score.toLocaleString('ru-RU')}</b>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function GameFinished({ onHome, onRestart, state }) {
  const human = getPlayer(state, HUMAN_PLAYER_ID);
  const standings = sortedStandings(state);
  const won = state.winnerId === HUMAN_PLAYER_ID;
  const accuracy = human.stats.answers > 0
    ? Math.round(human.stats.correctAnswers / human.stats.answers * 100)
    : 0;
  return (
    <div className="cq-finished">
      <section className="cq-finished-card cq-panel">
        <span className="cq-finished-crown" aria-hidden="true">{won ? '♛' : '♜'}</span>
        <p className="cq-eyebrow">Партия завершена</p>
        <h1>{won ? 'Победа' : 'Поход окончен'}</h1>
        <p>{won ? 'Королевство Аврора признало вашего правителя.' : `${getPlayer(state, state.winnerId).name} одержал победу.`}</p>
        <ol className="cq-final-table">
          {standings.map((player, index) => (
            <li key={player.id} className={player.id === state.winnerId ? 'is-winner' : ''}>
              <span>{index + 1}</span>
              <strong>{player.name}</strong>
              <b>{player.eliminated ? 'уничтожен' : getPlayerScore(state, player.id).toLocaleString('ru-RU')}</b>
            </li>
          ))}
        </ol>
        <div className="cq-final-stats">
          <span><small>Территории</small><strong>{getPlayerTerritoryCount(state, HUMAN_PLAYER_ID)}</strong></span>
          <span><small>Ответы</small><strong>{human.stats.correctAnswers} / {human.stats.answers}</strong></span>
          <span><small>Точность</small><strong>{accuracy}%</strong></span>
          <span><small>Атаки</small><strong>{human.stats.successfulAttacks}</strong></span>
          <span><small>Защиты</small><strong>{human.stats.successfulDefenses}</strong></span>
          <span><small>Королевства</small><strong>{human.stats.eliminatedPlayers}</strong></span>
        </div>
        <div className="cq-finished-actions">
          <button className="cq-primary-action" type="button" onClick={onRestart}>Сыграть ещё</button>
          <button className="cq-secondary-action" type="button" onClick={onHome}>На главную</button>
        </div>
      </section>
    </div>
  );
}

function AttackConfirmation({ onCancel, onConfirm, state }) {
  const dialogRef = useModalFocus(onCancel);
  const target = getTerritory(state, state.selectedTerritoryId);
  const definition = TERRITORY_BY_ID[target.id];
  const defender = getPlayer(state, target.ownerId);
  const isCastle = target.isBase
    && target.baseOwnerId === defender.id
    && defender.castleTowers > 0
    && !defender.eliminated;
  return (
    <div className="cq-overlay cq-confirm-overlay">
      <section
        ref={dialogRef}
        className="cq-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cq-confirm-title"
        aria-describedby="cq-confirm-description"
        tabIndex="-1"
      >
        <span aria-hidden="true">{isCastle ? '♜' : '⚔'}</span>
        <p className="cq-eyebrow">Военный совет</p>
        <h2 id="cq-confirm-title">
          {isCastle ? `Атаковать замок ${defender.name}?` : `Атаковать «${definition.name}»?`}
        </h2>
        <p id="cq-confirm-description">Владелец: <strong>{defender.name}</strong></p>
        {isCastle && <p>Башни: <strong>{defender.castleTowers} / {GAME_RULES.CASTLE_TOWERS}</strong></p>}
        <div>
          <button className="cq-primary-action" type="button" onClick={onConfirm}>Атаковать</button>
          <button className="cq-secondary-action" type="button" onClick={onCancel} data-dialog-initial>Отмена</button>
        </div>
      </section>
    </div>
  );
}

function RestartDialog({ onCancel, onConfirm }) {
  const dialogRef = useModalFocus(onCancel);
  return (
    <div className="cq-overlay cq-confirm-overlay">
      <section
        ref={dialogRef}
        className="cq-confirm-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cq-restart-title"
        aria-describedby="cq-restart-description"
        tabIndex="-1"
      >
        <span aria-hidden="true">↻</span>
        <h2 id="cq-restart-title">Начать новую партию?</h2>
        <p id="cq-restart-description">Текущий поход будет удалён. Очки и повреждения замков не перенесутся.</p>
        <div>
          <button className="cq-primary-action" type="button" onClick={onConfirm}>Новая игра</button>
          <button className="cq-secondary-action" type="button" onClick={onCancel} data-dialog-initial>Продолжить поход</button>
        </div>
      </section>
    </div>
  );
}

export default function ConquiztadorGame() {
  const { currentUser, navigate } = useApp();
  const userScope = currentUser?.id ? `user-${currentUser.id}` : 'guest';
  const saveKey = `${SAVE_PREFIX}:${userScope}`;
  const historyKey = `${HISTORY_PREFIX}:${userScope}`;
  const [game, setGame] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [restartOpen, setRestartOpen] = useState(false);
  const [history, setHistory] = useState(() => normalizeHistory(readJson(historyKey, [])));
  const [restored, setRestored] = useState(false);
  const gameRef = useRef(null);
  const recordedGameRef = useRef(null);
  const devMode = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('conquizDev') === '1';

  useLayoutEffect(() => {
    document.body.classList.add('conquiztador-game-active');
    return () => document.body.classList.remove('conquiztador-game-active');
  }, []);

  useEffect(() => {
    const saved = readJson(saveKey, null);
    if (saved) {
      try {
        const restoredGame = restoreGame(saved);
        gameRef.current = restoredGame;
        setGame(restoredGame);
        setRestored(true);
      } catch {
        removeStoredValue(saveKey);
      }
    }
    setHistory(normalizeHistory(readJson(historyKey, [])));
    setLoaded(true);
  }, [historyKey, saveKey]);

  const apply = useCallback(transform => {
    const current = gameRef.current;
    if (!current) return;
    try {
      const next = transform(current);
      gameRef.current = next;
      setGame(next);
      setError('');
    } catch (actionError) {
      setError(actionError?.message || 'Этот ход сейчас невозможен.');
    }
  }, []);

  useEffect(() => {
    if (!game) return;
    if (game.status === 'ACTIVE') {
      writeJson(saveKey, game);
      return;
    }
    removeStoredValue(saveKey);
    if (game.step !== STEPS.SUMMARY || recordedGameRef.current === game.id) return;
    recordedGameRef.current = game.id;
    const standings = sortedStandings(game);
    const human = getPlayer(game, HUMAN_PLAYER_ID);
    const entry = {
      id: `${game.id}-${Date.now()}`,
      date: new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date()),
      playerName: human.name,
      place: standings.findIndex(player => player.id === HUMAN_PLAYER_ID) + 1,
      score: getPlayerScore(game, HUMAN_PLAYER_ID),
    };
    const nextHistory = [entry, ...normalizeHistory(readJson(historyKey, []))].slice(0, 5);
    writeJson(historyKey, nextHistory);
    setHistory(nextHistory);
  }, [game, historyKey, saveKey]);

  useEffect(() => {
    if (!restored) return undefined;
    const timeout = window.setTimeout(() => setRestored(false), 3200);
    return () => window.clearTimeout(timeout);
  }, [restored]);

  useEffect(() => {
    if (!game || restartOpen || game.step !== STEPS.BOT_THINKING) return undefined;
    const timeout = window.setTimeout(() => {
      if (game.phase === PHASES.EXPANSION) apply(resolveBotExpansion);
      else if (game.phase === PHASES.WAR) apply(resolveBotWarTurn);
    }, getBotDelayMs(devMode));
    return () => window.clearTimeout(timeout);
  }, [apply, devMode, game, restartOpen]);

  useEffect(() => {
    if (!game || restartOpen || ![STEPS.RESULT, STEPS.TRANSITION].includes(game.step)) return undefined;
    const delay = devMode ? 120 : GAME_RULES.RESULT_DISPLAY_MS;
    const timeout = window.setTimeout(() => apply(advanceAfterResult), delay);
    return () => window.clearTimeout(timeout);
  }, [apply, devMode, game, restartOpen]);

  const startFresh = useCallback(name => {
    const next = createGame({
      playerName: name,
      questionDurationMs: getQuestionTimeMs(devMode),
      seed: makeSeed(),
    });
    recordedGameRef.current = null;
    gameRef.current = next;
    setGame(next);
    setRestartOpen(false);
    setError('');
    setRestored(false);
  }, [devMode]);

  const restartFromLobby = useCallback(() => {
    removeStoredValue(saveKey);
    gameRef.current = null;
    setGame(null);
    setRestartOpen(false);
    setError('');
  }, [saveKey]);

  const legalIds = useMemo(() => {
    if (!game) return [];
    if (game.phase === PHASES.BASE_SELECTION && game.step === STEPS.SELECT_TERRITORY) {
      return getLegalBaseTerritoryIds(game, HUMAN_PLAYER_ID);
    }
    if (game.phase === PHASES.EXPANSION && game.step === STEPS.SELECT_TERRITORY) {
      return getLegalExpansionTerritoryIds(game, HUMAN_PLAYER_ID);
    }
    if (game.phase === PHASES.DISTRIBUTION && game.step === STEPS.SELECT_TERRITORY) {
      return getLegalDistributionTerritoryIds(game, HUMAN_PLAYER_ID);
    }
    if (game.phase === PHASES.WAR && game.step === STEPS.SELECT_TERRITORY) {
      return getLegalAttackTerritoryIds(game, HUMAN_PLAYER_ID);
    }
    return [];
  }, [game]);

  const handleMapSelect = territoryId => {
    if (game.phase === PHASES.BASE_SELECTION) {
      apply(state => selectBase(state, HUMAN_PLAYER_ID, territoryId));
    } else if (game.phase === PHASES.EXPANSION) {
      apply(state => selectExpansionTerritory(state, HUMAN_PLAYER_ID, territoryId));
    } else if (game.phase === PHASES.DISTRIBUTION) {
      apply(state => selectDistributionTerritory(state, HUMAN_PLAYER_ID, territoryId));
    } else if (game.phase === PHASES.WAR) {
      apply(state => selectAttackTerritory(state, HUMAN_PLAYER_ID, territoryId));
    }
  };

  const handleQuestionAnswer = (answer, responseMs) => {
    if (game.phase === PHASES.EXPANSION) {
      apply(state => submitExpansionAnswer(state, HUMAN_PLAYER_ID, answer, responseMs));
    } else if (game.phase === PHASES.DISTRIBUTION) {
      apply(state => submitDistributionAnswer(state, HUMAN_PLAYER_ID, answer, responseMs));
    } else if (game.phase === PHASES.WAR && game.step === STEPS.QUESTION) {
      apply(state => submitWarAnswer(state, HUMAN_PLAYER_ID, answer, responseMs));
    } else if (game.phase === PHASES.WAR && game.step === STEPS.TIEBREAK) {
      apply(state => submitWarTieBreak(state, HUMAN_PLAYER_ID, answer, responseMs));
    } else if (game.phase === PHASES.FINISHED && game.step === STEPS.TIEBREAK) {
      apply(state => submitFinalTieBreak(state, HUMAN_PLAYER_ID, answer, responseMs));
    }
  };

  const questionContext = useMemo(() => {
    if (!game) return '';
    if (game.phase === PHASES.EXPANSION) return 'Захват земли';
    if (game.phase === PHASES.DISTRIBUTION) return 'Распределение земель';
    if (game.phase === PHASES.FINISHED) return 'Финальная дуэль';
    const battle = game.battle;
    if (!battle) return 'Битва';
    return battle.attackerId === HUMAN_PLAYER_ID
      ? `Атака на ${TERRITORY_BY_ID[battle.territoryId].name}`
      : `Защита ${TERRITORY_BY_ID[battle.territoryId].name}`;
  }, [game]);

  if (!loaded) {
    return <div className="cq-loading cq-panel" role="status">Восстанавливаем королевство…</div>;
  }

  if (!game) {
    return (
      <Lobby
        defaultName={currentUser?.name || 'Игрок'}
        history={history}
        onBack={() => navigate('wheel')}
        onStart={startFresh}
      />
    );
  }

  if (game.phase === PHASES.FINISHED && game.step === STEPS.SUMMARY) {
    return (
      <GameFinished
        state={game}
        onHome={() => navigate('wheel')}
        onRestart={() => startFresh(getPlayer(game, HUMAN_PLAYER_ID).name)}
      />
    );
  }

  const turn = getCurrentPlayer(game);
  const questionVisible = Boolean(
    game.activeQuestion && [STEPS.QUESTION, STEPS.TIEBREAK].includes(game.step)
  );
  const attackConfirmationVisible = game.phase === PHASES.WAR
    && game.step === STEPS.CONFIRM_ATTACK;
  const blockingDialogOpen = restartOpen || questionVisible || attackConfirmationVisible;
  const backgroundA11yProps = blockingDialogOpen
    ? { inert: true, 'aria-hidden': true }
    : {};

  return (
    <main className="cq-game-shell">
      <header className="cq-game-header cq-panel" {...backgroundA11yProps}>
        <div>
          <button className="cq-text-button" type="button" onClick={() => navigate('wheel')}>
            ← На главную
          </button>
          <p className="cq-eyebrow">{phaseTitle(game)}</p>
          <h1>Con<span>QUIZ</span>tador</h1>
        </div>
        <div className="cq-turn-status">
          {game.phase !== PHASES.DISTRIBUTION && game.phase !== PHASES.FINISHED && (
            <span>Ход: <strong>{turn?.name}</strong></span>
          )}
          <p>{instructionFor(game)}</p>
        </div>
        <button className="cq-secondary-action cq-new-game" type="button" onClick={() => setRestartOpen(true)}>
          Новая игра
        </button>
      </header>

      {restored && <div className="cq-restored" role="status">Партия восстановлена после обновления страницы</div>}
      {error && <div className="cq-game-error" role="alert">{error}</div>}

      <div className="cq-game-layout" {...backgroundA11yProps}>
        <ConquiztadorBoard
          state={game}
          legalIds={legalIds}
          selectedId={game.selectedTerritoryId}
          onSelect={handleMapSelect}
        />
        <ConquiztadorSidebar state={game} />
      </div>

      {game.step === STEPS.BOT_THINKING && (
        <div className="cq-bot-thinking" role="status" {...backgroundA11yProps}>
          <span aria-hidden="true">♟</span>
          <strong>{turn.name}</strong> обдумывает ход…
        </div>
      )}

      {attackConfirmationVisible && !restartOpen && (
        <AttackConfirmation
          state={game}
          onCancel={() => apply(state => cancelAttack(state, HUMAN_PLAYER_ID))}
          onConfirm={() => apply(state => confirmAttack(state, HUMAN_PLAYER_ID))}
        />
      )}

      {questionVisible && !restartOpen && (
        <ConquiztadorQuestion
          key={`${game.id}-${game.activeQuestion.sequence}-${game.step}`}
          question={game.activeQuestion}
          context={questionContext}
          deadlineAt={game.questionDeadlineAt}
          durationMs={game.questionDurationMs}
          onAnswer={handleQuestionAnswer}
        />
      )}

      {!restartOpen && [STEPS.RESULT, STEPS.TRANSITION].includes(game.step) && (
        <ConquiztadorResult result={game.result} state={game} />
      )}

      {restartOpen && (
        <RestartDialog onCancel={() => setRestartOpen(false)} onConfirm={restartFromLobby} />
      )}

      {devMode && (
        <aside className="cq-dev-panel" aria-label="Инструменты разработчика">
          <strong>DEV</strong>
          {questionVisible && !restartOpen && game.activeQuestion.type === 'MULTIPLE_CHOICE' && (
            <>
              <button type="button" onClick={() => handleQuestionAnswer(game.activeQuestion.correctAnswer, 100)}>
                Ответить правильно
              </button>
              <button type="button" onClick={() => handleQuestionAnswer((game.activeQuestion.correctAnswer + 1) % 4, 100)}>
                Ответить неверно
              </button>
            </>
          )}
          {questionVisible && !restartOpen && game.activeQuestion.type === 'ESTIMATION' && (
            <>
              <button type="button" onClick={() => handleQuestionAnswer(game.activeQuestion.correctValue, 100)}>
                Точное число
              </button>
              <button type="button" onClick={() => handleQuestionAnswer(game.activeQuestion.correctValue + (game.activeQuestion.spread || 1000), 100)}>
                Большая ошибка
              </button>
            </>
          )}
          {[PHASES.EXPANSION, PHASES.DISTRIBUTION].includes(game.phase) && (
            <button type="button" onClick={() => apply(devFillNeutralTerritories)}>Заполнить карту / к войне</button>
          )}
          {game.phase === PHASES.WAR && getActivePlayers(game).length > 1 && (
            <button type="button" onClick={() => apply(devDamageEnemyCastle)}>Повредить замок</button>
          )}
        </aside>
      )}
    </main>
  );
}
