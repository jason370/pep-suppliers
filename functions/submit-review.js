const { connectLambda, getStore } = require('@netlify/blobs');

const REPO = 'jason370/pep-suppliers';
const PENDING_PATH = 'pending-reviews.json';
const BRANCH = 'main';
const MAX_TEXT = 1200;
const MAX_NAME = 80;
const MAX_ROLE = 120;
const MAX_LOCATION = 120;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function cleanText(value, maxLen) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function newReviewId() {
  return 'review-guest-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pep-suppliers-submit-review',
  };
}

async function getFile(path, token) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
    { headers: githubHeaders(token) }
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(`GitHub read failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function putFile(path, contentB64, message, sha, token) {
  const body = { message, content: contentB64, branch: BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    const err = new Error(data.message || `GitHub write failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function saveToBlobs(event, reviewId, review) {
  try {
    connectLambda(event);
    const store = getStore('pending-reviews');
    await store.setJSON(reviewId, review);
    return true;
  } catch (err) {
    console.error('blob save failed', err);
    return false;
  }
}

async function saveToGithub(token, review) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const meta = await getFile(PENDING_PATH, token);
      let list = [];
      if (meta && meta.content) {
        try {
          const decoded = Buffer.from(meta.content, 'base64').toString('utf8');
          list = JSON.parse(decoded);
          if (!Array.isArray(list)) list = [];
        } catch (_err) {
          list = [];
        }
      }
      list.unshift(review);
      const contentStr = JSON.stringify(list, null, 2) + '\n';
      await putFile(
        PENDING_PATH,
        Buffer.from(contentStr, 'utf8').toString('base64'),
        'Customer review submission (pending)',
        meta && meta.sha ? meta.sha : undefined,
        token
      );
      return true;
    } catch (err) {
      if (attempt === 2 || err.status !== 409) {
        console.error('github pending save failed', err);
        throw err;
      }
    }
  }
  return false;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_err) {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  if (body.company) {
    return jsonResponse(200, { ok: true });
  }

  const text = cleanText(body.text, MAX_TEXT);
  const name = cleanText(body.name, MAX_NAME) || 'Research customer';
  const role = cleanText(body.role, MAX_ROLE);
  const location = cleanText(body.location, MAX_LOCATION);
  const stars = Math.max(1, Math.min(5, Math.round(Number(body.stars) || 0)));

  if (!text || text.length < 10) {
    return jsonResponse(400, { error: 'Please write at least 10 characters in your review.' });
  }
  if (!stars) {
    return jsonResponse(400, { error: 'Please select a star rating.' });
  }

  const reviewId = newReviewId();
  const review = {
    id: reviewId,
    stars,
    text,
    name,
    role,
    location,
    published: false,
    submittedAt: new Date().toISOString(),
    source: 'website',
  };

  const photoBase64 = typeof body.photoBase64 === 'string' ? body.photoBase64.trim() : '';
  const photoMime = typeof body.photoMime === 'string' ? body.photoMime.trim().toLowerCase() : '';
  if (photoBase64) {
    if (!/^image\/(jpeg|png|webp)$/.test(photoMime)) {
      return jsonResponse(400, { error: 'Photo must be JPG, PNG, or WebP.' });
    }
    let bytes;
    try {
      bytes = Buffer.from(photoBase64, 'base64');
    } catch (_err) {
      return jsonResponse(400, { error: 'Invalid photo upload.' });
    }
    if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) {
      return jsonResponse(400, { error: 'Photo must be under 2 MB.' });
    }
    review.photoBase64 = photoBase64;
    review.photoMime = photoMime;
  }

  const token = process.env.GITHUB_TOKEN;
  let githubOk = false;
  let blobOk = false;
  let githubError = '';

  blobOk = await saveToBlobs(event, reviewId, review);

  if (token) {
    try {
      githubOk = await saveToGithub(token, review);
    } catch (err) {
      githubError = String(err && err.message ? err.message : err);
    }
  } else {
    githubError = 'GITHUB_TOKEN missing';
  }

  if (githubOk || blobOk) {
    return jsonResponse(200, {
      ok: true,
      message: 'Thank you! Your review was submitted and will appear after a quick approval.',
      stored: { github: githubOk, blob: blobOk },
    });
  }

  return jsonResponse(502, {
    error: 'Could not save review. Please try again in a moment.',
    detail: githubError || 'storage failed',
  });
};
