/**
 * reports.js — Генерация и экспорт отчётов (CSV / XLSX)
 */

const Reports = (() => {

  const CSV_SEPARATOR = ';';
  const AMINO_KEYS = ['leucine', 'isoleucine', 'valine', 'lysine', 'methionine', 'phenylalanine', 'threonine', 'tryptophan', 'histidine'];

  const HEADERS = [
    'Дата', 'Приём пищи', 'Продукт', 'Порция (г)',
    'Калории', 'Белки', 'Жиры', 'Углеводы',
    ...AMINO_KEYS.map(k => Analysis.AMINO_NAMES[k]),
    'Омега-3', 'Омега-6',
    'Источник', 'Статус'
  ];

  const STATUS_LABELS = { ok: 'Норма', warn: 'Отклонение', danger: 'Дефицит', unknown: '—' };

  /**
   * Собирает строки отчёта для одного студента
   */
  function buildStudentRows(studentId) {
    const reports = Database.getReports(studentId);
    const rows = [];

    for (const report of reports) {
      const date = report.date;
      const statusRaw = Analysis.getOverallStatus(report);
      const status = STATUS_LABELS[statusRaw] || statusRaw;

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
              item.source || '', status
            ]);
          }
        }
      }

      if (report.totals) {
        const t = report.totals;
        const taa = t.amino_acids || {};
        rows.push([
          date, 'ИТОГО', '', '',
          t.calories, t.protein, t.fat, t.carbs,
          ...AMINO_KEYS.map(k => taa[k] || 0),
          t.omega3 || 0, t.omega6 || 0,
          '', status
        ]);
      }
    }

    return rows;
  }

  /**
   * Экспорт отчётов одного студента в CSV
   */
  function exportStudentCSV(studentId, studentName) {
    const rows = [HEADERS, ...buildStudentRows(studentId)];
    downloadCSV(rows, `отчёт_${studentName}_${new Date().toISOString().slice(0,10)}.csv`);
  }

  /**
   * Экспорт отчётов всех студентов — XLSX с отдельным листом на каждого
   */
  function exportAllCSV() {
    const students = Auth.getAllStudents();
    const sheets = [];

    for (const student of students) {
      const rows = buildStudentRows(student.id);
      if (rows.length > 0) {
        sheets.push({ name: student.name, rows: [HEADERS, ...rows] });
      }
    }

    if (sheets.length === 0) {
      sheets.push({ name: 'Нет данных', rows: [HEADERS] });
    }

    downloadXLSX(sheets, `отчёт_все_студенты_${new Date().toISOString().slice(0,10)}.xls`);
  }

  // ===== CSV =====

  function formatCell(cell) {
    if (cell == null) return '';
    if (typeof cell === 'number') return String(cell).replace('.', ',');
    const s = String(cell);
    if (/^\d+\.\d+$/.test(s)) return s.replace('.', ',');
    return s;
  }

  function downloadCSV(rows, filename) {
    const bom = '\uFEFF';
    const csv = bom + rows.map(row =>
      row.map(cell => {
        const s = formatCell(cell);
        if (s.includes(CSV_SEPARATOR) || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(CSV_SEPARATOR)
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
  }

  // ===== XLSX (SpreadsheetML XML) =====

  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function downloadXLSX(sheets, filename) {
    // Генерируем Excel XML Spreadsheet 2003 — нативно открывается в Excel
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<?mso-application progid="Excel.Sheet"?>\n';
    xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
    xml += '  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';

    // Стили
    xml += '<Styles>\n';
    xml += '  <Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#DCE6F1" ss:Pattern="Solid"/></Style>\n';
    xml += '  <Style ss:ID="total"><Font ss:Bold="1"/><Interior ss:Color="#F2F2F2" ss:Pattern="Solid"/></Style>\n';
    xml += '</Styles>\n';

    for (const sheet of sheets) {
      // Имя листа: макс 31 символ, без спецсимволов
      const safeName = escXml(sheet.name.replace(/[\[\]:*?\/\\]/g, '').substring(0, 31));
      xml += `<Worksheet ss:Name="${safeName}">\n<Table>\n`;

      for (let rowIdx = 0; rowIdx < sheet.rows.length; rowIdx++) {
        const row = sheet.rows[rowIdx];
        const isHeader = rowIdx === 0;
        const isTotal = !isHeader && row[1] === 'ИТОГО';
        const style = isHeader ? ' ss:StyleID="header"' : (isTotal ? ' ss:StyleID="total"' : '');

        xml += `<Row${style}>\n`;
        for (const cell of row) {
          const val = cell == null ? '' : cell;
          if (typeof val === 'number') {
            xml += `  <Cell><Data ss:Type="Number">${val}</Data></Cell>\n`;
          } else {
            xml += `  <Cell><Data ss:Type="String">${escXml(val)}</Data></Cell>\n`;
          }
        }
        xml += '</Row>\n';
      }

      xml += '</Table>\n</Worksheet>\n';
    }

    xml += '</Workbook>';

    const bom = '\uFEFF';
    const blob = new Blob([bom + xml], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { exportStudentCSV, exportAllCSV };
})();
