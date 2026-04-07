/**
 * Cloudflare Worker — прокси для Claude API + CRUD данных через GitHub API
 *
 * Secrets (wrangler secret put):
 *   ANTHROPIC_API_KEY — ключ Claude API
 *   GITHUB_TOKEN      — Personal Access Token (repo scope)
 *
 * Vars (wrangler.toml [vars]):
 *   GITHUB_REPO       — owner/repo (например "myuser/nutricheck")
 *   GITHUB_BRANCH     — ветка (по умолчанию "main")
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // --- Claude API proxy ---
      if (path === '/api/analyze' && request.method === 'POST') {
        return handleAnalyze(request, env);
      }

      // --- Data: read file ---
      if (path.startsWith('/data/') && request.method === 'GET') {
        const file = 'data/' + path.slice(6); // e.g. "data/users.json"
        return handleReadFile(file, env);
      }

      // --- Data: write file ---
      if (path.startsWith('/data/') && request.method === 'PUT') {
        const file = 'data/' + path.slice(6);
        const body = await request.json();
        return handleWriteFile(file, body, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};

// ===== Claude API =====

async function handleAnalyze(request, env) {
  const body = await request.json();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: body.messages,
      system: body.system || '',
    }),
  });

  const data = await response.json();
  return jsonResponse(data);
}

// ===== GitHub API: read file =====

async function handleReadFile(filePath, env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const token = env.GITHUB_TOKEN;

  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;

  const res = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NutriCheck-Worker',
    },
  });

  if (!res.ok) {
    if (res.status === 404) return jsonResponse(null);
    const err = await res.text();
    return jsonResponse({ error: 'GitHub read error: ' + err }, res.status);
  }

  const meta = await res.json();
  const content = atob(meta.content);
  const data = JSON.parse(content);

  return jsonResponse({ data, sha: meta.sha });
}

// ===== GitHub API: write (create/update) file =====

async function handleWriteFile(filePath, body, env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const token = env.GITHUB_TOKEN;

  // body.data — JSON данные для записи
  // body.message — commit message (опционально)
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(body.data, null, 2))));
  const commitMessage = body.message || `Update ${filePath}`;

  // Получаем текущий SHA файла (нужен для обновления)
  const getUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;
  const getRes = await fetch(getUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NutriCheck-Worker',
    },
  });

  let sha = null;
  if (getRes.ok) {
    const meta = await getRes.json();
    sha = meta.sha;
  }

  // Записываем
  const putUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const putBody = {
    message: commitMessage,
    content,
    branch,
  };
  if (sha) putBody.sha = sha;

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NutriCheck-Worker',
    },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    return jsonResponse({ error: 'GitHub write error: ' + err }, putRes.status);
  }

  const result = await putRes.json();
  return jsonResponse({ ok: true, sha: result.content.sha });
}
