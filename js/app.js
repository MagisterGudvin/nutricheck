/**
 * app.js — Роутинг и инициализация SPA
 */

const App = (() => {

  async function init() {
    await Database.init();

    const session = Auth.getSession();
    if (!session) {
      UI.renderAuth();
    } else {
      enterApp();
    }
  }

  function onLogin() {
    enterApp();
    navigate();
  }

  function enterApp() {
    UI.renderApp();
    window.addEventListener('hashchange', navigate);
    navigate();
  }

  function navigate() {
    const hash = location.hash.slice(1) || '';
    const parts = hash.split('/');
    const page = parts[0];

    const session = Auth.getSession();
    if (!session) {
      UI.renderAuth();
      return;
    }

    // Роутинг
    if (Auth.isStudent()) {
      switch (page) {
        case 'diary':
          UI.renderPage('diary');
          break;
        case 'week-diary':
          UI.renderPage('week-diary');
          break;
        case 'report':
          UI.renderPage('report', { date: parts[1] || null });
          break;
        case 'week-report':
          UI.renderPage('week-report', { weekStart: parts[1] || null });
          break;
        case 'week':
          UI.renderPage('week');
          break;
        case 'norms':
          UI.renderPage('norms');
          break;
        case 'settings':
          UI.renderPage('settings');
          break;
        default:
          UI.renderPage('diary');
      }
    } else if (Auth.isTeacher()) {
      switch (page) {
        case 'students':
          UI.renderPage('students');
          break;
        case 'student':
          UI.renderPage('student-detail', { studentId: parts[1] });
          break;
        case 'report':
          // teacher viewing student report: #report/studentId/date
          UI.renderPage('report', { studentId: parts[1], date: parts[2] });
          break;
        case 'week-report':
          UI.renderPage('week-report', { studentId: parts[1], weekStart: parts[2] });
          break;
        case 'products':
          UI.renderPage('products');
          break;
        case 'books':
          UI.renderPage('books');
          break;
        case 'export':
          UI.renderPage('export');
          break;
        default:
          UI.renderPage('students');
      }
    }
  }

  return { init, onLogin };
})();

// Start
document.addEventListener('DOMContentLoaded', () => App.init());
