import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext';

const BOARD_SIZE = 5;

function cellKey(row, column) {
  return `${row}:${column}`;
}

function isAdjacent(first, second) {
  return Math.abs(first.row - second.row) + Math.abs(first.column - second.column) === 1;
}

export default function BaldaGame({ onClose }) {
  const { connected, currentUser, isGuest, socket } = useApp();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const [placement, setPlacement] = useState(null);
  const [letter, setLetter] = useState('');
  const [path, setPath] = useState([]);
  const [unknownDraft, setUnknownDraft] = useState(null);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [dictionaryWord, setDictionaryWord] = useState('');
  const [dictionaryResult, setDictionaryResult] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now());

  useLayoutEffect(() => {
    document.body.classList.add('balda-game-active');
    return () => document.body.classList.remove('balda-game-active');
  }, []);

  useEffect(() => {
    const onState = nextState => {
      setState(nextState);
      setLoadError('');
    };
    const watch = () => {
      socket.timeout(5000).emit('balda:watch', (error, result) => {
        if (error) {
          setLoadError('Не удалось загрузить партию');
          return;
        }
        if (result?.state) onState(result.state);
      });
    };

    socket.on('balda:state', onState);
    socket.on('connect', watch);
    if (socket.connected) watch();
    return () => {
      socket.off('balda:state', onState);
      socket.off('connect', watch);
      if (socket.connected) socket.emit('balda:unwatch');
    };
  }, [socket]);

  useEffect(() => {
    setClockNow(Date.now());
    if (!state?.turnDeadline) return undefined;
    const interval = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [state?.turnDeadline]);

  const perform = useCallback((event, payload) => new Promise(resolve => {
    setBusy(event);
    setActionError('');
    const callback = (timeoutError, result) => {
      setBusy('');
      if (timeoutError) {
        setActionError('Сервер не ответил. Попробуйте ещё раз.');
        resolve(null);
        return;
      }
      if (!result?.ok) {
        setActionError(result?.error || 'Не удалось выполнить действие');
        resolve(result);
        return;
      }
      resolve(result);
    };
    if (payload === undefined) socket.timeout(5000).emit(event, callback);
    else socket.timeout(5000).emit(event, payload, callback);
  }), [socket]);

  const currentUserId = Number(currentUser?.id);
  const players = state?.players || [];
  const myPlayer = players.find(player => Number(player.user?.id) === currentUserId);
  const botPlayer = players.find(player => player.user?.isBot);
  const currentPlayer = players.find(
    player => Number(player.user?.id) === Number(state?.currentPlayerId)
  );
  const pendingResponder = players.find(
    player => Number(player.user?.id) === Number(state?.pendingWord?.responderId)
  );
  const pendingProposer = players.find(
    player => Number(player.user?.id) === Number(state?.pendingWord?.proposerId)
  );
  const isMyTurn = Boolean(
    myPlayer
    && state?.status === 'playing'
    && Number(state.currentPlayerId) === currentUserId
  );
  const canEdit = isMyTurn && !state?.pendingWord && !busy && connected;
  const emptySeatAvailable = players.some(player => !player.user);
  const turnDurationLocked = state?.status === 'playing'
    && (state.moves.length > 0 || Boolean(state.pendingWord));
  const canSetTurnDuration = Boolean(myPlayer && !turnDurationLocked && !busy && connected);
  const remainingSeconds = state?.turnDeadline
    ? Math.max(0, Math.ceil((Number(state.turnDeadline) - clockNow) / 1000))
    : null;

  useEffect(() => {
    if (!isMyTurn) setUnknownDraft(null);
  }, [isMyTurn]);

  const pathPositions = useMemo(() => new Map(
    path.map((cell, index) => [cellKey(cell.row, cell.column), index + 1])
  ), [path]);

  const previewWord = useMemo(() => {
    if (!state) return '';
    return path.map(cell => {
      if (placement && cell.row === placement.row && cell.column === placement.column) {
        return letter || '•';
      }
      return state.board[(cell.row * BOARD_SIZE) + cell.column] || '•';
    }).join('');
  }, [letter, path, placement, state]);

  const resetDraft = useCallback(() => {
    setPlacement(null);
    setLetter('');
    setPath([]);
    setUnknownDraft(null);
  }, []);

  const handleCellClick = (row, column) => {
    if (!canEdit || !state) return;
    setActionError('');
    setUnknownDraft(null);
    const index = (row * BOARD_SIZE) + column;
    const key = cellKey(row, column);
    const isCurrentPlacement = placement?.row === row && placement?.column === column;
    const isAvailableForPath = Boolean(state.board[index]) || (isCurrentPlacement && letter);

    if (!isAvailableForPath) {
      setPlacement({ row, column });
      setLetter('');
      setPath([]);
      return;
    }

    const existingIndex = path.findIndex(cell => cellKey(cell.row, cell.column) === key);
    if (existingIndex >= 0) {
      setPath(previous => previous.slice(0, existingIndex));
      return;
    }
    const nextCell = { row, column };
    if (path.length > 0 && !isAdjacent(path[path.length - 1], nextCell)) {
      setActionError('Выбирайте соседние клетки по горизонтали или вертикали');
      return;
    }
    setPath(previous => [...previous, nextCell]);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!placement || !letter || path.length < 2) return;
    const move = {
      row: placement.row,
      column: placement.column,
      letter,
      path,
    };
    const result = await perform('balda:submit-move', move);
    if (result?.unknown) {
      setUnknownDraft({ ...move, word: result.word });
    } else if (result?.ok) {
      resetDraft();
    }
  };

  const handleProposeWord = async () => {
    if (!unknownDraft) return;
    const result = await perform('balda:propose-word', unknownDraft);
    if (result?.ok) resetDraft();
  };

  const handleDictionaryCheck = async event => {
    event.preventDefault();
    const result = await perform('balda:check-word', { word: dictionaryWord });
    if (result?.ok) setDictionaryResult(result);
  };

  const handleLeave = async () => {
    if (state?.status === 'playing' && !window.confirm(
      'Освободить место? Текущая партия будет завершена в пользу соперника.'
    )) return;
    await perform('balda:leave');
    resetDraft();
  };

  const handleRemoveBot = async () => {
    if (state?.status === 'playing' && !window.confirm(
      'Убрать Борхеса? Текущая партия будет аннулирована.'
    )) return;
    await perform('balda:remove-bot');
    resetDraft();
  };

  const submitReady = Boolean(
    placement
    && letter
    && path.length >= 2
    && path.some(cell => cell.row === placement.row && cell.column === placement.column)
  );

  if (!state) {
    return (
      <section className="balda-shell surface" aria-busy={!loadError}>
        <button className="balda-back" type="button" onClick={onClose}>← К играм</button>
        <div className="balda-loading" role="status">
          {loadError || 'Загружаем партию…'}
        </div>
      </section>
    );
  }

  const statusText = state.status === 'waiting'
    ? 'Ждём второго игрока'
    : state.status === 'finished'
      ? state.winner ? `Победил ${state.winner.name}` : 'Ничья'
      : isMyTurn ? 'Ваш ход' : `Ходит ${currentPlayer?.user?.name || 'игрок'}`;

  return (
    <section className="balda-shell" aria-label="Игра Балда">
      <header className="balda-header surface">
        <div>
          <button className="balda-back" type="button" onClick={onClose}>← К играм</button>
          <h1>Балда</h1>
          <p>Добавьте букву и соберите слово по соседним клеткам.</p>
        </div>
        <div className="balda-viewers" title="Людей сейчас в игре">
          <span aria-hidden="true">👥</span> {state.presenceCount}
        </div>
      </header>

      <div className="balda-scoreboard" aria-label="Счёт игроков">
        {players.map(player => {
          const active = Number(player.user?.id) === Number(state.currentPlayerId);
          return (
            <article
              className={`balda-player surface${active ? ' is-active' : ''}${Number(player.user?.id) === currentUserId ? ' is-me' : ''}`}
              key={player.slot}
            >
              <span className="balda-player-slot">Игрок {player.slot}</span>
              <strong>
                {player.user?.name || 'Свободное место'}
                {player.user?.isBot && <small className="balda-bot-badge">бот</small>}
              </strong>
              {player.user && (
                <span className="balda-player-stats">
                  В {player.stats.wins} · Н {player.stats.draws} · П {player.stats.losses}
                </span>
              )}
              <span className="balda-score">{player.score}</span>
            </article>
          );
        })}
      </div>

      <div className="balda-status surface" role="status" aria-live="polite">
        <strong>{statusText}</strong>
        {!connected && <span>Нет связи с сервером</span>}
        {state.status === 'playing' && state.consecutivePasses === 1 && (
          <span>Один ход пропущен. Ещё один пропуск завершит партию.</span>
        )}
        <div className="balda-turn-controls">
          {state.status === 'playing' && (
            <span className={`balda-turn-clock${remainingSeconds !== null && remainingSeconds <= 10 ? ' is-urgent' : ''}`}>
              {remainingSeconds === null
                ? '⏱ —'
                : `⏱ ${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`}
            </span>
          )}
          <label className="balda-turn-duration">
            На ход
            <select
              value={state.turnDurationSeconds}
              disabled={!canSetTurnDuration}
              title={turnDurationLocked ? 'Время меняется до первого хода или между партиями' : undefined}
              onChange={event => perform('balda:set-turn-duration', { seconds: Number(event.target.value) })}
            >
              <option value={30}>30 секунд</option>
              <option value={60}>1 минута</option>
              <option value={120}>2 минуты</option>
              <option value={180}>3 минуты</option>
              <option value={240}>4 минуты</option>
              <option value={300}>5 минут</option>
            </select>
          </label>
        </div>
      </div>

      <div className="balda-layout">
        <div className="balda-play-column">
          <div className="balda-board surface" role="grid" aria-label="Игровое поле 5 на 5">
            {state.board.map((boardLetter, index) => {
              const row = Math.floor(index / BOARD_SIZE);
              const column = index % BOARD_SIZE;
              const key = cellKey(row, column);
              const isPlacement = placement?.row === row && placement?.column === column;
              const order = pathPositions.get(key);
              const displayLetter = boardLetter || (isPlacement ? letter : '');
              return (
                <button
                  className={[
                    'balda-cell',
                    boardLetter ? 'is-filled' : '',
                    isPlacement ? 'is-placement' : '',
                    order ? 'is-in-path' : '',
                  ].filter(Boolean).join(' ')}
                  type="button"
                  role="gridcell"
                  key={key}
                  onClick={() => handleCellClick(row, column)}
                  disabled={!canEdit}
                  aria-label={`Строка ${row + 1}, столбец ${column + 1}${displayLetter ? `, буква ${displayLetter}` : ', пусто'}`}
                >
                  <span>{displayLetter}</span>
                  {order && <small aria-hidden="true">{order}</small>}
                </button>
              );
            })}
          </div>

          {isMyTurn && !state.pendingWord && (
            <form className="balda-move-panel surface" onSubmit={handleSubmit}>
              <label>
                Новая буква
                <input
                  value={letter}
                  maxLength={1}
                  disabled={!placement || Boolean(busy) || !connected}
                  onChange={event => {
                    const nextLetter = event.target.value.toLocaleUpperCase('ru-RU')
                      .replace(/[^А-ЯЁ]/gu, '')
                      .slice(-1);
                    setLetter(nextLetter);
                    setPath([]);
                    setUnknownDraft(null);
                  }}
                  aria-describedby="balda-move-hint"
                  inputMode="text"
                />
              </label>
              <div className="balda-word-preview" aria-label={`Собранное слово: ${previewWord || 'нет'}`}>
                {previewWord || 'СЛОВО'}
              </div>
              <p id="balda-move-hint">
                {!placement
                  ? 'Сначала выберите пустую клетку.'
                  : !letter
                    ? 'Введите букву, затем нажмите клетки слова по порядку.'
                    : 'Нажимайте соседние клетки; повторное нажатие укоротит путь.'}
              </p>
              <div className="balda-move-actions">
                <button className="game-btn" type="submit" disabled={!submitReady || Boolean(busy)}>
                  Сыграть слово
                </button>
                <button className="balda-secondary-btn" type="button" onClick={resetDraft} disabled={Boolean(busy)}>
                  Сбросить
                </button>
                <button className="balda-text-btn" type="button" onClick={() => perform('balda:pass')} disabled={Boolean(busy)}>
                  Пропустить ход
                </button>
              </div>
            </form>
          )}

          {state.pendingWord && (
            <div className="balda-word-vote surface" role="group" aria-label="Подтверждение слова">
              <span className="balda-kicker">Слова нет в словаре</span>
              <strong>{state.pendingWord.word}</strong>
              <p>
                {pendingProposer?.user?.name || 'Игрок'} предлагает засчитать слово.
                {' '}{Number(state.pendingWord.responderId) === currentUserId
                  ? 'Решение за вами.'
                  : `Ждём решения игрока ${pendingResponder?.user?.name || ''}.`}
                {' '}Таймер предлагающего продолжает идти.
              </p>
              {Number(state.pendingWord.responderId) === currentUserId && (
                <div className="balda-vote-actions">
                  <button
                    className="game-btn"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => perform('balda:resolve-word', { accepted: true })}
                  >
                    Принять и добавить в словарь
                  </button>
                  <button
                    className="balda-danger-btn"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => perform('balda:resolve-word', { accepted: false })}
                  >
                    Отклонить
                  </button>
                </div>
              )}
            </div>
          )}

          {unknownDraft && isMyTurn && !state.pendingWord && (
            <div className="balda-unknown-word surface" role="status">
              <span className="balda-kicker">Слова нет в словаре</span>
              <strong>{unknownDraft.word}</strong>
              <p>Можно изменить слово или отдельно предложить сопернику засчитать его.</p>
              <button className="game-btn" type="button" disabled={Boolean(busy)} onClick={handleProposeWord}>
                Предложить сопернику
              </button>
            </div>
          )}

          {actionError && <div className="balda-error" role="alert">{actionError}</div>}

          <div className="balda-lobby-actions">
            <button className="balda-secondary-btn" type="button" onClick={() => {
              setDictionaryOpen(true);
              setDictionaryResult(null);
            }}>
              Проверить слово
            </button>
            {!myPlayer && !isGuest && emptySeatAvailable && (
              <button className="game-btn" type="button" disabled={Boolean(busy) || !connected} onClick={() => perform('balda:join')}>
                Занять место
              </button>
            )}
            {myPlayer && emptySeatAvailable && !botPlayer && (
              <button className="balda-secondary-btn" type="button" disabled={Boolean(busy) || !connected} onClick={() => perform('balda:add-bot')}>
                Добавить Борхеса
              </button>
            )}
            {myPlayer && botPlayer && (
              <button className="balda-text-btn" type="button" disabled={Boolean(busy)} onClick={handleRemoveBot}>
                Убрать Борхеса
              </button>
            )}
            {!myPlayer && (isGuest || !emptySeatAvailable) && (
              <span className="balda-spectator-note">
                {isGuest ? 'Вы смотрите как гость.' : 'Вы смотрите партию.'}
              </span>
            )}
            {myPlayer && state.status === 'finished' && players.every(player => player.user) && (
              <button className="game-btn" type="button" disabled={Boolean(busy)} onClick={() => perform('balda:new-game')}>
                Новая партия
              </button>
            )}
            {myPlayer && (
              <button className="balda-text-btn" type="button" disabled={Boolean(busy)} onClick={handleLeave}>
                Освободить место
              </button>
            )}
          </div>
        </div>

        <aside className="balda-sidebar">
          <section className="balda-statistics surface">
            <h2>Статистика</h2>
            <div className="balda-statistics-scroll">
              <table>
                <thead>
                  <tr><th>Игрок</th><th title="Победы">В</th><th title="Ничьи">Н</th><th title="Поражения">П</th></tr>
                </thead>
                <tbody>
                  {state.leaderboard.map(entry => (
                    <tr key={entry.user.id}>
                      <td>{entry.user.name}</td>
                      <td>{entry.wins}</td>
                      <td>{entry.draws}</td>
                      <td>{entry.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="balda-history surface">
            <h2>Ходы</h2>
            {state.moves.length === 0 ? (
              <p className="balda-empty">Пока нет сыгранных слов.</p>
            ) : (
              <ol>
                {[...state.moves].reverse().map((move, index) => {
                  const player = players.find(item => Number(item.user?.id) === Number(move.userId));
                  return (
                    <li key={`${move.createdAt}:${index}`}>
                      <span>{move.userName || player?.user?.name || 'Игрок'}</span>
                      {move.pass
                        ? <em>{move.timedOut ? 'время вышло' : 'пропуск'}</em>
                        : <><strong>{move.word}</strong><b>+{move.score}</b></>}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <details className="balda-rules surface">
            <summary>Как играть</summary>
            <p className="balda-dictionary-note">
              В словаре {state.dictionarySize.toLocaleString('ru-RU')} русских существительных из OpenRussian.
            </p>
            <ol>
              <li>Играют существительными в именительном падеже; нарицательными именами.</li>
              <li>Выберите пустую клетку и добавьте одну букву.</li>
              <li>Соберите новое слово, переходя по сторонам клеток без повторов.</li>
              <li>За слово начисляется столько очков, сколько в нём букв.</li>
              <li>Если слова нет в словаре, соперник может принять его. Тогда оно сохранится для будущих партий.</li>
              <li>Неизвестное слово отправляется сопернику только отдельной кнопкой; таймер при этом не останавливается.</li>
              <li>На ход даётся от 30 секунд до 5 минут. По истечении времени ход пропускается.</li>
              <li>Партия заканчивается при заполнении поля или после двух пропусков подряд.</li>
              <li>На свободное место можно добавить бота Борхеса; он играет по тому же словарю и правилам.</li>
            </ol>
          </details>
        </aside>
      </div>

      {dictionaryOpen && (
        <div className="balda-dictionary-overlay" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setDictionaryOpen(false);
        }}>
          <section className="balda-dictionary-dialog surface" role="dialog" aria-modal="true" aria-labelledby="balda-dictionary-title">
            <button className="balda-dictionary-close" type="button" aria-label="Закрыть проверку слова" onClick={() => setDictionaryOpen(false)}>×</button>
            <h2 id="balda-dictionary-title">Проверить слово</h2>
            <p>Проверка не совершает ход и не влияет на таймер.</p>
            <form onSubmit={handleDictionaryCheck}>
              <label htmlFor="balda-dictionary-input">Русское существительное</label>
              <input
                id="balda-dictionary-input"
                autoFocus
                value={dictionaryWord}
                maxLength={25}
                onChange={event => {
                  setDictionaryWord(event.target.value.toLocaleUpperCase('ru-RU').replace(/[^А-ЯЁ]/gu, ''));
                  setDictionaryResult(null);
                }}
              />
              <button className="game-btn" type="submit" disabled={Boolean(busy) || dictionaryWord.length < 2}>Проверить</button>
            </form>
            {dictionaryResult && (
              <div className={`balda-dictionary-result ${dictionaryResult.exists ? 'exists' : 'missing'}`} role="status">
                <strong>{dictionaryResult.word}</strong>
                <span>{dictionaryResult.exists ? 'есть в словаре' : 'нет в словаре'}</span>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
