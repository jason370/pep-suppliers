const REPO = 'jason370/pep-suppliers';
const FILE_PATH = 'products.json';
const BRANCH = 'main';

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

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return jsonResponse(500, { error: 'Server configuration error' });
  }

  if (body.password !== adminPassword) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  const products = body.products;
  if (!Array.isArray(products) || products.length === 0) {
    return jsonResponse(400, { error: 'products must be a non-empty array' });
  }

  const clientSha = typeof body.sha === 'string' ? body.sha : '';
  if (!clientSha) {
    return jsonResponse(400, { error: 'sha is required' });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse(500, { error: 'Server configuration error' });
  }

  let contentStr;
  try {
    contentStr = JSON.stringify(products, null, 2) + '\n';
    JSON.parse(contentStr);
  } catch (_err) {
    return jsonResponse(400, { error: 'products array failed JSON serialization' });
  }

  const apiUrl = `https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`;
  const githubHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'pep-suppliers-admin',
  };

  let remoteSha;
  try {
    const getRes = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: githubHeaders });
    if (!getRes.ok) {
      return jsonResponse(502, { error: 'Failed to fetch current file from GitHub' });
    }
    const remote = await getRes.json();
    remoteSha = remote.sha;
  } catch (_err) {
    return jsonResponse(502, { error: 'GitHub API unreachable' });
  }

  if (remoteSha !== clientSha) {
    return jsonResponse(409, {
      error: 'Conflict: file was modified elsewhere',
      sha: remoteSha,
    });
  }

  const contentB64 = Buffer.from(contentStr, 'utf8').toString('base64');

  try {
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        ...githubHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Update products.json via admin panel',
        content: contentB64,
        sha: remoteSha,
        branch: BRANCH,
      }),
    });

    if (!putRes.ok) {
      return jsonResponse(502, { error: 'GitHub write failed' });
    }

    const putData = await putRes.json();
    const newSha = putData.content && putData.content.sha ? putData.content.sha : remoteSha;
    return jsonResponse(200, { ok: true, sha: newSha });
  } catch (_err) {
    return jsonResponse(502, { error: 'GitHub API unreachable' });
  }
};
