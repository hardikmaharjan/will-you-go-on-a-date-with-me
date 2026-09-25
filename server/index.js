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
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (Boolean(supabaseUrl) !== Boolean(supabaseSecretKey)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY, or neither to use local SQLite.');
}
const useSupabase = Boolean(supabaseUrl && supabaseSecretKey);

let database;
let savePlan;
let listPlans;
if (!useSupabase) {
  const dataPath = process.env.DATA_DIR
    ? path.resolve(projectRoot, process.env.DATA_DIR)
    : path.join(projectRoot, 'data');
  mkdirSync(dataPath, { recursive: true });

  database = new DatabaseSync(path.join(dataPath, 'plans.db'));
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
  savePlan = database.prepare(`
    INSERT INTO plans (submission_id, activity, date, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id) DO UPDATE SET
      activity = excluded.activity,
      date = excluded.date,
      note = excluded.note,
      updated_at = excluded.updated_at
  `);
  listPlans = database.prepare(`
    SELECT submission_id AS submissionId, activity, date, note, created_at AS createdAt, updated_at AS updatedAt
    FROM plans ORDER BY created_at DESC
  `);
}

async function savePlanRecord(plan, now) {
  if (!useSupabase) {
    savePlan.run(plan.submissionId, plan.activity, plan.date, plan.note, now, now);
    return;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/plans?on_conflict=submission_id`, {
    method: 'POST',
    headers: {
      apikey: supabaseSecretKey,
      authorization: `Bearer ${supabaseSecretKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      submission_id: plan.submissionId,
      activity: plan.activity,
      date: plan.date,
      note: plan.note,
      created_at: now,
      updated_at: now,
    }),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Supabase could not save the plan (${response.status}): ${details}`);
  }
}

async function fetchPlans() {
  if (!useSupabase) return listPlans.all();

  const query = new URLSearchParams({
    select: 'submission_id,activity,date,note,created_at,updated_at',
    order: 'created_at.desc',
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/plans?${query}`, {
    headers: {
      apikey: supabaseSecretKey,
      authorization: `Bearer ${supabaseSecretKey}`,
    },
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 300);
    throw new Error(`Supabase could not load plans (${response.status}): ${details}`);
  }
  const rows = await response.json();
  return rows.map((plan) => ({
    submissionId: plan.submission_id,
    activity: plan.activity,
    date: plan.date,
    note: plan.note,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  }));
}

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

function applyApiCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return;
  const configuredOrigins = (process.env.FRONTEND_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (configuredOrigins.includes(origin) || localOrigin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
    response.setHeader('access-control-max-age', '86400');
    response.setHeader('vary', 'Origin');
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
  if (url.pathname.startsWith('/api/')) {
    applyApiCors(request, response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
  }
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
      await savePlanRecord({ submissionId: body.submissionId, activity, date: body.date, note }, now);
      sendJson(response, 201, { saved: true });
    } catch (error) {
      sendJson(response, error.status || 502, { error: error.message || 'Could not save the plan.' });
    }
    return;
  }

  if (url.pathname === '/api/plans' && request.method === 'GET') {
    if (!authorized(request)) {
      sendJson(response, 401, { error: 'That admin password did not match.' });
      return;
    }
    try {
      sendJson(response, 200, { plans: await fetchPlans() });
    } catch (error) {
      sendJson(response, 502, { error: error.message || 'Could not load saved plans.' });
    }
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
  console.log(`Plan storage: ${useSupabase ? 'Supabase' : 'local SQLite'}`);
  if (process.env.NODE_ENV === 'production') console.log('Set ADMIN_PASSWORD and configure Supabase credentials or a persistent DATA_DIR.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => {
    database?.close();
    process.exit(0);
  }));
}
