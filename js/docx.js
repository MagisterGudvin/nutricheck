/**
 * docx.js — Генерация отчётов в формате Word (WordprocessingML XML → .doc)
 * Стилизация максимально приближена к виду страниц на сайте.
 */

const DocxExport = (() => {

  const STATUS_LABELS = { ok: 'Норма', warn: 'Отклонение', danger: 'Дефицит', unknown: '—' };
  // Цвета, соответствующие CSS-переменным сайта
  const C = {
    green: '2ECC71', greenLight: 'D5F5E3', greenText: '1E8449',
    red: 'E74C3C', redLight: 'FADBD8', redText: '922B21',
    yellow: 'F39C12', yellowLight: 'FEF9E7', yellowText: '7D6608',
    dark: '2C3E50', gray: '95A5A6', grayLight: 'ECF0F1',
    white: 'FFFFFF', bg: 'F8F9FA',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function rv(val) {
    if (val == null) return '0';
    return String(Math.round(val * 10) / 10);
  }

  // ===== Low-level XML builders =====

  function run(text, opts) {
    let rpr = '';
    if (opts) {
      const parts = [];
      if (opts.bold) parts.push('<w:b/>');
      if (opts.italic) parts.push('<w:i/>');
      if (opts.color) parts.push(`<w:color w:val="${opts.color}"/>`);
      if (opts.size) parts.push(`<w:sz w:val="${opts.size}"/>`);
      if (opts.font) parts.push(`<w:rFonts w:ascii="${opts.font}" w:h-ansi="${opts.font}"/>`);
      if (parts.length) rpr = `<w:rPr>${parts.join('')}</w:rPr>`;
    }
    return `<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  }

  function para(runs, opts) {
    let ppr = '';
    if (opts) {
      const parts = [];
      if (opts.spacing) parts.push(`<w:spacing w:before="${opts.spacing}" w:after="${opts.spacing}"/>`);
      if (opts.align) parts.push(`<w:jc w:val="${opts.align}"/>`);
      if (opts.shd) parts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shd}"/>`);
      if (opts.border) parts.push(`<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${opts.border}"/></w:pBdr>`);
      if (parts.length) ppr = `<w:pPr>${parts.join('')}</w:pPr>`;
    }
    const runsXml = typeof runs === 'string' ? run(runs) : runs;
    return `<w:p>${ppr}${runsXml}</w:p>`;
  }

  function emptyPara() { return '<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>'; }

  // ===== Styled elements matching site design =====

  /** Зелёный заголовок секции с нижней линией (как .report-section h3 на сайте) */
  function sectionHeading(text) {
    return para(
      run(text, { bold: true, size: 24, color: C.dark }),
      { spacing: 120, border: C.grayLight }
    );
  }

  /** Крупный заголовок страницы (как .page-header h2) */
  function pageTitle(text) {
    return para(run(text, { bold: true, size: 32, color: C.dark }), { spacing: 80 });
  }

  /** Подзаголовок (как .page-header p) */
  function pageSubtitle(text) {
    return para(run(text, { color: C.gray, size: 20 }));
  }

  /** Бейдж статуса (текст с фоном) */
  function statusBadge(status) {
    const label = STATUS_LABELS[status] || '—';
    const colors = {
      ok: { bg: C.greenLight, fg: C.greenText },
      warn: { bg: C.yellowLight, fg: C.yellowText },
      danger: { bg: C.redLight, fg: C.redText },
    };
    const c = colors[status] || { bg: C.grayLight, fg: C.gray };
    return run(` [${label}] `, { bold: true, color: c.fg, size: 18 });
  }

  // ===== Table builder (styled like site tables) =====

  function styledCell(text, opts) {
    const tcParts = [];
    if (opts?.shd) tcParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shd}"/>`);
    if (opts?.width) tcParts.push(`<w:tcW w:w="${opts.width}" w:type="dxa"/>`);
    const tcPr = tcParts.length ? `<w:tcPr>${tcParts.join('')}</w:tcPr>` : '';

    const rOpts = {};
    if (opts?.bold) rOpts.bold = true;
    if (opts?.color) rOpts.color = opts.color;
    if (opts?.size) rOpts.size = opts.size;
    rOpts.size = rOpts.size || 18;

    return `<w:tc>${tcPr}<w:p><w:pPr><w:spacing w:before="30" w:after="30"/></w:pPr>${run(text, rOpts)}</w:p></w:tc>`;
  }

  function styledTable(headers, rows, specialRows) {
    // specialRows: массив {index, type: 'total'|'norm'|'diff'}
    const specMap = {};
    (specialRows || []).forEach(s => { specMap[s.index] = s.type; });

    const tblPr = `<w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="${C.grayLight}"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="${C.grayLight}"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="${C.grayLight}"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="${C.grayLight}"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="${C.grayLight}"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="${C.grayLight}"/>
      </w:tblBorders>
    </w:tblPr>`;

    let xml = `<w:tbl>${tblPr}`;

    // Header row (как thead на сайте — серый фон, жирный текст)
    xml += '<w:tr>';
    for (const h of headers) {
      xml += styledCell(h, { shd: C.grayLight, bold: true, color: C.dark });
    }
    xml += '</w:tr>';

    // Data rows
    rows.forEach((row, idx) => {
      const type = specMap[idx];
      xml += '<w:tr>';
      row.forEach((cell, ci) => {
        const opts = { size: 18 };
        if (type === 'total') { opts.shd = C.grayLight; opts.bold = true; }
        else if (type === 'norm') { opts.shd = C.greenLight; opts.bold = true; }
        else if (type === 'diff') { opts.bold = true; }
        // Подсветка статус-ячеек
        if (typeof cell === 'object' && cell._status) {
          opts.color = cell._status === 'ok' ? C.greenText : (cell._status === 'danger' ? C.redText : C.yellowText);
          xml += styledCell(cell.text, opts);
        } else {
          xml += styledCell(String(cell), opts);
        }
      });
      xml += '</w:tr>';
    });

    xml += '</w:tbl>';
    return xml;
  }

  // ===== Styled lists (like .deficit-list / .recommendation-list) =====

  function styledListItem(text, bgColor, textColor) {
    return para(
      run('• ' + text, { color: textColor, size: 18 }),
      { shd: bgColor, spacing: 30 }
    );
  }

  function deficitList(items) {
    return items.map(item => styledListItem(item, C.redLight, C.redText)).join('');
  }

  function imbalanceList(items) {
    return items.map(item => styledListItem(item, C.yellowLight, C.yellowText)).join('');
  }

  function recommendationList(items) {
    return items.map(item => styledListItem(item, C.greenLight, C.greenText)).join('');
  }

  // ===== Document wrapper =====

  function wrapDocument(bodyXml) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint">
