// ========== ТЕМА И УКРАШЕНИЯ ==========
import { fetchTheme, postTheme } from './api.js';
import { state } from './state.js';

function createSnowflakes() {
  const container = document.getElementById('snowflakes');
  if (!container || container.children.length > 0) return;

  const snowflakes = ['❄', '❅', '❆', '✻', '✼', '❉', '∗'];

  for (let i = 0; i < 50; i++) {
    const snowflake = document.createElement('div');
    snowflake.className = 'snowflake';
    snowflake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
    snowflake.style.left = Math.random() * 100 + '%';
    snowflake.style.fontSize = (Math.random() * 1 + 0.5) + 'rem';
    snowflake.style.animationDuration = (Math.random() * 5 + 5) + 's';
    snowflake.style.animationDelay = (Math.random() * 10) + 's';
    snowflake.style.opacity = Math.random() * 0.5 + 0.5;
    container.appendChild(snowflake);
  }
}

function createGarland() {
  const container = document.getElementById('garland-lights');
  if (!container || container.children.length > 0) return;

  for (let i = 0; i < 40; i++) {
    const light = document.createElement('div');
    light.className = 'light';
    light.style.left = Math.random() * 100 + '%';
    light.style.top = Math.random() * 100 + '%';
    light.style.animationDelay = (Math.random() * 2) + 's';
    container.appendChild(light);
  }
}

function createPetals() {
  const container = document.getElementById('petals');
  if (!container || container.children.length > 0) return;

  const petals = ['🌸', '🌺', '🌷', '🌼', '💮', '✿', '❀'];

  for (let i = 0; i < 40; i++) {
    const petal = document.createElement('div');
    petal.className = 'petal';
    petal.textContent = petals[Math.floor(Math.random() * petals.length)];
    petal.style.left = Math.random() * 100 + '%';
    petal.style.fontSize = (Math.random() * 0.8 + 0.8) + 'rem';
    petal.style.animationDuration = (Math.random() * 8 + 7) + 's';
    petal.style.animationDelay = (Math.random() * 12) + 's';
    petal.style.opacity = Math.random() * 0.4 + 0.4;
    container.appendChild(petal);
  }
}

export async function loadTheme() {
  try {
    const data = await fetchTheme();
    applyTheme(data.theme);
  } catch (err) {
    console.error('Ошибка загрузки темы:', err);
  }
}

export function applyTheme(theme) {
  state.currentTheme = theme;
  document.body.classList.remove('theme-cheese', 'theme-newyear', 'theme-spring');

  if (theme === 'newyear') {
    document.body.classList.add('theme-newyear');
    createSnowflakes();
    createGarland();
  } else if (theme === 'spring') {
    document.body.classList.add('theme-spring');
    createPetals();
  }

  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });
}

export async function setTheme(theme) {
  try {
    await postTheme(theme);
    applyTheme(theme);
  } catch (err) {
    console.error('Ошибка установки темы:', err);
  }
}

export function showAdminModal() {
  document.getElementById('admin-modal').classList.add('active');
}

export function hideAdminModal() {
  document.getElementById('admin-modal').classList.remove('active');
}
