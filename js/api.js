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

  /**
   * Извлекает ключевые слова из текста рациона для поиска по книге.
   * Разбивает на слова, убирает короткие/служебные, оставляет существительные продуктов.
   */
  function extractKeywords(breakfast, lunch, dinner) {
    const text = [breakfast, lunch, dinner].filter(Boolean).join(' ');
    const stopWords = new Set([
      'и', 'с', 'в', 'на', 'из', 'по', 'не', 'за', 'от', 'до', 'без', 'для',
      'или', 'но', 'что', 'как', 'это', 'так', 'уже', 'ещё', 'еще', 'тоже',
      'грамм', 'порция', 'кусок', 'штук', 'штука', 'ложка', 'стакан', 'чашка',
      'тарелка', 'немного', 'много', 'мало', 'около', 'примерно',
    ]);
    const words = text
      .toLowerCase()
      .replace(/[^а-яёa-z\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w));
    // Уникальные
    return [...new Set(words)];
  }

  async function analyze(breakfast, lunch, dinner) {
    const products = Database.getProducts();
    const norms = Database.getNorms();

    // Ищем в книге только по упомянутым продуктам (вместо передачи всей книги)
    const keywords = extractKeywords(breakfast, lunch, dinner);
    const booksExcerpt = Database.searchBooks(keywords);

    const systemPrompt = buildSystemPrompt(products, norms, booksExcerpt);
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

  function buildSystemPrompt(products, norms, booksExcerpt) {
    const hasManualProducts = products && products.length > 0;
    const productsSection = hasManualProducts
      ? `БАЗА ПРОДУКТОВ (приоритетный источник, добавлено вручную преподавателем):\n${JSON.stringify(products, null, 2)}`
      : 'БАЗА ПРОДУКТОВ: (пока пуста — используй данные из книг ниже)';

    return `Ты — нутрициолог-аналитик. Проанализируй рацион студента.

ИСТОЧНИКИ ДАННЫХ (по приоритету):
1. Ручная база продуктов (если есть) — данные от преподавателя
2. Фрагменты из справочника Скурихина «Химический состав российских продуктов питания» (2008)
3. Только если продукта нет ни в базе, ни в книге — используй свои знания, но ОБЯЗАТЕЛЬНО отметь это в поле source: "оценка ИИ"

${productsSection}

ДАННЫЕ ИЗ СПРАВОЧНИКА СКУРИХИНА (фрагменты таблиц по указанным продуктам):
Таблицы содержат данные на 100 г съедобной части. Колонки левой части: Код, Продукты, Порция, Вода, Бел(белки%), Жир%, НЖК, Хол(мг%), МДС, Кр(крахмал), Угл(углеводы%), ПВ(пищ.волокна), ОК, Зола.
Колонки правой части: Na, К, Са, Мд, Р, Fe, А(мкг%), Кар, РЭ, ТЭ, B1, В2, РР, НЭ, С, ЭЦ(ккал), Код.
Для каждого продукта 3 строки: 1) на 100 г, 2) на порцию, 3) %суточной потребности.

${booksExcerpt}

СУТОЧНЫЕ НОРМЫ:
${JSON.stringify(norms, null, 2)}

ЗАДАЧА:
1. Распознай каждый продукт и порцию (если порция не указана — используй стандартную).
2. Для каждого продукта найди данные: калории, белки, жиры, углеводы, незаменимые аминокислоты, Омега-3, Омега-6.
3. Для каждого продукта ОБЯЗАТЕЛЬНО укажи поле "source" — откуда взяты данные:
   - Если из ручной базы: "База продуктов"
   - Если из справочника: "Скурихин, табл. X" (укажи номер таблицы/главы, например "Скурихин, табл. 1" для молочных, "табл. 3" для мясных и т.д.)
   - Если данных нет ни в базе, ни в книге: "Оценка ИИ"
4. Просуммируй всё за день.
5. Сравни с суточными нормами.

Ответь СТРОГО в JSON (без markdown-блоков, без пояснений — только JSON):
{
  "meals": {
    "breakfast": [{"product": "...", "portion_g": 0, "calories": 0, "protein": 0, "fat": 0, "carbs": 0, "amino_acids": {"leucine":0,"isoleucine":0,"valine":0,"lysine":0,"methionine":0,"phenylalanine":0,"threonine":0,"tryptophan":0,"histidine":0}, "omega3": 0, "omega6": 0, "source": "Скурихин, табл. X"}],
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
