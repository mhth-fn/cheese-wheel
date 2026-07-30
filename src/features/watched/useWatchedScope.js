import { useEffect, useMemo, useState } from 'react';

function withScopedAverage(movie, scopedUsers) {
  const ratings = scopedUsers
    .map(user => movie[`rating_${user.id}`])
    .filter(rating => rating !== null && rating !== undefined && rating !== '');
  if (ratings.length === 0) return null;
  const average = (
    ratings.reduce((sum, rating) => sum + Number(rating), 0) / ratings.length
  );
  return {
    ...movie,
    avg_rating: Math.round(average * 10) / 10,
    ratings_count: ratings.length,
  };
}

export function useWatchedScope({
  currentUser,
  isGuest,
  movies,
  onScopeChange,
  showToast,
  users,
}) {
  const [personalModeEnabled, setPersonalModeEnabled] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState(null);

  const currentParticipant = useMemo(
    () => users.find(user => Number(user.id) === Number(currentUser?.id)) || null,
    [currentUser?.id, users]
  );
  const canUsePersonalFilter = !isGuest && Boolean(currentParticipant);
  const filterUsers = useMemo(
    () => canUsePersonalFilter
      ? users.filter(user => Number(user.id) !== Number(currentParticipant.id))
      : users,
    [canUsePersonalFilter, currentParticipant, users]
  );
  const filterUserIds = useMemo(
    () => filterUsers.map(user => Number(user.id)),
    [filterUsers]
  );
  const filterUserIdsKey = filterUserIds.join(',');
  const personalMode = canUsePersonalFilter && personalModeEnabled;
  const userFilterEnabled = (
    Array.isArray(selectedUserIds)
    && selectedUserIds.length < filterUserIds.length
    && (personalMode || selectedUserIds.length > 0)
  );
  const activeScope = personalMode
    ? 'personal'
    : userFilterEnabled
      ? 'selected'
      : 'all';
  const filterStorageKey = (
    `watchedStatsUsers:${currentUser?.id ?? (isGuest ? 'guest' : 'anonymous')}`
  );
  const personalStorageKey = currentUser?.id
    ? `watchedStatsScope:${currentUser.id}`
    : '';
  const selectedUserIdSet = useMemo(
    () => new Set(userFilterEnabled ? selectedUserIds : filterUserIds),
    [filterUserIds, selectedUserIds, userFilterEnabled]
  );
  const groupVisibleUsers = useMemo(() => {
    if (!userFilterEnabled) return users;
    return users.filter(user => (
      Number(user.id) === Number(currentParticipant?.id)
      || selectedUserIdSet.has(Number(user.id))
    ));
  }, [currentParticipant, selectedUserIdSet, userFilterEnabled, users]);
  const visibleUsers = useMemo(
    () => personalMode ? [currentParticipant] : groupVisibleUsers,
    [currentParticipant, groupVisibleUsers, personalMode]
  );
  const selectedComparisonUserIds = useMemo(
    () => filterUsers
      .filter(user => selectedUserIdSet.has(Number(user.id)))
      .map(user => Number(user.id)),
    [filterUsers, selectedUserIdSet]
  );
  const selectedStatsUserIds = useMemo(
    () => personalMode
      ? selectedComparisonUserIds
      : groupVisibleUsers.map(user => Number(user.id)),
    [groupVisibleUsers, personalMode, selectedComparisonUserIds]
  );
  const personalComparisonScope = (
    personalMode && userFilterEnabled ? 'selected' : 'all'
  );

  useEffect(() => {
    if (filterUserIds.length === 0) {
      setSelectedUserIds(null);
      return;
    }
    let storedIds = null;
    const storedValue = localStorage.getItem(filterStorageKey);
    if (storedValue !== null) {
      try {
        const stored = JSON.parse(storedValue);
        if (Array.isArray(stored)) {
          const allowedIds = new Set(filterUserIds);
          storedIds = stored
            .map(Number)
            .filter((id, index, values) => (
              allowedIds.has(id) && values.indexOf(id) === index
            ));
        }
      } catch {
        storedIds = null;
      }
    }
    setSelectedUserIds(
      Array.isArray(storedIds) && storedIds.length < filterUserIds.length
        ? storedIds
        : null
    );
  }, [filterStorageKey, filterUserIdsKey]);

  useEffect(() => {
    if (!canUsePersonalFilter || !personalStorageKey) {
      setPersonalModeEnabled(false);
      return;
    }
    setPersonalModeEnabled(
      localStorage.getItem(personalStorageKey) === 'personal'
    );
  }, [canUsePersonalFilter, personalStorageKey]);

  const scopedMovies = useMemo(() => {
    if (activeScope === 'all') return movies;
    return movies.flatMap(movie => {
      const scopedMovie = withScopedAverage(movie, visibleUsers);
      return scopedMovie ? [scopedMovie] : [];
    });
  }, [activeScope, movies, visibleUsers]);

  const saveSelectedUsers = nextIds => {
    const normalized = nextIds.length === filterUserIds.length ? null : nextIds;
    setSelectedUserIds(normalized);
    if (normalized) {
      localStorage.setItem(filterStorageKey, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(filterStorageKey);
    }
    onScopeChange();
  };

  const toggleUserFilter = userId => {
    const id = Number(userId);
    const currentIds = userFilterEnabled ? selectedUserIds : filterUserIds;
    if (!personalMode && currentIds.includes(id) && currentIds.length === 1) {
      showToast('Оставьте хотя бы одного участника для сравнения', 'info');
      return;
    }
    const nextIds = currentIds.includes(id)
      ? currentIds.filter(item => item !== id)
      : filterUserIds.filter(item => currentIds.includes(item) || item === id);
    saveSelectedUsers(nextIds);
    if (personalStorageKey) {
      localStorage.setItem(
        personalStorageKey,
        personalMode
          ? 'personal'
          : nextIds.length === filterUserIds.length
            ? 'all'
            : 'selected'
      );
    }
  };

  const showAllUsers = () => {
    saveSelectedUsers(filterUserIds);
    if (personalStorageKey) {
      localStorage.setItem(personalStorageKey, personalMode ? 'personal' : 'all');
    }
  };

  const togglePersonalFilter = () => {
    if (!canUsePersonalFilter) return;
    const nextPersonalMode = !personalMode;
    const resetEmptySelection = (
      !nextPersonalMode
      && Array.isArray(selectedUserIds)
      && selectedUserIds.length === 0
    );
    setPersonalModeEnabled(nextPersonalMode);
    if (resetEmptySelection) {
      saveSelectedUsers(filterUserIds);
    }
    if (personalStorageKey) {
      localStorage.setItem(
        personalStorageKey,
        nextPersonalMode
          ? 'personal'
          : resetEmptySelection
            ? 'all'
            : userFilterEnabled
              ? 'selected'
              : 'all'
      );
    }
    onScopeChange();
  };

  return {
    activeScope,
    canUsePersonalFilter,
    currentParticipant,
    filterUsers,
    groupVisibleUsers,
    personalComparisonScope,
    personalMode,
    scopedMovies,
    selectedComparisonUserIds,
    selectedStatsUserIds,
    selectedUserIdSet,
    showAllUsers,
    togglePersonalFilter,
    toggleUserFilter,
    userFilterEnabled,
    visibleUsers,
  };
}
