#!/usr/bin/env node

/**
 * parse-books.js
 * Парсит Markdown-таблицы из файлов в папке books/ и формирует data/products.json
 *
 * Запуск: node tools/parse-books.js
 */

const fs = require('fs');
const path = require('path');

const BOOKS_DIR = path.join(__dirname, '..', 'books');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'products.json');
const INDEX_FILE = path.join(__dirname, '..', 'books', 'index.json');

// Маппинг заголовков колонок на поля
const COLUMN_PATTERNS = {
  name: /продукт|название|наименование|name|food|item/i,
  calories: /калор|ккал|энерг|calor|kcal|energy/i,
  protein: /бел[ок|ки]|протеин|protein/i,
  fat: /жир|fat|липид/i,
  carbs: /углевод|carb|карб/i,
  fast_carbs: /быстр.*углевод|сахар|sugar|simple.*carb|моно.*дисахарид/i,
  leucine: /лейцин|leucine/i,
  isoleucine: /изолейцин|isoleucine/i,
  valine: /валин|valine/i,
  lysine: /лизин|lysine/i,
  methionine: /метионин|methionine/i,
  phenylalanine: /фенилаланин|phenylalanine/i,
  threonine: /треонин|threonine/i,
  tryptophan: /триптофан|tryptophan/i,
  histidine: /гистидин|histidine/i,
  omega3: /омега.*3|omega.*3|ω.*3/i,
  omega6: /омега.*6|omega.*6|ω.*6/i,
  portion: /порция|portion|serving/i,
};

function parseNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/[^\d.,\-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function detectColumns(headerCells) {
  const mapping = {};
  headerCells.forEach((cell, index) => {
    const trimmed = cell.trim();
    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (pattern.test(trimmed)) {
        mapping[field] = index;
        break;
      }
    }
  });
  return mapping;
}

function parseMarkdownTable(tableLines, sourceFile) {
  if (tableLines.length < 3) return [];

  const headerLine = tableLines[0];
  const headerCells = headerLine.split('|').map(c => c.trim()).filter(c => c !== '');

  const columnMap = detectColumns(headerCells);

  if (!columnMap.name) {
    console.log(`  ⚠ Таблица пропущена — не найдена колонка с названием продукта`);
    return [];
  }

  const products = [];

  // Пропускаем заголовок (строка 0) и разделитель (строка 1)
  for (let i = 2; i < tableLines.length; i++) {
    const line = tableLines[i];
    const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');

    if (cells.length < 2) continue;

    const name = cells[columnMap.name];
    if (!name || /^[-\s:]+$/.test(name)) continue;

    const product = {
      name: name.trim(),
      aliases: [],
      portion_default_g: parseNumber(cells[columnMap.portion]) || 100,
      source: sourceFile,
      per_100g: {
        calories: parseNumber(cells[columnMap.calories]) || 0,
        protein: parseNumber(cells[columnMap.protein]) || 0,
        fat: parseNumber(cells[columnMap.fat]) || 0,
        carbs: parseNumber(cells[columnMap.carbs]) || 0,
        fast_carbs: parseNumber(cells[columnMap.fast_carbs]) || 0,
        amino_acids: {
          leucine: parseNumber(cells[columnMap.leucine]) || 0,
          isoleucine: parseNumber(cells[columnMap.isoleucine]) || 0,
          valine: parseNumber(cells[columnMap.valine]) || 0,
          lysine: parseNumber(cells[columnMap.lysine]) || 0,
          methionine: parseNumber(cells[columnMap.methionine]) || 0,
          phenylalanine: parseNumber(cells[columnMap.phenylalanine]) || 0,
          threonine: parseNumber(cells[columnMap.threonine]) || 0,
          tryptophan: parseNumber(cells[columnMap.tryptophan]) || 0,
          histidine: parseNumber(cells[columnMap.histidine]) || 0,
        },
        omega3: parseNumber(cells[columnMap.omega3]) || 0,
        omega6: parseNumber(cells[columnMap.omega6]) || 0,
      }
    };

    products.push(product);
  }

  return products;
}

