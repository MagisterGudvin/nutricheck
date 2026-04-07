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

      // --- Books: read file (text) ---
      if (path.startsWith('/books/') && request.method === 'GET') {
        const file = 'books/' + path.slice(7);
        return handleReadTextFile(file, env);
      }

      // --- Books: write file (text, .md only) ---
      if (path.startsWith('/books/') && request.method === 'PUT') {
        const file = 'books/' + path.slice(7);
        if (!file.endsWith('.md') && !file.endsWith('.json')) {
          return jsonResponse({ error: 'Only .md and .json files allowed in books/' }, 400);
        }
        const body = await request.json();
        return handleWriteTextFile(file, body, env);
      }

      // --- Books: delete file ---
      if (path.startsWith('/books/') && request.method === 'DELETE') {
        const file = 'books/' + path.slice(7);
        return handleDeleteFile(file, env);
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
  // atob возвращает бинарную строку; для корректной декодировки UTF-8 (кириллица)
  // нужно пропустить через Uint8Array → TextDecoder
  const binary = atob(meta.content.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const content = new TextDecoder('utf-8').decode(bytes);
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

// ===== GitHub API: read text file (books) =====

async function handleReadTextFile(filePath, env) {
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
  const binary = atob(meta.content.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const text = new TextDecoder('utf-8').decode(bytes);

  return jsonResponse({ text, sha: meta.sha });
}

// ===== GitHub API: write text file (books) =====

async function handleWriteTextFile(filePath, body, env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const token = env.GITHUB_TOKEN;

  // body.text — текстовое содержимое файла
  // body.message — commit message
  const encoder = new TextEncoder();
  const encoded = encoder.encode(body.text);
  let binaryStr = '';
  for (let i = 0; i < encoded.length; i++) binaryStr += String.fromCharCode(encoded[i]);
  const content = btoa(binaryStr);
  const commitMessage = body.message || `Update ${filePath}`;

  // Получаем текущий SHA
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

  const putUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const putBody = { message: commitMessage, content, branch };
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

// ===== GitHub API: delete file =====

async function handleDeleteFile(filePath, env) {
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  const token = env.GITHUB_TOKEN;

  // Получаем SHA
  const getUrl = `https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`;
  const getRes = await fetch(getUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NutriCheck-Worker',
    },
  });

  if (!getRes.ok) {
    return jsonResponse({ error: 'File not found' }, 404);
  }

  const meta = await getRes.json();

  const delRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'NutriCheck-Worker',
    },
    body: JSON.stringify({
      message: `Delete ${filePath}`,
      sha: meta.sha,
      branch,
    }),
  });

  if (!delRes.ok) {
    const err = await delRes.text();
    return jsonResponse({ error: 'GitHub delete error: ' + err }, delRes.status);
  }

  return jsonResponse({ ok: true });
}
