/**
 * auth.js — Авторизация и управление пользователями
 * Данные хранятся в data/users.json (через Storage → Worker → GitHub)
 * Сессия — в localStorage (только текущий залогиненный пользователь)
 */

const Auth = (() => {
  const SESSION_KEY = 'nutricheck_session';
  const ADMIN_LOGIN = 'admin';
  const ADMIN_PASSWORD = 'admin123';

  function getUsers() {
    return Storage.getUsers();
  }

  async function register(name, login, password) {
    if (!name || !login || !password) {
      return { ok: false, error: 'Заполните все поля' };
    }
    if (login === ADMIN_LOGIN) {
      return { ok: false, error: 'Этот логин зарезервирован' };
    }
    const users = getUsers();
    if (users.find(u => u.login === login)) {
      return { ok: false, error: 'Пользователь с таким логином уже существует' };
    }
    const user = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      login,
      password,
      role: 'student',
      created: new Date().toISOString()
    };
    users.push(user);
    await Storage.saveUsers(users);
    setSession(user);
    return { ok: true, user };
  }

  function login(login, password) {
    if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
      const admin = { id: 'admin', name: 'Преподаватель', login: ADMIN_LOGIN, role: 'teacher' };
      setSession(admin);
      return { ok: true, user: admin };
    }
    const users = getUsers();
    const user = users.find(u => u.login === login && u.password === password);
    if (!user) {
      return { ok: false, error: 'Неверный логин или пароль' };
    }
    setSession(user);
    return { ok: true, user };
  }

  function setSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.role
    }));
  }

  function getSession() {
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function isTeacher() {
    const s = getSession();
    return s && s.role === 'teacher';
  }

  function isStudent() {
    const s = getSession();
    return s && s.role === 'student';
  }

  function getAllStudents() {
    return getUsers().filter(u => u.role === 'student');
  }

  function getStudentById(id) {
    return getUsers().find(u => u.id === id);
  }

  return { register, login, logout, getSession, isTeacher, isStudent, getAllStudents, getStudentById };
})();
