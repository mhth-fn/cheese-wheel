import { useCallback, useEffect, useState } from 'react';
import {
  fetchNextWheelMovies,
  fetchOneOffWheel,
  fetchWheelMovies,
  fetchWheelStatus,
} from '../api';

const EMPTY_WHEEL_STATUS = {
  formed: false,
  movies: [],
  round_movies: [],
  current_count: 0,
};

const EMPTY_ONE_OFF_STATE = {
  enabled: false,
  mode: 'selection',
  spin_duration: 5,
  movies: [],
  result: null,
  spinning_until: null,
  elimination_active: false,
};

export function useWheelState(isLoggedIn) {
  const [centerImage, setCenterImage] = useState(null);
  const [nextWheelMovies, setNextWheelMovies] = useState([]);
  const [oneOffIsSpinning, setOneOffIsSpinning] = useState(false);
  const [oneOffState, setOneOffState] = useState(EMPTY_ONE_OFF_STATE);
  const [remoteOneOffSpin, setRemoteOneOffSpin] = useState(null);
  const [remoteSpin, setRemoteSpin] = useState(null);
  const [wheelIsSpinning, setWheelIsSpinning] = useState(false);
  const [wheelMovies, setWheelMovies] = useState([]);
  const [wheelStatus, setWheelStatus] = useState(EMPTY_WHEEL_STATUS);
  const [wheelStatusLoadState, setWheelStatusLoadState] = useState('loading');
  const [winner, setWinner] = useState(null);

  const refreshWheelData = useCallback(async () => {
    setWheelStatusLoadState('loading');
    try {
      const [currentMovies, nextMovies, status, oneOff] = await Promise.all([
        fetchWheelMovies(),
        fetchNextWheelMovies(),
        fetchWheelStatus(),
        fetchOneOffWheel(),
      ]);
      if (
        !Array.isArray(currentMovies)
        || !Array.isArray(nextMovies)
        || !Array.isArray(status.movies)
        || !Array.isArray(oneOff.movies)
      ) {
        throw new Error('Некорректный ответ сервера');
      }
      setWheelMovies(currentMovies);
      setNextWheelMovies(nextMovies);
      setWheelStatus(status);
      setOneOffState(oneOff);
      setWheelStatusLoadState('ready');
    } catch {
      setWheelStatusLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) refreshWheelData();
  }, [isLoggedIn, refreshWheelData]);

  return {
    centerImage,
    nextWheelMovies,
    oneOffIsSpinning,
    oneOffState,
    refreshWheelData,
    remoteOneOffSpin,
    remoteSpin,
    setCenterImage,
    setNextWheelMovies,
    setOneOffIsSpinning,
    setOneOffState,
    setRemoteOneOffSpin,
    setRemoteSpin,
    setWheelIsSpinning,
    setWheelMovies,
    setWheelStatus,
    setWheelStatusLoadState,
    setWinner,
    wheelIsSpinning,
    wheelMovies,
    wheelStatus,
    wheelStatusLoadState,
    winner,
  };
}
