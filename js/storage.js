/**
 * storage.js — Чтение/запись данных через Cloudflare Worker → GitHub API
 *
 * Файлы данных в репозитории:
 *   data/config.json             — настройки (proxy_url и т.д.)
 *   data/users.json              — пользователи
 *   data/reports.json            — отчёты { [studentId]: [...reports] }
 *   data/comments.json           — комментарии { "studentId_date": "text" }
 *   data/products_override.json  — правки базы продуктов преподавателем
 *
 * Логика:
 *   - При загрузке: читаем файлы через Worker (GET /data/...)
 *   - При изменении: пишем через Worker (PUT /data/...) → коммит в репо
 *   - Кеш в памяти, чтобы не дёргать GitHub на каждый чих
 *   - config.json читается также напрямую (fetch) при первом запуске,
 *     когда Worker URL ещё не известен
 */

const Storage = (() => {
  const cache = {
    config: null,
    users: null,
    reports: null,
    comments: null,
    productsOverride: undefined, // undefined = не загружен, null = нет правок
  };

  const shas = {};

  function getWorkerUrl() {
    return cache.config?.proxy_url || '';
  }

  // ===== Общие методы чтения/записи =====

  async function readFile(name) {
    const url = getWorkerUrl();
    if (!url) throw new Error('URL Worker не настроен');

    const res = await fetch(`${url}/data/${name}.json`);
    if (!res.ok) throw new Error(`Ошибка чтения ${name}: ${res.status}`);

    const json = await res.json();
    if (json && json.sha) shas[name] = json.sha;
    return json?.data ?? null;
  }

  async function writeFile(name, data, message) {
    const url = getWorkerUrl();
    if (!url) throw new Error('URL Worker не настроен');

    const res = await fetch(`${url}/data/${name}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data,
        message: message || `Update ${name}.json`,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Ошибка записи ${name}: ${res.status}`);
    }

    const result = await res.json();
    if (result.sha) shas[name] = result.sha;
    return result;
  }

  // ===== Config: читается сначала напрямую из статики =====

  async function loadConfig() {
    try {
      const res = await fetch('data/config.json');
      if (res.ok) {
        cache.config = await res.json();
      }
    } catch (e) {
      console.warn('Не удалось загрузить config.json:', e.message);
    }
    if (!cache.config) {
      cache.config = { proxy_url: '' };
    }
  }

  function getConfig() {
    return cache.config || { proxy_url: '' };
  }

  async function saveConfig(config) {
    cache.config = config;
    await writeFile('config', config, 'Update config');
  }

  // ===== Инициализация: загрузка всех данных =====

  async function init() {
    // Сначала загрузим конфиг из статики (чтобы узнать proxy_url)
    await loadConfig();

    if (!getWorkerUrl()) {
      console.warn('Storage: proxy_url не задан, данные не загружены');
      cache.users = [];
      cache.reports = {};
      cache.comments = {};
      cache.productsOverride = null;
      return;
    }

    try {
      const [users, reports, comments, productsOverride] = await Promise.all([
        readFile('users').catch(() => []),
        readFile('reports').catch(() => ({})),
        readFile('comments').catch(() => ({})),
        readFile('products_override').catch(() => null),
      ]);
      cache.users = users || [];
      cache.reports = reports || {};
      cache.comments = comments || {};
      cache.productsOverride = productsOverride; // null = нет правок
    } catch (e) {
      console.warn('Storage init fallback to empty:', e.message);
      cache.users = [];
      cache.reports = {};
      cache.comments = {};
      cache.productsOverride = null;
    }
  }

  // ===== Users =====

  function getUsers() {
    return cache.users || [];
  }

  async function saveUsers(users) {
    cache.users = users;
    await writeFile('users', users, 'Update users');
  }

  // ===== Reports =====

  function getReports() {
    return cache.reports || {};
  }

  async function saveReports(reports) {
    cache.reports = reports;
    await writeFile('reports', reports, 'Update reports');
  }

  // ===== Comments =====

  function getComments() {
    return cache.comments || {};
  }

  async function saveComments(comments) {
    cache.comments = comments;
    await writeFile('comments', comments, 'Update comments');
  }

  // ===== Products Override =====

  function getProductsOverride() {
    return cache.productsOverride; // null = нет правок
  }

  async function saveProductsOverride(products) {
    cache.productsOverride = products;
    await writeFile('products_override', products, 'Update products override');
  }

  async function resetProductsOverride() {
    cache.productsOverride = null;
    await writeFile('products_override', null, 'Reset products override');
  }

  // ===== Проверка =====

  function isLoaded() {
    return cache.users !== null;
  }

  return {
    init, loadConfig,
    getConfig, saveConfig, getWorkerUrl,
    getUsers, saveUsers,
    getReports, saveReports,
    getComments, saveComments,
    getProductsOverride, saveProductsOverride, resetProductsOverride,
    isLoaded,
  };
})();
