/**
 * api.js — Запросы к Claude AI через Cloudflare Worker прокси
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

  async function analyze(breakfast, lunch, dinner) {
    const products = Database.getProducts();
    const norms = Database.getNorms();
    const booksText = Database.getBooksText();

    const systemPrompt = buildSystemPrompt(products, norms, booksText);
    const userMessage = buildUserMessage(breakfast, lunch, dinner);

    const url = getProxyUrl();

    const response = await fetch(url + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
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

    // Извлекаем текст ответа
    const text = data.content?.[0]?.text || '';
    return parseResponse(text);
  }

  function buildSystemPrompt(products, norms, booksText) {
    return `Ты — нутрициолог-аналитик. Проанализируй рацион студента.

ОСНОВНОЙ ИСТОЧНИК ДАННЫХ — КНИГИ И БАЗА, СОСТАВЛЕННАЯ ИЗ КНИГ.
Не используй собственные знания о составе продуктов. Бери данные ТОЛЬКО из источников ниже.

БАЗА ПРОДУКТОВ (составлена из книг, приоритетный источник):
${JSON.stringify(products, null, 2)}

ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ ИЗ КНИГ (если продукта нет в базе — ищи здесь):
${booksText || '(книги не загружены)'}

СУТОЧНЫЕ НОРМЫ:
${JSON.stringify(norms, null, 2)}

ЗАДАЧА:
1. Распознай каждый продукт и порцию (если порция не указана — используй стандартную).
2. Для каждого продукта найди в базе: калории, белки, жиры, углеводы, незаменимые аминокислоты (лейцин, изолейцин, валин, лизин, метионин, фенилаланин, треонин, триптофан, гистидин), Омега-3, Омега-6.
3. Просуммируй всё за день.
4. Сравни с суточными нормами.

Ответь СТРОГО в JSON (без markdown-блоков, без пояснений — только JSON):
{
  "meals": {
    "breakfast": [{"product": "...", "portion_g": 0, "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "amino_acids": {"leucine":0,"isoleucine":0,"valine":0,"lysine":0,"methionine":0,"phenylalanine":0,"threonine":0,"tryptophan":0,"histidine":0}, "omega3": 0, "omega6": 0}],
    "lunch": [...],
    "dinner": [...]
  },
  "totals": {"calories": 0, "protein": 0, "fat": 0, "carbs": 0, "amino_acids": {"leucine":0,"isoleucine":0,"valine":0,"lysine":0,"methionine":0,"phenylalanine":0,"threonine":0,"tryptophan":0,"histidine":0}, "omega3": 0, "omega6": 0},
  "norms": {"calories": 2500, "protein": 80, "fat": 70, "carbs": 350, "amino_acids": {...}, "omega3_min": 1.1, "omega6_max": 17},
  "deficits": ["описание дефицита 1", "описание дефицита 2"],
  "imbalances": ["описание дисбаланса 1"],
  "recommendations": ["рекомендация 1", "рекомендация 2"]
}`;
  }

  function buildUserMessage(breakfast, lunch, dinner) {
    return `РАЦИОН СТУДЕНТА:
Завтрак: ${breakfast || '(не указан)'}
Обед: ${lunch || '(не указан)'}
Ужин: ${dinner || '(не указан)'}`;
  }

  function parseResponse(text) {
    // Убираем возможные markdown-обёртки
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    }
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // Попробуем найти JSON в тексте
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw new Error('Не удалось разобрать ответ ИИ: ' + cleaned.substring(0, 200));
    }
  }

  return { analyze, setProxyUrl, getProxyUrl };
})();
