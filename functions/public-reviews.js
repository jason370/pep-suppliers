const { connectLambda, getStore } = require('@netlify/blobs');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function pendingStore(event) {
  connectLambda(event);
  return getStore('pending-reviews');
}

function sanitizePublicReview(review) {
  if (!review || typeof review !== 'object') return null;
  if (review.published === false) return null;
  const out = {
    id: review.id,
    stars: review.stars,
    text: review.text,
    name: review.name,
    role: review.role,
    location: review.location,
    published: true,
    submittedAt: review.submittedAt,
    updatedAt: review.updatedAt,
    source: review.source || 'website',
  };
  if (review.photo) out.photo = review.photo;
  else if (review.photoBase64 && review.photoMime) {
    out.photo = 'data:' + review.photoMime + ';base64,' + review.photoBase64;
  }
  return out;
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const store = pendingStore(event);
    const { blobs } = await store.list();
    const reviews = [];
    for (const blob of blobs) {
      const review = await store.get(blob.key, { type: 'json' });
      const clean = sanitizePublicReview(review);
      if (clean && String(clean.text || '').trim()) reviews.push(clean);
    }
    reviews.sort(function (a, b) {
      return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
    });
    return jsonResponse(200, { reviews });
  } catch (err) {
    console.error('public-reviews failed', err);
    return jsonResponse(200, { reviews: [] });
  }
};
