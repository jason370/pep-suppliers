const REPO = 'jason370/pep-suppliers';
const REVIEWS_PATH = 'reviews.json';
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
  if (!res.ok) throw new Error(`GitHub read failed (${res.status})`);
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
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || 'GitHub write failed');
    err.status = res.status;
    err.sha = data.sha;
    throw err;
  }
  return data;
}

function photoExt(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse(500, { error: 'Server configuration error' });
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
  let photoPath = '';

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
    const ext = photoExt(photoMime);
    photoPath = `images/reviews/${reviewId}.${ext}`;
    try {
      const photoMeta = await getFile(photoPath, token).catch(function () {
        return { sha: null };
      });
      await putFile(
        photoPath,
        photoBase64,
        `Customer review photo ${reviewId}`,
        photoMeta.sha || undefined,
        token
      );
    } catch (_err) {
      return jsonResponse(502, { error: 'Could not save photo. Try again without a photo.' });
    }
  }

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
  if (photoPath) review.photo = '/' + photoPath;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const meta = await getFile(REVIEWS_PATH, token);
      let reviews = [];
      try {
        const decoded = Buffer.from(meta.content, 'base64').toString('utf8');
        reviews = JSON.parse(decoded);
        if (!Array.isArray(reviews)) reviews = [];
      } catch (_err) {
        reviews = [];
      }
      reviews.unshift(review);
      const contentStr = JSON.stringify(reviews, null, 2) + '\n';
      await putFile(
        REVIEWS_PATH,
        Buffer.from(contentStr, 'utf8').toString('base64'),
        'Customer review submission (pending)',
        meta.sha,
        token
      );
      return jsonResponse(200, {
        ok: true,
        message: 'Thank you! Your review was submitted and will appear after a quick approval.',
      });
    } catch (err) {
      if (attempt === 2 || err.status !== 409) {
        return jsonResponse(502, { error: 'Could not save review. Please try again in a moment.' });
      }
    }
  }

  return jsonResponse(502, { error: 'Could not save review. Please try again.' });
};
