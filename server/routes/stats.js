'use strict';

function registerStatsRoutes(context) {
  const {
    CORE_STATS_USER_IDS,
    app,
    parseIntStrict,
    stmts,
  } = context;

function roundRating(value, digits) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function serializeRatingPair(pair) {
  if (!pair) return null;
  return {
    first_user: pair.first_user,
    second_user: pair.second_user,
    common_movies: pair.common_movies,
    average_difference: roundRating(pair.raw_difference, 2),
  };
}

function serializeRatingDifferenceSummary(ratingPairs) {
  const comparisonsCount = ratingPairs.reduce(
    (total, pair) => total + pair.common_movies,
    0
  );
  if (comparisonsCount === 0) return null;

  const userNames = [];
  ratingPairs.forEach(pair => {
    [pair.first_user, pair.second_user].forEach(name => {
      if (!userNames.includes(name)) userNames.push(name);
    });
  });

  const differenceTotal = ratingPairs.reduce(
    (total, pair) => total + pair.raw_difference * pair.common_movies,
    0
  );
  return {
    average_difference: roundRating(differenceTotal / comparisonsCount, 2),
    comparisons_count: comparisonsCount,
    compared_users: userNames.length,
    user_names: userNames,
  };
}

function buildGroupStats(groupUsers, scope = 'selected') {
  const watchedMovies = stmts.getWatched.all();
  const ratedMovies = watchedMovies.flatMap(movie => {
    const ratings = groupUsers
      .map(user => movie[`rating_${user.id}`])
      .filter(rating => rating !== null && rating !== undefined);
    if (ratings.length === 0) return [];
    return [{
      id: movie.id,
      title: movie.title,
      ratings_count: ratings.length,
      raw_average: ratings.reduce((sum, rating) => sum + Number(rating), 0) / ratings.length,
    }];
  });

  const topRated = [...ratedMovies].sort((first, second) => (
    second.raw_average - first.raw_average
    || second.ratings_count - first.ratings_count
    || first.id - second.id
  ))[0] || null;
  const lowestRated = [...ratedMovies].sort((first, second) => (
    first.raw_average - second.raw_average
    || second.ratings_count - first.ratings_count
    || first.id - second.id
  ))[0] || null;

  const perUserAvg = groupUsers.map(user => {
    const ratings = watchedMovies
      .map(movie => movie[`rating_${user.id}`])
      .filter(rating => rating !== null && rating !== undefined);
    return {
      name: user.name,
      avg_rating: ratings.length
        ? roundRating(ratings.reduce((sum, rating) => sum + Number(rating), 0) / ratings.length, 1)
        : null,
    };
  });

  const ratingPairs = [];
  for (let firstIndex = 0; firstIndex < groupUsers.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < groupUsers.length; secondIndex++) {
      const firstUser = groupUsers[firstIndex];
      const secondUser = groupUsers[secondIndex];
      const differences = watchedMovies.flatMap(movie => {
        const firstRating = movie[`rating_${firstUser.id}`];
        const secondRating = movie[`rating_${secondUser.id}`];
        if (
          firstRating === null || firstRating === undefined
          || secondRating === null || secondRating === undefined
        ) {
          return [];
        }
        return [Math.abs(Number(firstRating) - Number(secondRating))];
      });
      if (differences.length === 0) continue;
      ratingPairs.push({
        first_user: firstUser.name,
        second_user: secondUser.name,
        common_movies: differences.length,
        raw_difference: differences.reduce((sum, difference) => sum + difference, 0) / differences.length,
        order: ratingPairs.length,
      });
    }
  }

  const closestRatingPair = [...ratingPairs].sort((first, second) => (
    first.raw_difference - second.raw_difference
    || second.common_movies - first.common_movies
    || first.order - second.order
  ))[0] || null;
  const furthestRatingPair = [...ratingPairs].sort((first, second) => (
    second.raw_difference - first.raw_difference
    || second.common_movies - first.common_movies
    || first.order - second.order
  ))[0] || null;

  return {
    scope,
    selected_user_ids: groupUsers.map(user => Number(user.id)),
    total_watched: ratedMovies.length,
    top_rated: topRated ? {
      title: topRated.title,
      avg_rating: roundRating(topRated.raw_average, 1),
    } : null,
    lowest_rated: lowestRated ? {
      title: lowestRated.title,
      avg_rating: roundRating(lowestRated.raw_average, 1),
    } : null,
    per_user_avg: perUserAvg,
    closest_rating_pair: serializeRatingPair(closestRatingPair),
    furthest_rating_pair: serializeRatingPair(furthestRatingPair),
    rating_difference_summary: serializeRatingDifferenceSummary(ratingPairs),
  };
}

