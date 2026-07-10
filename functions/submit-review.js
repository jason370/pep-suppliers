const { connectLambda, getStore } = require('@netlify/blobs');

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

function pendingStore(event) {
  connectLambda(event);
  return getStore('pending-reviews');
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

  try {
    const store = pendingStore(event);
    await store.setJSON(reviewId, review);
    return jsonResponse(200, {
      ok: true,
      message: 'Thank you! Your review was submitted and will appear after a quick approval.',
    });
  } catch (err) {
    console.error('submit-review blob write failed', err);
    return jsonResponse(502, { error: 'Could not save review. Please try again in a moment.' });
  }
};
