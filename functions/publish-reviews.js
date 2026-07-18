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

function cleanReviewForStore(review) {
  const copy = Object.assign({}, review);
  delete copy._blobPending;
  return copy;
}

function cleanReviewForGithub(review) {
  const copy = cleanReviewForStore(review);
  delete copy.photoBase64;
  delete copy.photoMime;
  // Never commit giant data-URL photos into reviews.json
  if (copy.photo && String(copy.photo).indexOf('data:') === 0) delete copy.photo;
  return copy;
}

function normalizeIncomingPhoto(review) {
  const next = cleanReviewForStore(review);
  if ((!next.photoBase64 || !next.photoMime) && next.photo && String(next.photo).indexOf('data:') === 0) {
    const match = String(next.photo).match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      next.photoMime = match[1];
      next.photoBase64 = match[2];
    }
  }
  return next;
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
    const clean = reviews.map(cleanReviewForGithub);
    const contentB64 = Buffer.from(JSON.stringify(clean, null, 2) + '\n', 'utf8').toString('base64');
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Update reviews from pricing admin',
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

async function upsertBlobReviews(store, reviews) {
  const saved = [];
  for (const review of reviews) {
    if (!review || !review.id) continue;
    const existing = await store.get(String(review.id), { type: 'json' });
    const next = normalizeIncomingPhoto(review);
    const existingStamp = existing && typeof existing === 'object'
      ? Date.parse(existing.updatedAt || existing.submittedAt || 0) || 0
      : 0;
    const nextStamp = Date.parse(next.updatedAt || next.submittedAt || 0) || 0;

    // Never clobber a newer live Blobs edit with an older reviews.json/admin copy.
    if (existing && typeof existing === 'object' && existingStamp > nextStamp) {
      saved.push(String(review.id));
      continue;
    }

    if (existing && typeof existing === 'object') {
      // Prefer newly uploaded photo data over stale Blobs photo.
      if (next.photoBase64) {
        // keep next.photoBase64 / photoMime
      } else if (existing.photoBase64) {
        next.photoBase64 = existing.photoBase64;
        next.photoMime = existing.photoMime || next.photoMime;
      }
      if (!next.photo && existing.photo) next.photo = existing.photo;
      if (!next.submittedAt && existing.submittedAt) next.submittedAt = existing.submittedAt;
      if (!next.source && existing.source) next.source = existing.source;
    }
    if (next.published === undefined) next.published = true;
    next.updatedAt = next.updatedAt || new Date().toISOString();
    await store.setJSON(String(review.id), next);
    saved.push(String(review.id));
  }
  return saved;
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
  const syncAll = body.syncAll === true;
  const token = getRequestToken(event) || process.env.GITHUB_TOKEN || '';

  try {
    const store = pendingStore(event);
    let savedIds = [];

    // Full review payloads: upsert into Blobs so homepage edits go live immediately.
    if (reviews && reviews.length) {
      const toSave = syncAll
        ? reviews
        : ids.length
          ? reviews.filter(function (r) { return r && ids.indexOf(String(r.id)) >= 0; })
          : reviews.filter(function (r) { return r && r.published !== false; });
      savedIds = await upsertBlobReviews(store, toSave.length ? toSave : reviews.filter(function (r) {
        return r && ids.indexOf(String(r.id)) >= 0;
      }));
    } else if (ids.length) {
      for (const id of ids) {
        const existing = await store.get(id, { type: 'json' });
        if (!existing || typeof existing !== 'object') continue;
        existing.published = true;
        await store.setJSON(id, existing);
        savedIds.push(id);
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

    if (!savedIds.length && !githubOk) {
      return jsonResponse(502, {
        error: 'Could not publish reviews.',
        detail: githubError || 'No matching reviews found to update.',
      });
    }

    return jsonResponse(200, {
      ok: true,
      publishedIds: savedIds,
      github: githubOk,
      githubError: githubOk ? undefined : githubError || undefined,
      message: githubOk
        ? 'Reviews updated on the site.'
        : 'Reviews updated on the live site. GitHub file sync failed, but customers can already see the changes.',
    });
  } catch (err) {
    console.error('publish-reviews failed', err);
    return jsonResponse(502, {
      error: 'Could not publish reviews.',
      detail: String(err && err.message ? err.message : err),
    });
  }
};