function extractTables(content) {
  const lines = content.split('\n');
  const tables = [];
  let currentTable = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('|') && trimmed.startsWith('|')) {
      inTable = true;
      currentTable.push(trimmed);
    } else {
      if (inTable && currentTable.length >= 3) {
        tables.push([...currentTable]);
      }
      currentTable = [];
      inTable = false;
    }
  }

  if (inTable && currentTable.length >= 3) {
    tables.push(currentTable);
  }

  return tables;
}

function mergeProducts(existing, newProduct) {
  // Считаем заполненность — сколько ненулевых полей
  const countFilled = (p) => {
    let count = 0;
    const g = p.per_100g;
    if (g.calories) count++;
    if (g.protein) count++;
    if (g.fat) count++;
    if (g.carbs) count++;
    for (const v of Object.values(g.amino_acids)) {
      if (v) count++;
    }
    if (g.omega3) count++;
    if (g.omega6) count++;
    return count;
  };

  if (countFilled(newProduct) > countFilled(existing)) {
    // Новый продукт полнее — заменяем, но сохраняем алиасы
    newProduct.aliases = [...new Set([...existing.aliases, ...newProduct.aliases])];
    return newProduct;
  }

  // Дополняем существующий недостающими данными
  const g = existing.per_100g;
  const ng = newProduct.per_100g;
  if (!g.calories && ng.calories) g.calories = ng.calories;
  if (!g.protein && ng.protein) g.protein = ng.protein;
  if (!g.fat && ng.fat) g.fat = ng.fat;
  if (!g.carbs && ng.carbs) g.carbs = ng.carbs;
  if (!g.omega3 && ng.omega3) g.omega3 = ng.omega3;
  if (!g.omega6 && ng.omega6) g.omega6 = ng.omega6;
  for (const key of Object.keys(g.amino_acids)) {
    if (!g.amino_acids[key] && ng.amino_acids[key]) {
      g.amino_acids[key] = ng.amino_acids[key];
    }
  }

  return existing;
}

function main() {
  console.log('🔍 Парсинг книг из папки books/...\n');

  const files = fs.readdirSync(BOOKS_DIR)
    .filter(f => f.endsWith('.md') && f !== 'README.md');

  if (files.length === 0) {
    console.log('⚠ Нет MD-файлов в папке books/');
    console.log('  Положите файлы с таблицами продуктов и запустите снова.\n');
    fs.writeFileSync(OUTPUT_FILE, '[]', 'utf8');
    console.log('✅ Создан пустой data/products.json');
    return;
  }

  console.log(`📚 Найдено файлов: ${files.length}\n`);

  const allProducts = new Map(); // name.toLowerCase() -> product
  let totalFound = 0;

  for (const file of files) {
    const filePath = path.join(BOOKS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const tables = extractTables(content);

    console.log(`📖 ${file}: найдено таблиц — ${tables.length}`);

    let fileProducts = 0;
    for (const table of tables) {
      const products = parseMarkdownTable(table, file);
      fileProducts += products.length;

      for (const product of products) {
        const key = product.name.toLowerCase().trim();
        if (allProducts.has(key)) {
          allProducts.set(key, mergeProducts(allProducts.get(key), product));
        } else {
          allProducts.set(key, product);
        }
      }
    }

    console.log(`   Продуктов извлечено: ${fileProducts}`);
    totalFound += fileProducts;
  }

  const result = Array.from(allProducts.values());

  // Статистика заполненности
  let withAmino = 0;
  let withOmega = 0;
  for (const p of result) {
    const aa = Object.values(p.per_100g.amino_acids);
    if (aa.some(v => v > 0)) withAmino++;
    if (p.per_100g.omega3 > 0 || p.per_100g.omega6 > 0) withOmega++;
  }

  console.log(`\n📊 Итого:`);
  console.log(`   Всего записей (до дедупликации): ${totalFound}`);
  console.log(`   Уникальных продуктов: ${result.length}`);
  console.log(`   С аминокислотами: ${withAmino}`);
  console.log(`   С Омега-3/6: ${withOmega}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n✅ Записано в ${OUTPUT_FILE}`);

  // Обновляем index.json
  fs.writeFileSync(INDEX_FILE, JSON.stringify(files, null, 2), 'utf8');
  console.log(`✅ Обновлён ${INDEX_FILE}`);
}

main();
