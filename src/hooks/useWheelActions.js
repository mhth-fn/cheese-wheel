import { useCallback } from 'react';
import {
  deleteMovie,
  deleteNextMovie,
  formNextWheel,
  formWheel,
  postMovie,
  postNextMovie,
  updateMovie,
} from '../api';

async function readResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackMessage);
  return data;
}

export function useWheelActions({
  connected,
  showToast,
  wheel,
}) {
  const {
    setNextWheelMovies,
    setWheelMovies,
    setWheelStatus,
    setWheelStatusLoadState,
    wheelIsSpinning,
  } = wheel;

  const requireAvailableWheel = useCallback(() => {
    if (!connected) {
      showToast('Нет соединения с сервером', 'error');
      return false;
    }
    if (wheelIsSpinning) {
      showToast('Дождитесь окончания прокрутки', 'info');
      return false;
    }
    return true;
  }, [connected, showToast, wheelIsSpinning]);

  const addCurrentMovie = useCallback(async movie => {
    if (!requireAvailableWheel()) return false;
    try {
      const data = await readResponse(await postMovie(movie), 'Ошибка добавления');
      showToast(
        data.replaced
          ? 'Ваш фильм заменён'
          : `«${movie.title}» выбран для колеса`,
        'success'
      );
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [requireAvailableWheel, showToast]);

  const removeCurrentMovie = useCallback(async id => {
    if (!requireAvailableWheel()) return false;
    try {
      await readResponse(await deleteMovie(id), 'Не удалось удалить фильм');
      showToast('Фильм удалён из колеса', 'info');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка удаления', 'error');
      return false;
    }
  }, [requireAvailableWheel, showToast]);

  const updateCurrentMovie = useCallback(async (id, movie) => {
    if (!requireAvailableWheel()) return false;
    try {
      await readResponse(await updateMovie(id, movie), 'Ошибка обновления');
      showToast('Фильм обновлён', 'success');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [requireAvailableWheel, showToast]);

  const formCurrentWheel = useCallback(async () => {
    if (!requireAvailableWheel()) return false;
    try {
      const data = await readResponse(
        await formWheel(),
        'Не удалось сформировать колесо'
      );
      setWheelStatus(data);
      setWheelStatusLoadState('ready');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [
    requireAvailableWheel,
    setWheelStatus,
    setWheelStatusLoadState,
    showToast,
  ]);

  const addNextMovie = useCallback(async movie => {
    if (!connected) {
      showToast('Нет соединения с сервером', 'error');
      return false;
    }
    try {
      const data = await readResponse(await postNextMovie(movie), 'Ошибка добавления');
      showToast(
        data.replaced
          ? 'Ваш фильм для следующего раунда заменён'
          : `«${movie.title}» выбран для следующего раунда`,
        'success'
      );
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [connected, showToast]);

  const removeNextMovie = useCallback(async id => {
    if (!connected) {
      showToast('Нет соединения с сервером', 'error');
      return false;
    }
    try {
      await readResponse(await deleteNextMovie(id), 'Не удалось удалить фильм');
      showToast('Фильм удалён из следующего раунда', 'info');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка удаления', 'error');
      return false;
    }
  }, [connected, showToast]);

  const formUpcomingWheel = useCallback(async () => {
    if (!requireAvailableWheel()) return false;
    try {
      const data = await readResponse(
        await formNextWheel(),
        'Не удалось сформировать следующее колесо'
      );
      setWheelStatus(data);
      setWheelStatusLoadState('ready');
      setNextWheelMovies([]);
      setWheelMovies(data.movies);
      showToast('Следующее колесо сформировано', 'success');
      return true;
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
      return false;
    }
  }, [
    requireAvailableWheel,
    setNextWheelMovies,
    setWheelMovies,
    setWheelStatus,
    setWheelStatusLoadState,
    showToast,
  ]);

  return {
    addCurrentMovie,
    addNextMovie,
    formCurrentWheel,
    formUpcomingWheel,
    removeCurrentMovie,
    removeNextMovie,
    updateCurrentMovie,
  };
}
