// ========== ТОЧКА ВХОДА ==========
import { state } from './state.js';
import { fetchUsers, fetchSettings } from './api.js';
import { loadTheme } from './theme.js';
import { setupSocketListeners } from './socket.js';
import { setupEventListeners } from './events.js';
import { renderAuthPage, completeLogin } from './auth.js';

loadTheme();

async function init() {
  try {
    state.users = await fetchUsers();
  } catch (err) {
    console.error('Ошибка загрузки пользователей:', err);
  }
  try {
    const settings = await fetchSettings();
    state.spinDuration = settings.spin_duration || 5;
    document.getElementById('spin-duration-input').value = state.spinDuration;
  } catch (err) {
    console.error('Ошибка загрузки настроек:', err);
  }
  setupEventListeners();
  setupSocketListeners();

  const savedSession = localStorage.getItem('cheeseWheelSession');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (session.isGuest) {
        state.isGuest = true;
        state.currentUser = null;
        completeLogin();
        return;
      } else if (session.userId) {
        state.currentUser = state.users.find(u => u.id === session.userId);
        if (state.currentUser) {
          state.isGuest = false;
          completeLogin();
          return;
        }
      }
    } catch (e) {
      localStorage.removeItem('cheeseWheelSession');
    }
  }

  renderAuthPage();
}

init();
