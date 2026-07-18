const { connectLambda, getStore } = require('@netlify/blobs');

const REPO = 'jason370/pep-suppliers';
const REVIEWS_PATH = 'reviews.json';
const BRANCH = 'main';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Token, X-Admin-Password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function headerValue(event, name) {
  const headers = event.headers || {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return String(headers[key] || '').trim();
  }
  return '';
}

function getRequestToken(event) {
  const custom = headerValue(event, 'x-github-token');
  if (custom) return custom;
  const auth = headerValue(event, 'authorization');
  const match = auth.match(/^Bearer\s+(.+)$/i) || auth.match(/^token\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function isAuthorized(event) {
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const providedPassword = headerValue(event, 'x-admin-password');
  if (adminPassword && providedPassword && providedPassword === adminPassword) return true;

  const token = getRequestToken(event);
  if (!token) return false;
  if (process.env.GITHUB_TOKEN && token === process.env.GITHUB_TOKEN) return true;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/reviews.json?ref=${BRANCH}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pep-suppliers-publish-reviews',
      },
    });
    return res.ok;
  } catch (_err) {
    return false;
  }
}

function pendingStore(event) {
  connectLambda(event);
  return getStore('pending-reviews');
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pep-suppliers-publish-reviews',
  };
}

async function writeReviewsJson(token, reviews) {
  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${REVIEWS_PATH}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: githubHeaders(token) });
    if (!getRes.ok) {
      const errBody = await getRes.json().catch(function () { return {}; });
      throw new Error(errBody.message || `GitHub read failed (${getRes.status})`);
    }
    const meta = await getRes.json();
    const clean = reviews.map(function (r) {
      const copy = Object.assign({}, r);
      delete copy._blobPending;
      delete copy.photoBase64;
      delete copy.photoMime;
      return copy;
    });
    const contentB64 = Buffer.from(JSON.stringify(clean, null, 2) + '\n', 'utf8').toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Publish reviews from pricing admin',
        content: contentB64,
        sha: meta.sha,
        branch: BRANCH,
      }),
    });
    const putData = await putRes.json().catch(function () { return {}; });
    if (putRes.ok) return putData;
    if (putRes.status !== 409 || attempt === 2) {
      throw new Error(putData.message || `GitHub write failed (${putRes.status})`);
    }
  }
  throw new Error('GitHub write conflict');
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }
  if (!(await isAuthorized(event))) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_err) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const ids = Array.isArray(body.ids) ? body.ids.map(String) : body.id ? [String(body.id)] : [];
  const reviews = Array.isArray(body.reviews) ? body.reviews : null;
  const token = getRequestToken(event) || process.env.GITHUB_TOKEN || '';

  try {
    const store = pendingStore(event);
    const published = [];

    if (ids.length) {
      for (const id of ids) {
        const existing = await store.get(id, { type: 'json' });
        if (!existing || typeof existing !== 'object') continue;
        existing.published = true;
        await store.setJSON(id, existing);
        published.push(id);
      }
    }

    let githubOk = false;
    let githubError = '';
    if (reviews && token) {
      try {
        await writeReviewsJson(token, reviews);
        githubOk = true;
      } catch (err) {
        githubError = String(err && err.message ? err.message : err);
        console.error('publish-reviews github write failed', err);
      }
    }

    if (!published.length && !githubOk) {
      return jsonResponse(502, {
        error: 'Could not publish reviews.',
        detail: githubError || 'No matching pending reviews found.',
      });
    }

    return jsonResponse(200, {
      ok: true,
      publishedIds: published,
      github: githubOk,
      githubError: githubOk ? undefined : githubError || undefined,
      message: githubOk
        ? 'Reviews published to the site.'
        : 'Reviews are live on the site now. GitHub sync failed, but customers can already see them.',
    });
  } catch (err) {
    console.error('publish-reviews failed', err);
    return jsonResponse(502, {
      error: 'Could not publish reviews.',
      detail: String(err && err.message ? err.message : err),
    });
  }
};
