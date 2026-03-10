// ========== СОСТОЯНИЕ ==========
export const state = {
  currentUser: null,
  isGuest: false,
  selectedUserId: null,
  users: [],
  wheelMovies: [],
  watchedMovies: [],
  sortColumn: 'avg_rating',
  sortDirection: 'desc',
  pendingWinner: null,
  spinDuration: 5,
  isSpinning: false,
  searchQuery: '',
  wheelRotation: 0,
  wheelAnimId: null,
};
