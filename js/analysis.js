/**
 * analysis.js — Логика анализа рациона: сравнение с нормами, статусы
 */

const Analysis = (() => {

  const AMINO_NAMES = {
    leucine: 'Лейцин',
    isoleucine: 'Изолейцин',
    valine: 'Валин',
    lysine: 'Лизин',
    methionine: 'Метионин',
    phenylalanine: 'Фенилаланин',
    threonine: 'Треонин',
    tryptophan: 'Триптофан',
    histidine: 'Гистидин'
  };

  /**
   * Определяет статус значения относительно нормы
   * @returns 'ok' | 'warn' | 'danger'
   */
  function getStatus(actual, norm, isMax) {
    if (!norm || norm === 0) return 'ok';
    const ratio = actual / norm;
    if (isMax) {
      // Для максимумов: превышение — плохо
      if (ratio <= 1) return 'ok';
      if (ratio <= 1.2) return 'warn';
      return 'danger';
    }
    // Для минимумов/норм: недобор — плохо
    if (ratio >= 0.8) return 'ok';
    if (ratio >= 0.6) return 'warn';
    return 'danger';
  }

  /**
   * Вычисляет разницу (факт - норма)
   */
  function getDiff(actual, norm) {
    return Math.round((actual - norm) * 10) / 10;
  }

  /**
   * Формирует сводку дня на основе данных анализа
   */
  function getDaySummary(report, studentId) {
    if (!report || !report.totals) return null;
    const norms = studentId ? Database.getStudentNorms(studentId) : Database.getNorms();
    const t = report.totals;

    return {
      calories: { value: t.calories, norm: norms.calories, status: getStatus(t.calories, norms.calories) },
      protein: { value: t.protein, norm: norms.protein, status: getStatus(t.protein, norms.protein) },
      fat: { value: t.fat, norm: norms.fat, status: getStatus(t.fat, norms.fat) },
      carbs: { value: t.carbs, norm: norms.carbs, status: getStatus(t.carbs, norms.carbs) },
    };
  }

  /**
   * Общий статус дня
   */
  function getOverallStatus(report, studentId) {
    const summary = getDaySummary(report, studentId);
    if (!summary) return 'unknown';
    const statuses = Object.values(summary).map(s => s.status);
    if (statuses.includes('danger')) return 'danger';
    if (statuses.includes('warn')) return 'warn';
    return 'ok';
  }

  /**
   * Средние значения за период
   */
  function getAverages(reports) {
    if (!reports.length) return null;
    const sums = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    let count = 0;
    for (const r of reports) {
      if (r.totals) {
        sums.calories += r.totals.calories || 0;
        sums.protein += r.totals.protein || 0;
        sums.fat += r.totals.fat || 0;
        sums.carbs += r.totals.carbs || 0;
        count++;
      }
    }
    if (count === 0) return null;
    return {
      calories: Math.round(sums.calories / count),
      protein: Math.round(sums.protein / count * 10) / 10,
      fat: Math.round(sums.fat / count * 10) / 10,
      carbs: Math.round(sums.carbs / count * 10) / 10,
      days: count
    };
  }

  /**
   * Проверка соотношения Омега
   */
  function getOmegaRatio(omega3, omega6) {
    if (!omega3 || omega3 === 0) return null;
    return Math.round(omega6 / omega3 * 10) / 10;
  }

  return { AMINO_NAMES, getStatus, getDiff, getDaySummary, getOverallStatus, getAverages, getOmegaRatio };
})();