function buildCoreStats(coreUsers) {
  return buildGroupStats(coreUsers, 'core');
}

function buildPersonalStats(currentUser, comparisonScope = 'all', selectedComparisonUserIds = []) {
  const watchedMovies = stmts.getWatched.all();
  const ratingKey = `rating_${currentUser.id}`;
  const ratedMovies = watchedMovies.flatMap(movie => {
    const rating = movie[ratingKey];
    if (rating === null || rating === undefined) return [];
    return [{
      id: movie.id,
      title: movie.title,
      raw_average: Number(rating),
    }];
  });

  const highestRating = ratedMovies.length
    ? Math.max(...ratedMovies.map(movie => movie.raw_average))
    : null;
  const lowestRating = ratedMovies.length
    ? Math.min(...ratedMovies.map(movie => movie.raw_average))
    : null;
  const personalExtremesAreEqual = ratedMovies.length > 0 && highestRating === lowestRating;
  const topRatedMovies = ratedMovies
    .filter(movie => movie.raw_average === highestRating)
    .sort((first, second) => first.id - second.id);
  const lowestRatedMovies = ratedMovies
    .filter(movie => !personalExtremesAreEqual && movie.raw_average === lowestRating)
    .sort((first, second) => first.id - second.id);
  const topRated = topRatedMovies[0] || null;
  const lowestRated = lowestRatedMovies[0] || null;
  const personalAverage = ratedMovies.length
    ? ratedMovies.reduce((sum, movie) => sum + movie.raw_average, 0) / ratedMovies.length
    : null;

  const selectedComparisonUserIdSet = new Set(selectedComparisonUserIds.map(Number));
  const allComparisonUsers = stmts.getUsers.all()
    .filter(user => Number(user.id) !== Number(currentUser.id));
  const comparisonUsers = allComparisonUsers
    .filter(user => (
      comparisonScope === 'selected'
        ? selectedComparisonUserIdSet.has(Number(user.id))
        : comparisonScope !== 'core' || CORE_STATS_USER_IDS.includes(Number(user.id))
    ));
  const buildRatingPairs = comparisonUsersList => comparisonUsersList.flatMap((otherUser, order) => {
    const differences = watchedMovies.flatMap(movie => {
      const currentRating = movie[ratingKey];
      const otherRating = movie[`rating_${otherUser.id}`];
      if (
        currentRating === null || currentRating === undefined
        || otherRating === null || otherRating === undefined
      ) {
        return [];
      }
      return [Math.abs(Number(currentRating) - Number(otherRating))];
    });
    if (differences.length === 0) return [];
    return [{
      first_user: currentUser.name,
      second_user: otherUser.name,
      common_movies: differences.length,
      raw_difference: differences.reduce((sum, difference) => sum + difference, 0) / differences.length,
      order,
    }];
  });
  const ratingPairs = buildRatingPairs(comparisonUsers);
  const summaryRatingPairs = (
    comparisonScope === 'selected' && selectedComparisonUserIds.length === 0
      ? buildRatingPairs(allComparisonUsers)
      : ratingPairs
  );

  const closestRatingPair = [...ratingPairs].sort((first, second) => (
    first.raw_difference - second.raw_difference
    || second.common_movies - first.common_movies
    || first.order - second.order
  ))[0] || null;
  const furthestRatingPair = [...ratingPairs].sort((first, second) => (
    second.raw_difference - first.raw_difference
    || second.common_movies - first.common_movies
    || first.order - second.order
  ))[0] || null;

  return {
    scope: 'personal',
    comparison_scope: comparisonScope,
    comparison_user_ids: comparisonUsers.map(user => Number(user.id)),
    subject_name: currentUser.name,
    total_watched: ratedMovies.length,
    personal_extremes_equal: personalExtremesAreEqual,
    top_rated: topRated ? {
      id: topRated.id,
      title: topRated.title,
      avg_rating: roundRating(topRated.raw_average, 1),
    } : null,
    top_rated_movies: topRatedMovies.map(movie => ({
      id: movie.id,
      title: movie.title,
      avg_rating: roundRating(movie.raw_average, 1),
    })),
    lowest_rated: lowestRated ? {
      id: lowestRated.id,
      title: lowestRated.title,
      avg_rating: roundRating(lowestRated.raw_average, 1),
    } : null,
    lowest_rated_movies: lowestRatedMovies.map(movie => ({
      id: movie.id,
      title: movie.title,
      avg_rating: roundRating(movie.raw_average, 1),
    })),
    per_user_avg: [{
      name: currentUser.name,
      avg_rating: roundRating(personalAverage, 1),
    }],
    closest_rating_pair: serializeRatingPair(closestRatingPair),
    furthest_rating_pair: serializeRatingPair(furthestRatingPair),
    rating_difference_summary: serializeRatingDifferenceSummary(summaryRatingPairs),
  };
}

