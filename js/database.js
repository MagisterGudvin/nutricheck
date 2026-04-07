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

  async function loadBooks() {
    try {
      const indexRes = await fetch('books/index.json');
      const files = await indexRes.json();
      const promises = files.map(f =>
        fetch('books/' + f).then(r => r.text()).then(text => ({ file: f, text }))
      );
      booksContent = await Promise.all(promises);
    } catch (e) {
      console.warn('Книги не загружены:', e);
      booksContent = [];
    }
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

  function getBooksText() {
    return booksContent.map(b => `--- Файл: ${b.file} ---\n${b.text}`).join('\n\n');
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
    getNorms, getBooksText,
    getReports, getAllReports, saveReport, updateReport,
    getComment, saveComment, getAllComments
  };
})();
