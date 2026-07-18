const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 4247;
const DATA_DIR = path.join(__dirname, 'data');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.csv');
const CONFIG_FILE = path.join(DATA_DIR, 'config.csv');
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const ENTRY_HEADERS = ['ID', 'Timestamp', 'Type', 'Name', 'Amount', 'Description', 'Status', 'Notes', 'Points'];

// ---------- setup on first run ----------

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

  if (!fs.existsSync(ENTRIES_FILE)) {
    writeCsv(ENTRIES_FILE, ENTRY_HEADERS, []);
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    writeCsv(CONFIG_FILE, ['Key', 'Value'], [
      { Key: 'ClubName', Value: 'Chancellery' },
      { Key: 'Venmo', Value: '@your-venmo' },
      { Key: 'Zelle', Value: 'treasurer@example.com' },
      { Key: 'Message', Value: 'Thank you for supporting Chancellery! Every donation earns you Chancellery points, redeemable for perks down the line.' },
      { Key: 'ShowTotal', Value: 'true' }
    ]);
  }

  if (!fs.existsSync(SECRETS_FILE)) {
    fs.writeFileSync(SECRETS_FILE, JSON.stringify({ adminPassword: 'changeme' }, null, 2));
    console.log('\n>>> Created data/secrets.json with default admin password "changeme". Change it before your bar opens! <<<\n');
  }
}

// ---------- CSV helpers ----------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function csvEscape(value) {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
    return obj;
  });
}

function writeCsv(filePath, headers, objects) {
  const lines = [headers.join(',')];
  objects.forEach(obj => {
    lines.push(headers.map(h => csvEscape(obj[h])).join(','));
  });
  fs.writeFileSync(filePath, lines.join('\r\n') + '\r\n');
}

// ---------- data access ----------

function getEntries() {
  return readCsv(ENTRIES_FILE);
}

function saveEntries(entries) {
  writeCsv(ENTRIES_FILE, ENTRY_HEADERS, entries);
}

function getConfigMap() {
  const rows = readCsv(CONFIG_FILE);
  const map = {};
  rows.forEach(r => { map[r.Key] = r.Value; });
  return map;
}

function saveConfigMap(map) {
  const rows = Object.keys(map).map(k => ({ Key: k, Value: map[k] }));
  writeCsv(CONFIG_FILE, ['Key', 'Value'], rows);
}

function getAdminPassword() {
  return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')).adminPassword;
}

function computeTotals(entries) {
  let totalDonations = 0, totalReimbursed = 0, totalPending = 0, totalPoints = 0;
  entries.forEach(e => {
    const amt = Number(e.Amount) || 0;
    if (e.Type === 'Donation') {
      totalDonations += amt;
      totalPoints += Number(e.Points) || 0;
    } else if (e.Type === 'Expense') {
      if (e.Status === 'Reimbursed') totalReimbursed += amt;
      else totalPending += amt;
    }
  });
  return { totalDonations, totalReimbursed, totalPending, totalPoints, balance: totalDonations - totalReimbursed };
}

function getLeaderboard() {
  const entries = getEntries();
  const map = new Map();
  entries.forEach(e => {
    if (e.Type !== 'Donation') return;
    const name = (e.Name || '').trim() || 'Anonymous';
    const points = e.Points !== undefined && e.Points !== '' ? Number(e.Points) : Number(e.Amount) || 0;
    const amount = Number(e.Amount) || 0;
    const cur = map.get(name) || { name, points: 0, totalDonated: 0, donationCount: 0 };
    cur.points += points;
    cur.totalDonated += amount;
    cur.donationCount += 1;
    map.set(name, cur);
  });
  return Array.from(map.values()).sort((a, b) => b.points - a.points);
}

// ---------- sessions ----------

const sessions = new Map(); // token -> expiry timestamp
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function createSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

// ---------- login security ----------

const loginAttempts = new Map(); // ip -> { count, firstAttempt, lockedUntil }
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

function getClientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(ip) {
  const rec = loginAttempts.get(ip);
  if (!rec) return { limited: false };
  if (rec.lockedUntil) {
    if (rec.lockedUntil > Date.now()) return { limited: true, retryAfterMs: rec.lockedUntil - Date.now() };
    loginAttempts.delete(ip);
  }
  return { limited: false };
}

function recordFailedAttempt(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, firstAttempt: Date.now() };
  if (Date.now() - rec.firstAttempt > ATTEMPT_WINDOW_MS) {
    rec.count = 0;
    rec.firstAttempt = Date.now();
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = Date.now() + LOCKOUT_MS;
  loginAttempts.set(ip, rec);
}