app.get('/api/stats', (req, res) => {
  const scope = req.query.scope || 'all';
  if (!['all', 'core', 'personal', 'selected'].includes(scope)) {
    return res.status(400).json({ error: 'Неизвестный режим статистики' });
  }
  if (scope === 'selected') {
    const rawIds = String(req.query.user_ids || '');
    const selectedIds = rawIds
      .split(',')
      .filter(Boolean)
      .map(parseIntStrict);
    if (
      selectedIds.length === 0
      || selectedIds.some(id => isNaN(id))
      || new Set(selectedIds).size !== selectedIds.length
    ) {
      return res.status(400).json({ error: 'Выберите хотя бы одного участника' });
    }
    const selectedIdSet = new Set(selectedIds);
    const selectedUsers = stmts.getUsers.all()
      .filter(user => selectedIdSet.has(Number(user.id)));
    if (selectedUsers.length !== selectedIds.length) {
      return res.status(400).json({ error: 'Неизвестный участник статистики' });
    }
    return res.json(buildGroupStats(selectedUsers, 'selected'));
  }
  if (scope === 'personal') {
    const comparisonScope = req.query.comparison_scope || 'all';
    if (!['all', 'core', 'selected'].includes(comparisonScope)) {
      return res.status(400).json({ error: 'Неизвестный круг сравнения' });
    }
    const currentUser = stmts.getUsers.all()
      .find(user => Number(user.id) === Number(req.tokenData.userId));
    if (!currentUser) {
      return res.status(403).json({ error: 'Требуется вход участника' });
    }
    let selectedComparisonUserIds = [];
    if (comparisonScope === 'selected') {
      selectedComparisonUserIds = String(req.query.user_ids || '')
        .split(',')
        .filter(Boolean)
        .map(parseIntStrict);
      if (
        selectedComparisonUserIds.some(id => isNaN(id))
        || new Set(selectedComparisonUserIds).size !== selectedComparisonUserIds.length
      ) {
        return res.status(400).json({ error: 'Некорректный список участников для сравнения' });
      }
      if (selectedComparisonUserIds.includes(Number(currentUser.id))) {
        return res.status(400).json({ error: 'Для сравнения можно выбирать только других участников' });
      }
      const selectedComparisonUserIdSet = new Set(selectedComparisonUserIds);
      const selectedComparisonUsers = stmts.getUsers.all()
        .filter(user => selectedComparisonUserIdSet.has(Number(user.id)));
      if (selectedComparisonUsers.length !== selectedComparisonUserIds.length) {
        return res.status(400).json({ error: 'Неизвестный участник сравнения' });
      }
    }
    res.set('Cache-Control', 'private, no-store');
    res.vary('Authorization');
    return res.json(buildPersonalStats(
      currentUser,
      comparisonScope,
      selectedComparisonUserIds
    ));
  }
  if (scope === 'core') {
    const usersById = new Map(stmts.getUsers.all().map(user => [Number(user.id), user]));
    const coreUsers = CORE_STATS_USER_IDS.map(id => usersById.get(id)).filter(Boolean);
    if (coreUsers.length !== CORE_STATS_USER_IDS.length) {
      return res.status(503).json({ error: 'Не удалось собрать основной состав' });
    }
    return res.json(buildCoreStats(coreUsers));
  }

  const ratingPairs = stmts.ratingPairs.all();
  const closestRatingPair = [...ratingPairs].sort((first, second) => (
    first.average_difference - second.average_difference
    || second.common_movies - first.common_movies
    || first.first_user.localeCompare(second.first_user, 'ru')
    || first.second_user.localeCompare(second.second_user, 'ru')
  ))[0] || null;
  const furthestRatingPair = [...ratingPairs].sort((first, second) => (
    second.average_difference - first.average_difference
    || second.common_movies - first.common_movies
    || first.first_user.localeCompare(second.first_user, 'ru')
    || first.second_user.localeCompare(second.second_user, 'ru')
  ))[0] || null;

  res.json({
    scope: 'all',
    total_watched: stmts.totalWatched.get().count,
    top_rated: stmts.topRated.get() || null,
    lowest_rated: stmts.lowestRated.get() || null,
    per_user_avg: stmts.perUserAvg.all(),
    closest_rating_pair: closestRatingPair,
    furthest_rating_pair: furthestRatingPair,
  });
});

}

module.exports = { registerStatsRoutes };
