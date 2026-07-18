const { connectLambda, getStore } = require('@netlify/blobs');

const REPO = 'jason370/pep-suppliers';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Token',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function getRequestToken(event) {
  const headers = event.headers || {};
  const custom = headers['x-github-token'] || headers['X-GitHub-Token'] || '';
  if (custom) return String(custom).trim();
  const auth = headers.authorization || headers.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i) || auth.match(/^token\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function validateGithubToken(token) {
  if (!token) return false;
  // Accept the site's own Netlify GITHUB_TOKEN as a shared secret.
  if (process.env.GITHUB_TOKEN && token === process.env.GITHUB_TOKEN) return true;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/contents/reviews.json?ref=main`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'pep-suppliers-pending-reviews',
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

async function listPendingReviews(event) {
  const store = pendingStore(event);
  const { blobs } = await store.list();
  const reviews = [];
  for (const blob of blobs) {
    const review = await store.get(blob.key, { type: 'json' });
    if (review && typeof review === 'object') reviews.push(review);
  }
  reviews.sort(function (a, b) {
    return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
  });
  return reviews;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }

  const token = getRequestToken(event);
  if (!(await validateGithubToken(token))) {
    return jsonResponse(401, { error: 'Unauthorized — GitHub token could not read the repo.' });
  }

  if (event.httpMethod === 'GET') {
    try {
      const reviews = await listPendingReviews(event);
      return jsonResponse(200, { reviews });
    } catch (err) {
      console.error('pending-reviews list failed', err);
      return jsonResponse(502, {
        error: 'Could not load pending reviews.',
        detail: String(err && err.message ? err.message : err),
      });
    }
  }

  if (event.httpMethod === 'DELETE') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (_err) {
      return jsonResponse(400, { error: 'Invalid JSON body' });
    }
    const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
    if (!ids.length) {
      return jsonResponse(400, { error: 'id or ids required' });
    }
    try {
      const store = pendingStore(event);
      await Promise.all(ids.map(function (id) {
        return store.delete(String(id));
      }));
      return jsonResponse(200, { ok: true, deleted: ids.length });
    } catch (err) {
      console.error('pending-reviews delete failed', err);
      return jsonResponse(502, { error: 'Could not delete pending reviews.' });
    }
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};
