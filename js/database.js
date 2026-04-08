/**
 * database.js — База продуктов, нормы, отчёты, комментарии
 * Все данные хранятся в файлах репозитория через Storage → Worker → GitHub API.
 * localStorage не используется.
 */

const Database = (() => {
  let productsOriginal = [];
  let norms = {};
  let booksContent = [];

  async function init() {
    // Загружаем статические данные (продукты, нормы)
    try {
      const [prodRes, normsRes] = await Promise.all([
        fetch('data/products.json'),
        fetch('data/norms.json')
      ]);
      productsOriginal = await prodRes.json();
      norms = await normsRes.json();
    } catch (e) {
      console.warn('Не удалось загрузить статические данные:', e);
      productsOriginal = [];
      norms = {};
    }

    await loadBooks();

    // Загружаем пользовательские данные из GitHub через Storage
    await Storage.init();
  }

  let booksIndex = [];

  async function loadBooks() {
    try {
      const indexRes = await fetch('books/index.json');
      booksIndex = await indexRes.json();
      const promises = booksIndex.map(f =>
        fetch('books/' + f).then(r => r.text()).then(text => ({ file: f, text }))
      );
      booksContent = await Promise.all(promises);
    } catch (e) {
      console.warn('Книги не загружены:', e);
      booksIndex = [];
      booksContent = [];
    }
  }

  function getBooksIndex() {
    return booksIndex;
  }

  async function uploadBook(filename, text) {
    await Storage.uploadBook(filename, text);
    if (!booksIndex.includes(filename)) {
      booksIndex.push(filename);
      await Storage.saveBooksIndex(booksIndex);
    }
    booksContent.push({ file: filename, text });
  }

  async function deleteBook(filename) {
    await Storage.deleteBook(filename);
    booksIndex = booksIndex.filter(f => f !== filename);
    await Storage.saveBooksIndex(booksIndex);
    booksContent = booksContent.filter(b => b.file !== filename);
  }

  // ===== Продукты (статика + правки через Storage → GitHub) =====

  function getProducts() {
    const override = Storage.getProductsOverride();
    if (override) return override;
    return productsOriginal;
  }

  async function saveProducts(products) {
    await Storage.saveProductsOverride(products);
  }

  async function resetProducts() {
    await Storage.resetProductsOverride();
  }

  function hasOverride() {
    return Storage.getProductsOverride() !== null;
  }

  async function addProduct(product) {
    const products = getProducts();
    product.source = product.source || 'Вручную';
    products.push(product);
    await saveProducts(products);
  }

  async function updateProduct(index, product) {
    const products = getProducts();
    if (index >= 0 && index < products.length) {
      products[index] = product;
      await saveProducts(products);
    }
  }

  async function deleteProduct(index) {
    const products = getProducts();
    products.splice(index, 1);
    await saveProducts(products);
  }

  function getNorms() {
    return norms;
  }

  async function saveNorms(newNorms) {
    norms = newNorms;
    await Storage.saveNorms(newNorms);
  }

  /** Получить нормы конкретного студента. Если нет — глобальные по умолчанию. */
  function getStudentNorms(studentId) {
    const all = Storage.getStudentNorms();
    return all[studentId] || norms;
  }

  /** Сохранить индивидуальные нормы студента */
  async function saveStudentNorms(studentId, studentNorms) {
    const all = Storage.getStudentNorms();
    all[studentId] = studentNorms;
    await Storage.saveStudentNorms(all);
  }

  function getBooksText() {
    return booksContent.map(b => `--- Файл: ${b.file} ---\n${b.text}`).join('\n\n');
  }

  /**
   * Поиск фрагментов книги по ключевым словам продуктов.
   * Возвращает только релевантные строки (±context) вместо всей книги,
   * чтобы уместиться в контекст Claude API.
   */
  function searchBooks(keywords) {
    if (!booksContent.length || !keywords.length) return '(книги не загружены)';

    const CONTEXT_LINES = 4; // строк до/после совпадения
    const MAX_CHARS = 80000; // ~20K токенов — безопасный лимит для части промпта
    const results = [];
    let totalChars = 0;

    // Также всегда включаем заголовки таблиц и нормы
    const tableHeaders = [];

    for (const book of booksContent) {
      const lines = book.text.split('\n');

      // Собираем индексы заголовков таблиц (строки с "Код | Продукты | Порция")
      for (let i = 0; i < lines.length; i++) {
        if (/Код.*Продукты.*Порция|Na.*К.*Са.*Мд.*Р.*Fe/.test(lines[i])) {
          tableHeaders.push(i);
        }
      }

      const matchedLines = new Set();

      for (const kw of keywords) {
        if (!kw || kw.length < 2) continue;
        // Экранируем спецсимволы regex
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(escaped, 'i');

        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            // Добавляем строку и контекст
            for (let j = Math.max(0, i - CONTEXT_LINES); j <= Math.min(lines.length - 1, i + CONTEXT_LINES); j++) {
              matchedLines.add(j);
            }
            // Ищем ближайший заголовок таблицы выше — чтобы было понятно какие колонки
            for (const h of tableHeaders) {
              if (h <= i && i - h < 50) {
                for (let j = h; j <= Math.min(lines.length - 1, h + 2); j++) {
                  matchedLines.add(j);
                }
              }
            }
          }
        }
      }

      if (matchedLines.size === 0) continue;

      // Сортируем и группируем в блоки
      const sorted = [...matchedLines].sort((a, b) => a - b);
      let block = [];
      let prevLine = -10;

      for (const lineIdx of sorted) {
        if (lineIdx - prevLine > 2 && block.length > 0) {
          const text = block.join('\n');
          if (totalChars + text.length > MAX_CHARS) break;
          results.push(text);
          totalChars += text.length;
          block = [];
        }
        block.push(lines[lineIdx]);
        prevLine = lineIdx;
      }
      if (block.length > 0) {
        const text = block.join('\n');
        if (totalChars + text.length <= MAX_CHARS) {
          results.push(text);
          totalChars += text.length;
        }
      }
    }

    return results.length > 0
      ? results.join('\n---\n')
      : '(по указанным продуктам в книгах ничего не найдено)';
  }

  // ===== Отчёты (через Storage → GitHub) =====

  function getReports(studentId) {
    const all = Storage.getReports();
    return all[studentId] || [];
  }

  function getAllReports() {
    return Storage.getReports();
  }

  async function saveReport(studentId, report) {
    const all = Storage.getReports();
    if (!all[studentId]) all[studentId] = [];

    const idx = all[studentId].findIndex(r => r.date === report.date);
    if (idx >= 0) {
      all[studentId][idx] = report;
    } else {
      all[studentId].push(report);
    }
    all[studentId].sort((a, b) => b.date.localeCompare(a.date));
    await Storage.saveReports(all);
  }

  async function deleteReport(studentId, date) {
    const all = Storage.getReports();
    if (!all[studentId]) return;
    all[studentId] = all[studentId].filter(r => r.date !== date);
    if (all[studentId].length === 0) delete all[studentId];
    await Storage.saveReports(all);
    // Удаляем комментарий
    const comments = Storage.getComments();
    const key = studentId + '_' + date;
    if (comments[key]) {
      delete comments[key];
      await Storage.saveComments(comments);
    }
  }

  async function deleteAllReports(studentId) {
    const all = Storage.getReports();
    delete all[studentId];
    await Storage.saveReports(all);
    // Удаляем все комментарии студента
    const comments = Storage.getComments();
    let changed = false;
    for (const key of Object.keys(comments)) {
      if (key.startsWith(studentId + '_')) {
        delete comments[key];
        changed = true;
      }
    }
    if (changed) await Storage.saveComments(comments);
  }

  async function updateReport(studentId, date, updates) {
    const all = Storage.getReports();
    if (!all[studentId]) return;
    const report = all[studentId].find(r => r.date === date);
    if (report) {
      Object.assign(report, updates);
      await Storage.saveReports(all);
    }
  }

  // ===== Комментарии (через Storage → GitHub) =====

  function getComment(studentId, date) {
    const all = Storage.getComments();
    return all[studentId + '_' + date] || '';
  }

  function getAllComments() {
    return Storage.getComments();
  }

  async function saveComment(studentId, date, text) {
    const all = Storage.getComments();
    all[studentId + '_' + date] = text;
    await Storage.saveComments(all);
  }

  return {
    init, getProducts, saveProducts, resetProducts, hasOverride,
    addProduct, updateProduct, deleteProduct,
    getNorms, saveNorms, getStudentNorms, saveStudentNorms, getBooksText, searchBooks,
    getBooksIndex, uploadBook, deleteBook,
    getReports, getAllReports, saveReport, updateReport, deleteReport, deleteAllReports,
    getComment, saveComment, getAllComments
  };
})();
