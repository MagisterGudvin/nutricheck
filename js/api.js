/**
 * api.js — Анализ рациона через Worker → Timeweb Cloud AI-агент
 */

const API = (() => {

  function getProxyUrl() {
    return Storage.getWorkerUrl();
  }

  async function setProxyUrl(url) {
    const config = Storage.getConfig();
    config.proxy_url = url;
    await Storage.saveConfig(config);
  }

  async function analyze(breakfast, lunch, dinner, studentId) {
    const products = Database.getProducts();
    const norms = studentId ? Database.getStudentNorms(studentId) : Database.getNorms();

    const userMessage = buildUserMessage(breakfast, lunch, dinner, products, norms);

    const url = getProxyUrl();
    if (!url) throw new Error('URL Worker не настроен');

    const response = await fetch(url + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('Ошибка API: ' + response.status + ' ' + err);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    // Worker возвращает ответ от Timeweb (OpenAI-формат)
    const text = data.choices?.[0]?.message?.content
      || data.content?.[0]?.text
      || '';
    if (!text) {
      throw new Error('Пустой ответ от агента');
    }

    return parseResponse(text);
  }

  function buildUserMessage(breakfast, lunch, dinner, products, norms) {
    const hasManualProducts = products && products.length > 0;
    const productsSection = hasManualProducts
      ? `\nБАЗА ПРОДУКТОВ (приоритетный источник, добавлено вручную преподавателем):\n${JSON.stringify(products, null, 2)}`
      : '';

    return `РАЦИОН СТУДЕНТА:
Завтрак: ${breakfast || '(не указан)'}
Обед: ${lunch || '(не указан)'}
Ужин: ${dinner || '(не указан)'}
${productsSection}

СУТОЧНЫЕ НОРМЫ:
${JSON.stringify(norms, null, 2)}`;
  }

  function parseResponse(text) {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error('Не удалось разобрать ответ: ' + cleaned.substring(0, 200));
    }
  }

  /**
   * Анализ рациона за неделю (7 дней).
   */
  async function analyzeWeek(days, studentId, onProgress) {
    const results = [];
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      if (onProgress) onProgress(i + 1, days.length, day.date);
      const result = await analyze(day.breakfast, day.lunch, day.dinner, studentId);
      results.push({ date: day.date, result });
    }
    return results;
  }

  return { analyze, analyzeWeek, setProxyUrl, getProxyUrl };
})();