<w:fonts>
  <w:defaultFonts w:ascii="Inter" w:fareast="Inter" w:h-ansi="Inter" w:cs="Inter"/>
</w:fonts>
<w:styles>
  <w:style w:type="paragraph" w:default="on" w:styleId="Normal">
    <w:rPr><w:sz w:val="20"/><w:rFonts w:ascii="Inter" w:h-ansi="Inter"/></w:rPr>
  </w:style>
</w:styles>
<w:body>
${bodyXml}
<w:sectPr>
  <w:pgSz w:w="11906" w:h="16838"/>
  <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
</w:sectPr>
</w:body>
</w:wordDocument>`;
  }

  // ===== Status helper =====

  function diffVal(actual, norm) {
    const d = Math.round(((actual || 0) - (norm || 0)) * 10) / 10;
    return d > 0 ? '+' + d : String(d);
  }

  function statusOf(actual, norm) {
    const ratio = norm ? actual / norm : 1;
    if (ratio >= 0.85 && ratio <= 1.15) return 'ok';
    if (ratio >= 0.7 && ratio <= 1.3) return 'warn';
    return 'danger';
  }

  function diffCell(actual, norm) {
    const d = diffVal(actual, norm);
    return { text: d, _status: statusOf(actual, norm) };
  }

  // =============================================
  //              DAY REPORT
  // =============================================

  function buildDayReport(report, studentName, norms, isSubReport) {
    const t = report.totals || {};
    const aa = t.amino_acids || {};
    const naa = norms.amino_acids || {};
    const status = Analysis.getOverallStatus(report);
    let body = '';

    // Заголовок
    if (!isSubReport) {
      body += pageTitle('Отчёт по питанию');
      body += pageSubtitle(studentName);
      body += emptyPara();
    }

    // Дата + статус
    body += para(
      run(report.date, { bold: true, size: 24, color: C.dark }) + statusBadge(status),
      { spacing: 60 }
    );

    // === Продукты по приёмам пищи ===
    if (report.meals) {
      body += sectionHeading('Продукты по приёмам пищи');
      const mealHeaders = ['Приём', 'Продукт', 'Порция (г)', 'Ккал', 'Белки', 'Жиры', 'Углеводы', 'Источник'];
      const mealRows = [];
      for (const [key, label] of [['breakfast', 'Завтрак'], ['lunch', 'Обед'], ['dinner', 'Ужин']]) {
        const items = report.meals[key] || [];
        for (const item of items) {
          mealRows.push([
            label, item.product || '', rv(item.portion_g),
            rv(item.calories), rv(item.protein), rv(item.fat), rv(item.carbs),
            item.source || ''
          ]);
        }
      }
      body += styledTable(mealHeaders, mealRows);
      body += emptyPara();
    }

    // === Суточные итоги (факт / норма / разница) ===
    body += sectionHeading('Суточные итоги');
    body += styledTable(
      ['', 'Калории', 'Белки (г)', 'Жиры (г)', 'Углеводы (г)'],
      [
        ['Фактически', rv(t.calories), rv(t.protein), rv(t.fat), rv(t.carbs)],
        ['Норма', String(norms.calories || 0), String(norms.protein || 0), String(norms.fat || 0), String(norms.carbs || 0)],
        [
          'Разница',
          diffCell(t.calories, norms.calories),
          diffCell(t.protein, norms.protein),
          diffCell(t.fat, norms.fat),
          diffCell(t.carbs, norms.carbs),
        ],
      ],
      [{ index: 0, type: 'total' }, { index: 1, type: 'norm' }, { index: 2, type: 'diff' }]
    );
    body += emptyPara();

    // === Аминокислоты ===
    if (Object.keys(aa).length > 0) {
      body += sectionHeading('Незаменимые аминокислоты (г)');
      const aaHeaders = ['Аминокислота', 'Факт', 'Норма', 'Разница'];
      const aaRows = Object.entries(Analysis.AMINO_NAMES).map(([key, label]) => {
        const actual = aa[key] || 0;
        const norm = naa[key] || 0;
        return [label, rv(actual), rv(norm), diffCell(actual, norm)];
      });
      body += styledTable(aaHeaders, aaRows);
      body += emptyPara();
    }

    // === Омега ===
    const omega3 = t.omega3 || 0;
    const omega6 = t.omega6 || 0;
    const ratio = omega3 > 0 ? Math.round(omega6 / omega3 * 10) / 10 : 0;
    body += sectionHeading('Омега жирные кислоты');
    body += styledTable(
      ['Показатель', 'Факт', 'Норма', 'Статус'],
      [
        ['Омега-3 (г)', rv(omega3), '≥ ' + (norms.omega3_min || 1.1),
          { text: omega3 >= (norms.omega3_min || 1.1) ? 'Норма' : 'Дефицит', _status: omega3 >= (norms.omega3_min || 1.1) ? 'ok' : 'danger' }],
        ['Омега-6 (г)', rv(omega6), '≤ ' + (norms.omega6_max || 17),
          { text: omega6 <= (norms.omega6_max || 17) ? 'Норма' : 'Избыток', _status: omega6 <= (norms.omega6_max || 17) ? 'ok' : 'danger' }],
        ['Соотношение Омега-6/3', ratio ? String(ratio) : '—', '≤ ' + (norms.omega_ratio_max || 4),
          { text: ratio && ratio <= (norms.omega_ratio_max || 4) ? 'Норма' : 'Высокое', _status: ratio && ratio <= (norms.omega_ratio_max || 4) ? 'ok' : 'danger' }],
      ]
    );
    body += emptyPara();

    // === Дефициты ===
    if (report.deficits?.length) {
      body += sectionHeading('Выявленные дефициты');
      body += deficitList(report.deficits);
      body += emptyPara();
    }

    // === Дисбалансы ===
    if (report.imbalances?.length) {
      body += sectionHeading('Дисбалансы');
      body += imbalanceList(report.imbalances);
      body += emptyPara();
    }

    // === Рекомендации ===
    if (report.recommendations?.length) {
      body += sectionHeading('Рекомендации');
      body += recommendationList(report.recommendations);
      body += emptyPara();
    }

    return body;
  }

  // =============================================
  //              WEEK REPORT
  // =============================================

  function buildWeekReport(weekReports, studentName, norms) {
    if (!weekReports.length) return para('Нет данных');

    const dateRange = `${weekReports[0].date} — ${weekReports[weekReports.length - 1].date}`;
    let body = '';

    body += pageTitle('Недельный отчёт по питанию');
    body += pageSubtitle(`${studentName} • ${dateRange} • ${weekReports.length} дн.`);
    body += emptyPara();

    // Суммы
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

    // === Сводная таблица по дням ===
    body += sectionHeading('Итоги по дням');
    const dayHeaders = ['Дата', 'Ккал', 'Белки', 'Жиры', 'Углеводы', 'Ом-3', 'Ом-6', 'Статус'];
    const dayRows = [];
    const specRows = [];

    weekReports.forEach(rep => {
      const t = rep.totals || {};
      const st = Analysis.getOverallStatus(rep);
      dayRows.push([
        rep.date, rv(t.calories), rv(t.protein), rv(t.fat), rv(t.carbs),
        rv(t.omega3), rv(t.omega6),
        { text: STATUS_LABELS[st] || '—', _status: st }
      ]);
    });

    // Строка суммы
    specRows.push({ index: dayRows.length, type: 'total' });
    dayRows.push(['Сумма', rv(totals.calories), rv(totals.protein), rv(totals.fat), rv(totals.carbs), rv(totals.omega3), rv(totals.omega6), '']);

    // Среднее
    dayRows.push(['Среднее/день', rv(totals.calories / days), rv(totals.protein / days), rv(totals.fat / days), rv(totals.carbs / days), rv(totals.omega3 / days), rv(totals.omega6 / days), '']);

    // Норма
    specRows.push({ index: dayRows.length, type: 'norm' });
    dayRows.push(['Норма/день', String(norms.calories || 0), String(norms.protein || 0), String(norms.fat || 0), String(norms.carbs || 0), '≥' + (norms.omega3_min || 1.1), '≤' + (norms.omega6_max || 17), '']);

    body += styledTable(dayHeaders, dayRows, specRows);
    body += emptyPara();

    // === Аминокислоты (среднее) ===
    if (Object.keys(aminoTotals).length > 0) {
      body += sectionHeading('Аминокислоты — среднее за день');
      const naa = norms.amino_acids || {};
      const aaRows = Object.entries(Analysis.AMINO_NAMES).map(([key, label]) => {
        const avgVal = Math.round((aminoTotals[key] || 0) / days * 100) / 100;
        const norm = naa[key] || 0;
        return [label, String(avgVal), String(norm), diffCell(avgVal, norm)];
      });
      body += styledTable(['Аминокислота', 'Ср. факт (г)', 'Норма (г)', 'Разница'], aaRows);
      body += emptyPara();
    }

    // === Дефициты / дисбалансы / рекомендации (общие за неделю) ===
    const allDeficits = new Set();
    const allImbalances = new Set();
    const allRecommendations = new Set();
    for (const rep of weekReports) {
      (rep.deficits || []).forEach(d => allDeficits.add(d));
      (rep.imbalances || []).forEach(d => allImbalances.add(d));
      (rep.recommendations || []).forEach(d => allRecommendations.add(d));
    }

    if (allDeficits.size > 0) {
      body += sectionHeading('Выявленные дефициты (за неделю)');
      body += deficitList([...allDeficits]);
      body += emptyPara();
    }
    if (allImbalances.size > 0) {
      body += sectionHeading('Дисбалансы (за неделю)');
      body += imbalanceList([...allImbalances]);
      body += emptyPara();
    }
    if (allRecommendations.size > 0) {
      body += sectionHeading('Рекомендации');
      body += recommendationList([...allRecommendations]);
      body += emptyPara();
    }

    // === Подробности по дням ===
    body += pageTitle('Подробности по дням');
    body += emptyPara();
    for (const rep of weekReports) {
      body += buildDayReport(rep, studentName, norms, true);
      body += emptyPara();
    }

    return body;
  }

  // =============================================
  //     ALL-STUDENTS EXPORT (per-sheet analog)
  // =============================================

  function buildAllStudentsReport() {
    const students = Auth.getAllStudents();
    let body = '';

    body += pageTitle('Отчёт по всем студентам');
    body += pageSubtitle(new Date().toISOString().slice(0, 10));
    body += emptyPara();

    for (const student of students) {
      const reports = Database.getReports(student.id);
      if (!reports.length) continue;

      const norms = Database.getStudentNorms(student.id);

      // Заголовок студента
      body += para(run(student.name, { bold: true, size: 28, color: C.dark }), { spacing: 100, border: C.green });
      body += para(run(`${student.login} • Отчётов: ${reports.length}`, { color: C.gray, size: 18 }));
      body += emptyPara();

      // Таблица дней
      const dayHeaders = ['Дата', 'Ккал', 'Белки', 'Жиры', 'Углеводы', 'Статус'];
      const dayRows = reports.map(rep => {
        const t = rep.totals || {};
        const st = Analysis.getOverallStatus(rep);
        return [rep.date, rv(t.calories), rv(t.protein), rv(t.fat), rv(t.carbs),
          { text: STATUS_LABELS[st] || '—', _status: st }];
      });
      body += styledTable(dayHeaders, dayRows);
      body += emptyPara();

      // Последний отчёт — подробно
      if (reports[0]) {
        body += para(run('Последний отчёт:', { bold: true, size: 20, color: C.dark }), { spacing: 60 });
        body += buildDayReport(reports[0], student.name, norms, true);
      }

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

    const norms = Database.getStudentNorms(studentId);
    const body = buildDayReport(report, studentName, norms, false);
    downloadDoc(wrapDocument(body), `отчёт_${studentName}_${date}.doc`);
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

    const body = buildWeekReport(weekReports, studentName, norms);
    const dateLabel = weekStart || weekReports[0]?.date || 'неделя';
    downloadDoc(wrapDocument(body), `отчёт_неделя_${studentName}_${dateLabel}.doc`);
  }

  function exportAllStudents() {
    const body = buildAllStudentsReport();
    const date = new Date().toISOString().slice(0, 10);
    downloadDoc(wrapDocument(body), `отчёт_все_студенты_${date}.doc`);
  }

  return { exportDayReport, exportWeekReport, exportAllStudents };
})();
