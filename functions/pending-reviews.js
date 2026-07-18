const { connectLambda, getStore } = require('@netlify/blobs');

const REPO = 'jason370/pep-suppliers';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-GitHub-Token, X-Admin-Password',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

async function validateGithubToken(token) {
  if (!token) return false;
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

async function isAuthorized(event) {
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const providedPassword = headerValue(event, 'x-admin-password');
  if (adminPassword && providedPassword && providedPassword === adminPassword) {
    return true;
  }
  return validateGithubToken(getRequestToken(event));
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

  if (!(await isAuthorized(event))) {
    return jsonResponse(401, {
      error: 'Unauthorized — enter the site password on the admin login screen to load pending customer reviews.',
    });
  }

  if (event.httpMethod === 'GET') {
    try {
      const reviews = await listPendingReviews(event);
      return jsonResponse(200, { reviews, count: reviews.length });
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
