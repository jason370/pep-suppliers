const { getStore } = require('@netlify/blobs');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function getBearerToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i) || auth.match(/^token\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function validateGithubToken(token) {
  if (!token) return false;
  try {
    const res = await fetch('https://api.github.com/user', {
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

function pendingStore() {
  return getStore({ name: 'pending-reviews', consistency: 'strong' });
}

async function listPendingReviews() {
  const store = pendingStore();
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

  const token = getBearerToken(event);
  if (!(await validateGithubToken(token))) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  if (event.httpMethod === 'GET') {
    try {
      const reviews = await listPendingReviews();
      return jsonResponse(200, { reviews });
    } catch (err) {
      console.error('pending-reviews list failed', err);
      return jsonResponse(502, { error: 'Could not load pending reviews.' });
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
      const store = pendingStore();
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
