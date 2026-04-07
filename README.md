# NutriCheck — Анализ питания студентов

Веб-приложение (SPA) для анализа рациона студентов с помощью Claude AI.  
Работает на GitHub Pages + Cloudflare Workers (прокси для Claude API + синхронизация данных).

## Структура проекта

```
├── index.html            # SPA — единственная HTML-страница
├── css/style.css         # Стили
├── js/                   # Модули JS
│   ├── app.js            # Роутинг, инициализация
│   ├── storage.js        # Чтение/запись данных (Worker → GitHub API)
│   ├── auth.js           # Авторизация
│   ├── api.js            # Запросы к Claude API через прокси
│   ├── database.js       # База продуктов, отчёты, комментарии
│   ├── analysis.js       # Логика анализа (сравнение с нормами)
│   ├── reports.js        # Экспорт CSV
│   └── ui.js             # Отрисовка интерфейса
├── data/
│   ├── products.json           # База продуктов (генерируется из книг)
│   ├── norms.json              # Суточные нормы
│   ├── config.json             # Настройки (URL Worker и т.д.)
│   ├── users.json              # Пользователи
│   ├── reports.json            # Отчёты студентов
│   ├── comments.json           # Комментарии преподавателя
│   └── products_override.json  # Правки базы продуктов
├── books/                # MD-файлы с данными из книг о питании
│   ├── index.json        # Список файлов (обновляется скриптом)
│   └── README.md         # Инструкция
├── tools/
│   └── parse-books.js    # Парсер таблиц из MD → products.json
├── worker/
│   ├── worker.js         # Cloudflare Worker (прокси Claude API + CRUD данных)
│   └── wrangler.toml     # Конфиг Wrangler
├── .github/workflows/
│   ├── deploy.yml        # Деплой GitHub Pages
│   └── sync-data.yml     # Валидация данных + бэкап при изменениях
└── _config.yml           # Jekyll (GitHub Pages)
```

## Быстрый старт

### 1. Подготовка базы продуктов из книг

1. Положите MD-файлы с таблицами продуктов в папку `books/`.
2. Запустите парсинг:

```bash
node tools/parse-books.js
```

Скрипт автоматически найдёт Markdown-таблицы, извлечёт данные и запишет `data/products.json`.

### 2. Деплой Cloudflare Worker (прокси + хранение данных)

Worker выполняет две функции:
- Проксирует запросы к Claude AI API
- Читает/пишет данные (users, reports, comments) в репозиторий через GitHub API

1. Установите [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/):

```bash
npm install -g wrangler
```

2. Авторизуйтесь:

```bash
wrangler login
```

3. Отредактируйте `worker/wrangler.toml` — укажите `GITHUB_REPO`:

```toml
[vars]
GITHUB_REPO = "ваш-юзернейм/nutricheck"
GITHUB_BRANCH = "main"
```

4. Задайте секреты:

```bash
cd worker
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GITHUB_TOKEN
```

> **GITHUB_TOKEN** — Personal Access Token с правами `repo` (Settings → Developer settings → Personal access tokens → Fine-grained tokens → выберите репозиторий, Contents: Read and write).

5. Задеплойте:

```bash
wrangler deploy
```

6. Скопируйте URL воркера (например `https://nutricheck-proxy.your-name.workers.dev`).

### 3. Деплой на GitHub Pages

1. Создайте репозиторий на GitHub.
2. Отредактируйте `_config.yml` — укажите ваш `baseurl` и `url`.
3. Запушьте код:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USER/nutricheck.git
git push -u origin main
```

4. В настройках репозитория:
   - Settings → Pages → Source: **GitHub Actions**
   - Settings → Actions → General → Workflow permissions: **Read and write permissions**

### 4. Настройка приложения

1. Откройте приложение в браузере.
2. Войдите как преподаватель (`admin` / `admin123`).
3. Перейдите в **Настройки** и укажите URL вашего Cloudflare Worker.
4. Нажмите **Проверить подключение** — убедитесь, что данные загружаются.
5. Готово!

## Роли

| Роль | Логин | Возможности |
|------|-------|-------------|
| **Преподаватель** | `admin` / `admin123` | Просмотр всех студентов, редактирование отчётов, комментарии, экспорт CSV, редактирование базы продуктов |
| **Студент** | Регистрация | Ввод рациона, анализ через ИИ, просмотр отчётов и сводки за неделю |

## Как это работает

1. Студент вводит рацион текстом (завтрак, обед, ужин).
2. Приложение отправляет текст + базу продуктов в Claude AI через Cloudflare Worker.
3. ИИ распознаёт продукты, считает БЖУ, аминокислоты, Омега-3/6 и сравнивает с нормами.
4. Результат отображается в виде таблиц с цветовой индикацией.
5. Преподаватель может просматривать, редактировать и комментировать отчёты.

## Хранение данных

Данные хранятся в JSON-файлах прямо в репозитории GitHub:

| Файл | Содержимое |
|------|-----------|
| `data/config.json` | Настройки приложения (URL Worker и т.д.) |
| `data/users.json` | Зарегистрированные пользователи |
| `data/reports.json` | Отчёты по дням `{ studentId: [reports] }` |
| `data/comments.json` | Комментарии преподавателя `{ "id_date": "text" }` |
| `data/products_override.json` | Правки базы продуктов преподавателем |

**Как работает синхронизация:**
1. Приложение отправляет данные → Cloudflare Worker
2. Worker коммитит изменения в репозиторий через GitHub API
3. GitHub Actions (`sync-data.yml`) валидирует JSON и создаёт backup-ветку
4. GitHub Pages автоматически пересобирается

> В `localStorage` хранится только сессия текущего пользователя (ID и роль).  
> Все остальные данные — в файлах репозитория.

## Workflows

| Workflow | Триггер | Что делает |
|----------|---------|-----------|
| `deploy.yml` | Push в main | Собирает Jekyll, деплоит на GitHub Pages |
| `sync-data.yml` | Изменения в `data/*.json` | Валидирует JSON, печатает сводку, создаёт backup-ветку |

## Технологии

- Чистый HTML / CSS / JS (без фреймворков)
- Claude AI API (через Cloudflare Workers)
- GitHub API (хранение данных в репозитории)
- GitHub Pages (Jekyll) + GitHub Actions
