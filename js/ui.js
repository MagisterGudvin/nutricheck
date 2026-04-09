/**
 * ui.js — Отрисовка интерфейса
 */

const UI = (() => {
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => (ctx || document).querySelectorAll(sel);

  function show(el) { el && el.classList.remove('hidden'); }
  function hide(el) { el && el.classList.add('hidden'); }

  function toast(message, type) {
    const container = $('.toast-container');
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'success');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function showLoading(text) {
    const el = $('#loading-overlay');
    $('#loading-text').textContent = text || 'Загрузка...';
    show(el);
  }

  function hideLoading() {
    hide($('#loading-overlay'));
  }

  // ===== Auth screens =====

  function renderAuth() {
    hide($('.app-layout'));
    show($('.auth-container'));
    const loginForm = $('#login-form');
    const regForm = $('#register-form');
    show(loginForm);
    hide(regForm);

    // Tabs
    $$('.auth-tab').forEach(tab => {
      tab.onclick = () => {
        $$('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.tab === 'login') { show(loginForm); hide(regForm); }
        else { hide(loginForm); show(regForm); }
        hideAuthError();
      };
    });

    // Login
    $('#btn-login').onclick = () => {
      const login = $('#login-username').value.trim();
      const password = $('#login-password').value.trim();
      if (!login || !password) {
        showAuthError('Введите логин и пароль');
        return;
      }
      const result = Auth.login(login, password);
      if (result.ok) {
        hideAuthError();
        App.onLogin();
      } else {
        showAuthError(result.error);
      }
    };

    // Register
    $('#btn-register').onclick = async () => {
      const name = $('#reg-name').value.trim();
      const login = $('#reg-username').value.trim();
      const password = $('#reg-password').value.trim();
      showLoading('Регистрация...');
      try {
        const result = await Auth.register(name, login, password);
        hideLoading();
        if (result.ok) {
          hideAuthError();
          App.onLogin();
        } else {
          showAuthError(result.error);
        }
      } catch (e) {
        hideLoading();
        showAuthError('Ошибка сети: ' + e.message);
      }
    };
  }

  function showAuthError(msg) {
    const el = $('.auth-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideAuthError() {
    const el = $('.auth-error');
    el.style.display = 'none';
  }

  // ===== App layout =====

  function renderApp() {
    hide($('.auth-container'));
    show($('.app-layout'));

    const session = Auth.getSession();
    $('#user-display-name').textContent = session.name;
    $('#user-display-role').textContent = session.role === 'teacher' ? 'Преподаватель' : 'Студент';

    // Nav
    renderNav();

    // Sidebar toggle
    $('#hamburger-btn').onclick = () => {
      $('.sidebar').classList.toggle('open');
      $('.sidebar-overlay').classList.toggle('open');
    };
    $('.sidebar-overlay').onclick = () => {
      $('.sidebar').classList.remove('open');
      $('.sidebar-overlay').classList.remove('open');
    };

    // Logout
    $('#btn-logout').onclick = () => {
      Auth.logout();
      location.hash = '';
      location.reload();
    };
  }

  function renderNav() {
    const nav = $('#sidebar-nav');
    nav.innerHTML = '';

    if (Auth.isStudent()) {
      nav.innerHTML = `
        <a href="#diary" data-page="diary"><span class="nav-icon">&#9997;</span> Ввод за день</a>
        <a href="#week-diary" data-page="week-diary"><span class="nav-icon">&#128221;</span> Ввод за неделю</a>
        <a href="#report" data-page="report"><span class="nav-icon">&#128202;</span> Последний отчёт</a>
        <a href="#week" data-page="week"><span class="nav-icon">&#128197;</span> Сводка по дням</a>
        <a href="#norms" data-page="norms"><span class="nav-icon">&#9878;</span> Мои нормы</a>
      `;
    } else if (Auth.isTeacher()) {
      nav.innerHTML = `
        <a href="#students" data-page="students"><span class="nav-icon">&#128101;</span> Студенты</a>
        <a href="#products" data-page="products"><span class="nav-icon">&#128218;</span> База продуктов</a>
        <a href="#books" data-page="books"><span class="nav-icon">&#128214;</span> Книги</a>
        <a href="#export" data-page="export"><span class="nav-icon">&#128190;</span> Экспорт</a>
      `;
    }
  }

  function setActiveNav(page) {
    $$('.sidebar-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === page);
    });
  }

  // ===== Pages =====

  function renderPage(page, params) {
    const content = $('#page-content');
    setActiveNav(page);

    // Close sidebar on mobile
    $('.sidebar').classList.remove('open');
    $('.sidebar-overlay').classList.remove('open');

    switch (page) {
      case 'diary': renderDiary(content); break;
      case 'week-diary': renderWeekDiary(content); break;
      case 'report': renderReport(content, params); break;
      case 'week-report': renderWeekReport(content, params); break;
      case 'week': renderWeek(content); break;
      case 'students': renderStudents(content); break;
      case 'student-detail': renderStudentDetail(content, params); break;
      case 'products': renderProducts(content); break;
      case 'norms': renderNorms(content); break;
      case 'books': renderBooks(content); break;
      case 'export': renderExport(content); break;
      case 'settings': renderSettings(content); break;
      default:
        if (Auth.isStudent()) renderDiary(content);
        else renderStudents(content);
    }
  }

  // ===== Diary (student) =====

  function renderDiary(container) {
    const today = new Date().toISOString().slice(0, 10);
    container.innerHTML = `
      <div class="page-header">
        <h2>Ввод рациона</h2>
        <p>Опишите, что вы ели за день</p>
      </div>
      <div class="card">
        <div class="form-group">
          <label for="diary-date">Дата</label>
          <input type="date" id="diary-date" value="${today}" style="max-width:200px">
        </div>
      </div>
      <div class="meal-cards">
        <div class="meal-card">
          <h3>&#127749; Завтрак</h3>
          <textarea id="meal-breakfast" placeholder="Например: Овсянка 200г, банан, чай с сахаром"></textarea>
        </div>
        <div class="meal-card">
          <h3>&#9728;&#65039; Обед</h3>
          <textarea id="meal-lunch" placeholder="Например: Борщ 300мл, хлеб 2 куска, компот"></textarea>
        </div>
        <div class="meal-card">
          <h3>&#127769; Ужин</h3>
          <textarea id="meal-dinner" placeholder="Например: Куриная грудка 150г, рис 200г, салат"></textarea>
        </div>
      </div>
      <div style="margin-top:1.5rem; text-align:center;">
        <button class="btn btn-primary btn-analyze" id="btn-analyze">
          &#128269; Анализировать
        </button>
      </div>
    `;

    $('#btn-analyze').onclick = async () => {
      const breakfast = $('#meal-breakfast').value.trim();
      const lunch = $('#meal-lunch').value.trim();
      const dinner = $('#meal-dinner').value.trim();

      if (!breakfast && !lunch && !dinner) {
        toast('Введите хотя бы один приём пищи', 'error');
        return;
      }

      showLoading('Анализируем рацион...');

      try {
        const session = Auth.getSession();
        const result = await API.analyze(breakfast, lunch, dinner, session.id);
        const date = $('#diary-date').value;

        const report = {
          date,
          input: { breakfast, lunch, dinner },
          meals: result.meals,
          totals: result.totals,
          norms: result.norms,
          deficits: result.deficits || [],
          imbalances: result.imbalances || [],
          recommendations: result.recommendations || [],
          createdAt: new Date().toISOString()
        };

        showLoading('Сохраняем отчёт...');
        await Database.saveReport(session.id, report);
        hideLoading();
        toast('Анализ завершён!');
        location.hash = '#report/' + date;
      } catch (e) {
        hideLoading();
        toast('Ошибка: ' + e.message, 'error');
        console.error(e);
      }
    };
  }

  // ===== Week Diary (input for 7 days) =====

  function renderWeekDiary(container) {
    const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

    // Рассчитаем даты текущей недели (пн-вс)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=вс, 1=пн...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    const weekLabel = `${weekDates[0]} — ${weekDates[6]}`;

    container.innerHTML = `
      <div class="page-header">
        <h2>Ввод рациона за неделю</h2>
        <p>${weekLabel}</p>
      </div>

      <div class="week-diary-days">
        ${weekDates.map((date, i) => {
          const isToday = date === today.toISOString().slice(0, 10);
          return `
            <div class="card week-day-card ${isToday ? 'week-day-today' : ''}" data-date="${date}">
              <h3 class="card-title">${DAY_NAMES[i]}, ${date} ${isToday ? '<span class="badge badge-ok">Сегодня</span>' : ''}</h3>
              <div class="meal-cards" style="grid-template-columns:1fr;">
                <div class="form-group" style="margin-bottom:0.5rem;">
                  <label>Завтрак</label>
                  <textarea id="wd-b-${i}" placeholder="Что ели на завтрак?" rows="2"></textarea>
                </div>
                <div class="form-group" style="margin-bottom:0.5rem;">
                  <label>Обед</label>
                  <textarea id="wd-l-${i}" placeholder="Что ели на обед?" rows="2"></textarea>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label>Ужин</label>
                  <textarea id="wd-d-${i}" placeholder="Что ели на ужин?" rows="2"></textarea>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div style="margin-top:1.5rem; text-align:center;">
        <button class="btn btn-primary btn-analyze" id="btn-analyze-week">
          &#128269; Анализировать неделю
        </button>
      </div>
    `;

    $('#btn-analyze-week').onclick = async () => {
      // Собираем данные по дням (только заполненные)
      const days = [];
      for (let i = 0; i < 7; i++) {
        const b = $(`#wd-b-${i}`).value.trim();
        const l = $(`#wd-l-${i}`).value.trim();
        const d = $(`#wd-d-${i}`).value.trim();
        if (b || l || d) {
          days.push({ date: weekDates[i], breakfast: b, lunch: l, dinner: d });
        }
      }

      if (days.length === 0) {
        toast('Заполните хотя бы один день', 'error');
        return;
      }

      try {
        const session = Auth.getSession();
        const results = await API.analyzeWeek(days, session.id, (current, total, date) => {
          showLoading(`Анализ дня ${current} из ${total} (${date})...`);
        });

        showLoading('Сохраняем отчёты...');
        for (const { date, result } of results) {
          const day = days.find(d => d.date === date);
          const report = {
            date,
            input: { breakfast: day.breakfast, lunch: day.lunch, dinner: day.dinner },
            meals: result.meals,
            totals: result.totals,
            norms: result.norms,
            deficits: result.deficits || [],
            imbalances: result.imbalances || [],
            recommendations: result.recommendations || [],
            createdAt: new Date().toISOString()
          };
          await Database.saveReport(session.id, report);
        }

        hideLoading();
        toast(`Анализ завершён! Обработано дней: ${results.length}`);
        location.hash = '#week-report/' + weekDates[0];
      } catch (e) {
        hideLoading();
        toast('Ошибка: ' + e.message, 'error');
        console.error(e);
      }
    };
  }

  // ===== Week Report (combined for multiple days) =====

  function renderWeekReport(container, params) {
    const session = Auth.getSession();
    const studentId = params?.studentId || session.id;
    const allReports = Database.getReports(studentId);
    const norms = Database.getStudentNorms(studentId);

    // Если указана стартовая дата — берём 7 дней от неё, иначе последние 7
    let weekReports;
    if (params?.weekStart) {
      const start = params.weekStart;
      const endDate = new Date(start);
      endDate.setDate(endDate.getDate() + 6);
      const end = endDate.toISOString().slice(0, 10);
      weekReports = allReports.filter(r => r.date >= start && r.date <= end);
      weekReports.sort((a, b) => a.date.localeCompare(b.date));
    } else {
      weekReports = allReports.slice(0, 7);
    }

    if (weekReports.length === 0) {
      container.innerHTML = `
        <div class="page-header"><h2>Недельный отчёт</h2></div>
        <div class="empty-state">
          <div class="empty-icon">&#128196;</div>
          <p>Нет отчётов за эту неделю.</p>
        </div>
      `;
      return;
    }

    // Суммы и средние за неделю
    const totals = { calories: 0, protein: 0, fat: 0, carbs: 0, omega3: 0, omega6: 0 };
    const aminoTotals = {};
    for (const rep of weekReports) {
      if (!rep.totals) continue;
      totals.calories += rep.totals.calories || 0;
      totals.protein += rep.totals.protein || 0;
      totals.fat += rep.totals.fat || 0;
      totals.carbs += rep.totals.carbs || 0;
      totals.omega3 += rep.totals.omega3 || 0;
      totals.omega6 += rep.totals.omega6 || 0;
      if (rep.totals.amino_acids) {
        for (const [k, v] of Object.entries(rep.totals.amino_acids)) {
          aminoTotals[k] = (aminoTotals[k] || 0) + (v || 0);
        }
      }
    }
    const days = weekReports.length;
    const avg = {
      calories: Math.round(totals.calories / days),
      protein: Math.round(totals.protein / days * 10) / 10,
      fat: Math.round(totals.fat / days * 10) / 10,
      carbs: Math.round(totals.carbs / days * 10) / 10,
    };

    // Собираем все дефициты и рекомендации
    const allDeficits = new Set();
    const allImbalances = new Set();
    const allRecommendations = new Set();
    for (const rep of weekReports) {
      (rep.deficits || []).forEach(d => allDeficits.add(d));
      (rep.imbalances || []).forEach(d => allImbalances.add(d));
      (rep.recommendations || []).forEach(d => allRecommendations.add(d));
    }

    const dateRange = `${weekReports[0].date} — ${weekReports[weekReports.length - 1].date}`;
    const student = Auth.getStudentById(studentId);
    const studentName = student ? student.name : session.name;

    container.innerHTML = `
      <div class="page-header">
        <h2>Недельный отчёт</h2>
        <p>${studentName} &middot; ${dateRange} &middot; ${days} дн.</p>
      </div>

      <div class="week-summary">
        <div class="week-stat"><div class="stat-value">${avg.calories}</div><div class="stat-label">Ср. калории/день</div></div>
        <div class="week-stat"><div class="stat-value">${avg.protein}</div><div class="stat-label">Ср. белки (г)</div></div>
        <div class="week-stat"><div class="stat-value">${avg.fat}</div><div class="stat-label">Ср. жиры (г)</div></div>
        <div class="week-stat"><div class="stat-value">${avg.carbs}</div><div class="stat-label">Ср. углеводы (г)</div></div>
        <div class="week-stat"><div class="stat-value">${days}</div><div class="stat-label">Дней</div></div>
      </div>

      <!-- Таблица по дням -->
      <div class="report-section">
        <h3>Итоги по дням</h3>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Дата</th><th>Ккал</th><th>Белки</th><th>Жиры</th><th>Углеводы</th>
              <th>Омега-3</th><th>Омега-6</th><th>Статус</th>
            </tr></thead>
            <tbody>
              ${weekReports.map(rep => {
                const t = rep.totals || {};
                const st = Analysis.getOverallStatus(rep);
                return `<tr class="day-report-row" data-date="${rep.date}" style="cursor:pointer">
                  <td><strong>${rep.date}</strong></td>
                  <td>${r(t.calories)}</td>
                  <td>${r(t.protein)}</td>
                  <td>${r(t.fat)}</td>
                  <td>${r(t.carbs)}</td>
                  <td>${r(t.omega3)}</td>
                  <td>${r(t.omega6)}</td>
                  <td><span class="badge badge-${st}">${statusLabel(st)}</span></td>
                </tr>`;
              }).join('')}
              <tr class="row-total">
                <td>Сумма</td>
                <td>${r(totals.calories)}</td>
                <td>${r(totals.protein)}</td>
                <td>${r(totals.fat)}</td>
                <td>${r(totals.carbs)}</td>
                <td>${r(totals.omega3)}</td>
                <td>${r(totals.omega6)}</td>
                <td></td>
              </tr>
              <tr class="row-norm">
                <td>Среднее/день</td>
                <td>${avg.calories}</td>
                <td>${avg.protein}</td>
                <td>${avg.fat}</td>
                <td>${avg.carbs}</td>
                <td>${r(totals.omega3 / days)}</td>
                <td>${r(totals.omega6 / days)}</td>
                <td></td>
              </tr>
              <tr>
                <td>Норма/день</td>
                <td>${norms.calories}</td>
                <td>${norms.protein}</td>
                <td>${norms.fat}</td>
                <td>${norms.carbs}</td>
                <td>&ge;${norms.omega3_min || 1.1}</td>
                <td>&le;${norms.omega6_max || 17}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Аминокислоты (среднее за неделю vs норма) -->
      ${Object.keys(aminoTotals).length > 0 ? `
        <div class="report-section">
          <h3>Аминокислоты — среднее за день</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Аминокислота</th><th>Ср. факт (г)</th><th>Норма (г)</th><th>Разница</th></tr></thead>
              <tbody>
                ${Object.entries(Analysis.AMINO_NAMES).map(([key, label]) => {
                  const avgVal = Math.round((aminoTotals[key] || 0) / days * 100) / 100;
                  const norm = norms.amino_acids?.[key] || 0;
                  const diff = avgVal - norm;
                  return `<tr>
                    <td>${label}</td>
                    <td>${avgVal}</td>
                    <td>${norm}</td>
                    <td class="${statusClass(avgVal, norm)}">${diffStr(diff)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      <!-- Дефициты за неделю -->
      ${allDeficits.size > 0 ? `
        <div class="report-section">
          <h3>Дефициты (за неделю)</h3>
          <ul class="deficit-list">${[...allDeficits].map(d => `<li>${escHtml(d)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      ${allImbalances.size > 0 ? `
        <div class="report-section">
          <h3>Дисбалансы (за неделю)</h3>
          <ul class="deficit-list imbalance-list">${[...allImbalances].map(d => `<li>${escHtml(d)}</li>`).join('')}</ul>
        </div>
      ` : ''}

      ${allRecommendations.size > 0 ? `
        <div class="report-section">
          <h3>Рекомендации</h3>
          <ul class="recommendation-list">${[...allRecommendations].map(d => `<li>${escHtml(d)}</li>`).join('')}</ul>
        </div>
      ` : ''}
    `;

    // Клик по строке — открываем отчёт за конкретный день
    $$('.day-report-row', container).forEach(row => {
      row.onclick = () => {
        location.hash = '#report/' + row.dataset.date;
      };
    });
  }

  // ===== Report =====

  function renderReport(container, params) {
    const session = Auth.getSession();
    const studentId = params?.studentId || session.id;
    const date = params?.date;
    const reports = Database.getReports(studentId);

    let report;
    if (date) {
      report = reports.find(r => r.date === date);
    } else {
      report = reports[0]; // Последний
    }

    if (!report) {
      container.innerHTML = `
        <div class="page-header"><h2>Отчёт</h2></div>
        <div class="empty-state">
          <div class="empty-icon">&#128196;</div>
          <p>Нет отчётов. Перейдите во «Ввод рациона», чтобы создать первый анализ.</p>
        </div>
      `;
      return;
    }

    const norms = Database.getStudentNorms(studentId);
    const isTeacher = Auth.isTeacher();
    const student = Auth.getStudentById(studentId);
    const studentName = student ? student.name : session.name;

    container.innerHTML = `
      <div class="page-header">
        <h2>Отчёт за ${report.date}</h2>
        <p>${studentName}</p>
      </div>

      ${renderMealTable(report)}
      ${renderTotalsComparison(report, norms)}
      ${renderAminoSection(report, norms)}
      ${renderOmegaSection(report, norms)}
      ${renderDeficits(report)}
      ${renderImbalances(report)}
      ${renderRecommendations(report, isTeacher, studentId)}

      ${isTeacher ? `<div class="action-buttons" style="margin-top:1rem;">
        <button class="btn btn-outline" id="btn-doc-day">&#128196; Скачать .doc</button>
      </div>` : ''}
    `;

    if (isTeacher) {
      const saveRecBtn = $('#btn-save-recommendations');
      if (saveRecBtn) {
        saveRecBtn.onclick = async () => {
          const text = $('#edit-recommendations').value;
          const recommendations = text.split('\n').filter(l => l.trim());
          showLoading('Сохраняем...');
          await Database.updateReport(studentId, report.date, { recommendations });
          hideLoading();
          toast('Рекомендации сохранены');
          renderReport(container, { studentId, date: report.date });
        };
      }
      const docDayBtn = $('#btn-doc-day');
      if (docDayBtn) {
        docDayBtn.onclick = () => {
          DocxExport.exportDayReport(studentId, report.date);
          toast('Отчёт скачан');
        };
      }
    }
  }

  function renderMealTable(report) {
    if (!report.meals) return '';
    const meals = [
      ['Завтрак', report.meals.breakfast],
      ['Обед', report.meals.lunch],
      ['Ужин', report.meals.dinner]
    ];

    let rows = '';
    for (const [name, items] of meals) {
      if (!items || !items.length) continue;
      rows += `<tr><td colspan="7" style="font-weight:700; background:var(--gray-light);">${name}</td></tr>`;
      for (const item of items) {
        const src = item.source || '';
        const srcClass = src.includes('Оценка') ? 'src-ai' : (src.includes('Скурихин') ? 'src-book' : 'src-db');
        rows += `<tr>
          <td>${item.product}</td>
          <td>${item.portion_g || '-'}</td>
          <td>${r(item.calories)}</td>
          <td>${r(item.protein)}</td>
          <td>${r(item.fat)}</td>
          <td>${r(item.carbs)}</td>
          <td class="cell-source ${srcClass}">${escHtml(src)}</td>
        </tr>`;
      }
    }

    return `
      <div class="report-section">
        <h3>Продукты по приёмам пищи</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Продукт</th><th>Порция (г)</th><th>Ккал</th><th>Белки</th><th>Жиры</th><th>Углеводы</th><th>Источник</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderTotalsComparison(report, norms) {
    if (!report.totals) return '';
    const t = report.totals;
    const n = norms;

    const diffCal = t.calories - n.calories;
    const diffP = t.protein - n.protein;
    const diffF = t.fat - n.fat;
    const diffC = t.carbs - n.carbs;

    return `
      <div class="report-section">
        <h3>Суточные итоги</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th></th><th>Калории</th><th>Белки (г)</th><th>Жиры (г)</th><th>Углеводы (г)</th></tr></thead>
            <tbody>
              <tr class="row-total"><td>Фактически</td><td>${r(t.calories)}</td><td>${r(t.protein)}</td><td>${r(t.fat)}</td><td>${r(t.carbs)}</td></tr>
              <tr class="row-norm"><td>Норма</td><td>${n.calories}</td><td>${n.protein}</td><td>${n.fat}</td><td>${n.carbs}</td></tr>
              <tr class="row-diff">
                <td>Разница</td>
                <td class="${statusClass(t.calories, n.calories)}">${diffStr(diffCal)}</td>
                <td class="${statusClass(t.protein, n.protein)}">${diffStr(diffP)}</td>
                <td class="${statusClass(t.fat, n.fat)}">${diffStr(diffF)}</td>
                <td class="${statusClass(t.carbs, n.carbs)}">${diffStr(diffC)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderAminoSection(report, norms) {
    if (!report.totals?.amino_acids) return '';
    const aa = report.totals.amino_acids;
    const naa = norms.amino_acids || {};

    let rows = '';
    for (const [key, label] of Object.entries(Analysis.AMINO_NAMES)) {
      const actual = aa[key] || 0;
      const norm = naa[key] || 0;
      const diff = actual - norm;
      rows += `<tr>
        <td>${label}</td>
        <td>${r(actual)}</td>
        <td>${r(norm)}</td>
        <td class="${statusClass(actual, norm)}">${diffStr(diff)}</td>
      </tr>`;
    }

    return `
      <div class="report-section">
        <h3>Незаменимые аминокислоты (г)</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Аминокислота</th><th>Факт</th><th>Норма</th><th>Разница</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderOmegaSection(report, norms) {
    if (!report.totals) return '';
    const t = report.totals;
    const omega3 = t.omega3 || 0;
    const omega6 = t.omega6 || 0;
    const ratio = Analysis.getOmegaRatio(omega3, omega6);

    const ratioStatus = ratio && ratio > (norms.omega_ratio_max || 4) ? 'val-danger' : 'val-ok';

    return `
      <div class="report-section">
        <h3>Омега жирные кислоты</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Показатель</th><th>Факт</th><th>Норма</th><th>Статус</th></tr></thead>
            <tbody>
              <tr>
                <td>Омега-3 (г)</td>
                <td>${r(omega3)}</td>
                <td>&ge; ${norms.omega3_min || 1.1}</td>
                <td class="${omega3 >= (norms.omega3_min || 1.1) ? 'val-ok' : 'val-danger'}">${omega3 >= (norms.omega3_min || 1.1) ? 'Норма' : 'Дефицит'}</td>
              </tr>
              <tr>
                <td>Омега-6 (г)</td>
                <td>${r(omega6)}</td>
                <td>&le; ${norms.omega6_max || 17}</td>
                <td class="${omega6 <= (norms.omega6_max || 17) ? 'val-ok' : 'val-danger'}">${omega6 <= (norms.omega6_max || 17) ? 'Норма' : 'Избыток'}</td>
              </tr>
              <tr>
                <td>Соотношение Омега-6/Омега-3</td>
                <td>${ratio != null ? ratio + ':1' : '-'}</td>
                <td>&le; ${norms.omega_ratio_max || 4}:1</td>
                <td class="${ratioStatus}">${ratio != null ? (ratio <= (norms.omega_ratio_max || 4) ? 'Норма' : 'Дисбаланс') : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderDeficits(report) {
    if (!report.deficits?.length) return '';
    return `
      <div class="report-section">
        <h3>Дефициты</h3>
        <ul class="deficit-list">${report.deficits.map(d => `<li>${d}</li>`).join('')}</ul>
      </div>
    `;
  }

  function renderImbalances(report) {
    if (!report.imbalances?.length) return '';
    return `
      <div class="report-section">
        <h3>Дисбалансы</h3>
        <ul class="deficit-list imbalance-list">${report.imbalances.map(d => `<li>${d}</li>`).join('')}</ul>
      </div>
    `;
  }

  function renderRecommendations(report, isTeacher, studentId) {
    if (isTeacher) {
      return `
        <div class="report-section">
          <h3>Рекомендации</h3>
          ${report.recommendations?.length ? `
            <ul class="recommendation-list" id="rec-list">${report.recommendations.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
          ` : '<p style="color:var(--gray)">Нет рекомендаций</p>'}
          <textarea id="edit-recommendations" rows="4" placeholder="Редактируйте рекомендации (по одной на строку)...">${(report.recommendations || []).join('\n')}</textarea>
          <div style="margin-top:0.5rem;">
            <button class="btn btn-primary btn-sm" id="btn-save-recommendations" data-student="${studentId}" data-date="${report.date}">Сохранить рекомендации</button>
          </div>
        </div>
      `;
    }
    if (!report.recommendations?.length) return '';
    return `
      <div class="report-section">
        <h3>Рекомендации</h3>
        <ul class="recommendation-list">${report.recommendations.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
      </div>
    `;
  }

  // ===== Week summary (student) =====

  function renderWeek(container) {
    const session = Auth.getSession();
    const reports = Database.getReports(session.id);
    const allDays = reports; // все дни, не только 7

    // Суммы по всем дням
    const sums = { calories: 0, protein: 0, fat: 0, carbs: 0, days: 0 };
    for (const rep of allDays) {
      if (rep.totals) {
        sums.calories += rep.totals.calories || 0;
        sums.protein += rep.totals.protein || 0;
        sums.fat += rep.totals.fat || 0;
        sums.carbs += rep.totals.carbs || 0;
        sums.days++;
      }
    }

    container.innerHTML = `
      <div class="page-header">
        <h2>Сводка по дням</h2>
        <p>Все отчёты с итогами</p>
      </div>

      ${sums.days > 0 ? `
        <div class="week-summary">
          <div class="week-stat"><div class="stat-value">${Math.round(sums.calories)}</div><div class="stat-label">Всего калорий</div></div>
          <div class="week-stat"><div class="stat-value">${Math.round(sums.protein * 10) / 10}</div><div class="stat-label">Всего белков (г)</div></div>
          <div class="week-stat"><div class="stat-value">${Math.round(sums.fat * 10) / 10}</div><div class="stat-label">Всего жиров (г)</div></div>
          <div class="week-stat"><div class="stat-value">${Math.round(sums.carbs * 10) / 10}</div><div class="stat-label">Всего углеводов (г)</div></div>
          <div class="week-stat"><div class="stat-value">${sums.days}</div><div class="stat-label">Дней</div></div>
        </div>
      ` : ''}

      ${allDays.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">&#128197;</div>
          <p>Нет данных. Начните вводить рацион!</p>
        </div>
      ` : `
        <div class="day-cards" id="day-cards">
          ${allDays.map(report => {
            const status = Analysis.getOverallStatus(report);
            const t = report.totals || {};
            return `
              <div class="day-card" data-date="${report.date}">
                <div class="day-date">${report.date} <span class="badge badge-${status}">${statusLabel(status)}</span></div>
                <div class="day-stats">
                  <span>Калории:</span><strong>${r(t.calories)}</strong>
                  <span>Белки:</span><strong>${r(t.protein)} г</strong>
                  <span>Жиры:</span><strong>${r(t.fat)} г</strong>
                  <span>Углеводы:</span><strong>${r(t.carbs)} г</strong>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    // Click on day card
    $$('.day-card', container).forEach(card => {
      card.onclick = () => {
        location.hash = '#report/' + card.dataset.date;
      };
    });
  }

  // ===== Students list (teacher) =====

  function renderStudents(container) {
    const students = Auth.getAllStudents();
    const allReports = Database.getAllReports();

    container.innerHTML = `
      <div class="page-header">
        <h2>Студенты</h2>
        <p>Список зарегистрированных студентов</p>
      </div>

      ${students.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">&#128101;</div>
          <p>Пока нет зарегистрированных студентов</p>
        </div>
      ` : `
        <!-- Desktop table -->
        <div class="card students-table-desktop">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Имя</th><th>Логин</th><th>Последний отчёт</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody>
                ${students.map(s => {
                  const reports = allReports[s.id] || [];
                  const last = reports[0];
                  const status = last ? Analysis.getOverallStatus(last) : 'unknown';
                  return `<tr class="student-row" data-id="${s.id}">
                    <td><strong>${escHtml(s.name)}</strong></td>
                    <td>${escHtml(s.login)}</td>
                    <td>${last ? last.date : '—'}</td>
                    <td>${last ? `<span class="badge badge-${status}">${statusLabel(status)}</span>` : '—'}</td>
                    <td>
                      <button class="btn btn-sm btn-outline btn-view-student" data-id="${s.id}">Открыть</button>
                      <button class="btn btn-sm btn-outline btn-doc-student" data-id="${s.id}">.doc</button>
                      <button class="btn btn-sm btn-danger btn-del-student" data-id="${s.id}" data-name="${escHtml(s.name)}">&times;</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Mobile cards -->
        <div class="students-cards-mobile">
          ${students.map(s => {
            const reports = allReports[s.id] || [];
            const last = reports[0];
            const status = last ? Analysis.getOverallStatus(last) : 'unknown';
            return `<div class="student-card" data-id="${s.id}">
              <div class="student-card-header">
                <strong>${escHtml(s.name)}</strong>
                ${last ? `<span class="badge badge-${status}">${statusLabel(status)}</span>` : ''}
              </div>
              <div class="student-card-info">
                <span class="student-card-label">Логин:</span> ${escHtml(s.login)}
              </div>
              <div class="student-card-info">
                <span class="student-card-label">Последний отчёт:</span> ${last ? last.date : '—'}
              </div>
              <div class="student-card-actions">
                <button class="btn btn-sm btn-outline btn-view-student" data-id="${s.id}">Открыть</button>
                <button class="btn btn-sm btn-outline btn-doc-student" data-id="${s.id}">.doc</button>
                <button class="btn btn-sm btn-danger btn-del-student" data-id="${s.id}" data-name="${escHtml(s.name)}">&times;</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    `;

    $$('.btn-view-student', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        location.hash = '#student/' + btn.dataset.id;
      };
    });

    $$('.btn-doc-student', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        DocxExport.exportWeekReport(btn.dataset.id);
        toast('Отчёт скачан');
      };
    });

    $$('.btn-del-student', container).forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`Удалить студента "${btn.dataset.name}" и все его отчёты?`)) {
          showLoading('Удаляем...');
          await Auth.deleteStudent(btn.dataset.id);
          hideLoading();
          toast('Студент удалён');
          renderStudents(container);
        }
      };
    });

    $$('.student-row', container).forEach(row => {
      row.onclick = () => { location.hash = '#student/' + row.dataset.id; };
    });

    $$('.student-card', container).forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('button')) return;
        location.hash = '#student/' + card.dataset.id;
      };
    });
  }

  // ===== Student detail (teacher) =====

  function renderStudentDetail(container, params) {
    const studentId = params?.studentId;
    const student = Auth.getStudentById(studentId);
    if (!student) {
      container.innerHTML = '<div class="empty-state"><p>Студент не найден</p></div>';
      return;
    }

    const reports = Database.getReports(studentId);

    container.innerHTML = `
      <div class="page-header">
        <h2>${escHtml(student.name)}</h2>
        <p>${escHtml(student.login)} &middot; Отчётов: ${reports.length}</p>
      </div>

      <div class="action-buttons" style="margin-bottom:1rem;">
        <button class="btn btn-secondary" onclick="location.hash='#students'">&#8592; К списку</button>
        <button class="btn btn-outline btn-doc-one" data-id="${studentId}">Отчёт (.doc)</button>
        <button class="btn btn-outline btn-week-doc" data-id="${studentId}">Недельный отчёт (.doc)</button>
      </div>

      ${reports.length === 0 ? `
        <div class="empty-state"><p>Нет отчётов</p></div>
      ` : `
        <div class="day-cards">
          ${reports.map(report => {
            const status = Analysis.getOverallStatus(report);
            const t = report.totals || {};
            return `
              <div class="day-card" data-date="${report.date}" data-student="${studentId}">
                <div class="day-date">
                  ${report.date} <span class="badge badge-${status}">${statusLabel(status)}</span>
                  <span style="float:right;">
                    <button class="btn btn-sm btn-outline btn-doc-report" data-date="${report.date}" data-student="${studentId}" title="Скачать .doc">&#128196;</button>
                    <button class="btn btn-sm btn-danger btn-del-report" data-date="${report.date}" data-student="${studentId}" title="Удалить отчёт">&times;</button>
                  </span>
                </div>
                <div class="day-stats">
                  <span>Калории:</span><strong>${r(t.calories)}</strong>
                  <span>Белки:</span><strong>${r(t.protein)} г</strong>
                  <span>Жиры:</span><strong>${r(t.fat)} г</strong>
                  <span>Углеводы:</span><strong>${r(t.carbs)} г</strong>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;

    container.querySelector('.btn-doc-one')?.addEventListener('click', () => {
      DocxExport.exportWeekReport(studentId);
      toast('Отчёт скачан');
    });

    container.querySelector('.btn-week-doc')?.addEventListener('click', () => {
      DocxExport.exportWeekReport(studentId);
      toast('Недельный отчёт скачан');
    });

    $$('.btn-doc-report', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        DocxExport.exportDayReport(btn.dataset.student, btn.dataset.date);
        toast('Отчёт скачан');
      };
    });

    $$('.btn-del-report', container).forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`Удалить отчёт за ${btn.dataset.date}?`)) {
          showLoading('Удаляем...');
          await Database.deleteReport(btn.dataset.student, btn.dataset.date);
          hideLoading();
          toast('Отчёт удалён');
          renderStudentDetail(container, { studentId: btn.dataset.student });
        }
      };
    });

    $$('.day-card', container).forEach(card => {
      card.onclick = () => {
        location.hash = '#report/' + card.dataset.student + '/' + card.dataset.date;
      };
    });
  }

  // ===== Products editor (teacher) =====

  function renderProducts(container) {
    const products = Database.getProducts();

    container.innerHTML = `
      <div class="page-header">
        <h2>База продуктов</h2>
        <p>Всего: ${products.length} продуктов ${Database.hasOverride() ? '(есть правки преподавателя)' : '(из книг)'}</p>
        ${products.length === 0 ? '<div class="hint-box">База пуста. При анализе рациона данные о составе продуктов берутся из загруженных книг (справочник Скурихина). Добавляйте продукты вручную, только если хотите уточнить или дополнить данные из книг.</div>' : ''}
      </div>

      <div class="product-actions">
        <button class="btn btn-primary" id="btn-add-product">+ Добавить продукт</button>
        ${Database.hasOverride() ? `<button class="btn btn-danger" id="btn-reset-products">Сбросить к данным из книг</button>` : ''}
        <input type="text" class="product-search" id="product-search" placeholder="Поиск продукта...">
      </div>

      <div class="card">
        <div class="table-wrap">
          <table id="products-table">
            <thead>
              <tr>
                <th>Продукт</th><th>Источник</th><th>Ккал</th><th>Б</th><th>Ж</th><th>У</th>
                <th>Омега-3</th><th>Омега-6</th><th>Действия</th>
              </tr>
            </thead>
            <tbody>
              ${products.map((p, i) => `
                <tr data-idx="${i}">
                  <td><strong>${escHtml(p.name)}</strong></td>
                  <td style="font-size:0.78rem;color:var(--gray)">${escHtml(p.source || '')}</td>
                  <td>${p.per_100g?.calories || 0}</td>
                  <td>${p.per_100g?.protein || 0}</td>
                  <td>${p.per_100g?.fat || 0}</td>
                  <td>${p.per_100g?.carbs || 0}</td>
                  <td>${p.per_100g?.omega3 || 0}</td>
                  <td>${p.per_100g?.omega6 || 0}</td>
                  <td>
                    <button class="btn btn-sm btn-outline btn-edit-prod" data-idx="${i}">&#9998;</button>
                    <button class="btn btn-sm btn-danger btn-del-prod" data-idx="${i}">&times;</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Search
    $('#product-search').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      $$('#products-table tbody tr').forEach(tr => {
        const name = tr.children[0].textContent.toLowerCase();
        tr.style.display = name.includes(q) ? '' : 'none';
      });
    };

    // Add
    $('#btn-add-product').onclick = () => showProductModal(null, () => renderProducts(container));

    // Reset
    $('#btn-reset-products')?.addEventListener('click', async () => {
      if (confirm('Сбросить все правки и вернуть данные из книг?')) {
        showLoading('Сбрасываем...');
        await Database.resetProducts();
        hideLoading();
        toast('База сброшена');
        renderProducts(container);
      }
    });

    // Edit
    $$('.btn-edit-prod', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        showProductModal(+btn.dataset.idx, () => renderProducts(container));
      };
    });

    // Delete
    $$('.btn-del-prod', container).forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (confirm('Удалить продукт?')) {
          showLoading('Удаляем...');
          await Database.deleteProduct(+btn.dataset.idx);
          hideLoading();
          toast('Продукт удалён');
          renderProducts(container);
        }
      };
    });
  }

  function showProductModal(index, onSave) {
    const products = Database.getProducts();
    const isNew = index === null;
    const p = isNew ? {
      name: '', aliases: [], portion_default_g: 100, source: 'Вручную',
      per_100g: { calories: 0, protein: 0, fat: 0, carbs: 0, fast_carbs: 0,
        amino_acids: { leucine:0, isoleucine:0, valine:0, lysine:0, methionine:0, phenylalanine:0, threonine:0, tryptophan:0, histidine:0 },
        omega3: 0, omega6: 0 }
    } : products[index];

    const g = p.per_100g || {};
    const aa = g.amino_acids || {};

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>${isNew ? 'Добавить продукт' : 'Редактировать: ' + escHtml(p.name)}</h3>
        <div class="form-group"><label>Название</label><input id="pm-name" value="${escHtml(p.name)}"></div>
        <div class="form-row">
          <div class="form-group"><label>Порция по умолчанию (г)</label><input type="number" id="pm-portion" value="${p.portion_default_g || 100}"></div>
          <div class="form-group"><label>Источник</label><input id="pm-source" value="${escHtml(p.source || '')}"></div>
        </div>
        <h4 style="margin:1rem 0 0.5rem;">На 100г</h4>
        <div class="form-row">
          <div class="form-group"><label>Калории</label><input type="number" id="pm-cal" value="${g.calories || 0}" step="0.1"></div>
          <div class="form-group"><label>Белки</label><input type="number" id="pm-prot" value="${g.protein || 0}" step="0.1"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Жиры</label><input type="number" id="pm-fat" value="${g.fat || 0}" step="0.1"></div>
          <div class="form-group"><label>Углеводы</label><input type="number" id="pm-carbs" value="${g.carbs || 0}" step="0.1"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Омега-3</label><input type="number" id="pm-o3" value="${g.omega3 || 0}" step="0.01"></div>
          <div class="form-group"><label>Омега-6</label><input type="number" id="pm-o6" value="${g.omega6 || 0}" step="0.01"></div>
        </div>
        <h4 style="margin:1rem 0 0.5rem;">Аминокислоты (г на 100г)</h4>
        <div class="form-row">
          ${Object.entries(Analysis.AMINO_NAMES).map(([key, label]) =>
            `<div class="form-group"><label>${label}</label><input type="number" id="pm-aa-${key}" value="${aa[key] || 0}" step="0.001"></div>`
          ).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="pm-cancel">Отмена</button>
          <button class="btn btn-primary" id="pm-save">Сохранить</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#pm-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#pm-save').onclick = async () => {
      const updated = {
        name: overlay.querySelector('#pm-name').value.trim(),
        aliases: p.aliases || [],
        portion_default_g: +overlay.querySelector('#pm-portion').value,
        source: overlay.querySelector('#pm-source').value.trim(),
        per_100g: {
          calories: +overlay.querySelector('#pm-cal').value,
          protein: +overlay.querySelector('#pm-prot').value,
          fat: +overlay.querySelector('#pm-fat').value,
          carbs: +overlay.querySelector('#pm-carbs').value,
          fast_carbs: g.fast_carbs || 0,
          amino_acids: {},
          omega3: +overlay.querySelector('#pm-o3').value,
          omega6: +overlay.querySelector('#pm-o6').value,
        }
      };
      for (const key of Object.keys(Analysis.AMINO_NAMES)) {
        updated.per_100g.amino_acids[key] = +overlay.querySelector('#pm-aa-' + key).value;
      }
      if (!updated.name) { toast('Введите название', 'error'); return; }

      showLoading('Сохраняем...');
      if (isNew) {
        await Database.addProduct(updated);
      } else {
        await Database.updateProduct(index, updated);
      }
      hideLoading();
      overlay.remove();
      toast(isNew ? 'Продукт добавлен' : 'Продукт обновлён');
      onSave();
    };
  }

  // ===== Export page (teacher) =====

  function renderExport(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Экспорт отчётов</h2>
        <p>Скачайте отчёты в формате DOCX</p>
      </div>
      <div class="card">
        <div style="display:flex; flex-direction:column; gap:1rem; max-width:400px;">
          <button class="btn btn-primary btn-block" id="btn-export-all">
            &#128190; Скачать отчёт по всем студентам (.doc)
          </button>
        </div>
        <div style="margin-top:2rem;">
          <h3 class="card-title">По отдельному студенту</h3>
          ${Auth.getAllStudents().map(s => `
            <div class="export-student-row">
              <span>${escHtml(s.name)}</span>
              <button class="btn btn-sm btn-outline btn-export-one" data-id="${s.id}">Скачать .doc</button>
            </div>
          `).join('') || '<p style="color:var(--gray)">Нет студентов</p>'}
        </div>
      </div>
    `;

    $('#btn-export-all').onclick = () => {
      DocxExport.exportAllStudents();
      toast('Отчёт по всем студентам скачан');
    };

    $$('.btn-export-one', container).forEach(btn => {
      btn.onclick = () => {
        DocxExport.exportWeekReport(btn.dataset.id);
        toast('Отчёт скачан');
      };
    });
  }

  // ===== Books (teacher) =====

  function renderBooks(container) {
    const books = Database.getBooksIndex();

    container.innerHTML = `
      <div class="page-header">
        <h2>Книги</h2>
        <p>Справочники для анализа состава продуктов. Только формат .md</p>
      </div>

      <div class="card">
        <div class="form-group">
          <label for="book-upload">Загрузить книгу (.md)</label>
          <input type="file" id="book-upload" accept=".md" style="margin-bottom:0.5rem;">
          <div class="form-hint">Файл в формате Markdown. Таблицы состава продуктов будут использоваться при анализе рациона.</div>
        </div>
        <button class="btn btn-primary" id="btn-upload-book">Загрузить</button>
      </div>

      <div class="card">
        <h3 class="card-title">Загруженные книги (${books.length})</h3>
        ${books.length === 0 ? '<p style="color:var(--gray)">Нет загруженных книг</p>' : `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Файл</th><th>Действия</th></tr></thead>
              <tbody>
                ${books.map(f => `
                  <tr>
                    <td>${escHtml(f)}</td>
                    <td><button class="btn btn-sm btn-danger btn-del-book" data-file="${escHtml(f)}">&times; Удалить</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    $('#btn-upload-book').onclick = async () => {
      const input = $('#book-upload');
      if (!input.files || !input.files.length) {
        toast('Выберите файл .md', 'error');
        return;
      }
      const file = input.files[0];
      if (!file.name.endsWith('.md')) {
        toast('Допускается только формат .md', 'error');
        return;
      }
      showLoading('Загружаем книгу...');
      try {
        const text = await file.text();
        await Database.uploadBook(file.name, text);
        hideLoading();
        toast('Книга загружена: ' + file.name);
        renderBooks(container);
      } catch (e) {
        hideLoading();
        toast('Ошибка: ' + e.message, 'error');
      }
    };

    $$('.btn-del-book', container).forEach(btn => {
      btn.onclick = async () => {
        const filename = btn.dataset.file;
        if (confirm(`Удалить книгу "${filename}"?`)) {
          showLoading('Удаляем...');
          try {
            await Database.deleteBook(filename);
            hideLoading();
            toast('Книга удалена');
            renderBooks(container);
          } catch (e) {
            hideLoading();
            toast('Ошибка: ' + e.message, 'error');
          }
        }
      };
    });
  }

  // ===== Norms (teacher) =====

  function renderNorms(container) {
    const session = Auth.getSession();
    const norms = Database.getStudentNorms(session.id);
    const aa = norms.amino_acids || {};

    container.innerHTML = `
      <div class="page-header">
        <h2>Мои суточные нормы</h2>
        <p>Индивидуальные нормы для анализа вашего рациона</p>
      </div>

      <div class="card">
        <h3 class="card-title">Основные показатели</h3>
        <div class="form-row">
          <div class="form-group"><label>Калории (ккал)</label><input type="number" id="norm-calories" value="${norms.calories || 2500}"></div>
          <div class="form-group"><label>Белки (г)</label><input type="number" id="norm-protein" value="${norms.protein || 80}" step="0.1"></div>
          <div class="form-group"><label>Жиры (г)</label><input type="number" id="norm-fat" value="${norms.fat || 70}" step="0.1"></div>
          <div class="form-group"><label>Углеводы (г)</label><input type="number" id="norm-carbs" value="${norms.carbs || 350}" step="0.1"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Быстрые углеводы макс. (г)</label><input type="number" id="norm-fast-carbs" value="${norms.fast_carbs_max || 50}" step="0.1"></div>
          <div class="form-group"><label>Омега-3 мин. (г)</label><input type="number" id="norm-omega3" value="${norms.omega3_min || 1.1}" step="0.1"></div>
          <div class="form-group"><label>Омега-6 макс. (г)</label><input type="number" id="norm-omega6" value="${norms.omega6_max || 17}" step="0.1"></div>
          <div class="form-group"><label>Соотношение Омега-6/3 макс.</label><input type="number" id="norm-omega-ratio" value="${norms.omega_ratio_max || 4}" step="0.1"></div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">Незаменимые аминокислоты (г/сутки)</h3>
        <div class="form-row">
          <div class="form-group"><label>Лейцин</label><input type="number" id="norm-aa-leucine" value="${aa.leucine || 0}" step="0.01"></div>
          <div class="form-group"><label>Изолейцин</label><input type="number" id="norm-aa-isoleucine" value="${aa.isoleucine || 0}" step="0.01"></div>
          <div class="form-group"><label>Валин</label><input type="number" id="norm-aa-valine" value="${aa.valine || 0}" step="0.01"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Лизин</label><input type="number" id="norm-aa-lysine" value="${aa.lysine || 0}" step="0.01"></div>
          <div class="form-group"><label>Метионин</label><input type="number" id="norm-aa-methionine" value="${aa.methionine || 0}" step="0.01"></div>
          <div class="form-group"><label>Фенилаланин</label><input type="number" id="norm-aa-phenylalanine" value="${aa.phenylalanine || 0}" step="0.01"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Треонин</label><input type="number" id="norm-aa-threonine" value="${aa.threonine || 0}" step="0.01"></div>
          <div class="form-group"><label>Триптофан</label><input type="number" id="norm-aa-tryptophan" value="${aa.tryptophan || 0}" step="0.01"></div>
          <div class="form-group"><label>Гистидин</label><input type="number" id="norm-aa-histidine" value="${aa.histidine || 0}" step="0.01"></div>
        </div>
      </div>

      <div class="action-buttons" style="margin-top:1rem;">
        <button class="btn btn-primary" id="btn-save-norms">Сохранить нормы</button>
        <button class="btn btn-secondary" id="btn-reset-norms">Сбросить к значениям по умолчанию</button>
      </div>
    `;

    $('#btn-save-norms').onclick = async () => {
      const updated = {
        calories: Number($('#norm-calories').value),
        protein: Number($('#norm-protein').value),
        fat: Number($('#norm-fat').value),
        carbs: Number($('#norm-carbs').value),
        fast_carbs_max: Number($('#norm-fast-carbs').value),
        amino_acids: {
          leucine: Number($('#norm-aa-leucine').value),
          isoleucine: Number($('#norm-aa-isoleucine').value),
          valine: Number($('#norm-aa-valine').value),
          lysine: Number($('#norm-aa-lysine').value),
          methionine: Number($('#norm-aa-methionine').value),
          phenylalanine: Number($('#norm-aa-phenylalanine').value),
          threonine: Number($('#norm-aa-threonine').value),
          tryptophan: Number($('#norm-aa-tryptophan').value),
          histidine: Number($('#norm-aa-histidine').value),
        },
        omega3_min: Number($('#norm-omega3').value),
        omega6_max: Number($('#norm-omega6').value),
        omega_ratio_max: Number($('#norm-omega-ratio').value),
      };
      showLoading('Сохраняем нормы...');
      await Database.saveStudentNorms(session.id, updated);
      hideLoading();
      toast('Нормы сохранены');
    };

    $('#btn-reset-norms').onclick = async () => {
      const defaults = {
        calories: 2500, protein: 80, fat: 70, carbs: 350, fast_carbs_max: 50,
        amino_acids: {
          leucine: 2.7, isoleucine: 1.4, valine: 1.8, lysine: 2.1,
          methionine: 0.7, phenylalanine: 1.6, threonine: 1.0,
          tryptophan: 0.28, histidine: 0.7
        },
        omega3_min: 1.1, omega6_max: 17, omega_ratio_max: 4
      };
      showLoading('Сброс норм...');
      await Database.saveStudentNorms(session.id, defaults);
      hideLoading();
      toast('Нормы сброшены к значениям по умолчанию');
      renderNorms(container);
    };
  }

  // ===== Settings =====

  function renderSettings(container) {
    const currentUrl = API.getProxyUrl();
    const connected = Storage.isLoaded();
    container.innerHTML = `
      <div class="page-header">
        <h2>Настройки</h2>
      </div>
      <div class="card">
        <h3 class="card-title">Cloudflare Worker</h3>
        <div class="form-group">
          <label>URL прокси</label>
          <input type="url" id="settings-proxy" value="${escHtml(currentUrl)}" placeholder="https://nutricheck-proxy.xxx.workers.dev">
          <div class="form-hint">Worker обрабатывает запросы к Claude API и синхронизирует данные с GitHub</div>
        </div>
        <button class="btn btn-primary" id="btn-save-settings">Сохранить</button>
        <button class="btn btn-outline" id="btn-test-connection" style="margin-left:0.5rem;">Проверить подключение</button>
      </div>

      <div class="card">
        <h3 class="card-title">Хранение данных</h3>
        <p style="font-size:0.9rem; color:var(--gray); margin-bottom:1rem;">
          Данные (пользователи, отчёты, комментарии) хранятся в JSON-файлах репозитория GitHub.
          Worker коммитит изменения через GitHub API. При каждом изменении данных запускается
          workflow для валидации и создания бэкапа.
        </p>
        <div style="font-size:0.9rem;">
          Статус: ${connected
            ? '<span class="badge badge-ok">Данные загружены</span>'
            : '<span class="badge badge-danger">Нет подключения</span>'}
        </div>
        <div style="margin-top:0.5rem; font-size:0.85rem; color:var(--gray);">
          Настройка Worker:<br>
          <code>wrangler secret put ANTHROPIC_API_KEY</code> — ключ Claude API<br>
          <code>wrangler secret put GITHUB_TOKEN</code> — GitHub PAT (scope: repo)<br>
          <code>GITHUB_REPO</code> — owner/repo в wrangler.toml
        </div>
      </div>
    `;

    $('#btn-save-settings').onclick = async () => {
      const url = $('#settings-proxy').value.trim();
      if (url) {
        showLoading('Сохраняем настройки...');
        await API.setProxyUrl(url);
        hideLoading();
        toast('Настройки сохранены');
      }
    };

    $('#btn-test-connection').onclick = async () => {
      showLoading('Проверяем подключение...');
      try {
        await Storage.init();
        hideLoading();
        toast('Подключение успешно! Данные загружены.');
        renderSettings(container); // re-render to update status
      } catch (e) {
        hideLoading();
        toast('Ошибка подключения: ' + e.message, 'error');
      }
    };
  }

  // ===== Helpers =====

  function r(val) {
    if (val == null) return '0';
    return Math.round(val * 10) / 10;
  }

  function diffStr(diff) {
    const v = Math.round(diff * 10) / 10;
    return v > 0 ? '+' + v : '' + v;
  }

  function statusClass(actual, norm) {
    const s = Analysis.getStatus(actual, norm);
    return 'val-' + s;
  }

  function statusLabel(status) {
    if (status === 'ok') return 'Норма';
    if (status === 'warn') return 'Отклонение';
    if (status === 'danger') return 'Дефицит';
    return '—';
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { renderAuth, renderApp, renderPage, toast, showLoading, hideLoading };
})();