function recordSuccessfulLogin(ip) {
  loginAttempts.delete(ip);
}

// Fixed-length hash comparison so neither the password's length nor its
// content can be inferred from how long the comparison takes.
function safeCompare(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- http helpers ----------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  if (filePath === '/admin') filePath = '/admin.html';
  const resolved = path.join(PUBLIC_DIR, filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(resolved, (err, content) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(resolved);
    res.writeHead(200, { 'Content-Type': (MIME[ext] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(content);
  });
}

// ---------- request handling ----------

async function handleApi(req, res, pathname) {
  const token = getCookie(req, 'session');
  const authed = isValidSession(token);

  if (pathname === '/api/public-config' && req.method === 'GET') {
    const config = getConfigMap();
    config.totalRaised = computeTotals(getEntries()).totalDonations;
    return sendJson(res, 200, config);
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    return sendJson(res, 200, getLeaderboard());
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const ip = getClientIp(req);
    const rl = checkRateLimit(ip);
    if (rl.limited) {
      return sendJson(res, 429, { error: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} minute(s).` });
    }
    const body = await readJsonBody(req);
    if (safeCompare(body.password || '', getAdminPassword())) {
      recordSuccessfulLogin(ip);
      const newToken = createSession();
      res.setHeader('Set-Cookie', `session=${newToken}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`);
      return sendJson(res, 200, { ok: true });
    }
    recordFailedAttempt(ip);
    return sendJson(res, 401, { error: 'Incorrect password.' });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
    return sendJson(res, 200, { ok: true });
  }

  // everything below requires auth
  if (!authed) return sendJson(res, 401, { error: 'Not logged in.' });

  if (pathname === '/api/admin/data' && req.method === 'GET') {
    const entries = getEntries().slice().reverse();
    const config = getConfigMap();
    config.totalRaised = computeTotals(getEntries()).totalDonations;
    return sendJson(res, 200, { entries, totals: computeTotals(getEntries()), config, leaderboard: getLeaderboard() });
  }

  if (pathname === '/api/admin/entries' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const amount = Number(body.amount);
    if (!body.name || !amount || amount <= 0) return sendJson(res, 400, { error: 'Name and a positive amount are required.' });
    const type = body.type === 'Expense' ? 'Expense' : 'Donation';
    let points = 0;
    if (type === 'Donation') {
      points = (body.points !== undefined && body.points !== null && body.points !== '') ? Number(body.points) : amount;
      if (!Number.isFinite(points) || points < 0) points = amount;
    }
    const entries = getEntries();
    entries.push({
      ID: crypto.randomUUID(),
      Timestamp: new Date().toISOString(),
      Type: type,
      Name: body.name,
      Amount: amount,
      Description: body.description || '',
      Status: type === 'Expense' ? 'Pending' : 'N/A',
      Notes: body.notes || '',
      Points: type === 'Donation' ? points : ''
    });
    saveEntries(entries);
    return sendJson(res, 200, { ok: true });
  }

  const reimburseMatch = pathname.match(/^\/api\/admin\/entries\/([^/]+)\/reimburse$/);
  if (reimburseMatch && req.method === 'POST') {
    const entries = getEntries();
    const entry = entries.find(e => e.ID === reimburseMatch[1]);
    if (entry) { entry.Status = 'Reimbursed'; saveEntries(entries); }
    return sendJson(res, 200, { ok: true });
  }

  const deleteMatch = pathname.match(/^\/api\/admin\/entries\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const entries = getEntries().filter(e => e.ID !== deleteMatch[1]);
    saveEntries(entries);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/config' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const config = getConfigMap();
    ['ClubName', 'Venmo', 'Zelle', 'Message', 'ShowTotal'].forEach(key => {
      if (body[key] !== undefined) config[key] = body[key];
    });
    saveConfigMap(config);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(err => sendJson(res, 500, { error: err.message }));
  } else {
    serveStatic(req, res, pathname);
  }
});

ensureDataFiles();

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const lanIps = [];
  Object.values(nets).forEach(ifaces => {
    (ifaces || []).forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) lanIps.push(iface.address);
    });
  });
  console.log('\nChancellery fund tracker running.');
  console.log(`  On this computer:  http://localhost:${PORT}/`);
  lanIps.forEach(ip => console.log(`  On your wifi:      http://${ip}:${PORT}/`));
  console.log(`  Admin login:       add /admin to either URL above`);
  if (getAdminPassword() === 'changeme') {
    console.log('\n  !! Admin password is still the default "changeme" — edit data/secrets.json before your event. !!');
  }
  console.log('\nPress Ctrl+C to stop the server.\n');
});
