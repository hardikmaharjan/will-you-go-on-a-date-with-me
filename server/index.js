import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(projectRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function readOrCreateAdminPassword() {
  if (process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 20) {
      throw new Error('ADMIN_PASSWORD must be at least 20 characters long.');
    }
    return process.env.ADMIN_PASSWORD;
  }

  const secretFile = path.join(projectRoot, '.local-admin-password');
  try {
    return readFileSync(secretFile, 'utf8').trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const password = randomBytes(32).toString('base64url');
    try {
      writeFileSync(secretFile, `${password}\n`, { flag: 'wx', mode: 0o600 });
      console.log('Created a local admin password in .local-admin-password');
      return password;
    } catch (writeError) {
      if (writeError.code !== 'EEXIST') throw writeError;
      return readFileSync(secretFile, 'utf8').trim();
    }
  }
}

const adminPassword = readOrCreateAdminPassword();
const dataPath = process.env.DATA_DIR
  ? path.resolve(projectRoot, process.env.DATA_DIR)
  : path.join(projectRoot, 'data');
mkdirSync(dataPath, { recursive: true });

const database = new DatabaseSync(path.join(dataPath, 'plans.db'));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS plans (
    submission_id TEXT PRIMARY KEY,
    activity TEXT NOT NULL CHECK (activity IN ('Coffee', 'Dinner', 'Picnic')),
    date TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
const savePlan = database.prepare(`
  INSERT INTO plans (submission_id, activity, date, note, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(submission_id) DO UPDATE SET
    activity = excluded.activity,
    date = excluded.date,
    note = excluded.note,
    updated_at = excluded.updated_at
`);
const listPlans = database.prepare(`
  SELECT submission_id AS submissionId, activity, date, note, created_at AS createdAt, updated_at AS updatedAt
  FROM plans ORDER BY created_at DESC
`);

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function authorized(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || '');
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(adminPassword);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8192) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Send a valid JSON request.'), { status: 400 });
  }
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function serveApp(request, response, pathname) {
  const distPath = path.join(projectRoot, 'dist');
  const requestedPath = pathname === '/admin' || pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const filePath = path.resolve(distPath, `.${requestedPath}`);
  if (!filePath.startsWith(`${distPath}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const finalPath = existsSync(filePath) && statSync(filePath).isFile()
    ? filePath
    : path.join(distPath, 'index.html');
  if (!existsSync(finalPath)) {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Build the app first with npm run build.');
    return;
  }
  const immutableAsset = finalPath.includes(`${path.sep}assets${path.sep}`);
  response.writeHead(200, {
    'content-type': contentTypes[path.extname(finalPath)] || 'application/octet-stream',
    'cache-control': immutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(finalPath).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/api/plans' && request.method === 'POST') {
    if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { error: 'Plan submissions must be JSON.' });
      return;
    }
    try {
      const body = await readJson(request);
      const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.submissionId || '');
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '')
        && !Number.isNaN(Date.parse(`${body.date}T12:00:00Z`))
        && new Date(`${body.date}T12:00:00Z`).toISOString().slice(0, 10) === body.date;
      const activity = ['Coffee', 'Dinner', 'Picnic'].includes(body.activity) ? body.activity : null;
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (!validId || !validDate || !activity || !note || note.length > 180) {
        sendJson(response, 400, { error: 'Choose a date, a date idea, and a short note before sending.' });
        return;
      }
      const now = new Date().toISOString();
      savePlan.run(body.submissionId, activity, body.date, note, now, now);
      sendJson(response, 201, { saved: true });
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message || 'Could not save the plan.' });
    }
    return;
  }

  if (url.pathname === '/api/plans' && request.method === 'GET') {
    if (!authorized(request)) {
      sendJson(response, 401, { error: 'That admin password did not match.' });
      return;
    }
    sendJson(response, 200, { plans: listPlans.all() });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'API route not found.' });
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    serveApp(request, response, url.pathname);
    return;
  }
  response.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
});

const port = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001));
const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => {
  console.log(`Plan backend listening on http://${host}:${port}`);
  if (process.env.NODE_ENV === 'production') console.log('Set ADMIN_PASSWORD and DATA_DIR in your hosting environment.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database.close();
    process.exit(0);
  }));
}
