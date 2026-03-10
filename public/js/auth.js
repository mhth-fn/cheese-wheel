// ========== АВТОРИЗАЦИЯ ==========
import { state } from './state.js';
import { postAuth } from './api.js';
import { renderNav } from './nav.js';
import { showPage, PAGE_PATHS, PATH_TO_PAGE } from './router.js';
import { loadWheelMovies } from './wheel.js';
import { hideAdminModal } from './theme.js';

export function renderAuthPage() {
  const container = document.getElementById('auth-users');
  container.innerHTML = state.users.map(user => `
    <button class="auth-btn" data-user-id="${user.id}">${user.name}</button>
  `).join('');

  state.selectedUserId = null;
  document.getElementById('auth-password-container').style.display = 'none';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-error').textContent = '';
  document.querySelectorAll('.auth-btn').forEach(btn => btn.classList.remove('selected'));
}

export function selectUser(userId) {
  state.selectedUserId = userId;
  document.querySelectorAll('.auth-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.userId === userId.toString());
  });
  document.getElementById('auth-password-container').style.display = 'flex';
  document.getElementById('auth-password').focus();
  document.getElementById('auth-error').textContent = '';
}

export async function attemptLogin() {
  const password = document.getElementById('auth-password').value;

  try {
    const res = await postAuth(parseInt(state.selectedUserId), password);

    if (res.ok) {
      state.currentUser = state.users.find(u => u.id === parseInt(state.selectedUserId));
      state.isGuest = false;
      completeLogin();
    } else {
      document.getElementById('auth-error').textContent = 'Неверный пароль';
      document.getElementById('auth-password').value = '';
    }
  } catch (err) {
    document.getElementById('auth-error').textContent = 'Ошибка соединения';
  }
}

export function loginAsGuest() {
  state.currentUser = null;
  state.isGuest = true;
  completeLogin();
}

export function completeLogin() {
  const session = state.isGuest
    ? { isGuest: true }
    : { userId: state.currentUser.id };
  localStorage.setItem('cheeseWheelSession', JSON.stringify(session));

  const page = PATH_TO_PAGE[location.pathname] || 'wheel';
  renderNav(page);
  showPage(page, false);
  history.replaceState({ page }, '', PAGE_PATHS[page] || '/');
  if (page === 'wheel') loadWheelMovies();
  updateUIForRole();
}

export function updateUIForRole() {
  document.querySelectorAll('.guest-hidden').forEach(el => {
    el.style.display = state.isGuest ? 'none' : '';
  });

  document.getElementById('spin-btn').disabled = state.isGuest;
  document.getElementById('spin-btn').title = state.isGuest ? 'Только для участников' : '';

  const adminBtn = document.getElementById('admin-btn');
  if (state.currentUser && state.currentUser.id === 2) {
    adminBtn.classList.add('visible');
  } else {
    adminBtn.classList.remove('visible');
  }
}

export function logout() {
  localStorage.removeItem('cheeseWheelSession');
  state.currentUser = null;
  state.isGuest = false;
  state.selectedUserId = null;
  document.getElementById('admin-btn').classList.remove('visible');
  hideAdminModal();
  renderAuthPage();
  showPage('auth', false);
  history.replaceState(null, '', '/');
}
