/**
 * reports.js — Генерация и экспорт отчётов (CSV)
 */

const Reports = (() => {

  const CSV_SEPARATOR = ';';
  const AMINO_KEYS = ['leucine', 'isoleucine', 'valine', 'lysine', 'methionine', 'phenylalanine', 'threonine', 'tryptophan', 'histidine'];

  /**
   * Экспорт отчётов одного студента в CSV
   */
  function exportStudentCSV(studentId, studentName) {
    const reports = Database.getReports(studentId);
    const comments = Database.getAllComments();

    const headers = [
      'Дата', 'Приём пищи', 'Продукт', 'Порция (г)',
      'Калории', 'Белки', 'Жиры', 'Углеводы',
      ...AMINO_KEYS.map(k => Analysis.AMINO_NAMES[k]),
      'Омега-3', 'Омега-6',
      'Статус', 'Комментарий преподавателя'
    ];

    const rows = [headers];

    for (const report of reports) {
      const date = report.date;
      const comment = comments[studentId + '_' + date] || '';
      const status = Analysis.getOverallStatus(report);

      if (report.meals) {
        for (const [mealKey, mealName] of [['breakfast', 'Завтрак'], ['lunch', 'Обед'], ['dinner', 'Ужин']]) {
          const items = report.meals[mealKey] || [];
          for (const item of items) {
            const aa = item.amino_acids || {};
            rows.push([
              date, mealName, item.product, item.portion_g,
              item.calories, item.protein, item.fat, item.carbs,
              ...AMINO_KEYS.map(k => aa[k] || 0),
              item.omega3 || 0, item.omega6 || 0,
              status, comment
            ]);
          }
        }
      }

      // Строка итого
      if (report.totals) {
        const t = report.totals;
        const taa = t.amino_acids || {};
        rows.push([
          date, 'ИТОГО', '', '',
          t.calories, t.protein, t.fat, t.carbs,
          ...AMINO_KEYS.map(k => taa[k] || 0),
          t.omega3 || 0, t.omega6 || 0,
          status, comment
        ]);
      }
    }

    downloadCSV(rows, `отчёт_${studentName}_${new Date().toISOString().slice(0,10)}.csv`);
  }

  /**
   * Экспорт отчётов всех студентов в CSV
   */
  function exportAllCSV() {
    const allReports = Database.getAllReports();
    const comments = Database.getAllComments();
    const students = Auth.getAllStudents();

    const headers = [
      'Студент', 'Дата', 'Приём пищи', 'Продукт', 'Порция (г)',
      'Калории', 'Белки', 'Жиры', 'Углеводы',
      ...AMINO_KEYS.map(k => Analysis.AMINO_NAMES[k]),
      'Омега-3', 'Омега-6',
      'Статус', 'Комментарий преподавателя'
    ];

    const rows = [headers];

    for (const student of students) {
      const reports = allReports[student.id] || [];
      for (const report of reports) {
        const date = report.date;
        const comment = comments[student.id + '_' + date] || '';
        const status = Analysis.getOverallStatus(report);

        if (report.meals) {
          for (const [mealKey, mealName] of [['breakfast', 'Завтрак'], ['lunch', 'Обед'], ['dinner', 'Ужин']]) {
            const items = report.meals[mealKey] || [];
            for (const item of items) {
              const aa = item.amino_acids || {};
              rows.push([
                student.name, date, mealName, item.product, item.portion_g,
                item.calories, item.protein, item.fat, item.carbs,
                ...AMINO_KEYS.map(k => aa[k] || 0),
                item.omega3 || 0, item.omega6 || 0,
                status, comment
              ]);
            }
          }
        }
      }
    }

    downloadCSV(rows, `отчёт_все_студенты_${new Date().toISOString().slice(0,10)}.csv`);
  }

  function downloadCSV(rows, filename) {
    const bom = '\uFEFF'; // BOM для Excel
    const csv = bom + rows.map(row =>
      row.map(cell => {
        const s = String(cell == null ? '' : cell);
        if (s.includes(CSV_SEPARATOR) || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(CSV_SEPARATOR)
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { exportStudentCSV, exportAllCSV };
})();
