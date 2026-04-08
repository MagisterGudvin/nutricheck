/**
 * docx.js — Генерация отчётов в формате Word (WordprocessingML XML → .doc)
 */

const DocxExport = (() => {

  const STATUS_LABELS = { ok: 'Норма', warn: 'Отклонение', danger: 'Дефицит', unknown: '—' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function rv(val) {
    if (val == null) return '0';
    return String(Math.round(val * 10) / 10);
  }

  // ===== XML building helpers =====

  function heading(text, level) {
    const size = level === 1 ? 32 : level === 2 ? 26 : 22;
    return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>
      <w:r><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  }

  function para(text, opts) {
    const bold = opts?.bold ? '<w:b/>' : '';
    const color = opts?.color ? `<w:color w:val="${opts.color}"/>` : '';
    const size = opts?.size ? `<w:sz w:val="${opts.size}"/>` : '';
    const rpr = (bold || color || size) ? `<w:rPr>${bold}${color}${size}</w:rPr>` : '';
    return `<w:p><w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  }

  function emptyPara() {
    return '<w:p/>';
  }

  function tableRow(cells, header) {
    const rpr = header ? '<w:rPr><w:b/></w:rPr>' : '';
    const shd = header ? '<w:shd w:val="clear" w:color="auto" w:fill="DCE6F1"/>' : '';
    return '<w:tr>' + cells.map(c => {
      const tcPr = shd ? `<w:tcPr>${shd}</w:tcPr>` : '';
      return `<w:tc>${tcPr}<w:p><w:r>${rpr}<w:t xml:space="preserve">${esc(c)}</w:t></w:r></w:p></w:tc>`;
    }).join('') + '</w:tr>';
  }

  function table(headers, rows) {
    const tblPr = `<w:tblPr>
      <w:tblStyle w:val="TableGrid"/>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/>
      </w:tblBorders>
    </w:tblPr>`;

    let xml = `<w:tbl>${tblPr}`;
    xml += tableRow(headers, true);
    for (const row of rows) {
      xml += tableRow(row, false);
    }
    xml += '</w:tbl>';
    return xml;
  }

  function bulletList(items, color) {
    return items.map(item =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
        <w:r>${color ? `<w:rPr><w:color w:val="${color}"/></w:rPr>` : ''}<w:t xml:space="preserve">${esc(item)}</w:t></w:r></w:p>`
    ).join('');
  }

  // ===== Document wrapper =====

  function wrapDocument(bodyXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint">
<w:body>
${bodyXml}
</w:body>
</w:wordDocument>`;
  }

  // ===== Day report =====

  function buildDayReport(report, studentName, norms) {
    const t = report.totals || {};
    const aa = t.amino_acids || {};
    const naa = norms.amino_acids || {};
    const status = STATUS_LABELS[Analysis.getOverallStatus(report)] || '—';
    let body = '';

    body += heading(`Отчёт по питанию за ${report.date}`, 1);
    body += para(`Студент: ${studentName}`);
    body += para(`Статус: ${status}`, { bold: true });
    body += emptyPara();

    // Meal table
    if (report.meals) {
      body += heading('Продукты по приёмам пищи', 2);
      const mealHeaders = ['Приём', 'Продукт', 'Порция (г)', 'Ккал', 'Белки', 'Жиры', 'Углеводы', 'Источник'];
      const mealRows = [];
      for (const [key, label] of [['breakfast', 'Завтрак'], ['lunch', 'Обед'], ['dinner', 'Ужин']]) {
        const items = report.meals[key] || [];
        for (const item of items) {
          mealRows.push([label, item.product || '', rv(item.portion_g), rv(item.calories), rv(item.protein), rv(item.fat), rv(item.carbs), item.source || '']);
        }
      }
      body += table(mealHeaders, mealRows);
      body += emptyPara();
    }

    // Totals comparison
    body += heading('Суточные итоги', 2);
    body += table(
      ['', 'Калории', 'Белки (г)', 'Жиры (г)', 'Углеводы (г)'],
      [
        ['Фактически', rv(t.calories), rv(t.protein), rv(t.fat), rv(t.carbs)],
        ['Норма', String(norms.calories || 0), String(norms.protein || 0), String(norms.fat || 0), String(norms.carbs || 0)],
        ['Разница', rv((t.calories || 0) - (norms.calories || 0)), rv((t.protein || 0) - (norms.protein || 0)), rv((t.fat || 0) - (norms.fat || 0)), rv((t.carbs || 0) - (norms.carbs || 0))],
      ]
    );
    body += emptyPara();

    // Amino acids
    if (Object.keys(aa).length > 0) {
      body += heading('Незаменимые аминокислоты (г)', 2);
      const aaHeaders = ['Аминокислота', 'Факт', 'Норма', 'Разница'];
      const aaRows = Object.entries(Analysis.AMINO_NAMES).map(([key, label]) => {
        const actual = aa[key] || 0;
        const norm = naa[key] || 0;
        return [label, rv(actual), rv(norm), rv(actual - norm)];
      });
      body += table(aaHeaders, aaRows);
      body += emptyPara();
    }

    // Omega
    body += heading('Омега жирные кислоты', 2);
    const omega3 = t.omega3 || 0;
    const omega6 = t.omega6 || 0;
    const ratio = omega3 > 0 ? Math.round(omega6 / omega3 * 10) / 10 : '—';
    body += table(
      ['Показатель', 'Факт', 'Норма', 'Статус'],
      [
        ['Омега-3 (г)', rv(omega3), `≥ ${norms.omega3_min || 1.1}`, omega3 >= (norms.omega3_min || 1.1) ? 'Норма' : 'Дефицит'],
        ['Омега-6 (г)', rv(omega6), `≤ ${norms.omega6_max || 17}`, omega6 <= (norms.omega6_max || 17) ? 'Норма' : 'Избыток'],
        ['Соотношение Омега-6/3', String(ratio), `≤ ${norms.omega_ratio_max || 4}`, ratio !== '—' && ratio <= (norms.omega_ratio_max || 4) ? 'Норма' : 'Высокое'],
      ]
    );
    body += emptyPara();

    // Deficits
    if (report.deficits?.length) {
      body += heading('Выявленные дефициты', 2);
      body += bulletList(report.deficits, 'CC0000');
      body += emptyPara();
    }

    // Imbalances
    if (report.imbalances?.length) {
      body += heading('Дисбалансы', 2);
      body += bulletList(report.imbalances, 'CC8800');
      body += emptyPara();
    }

    // Recommendations
    if (report.recommendations?.length) {
      body += heading('Рекомендации', 2);
      body += bulletList(report.recommendations, '1E8449');
      body += emptyPara();
    }


    return body;
  }

  // ===== Week report =====

  function buildWeekReport(weekReports, studentName, norms) {
    if (!weekReports.length) return para('Нет данных');

    const dateRange = `${weekReports[0].date} — ${weekReports[weekReports.length - 1].date}`;
    let body = '';

    body += heading(`Недельный отчёт по питанию`, 1);
    body += para(`Студент: ${studentName}`);
    body += para(`Период: ${dateRange} (${weekReports.length} дн.)`);
    body += emptyPara();

    // Totals per day table
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

    body += heading('Итоги по дням', 2);
    const dayHeaders = ['Дата', 'Ккал', 'Белки', 'Жиры', 'Углеводы', 'Омега-3', 'Омега-6', 'Статус'];
    const dayRows = weekReports.map(rep => {
      const t = rep.totals || {};
      const st = STATUS_LABELS[Analysis.getOverallStatus(rep)] || '—';
      return [rep.date, rv(t.calories), rv(t.protein), rv(t.fat), rv(t.carbs), rv(t.omega3), rv(t.omega6), st];
    });
    dayRows.push(['Сумма', rv(totals.calories), rv(totals.protein), rv(totals.fat), rv(totals.carbs), rv(totals.omega3), rv(totals.omega6), '']);
    dayRows.push(['Среднее/день', rv(totals.calories / days), rv(totals.protein / days), rv(totals.fat / days), rv(totals.carbs / days), rv(totals.omega3 / days), rv(totals.omega6 / days), '']);
    dayRows.push(['Норма/день', String(norms.calories || 0), String(norms.protein || 0), String(norms.fat || 0), String(norms.carbs || 0), `≥${norms.omega3_min || 1.1}`, `≤${norms.omega6_max || 17}`, '']);
    body += table(dayHeaders, dayRows);
    body += emptyPara();

    // Amino acids average
    if (Object.keys(aminoTotals).length > 0) {
      body += heading('Аминокислоты — среднее за день', 2);
      const naa = norms.amino_acids || {};
      const aaHeaders = ['Аминокислота', 'Ср. факт (г)', 'Норма (г)', 'Разница'];
      const aaRows = Object.entries(Analysis.AMINO_NAMES).map(([key, label]) => {
        const avgVal = Math.round((aminoTotals[key] || 0) / days * 100) / 100;
        const norm = naa[key] || 0;
        return [label, String(avgVal), String(norm), rv(avgVal - norm)];
      });
      body += table(aaHeaders, aaRows);
      body += emptyPara();
    }

    // Collect all deficits/recommendations
    const allDeficits = new Set();
    const allImbalances = new Set();
    const allRecommendations = new Set();
    for (const rep of weekReports) {
      (rep.deficits || []).forEach(d => allDeficits.add(d));
      (rep.imbalances || []).forEach(d => allImbalances.add(d));
      (rep.recommendations || []).forEach(d => allRecommendations.add(d));
    }

    if (allDeficits.size > 0) {
      body += heading('Выявленные дефициты (за неделю)', 2);
      body += bulletList([...allDeficits], 'CC0000');
      body += emptyPara();
    }

    if (allImbalances.size > 0) {
      body += heading('Дисбалансы (за неделю)', 2);
      body += bulletList([...allImbalances], 'CC8800');
      body += emptyPara();
    }

    if (allRecommendations.size > 0) {
      body += heading('Рекомендации', 2);
      body += bulletList([...allRecommendations], '1E8449');
      body += emptyPara();
    }

    // Per-day detail
    body += heading('Подробности по дням', 1);
    for (const rep of weekReports) {
      rep._studentId = rep._studentId || '';
      body += buildDayReport(rep, studentName, norms);
      body += emptyPara();
      body += emptyPara();
    }

    return body;
  }

  // ===== Download =====

  function downloadDoc(xml, filename) {
    const bom = '\uFEFF';
    const blob = new Blob([bom + xml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== Public API =====

  function exportDayReport(studentId, date) {
    const student = Auth.getStudentById(studentId);
    const studentName = student ? student.name : 'Студент';
    const reports = Database.getReports(studentId);
    const report = reports.find(r => r.date === date);
    if (!report) return;

    report._studentId = studentId;
    const norms = Database.getStudentNorms(studentId);
    const body = buildDayReport(report, studentName, norms);
    const xml = wrapDocument(body);
    downloadDoc(xml, `отчёт_${studentName}_${date}.doc`);
  }

  function exportWeekReport(studentId, weekStart) {
    const student = Auth.getStudentById(studentId);
    const studentName = student ? student.name : 'Студент';
    const allReports = Database.getReports(studentId);
    const norms = Database.getStudentNorms(studentId);

    let weekReports;
    if (weekStart) {
      const endDate = new Date(weekStart);
      endDate.setDate(endDate.getDate() + 6);
      const end = endDate.toISOString().slice(0, 10);
      weekReports = allReports.filter(r => r.date >= weekStart && r.date <= end);
    } else {
      weekReports = allReports.slice(0, 7);
    }
    weekReports.sort((a, b) => a.date.localeCompare(b.date));

    if (!weekReports.length) return;

    weekReports.forEach(r => r._studentId = studentId);
    const body = buildWeekReport(weekReports, studentName, norms);
    const xml = wrapDocument(body);
    const dateLabel = weekStart || weekReports[0]?.date || 'неделя';
    downloadDoc(xml, `отчёт_неделя_${studentName}_${dateLabel}.doc`);
  }

  return { exportDayReport, exportWeekReport };
})();
