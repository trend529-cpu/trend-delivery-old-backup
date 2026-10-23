/**
 * Trend Delivery Service - main backend entry point.
 * The complete backend runtime lives in this file so deployment can start
 * the application directly with: node server.js
 */
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// Request-driven, read-only System Delivery AI assistant.
const { createSystemDeliveryAI } = require('./ai/system-delivery-ai');
const systemDeliveryAI = createSystemDeliveryAI();
 // Short-lived, company-scoped cache avoids a database round trip for ordinary AI messages.
 // Memory-changing requests bypass this cache and invalidate it before writes.
 const SYSTEM_DELIVERY_AI_MEMORY_CACHE = new Map();
 const SYSTEM_DELIVERY_AI_MEMORY_CACHE_TTL_MS = 15000;


const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
const APP_ORIGIN = String(process.env.APP_ORIGIN || '').trim();

// Operating dates follow the administrator-selected company time zone.
const SUPPORTED_SYSTEM_TIME_ZONES = new Set(['Africa/Cairo', 'Asia/Dubai']);
let SYSTEM_TIME_ZONE = SUPPORTED_SYSTEM_TIME_ZONES.has(String(process.env.SYSTEM_TIME_ZONE || '')) ? String(process.env.SYSTEM_TIME_ZONE) : 'Africa/Cairo';
function normalizeSystemTimeZone(value) {
  const zone = String(value || '').trim();
  return SUPPORTED_SYSTEM_TIME_ZONES.has(zone) ? zone : 'Africa/Cairo';
}
function egyptDateISO(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYSTEM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const part = (type) => parts.find(x => x.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function egyptTodayISO() { return egyptDateISO(new Date()); }
function systemDayStartUTCISO(day) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [year, month, date] = match.slice(1).map(Number);
  const targetWallUTC = Date.UTC(year, month - 1, date, 0, 0, 0);
  let guess = targetWallUTC;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: SYSTEM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(guess));
    const part = type => Number(parts.find(item => item.type === type)?.value || 0);
    const representedWallUTC = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    const nextGuess = targetWallUTC - (representedWallUTC - guess);
    if (nextGuess === guess) break;
    guess = nextGuess;
  }
  return new Date(guess).toISOString();
}
// Accounting dates are calendar dates in the configured company time zone.
// Preserve date-only values (delivery-job/statement dates) and convert timestamps
// to the company zone so UTC ISO strings near midnight do not move transactions a day.
function accountingDay(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return egyptDateISO(text);
}
function addEgyptDaysISO(days, value = new Date()) {
  const base = egyptDateISO(value);
  if (!base) return '';
  const [year, month, day] = base.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12, 0, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
function isValidISODate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const SCHEDULED_OPERATIONAL_KEYS = new Set(['future delivery', 'return by driver', 'location change', 'schedule for tomorrow']);
// Short-lived company-scoped lookup cache keeps repeated Scan Driver checks responsive.
const SCAN_DRIVER_LOOKUP_CACHE = new Map();
function isScheduledOperationalOrder(order) {
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return SCHEDULED_OPERATIONAL_KEYS.has(normalize(order?.status)) ||
    SCHEDULED_OPERATIONAL_KEYS.has(normalize(order?.driver_statement_action));
}
function deliveryJobOperationalDay(job) {
  return accountingDay(job?.job_date || job?.delivery_date || job?.date || job?.created_at || '');
}
function operationalOrderDay(order, shipment, job) {
  // Orders scheduled for a retry/location change belong to their explicit next
  // operational day while that action is active.
  if (isScheduledOperationalOrder(order) && isValidISODate(String(order?.driver_scheduled_date || ''))) {
    return String(order.driver_scheduled_date);
  }
  // Once the courier records a final delivery/accounting outcome, use the date
  // of that status action rather than the old Delivery Job date. This lets an
  // order returned on the 19th and delivered on the 20th count on the 20th.
  const status = commissionStatusKey(order?.status || shipment?.status);
  const completedStatuses = new Set(['delivered', 'half delivered', 'cancelled', 'canceled', 'cancel', 'cancelled by shipper', 'cancelled by receiver', 'replaced']);
  if (completedStatuses.has(status)) {
    const isCancellation = ['cancelled', 'canceled', 'cancel', 'cancelled by shipper', 'cancelled by receiver'].includes(status);
    const completedDay = accountingDay(isCancellation
      ? (order?.status_changed_at || order?.updated_at || shipment?.updated_at || order?.driver_action_at || '')
      : (order?.driver_action_at || order?.actual_delivery_date || order?.delivered_at ||
        order?.delivery_completed_at || shipment?.delivered_at || order?.status_changed_at || ''));
    if (completedDay) return completedDay;
  }
  // Orders still out with the courier follow their latest/current Delivery Job,
  // so retries scheduled for the 20th appear on the 20th even if first assigned
  // on the 19th. Financial movement dates are deliberately excluded.
  const jobDay = deliveryJobOperationalDay(job);
  if (jobDay) return jobDay;
  return accountingDay(order?.actual_delivery_date || order?.delivered_at ||
    order?.delivery_completed_at || shipment?.delivered_at || order?.delivery_date ||
    order?.driver_action_at || order?.status_changed_at || order?.created_at || shipment?.created_at || '');
}
function latestDeliveryJobAssignments(jobs, links) {
  const jobsById = new Map((jobs || []).map(job => [String(job.id || ''), job]));
  const latest = new Map();
  const assignmentStamp = job => String(job?.created_at || job?.job_date ||
    job?.delivery_date || job?.date || '');
  for (const link of links || []) {
    const shipmentId = String(link?.shipment_id || '');
    const job = jobsById.get(String(link?.delivery_job_id || ''));
    if (!shipmentId || !job) continue;
    const previous = latest.get(shipmentId);
    const stamp = assignmentStamp(job);
    const previousStamp = assignmentStamp(previous?.job);
    if (!previous || stamp > previousStamp ||
        (stamp === previousStamp && String(job.id || '') > String(previous.job?.id || ''))) {
      latest.set(shipmentId, { job, link });
    }
  }
  return latest;
}

function shipperSettlementOrderInfo(order) {
  const status = String(order?.status || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const cancelledByShipper = status === 'cancelled by shipper';
  // Cancelled by Receiver may appear as an audit row, but must have zero financial impact.
  const receiverCancelled = status === 'cancelled by receiver';
  // Some legacy orders store the merchant collection state directly in status='paid'
  // instead of the dedicated collection fields. Treat that as paid for merchant statements.
  // Keep driver commission payment flags separate: they must never make a merchant order paid.
  const paid = status === 'paid' || [order?.cash_collection_status, order?.payment_status, order?.paid_status]
    .some(value => String(value || '').trim().toLowerCase() === 'paid');
  const eligibleStatus = ['delivered', 'deliverd', 'half delivered', 'half deliverd', 'cancelled by shipper', 'cancelled by receiver', 'replaced', 'paid'].includes(status);
  // Merchant settlement eligibility keeps its existing financial-period date rules.
  // Operational dashboards and driver statements use operationalOrderDay() instead;
  // do not replace these financial dates with Delivery Job dates because actual
  // collection, commission, and settlement timestamps must remain auditable.
  const rawDate = order?.driver_scheduled_date || order?.commission_paid_at || (cancelledByShipper
    ? (order?.status_changed_at || order?.updated_at || order?.delivery_date || order?.created_at)
    : (order?.delivered_at || order?.actual_delivery_date || order?.delivery_completed_at || order?.delivery_date || order?.status_changed_at || order?.updated_at || order?.created_at));
  const day = rawDate ? egyptDateISO(rawDate) : '';
  return { status, cancelledByShipper, receiverCancelled, eligibleStatus, paid, day, eligible: receiverCancelled ? Boolean(day) : eligibleStatus && paid && Boolean(day) };
}
function paidLockValues(...records) {
  return records.flatMap(record => record && typeof record === 'object'
    ? ['status','cash_collection_status','payment_status','paid_status','commission_paid_status','commission_payment_status'].map(key => record[key])
    : [record]).some(value => String(value || '').trim().toLowerCase() === 'paid');
}
function validateScheduledDate(status, date) {
  if (!isValidISODate(date)) return 'التاريخ غير صحيح. استخدم صيغة YYYY-MM-DD';
  const today = egyptTodayISO();
  if (['Location Change','Return by Driver','Schedule for Tomorrow'].includes(status) && date < today) return 'لا يمكن اختيار تاريخ سابق لليوم';
  if (status === 'Schedule for Tomorrow' && date < addEgyptDaysISO(1)) return 'Schedule for Tomorrow يجب أن يكون غدًا أو تاريخًا أبعد';
  if (status === 'Future Delivery' && date < addEgyptDaysISO(2)) return 'Future Delivery يجب أن يكون بعد غد أو تاريخًا أبعد';
  return '';
}

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
// Server/data access key. New Supabase projects use sb_secret_* here.
const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  '';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  SUPABASE_KEY ||
  '';
// Legacy service_role is a JWT and may be used as Authorization: Bearer.
// The new sb_secret_* key is NOT a JWT. Supabase requires it as the apikey
// header for server/admin access; sending sb_secret_* as Bearer causes the
// exact "This endpoint requires a valid Bearer token" / "Invalid JWT" errors.
const SUPABASE_LEGACY_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
// Authentication uses Supabase Auth with HttpOnly access/refresh cookies.
// The existing Trend users table remains the source of credentials during
// migration and the source of roles/permissions.
const AUTH_REFRESH_TTL_MS = 365 * 24 * 60 * 60 * 1000;
// Stable first-party session: derive a signing secret from the deployment secret
// so restarts/redeploys do not invalidate logged-in browsers.
// Browser-session cookie: survives refresh, but normally expires when the browser closes.
// Signed token TTL remains server-validated independently of cookie persistence.
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
function clearAuthCookie(name, req) {
  const secure = requestIsSecure(req) ? '; Secure' : '';
  return `${name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
function cookieValue(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : '';
}
const sessions = new Map();
// V7 uses a fresh cookie name so stale cookies from earlier builds cannot
// silently keep an old authentication session alive.
const SESSION_COOKIE_NAME = 'trend_session_v7';
// Legacy key is retained ONLY to validate cookies issued by earlier builds.
// New sessions use a deployment secret, never a hard-coded production secret.
const LEGACY_SESSION_SECRET = '607f28ce7e237233ea157f56dfd43f4d8efe680a21bcd624e20b02f8e0d67120406e89abc870b7b838935b3c1e7db6a6';
const CONFIGURED_SESSION_SECRET = String(process.env.TREND_SESSION_SECRET || process.env.JWT_SECRET || '').trim();
const SESSION_STABLE_SECRET = CONFIGURED_SESSION_SECRET || LEGACY_SESSION_SECRET;
const SESSION_SIGNING_SECRET = CONFIGURED_SESSION_SECRET || LEGACY_SESSION_SECRET;
if (NODE_ENV === 'production' && !CONFIGURED_SESSION_SECRET) {
  console.warn('⚠️ Security warning: set TREND_SESSION_SECRET (or JWT_SECRET) in the hosting environment. Legacy session compatibility is temporarily enabled.');
}
const persistentSessionCache = new Map();
const requests = { count: 0 };
// Authentication remains enabled; session restoration is handled by signed tokens.

function requestIsSecure(req) {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwarded) return forwarded === 'https';
  return Boolean(req?.socket?.encrypted);
}

function sessionCookie(req, tokenValue) {
  const secure = requestIsSecure(req) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(tokenValue)}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearSessionCookie(req) {
  const secure = requestIsSecure(req) ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

const settings = {
  appName: 'Trend Delivery Service',
  defaultDuration: 60
};

const roles = {
  admin: {
    users: true, orders: true, shipments: true, jobs: true, drivers: true,
    merchants: true, accounting: true, expenses: true, audit: true, chat: true, backup_restore: true
  },
  manager: {
    users: false, orders: true, shipments: true, jobs: true, drivers: true,
    merchants: true, accounting: true, expenses: true, audit: true, chat: true
  },
  dispatcher: {
    users: false, orders: true, shipments: true, jobs: true, drivers: true,
    merchants: true, accounting: false, expenses: true, audit: false, chat: true
  },
  employee: {
    users: false, orders: true, shipments: true, jobs: false, drivers: false,
    merchants: true, accounting: false, expenses: false, audit: false, chat: true
  },
  driver: {
    users: false, orders: false, shipments: true, jobs: true, drivers: true,
    merchants: false, accounting: false, expenses: true, audit: false
  }
};


function json(res, status, body) {
  const payload = JSON.stringify(body);
  // Compress larger JSON responses for faster dashboard/table loads on mobile
  // connections. Keep small responses uncompressed to avoid CPU overhead.
  const acceptsGzip = /(?:^|,)\\s*gzip\\s*(?:,|$)/i.test(String(res.req?.headers?.['accept-encoding'] || ''));
  const shouldCompress = acceptsGzip && Buffer.byteLength(payload, 'utf8') >= 1024;
  // Preserve headers already queued by the handler, especially Set-Cookie.
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': APP_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS'
  };
  const setCookie = res.getHeader('Set-Cookie');
  if (setCookie) headers['Set-Cookie'] = setCookie;
  if (APP_ORIGIN) headers['Access-Control-Allow-Credentials'] = 'true';
  if (shouldCompress) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    res.writeHead(status, headers);
    return res.end(zlib.gzipSync(payload));
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function html(res, status, body, contentType = 'text/html; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  if (stored == null) return false;
  const value = String(stored);
  const pass = String(password);

  try {
    if (value.startsWith('scrypt:')) {
      const parts = value.split(':');
      if (parts.length !== 3) return false;
      const derived = crypto.scryptSync(pass, parts[1], 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(parts[2], 'hex'));
    }

    if (value.startsWith('sha256:')) {
      return sha256(pass) === value.slice(7);
    }

    // Supports a plain SHA-256 hash from an older database.
    if (/^[a-f0-9]{64}$/i.test(value)) {
      return sha256(pass) === value.toLowerCase();
    }

    // Temporary compatibility for an existing database that stores plaintext.
    // New users created by this server always use scrypt.
    return value === pass;
  } catch (_) {
    return false;
  }
}

function hashSessionToken(tokenValue) {
  return crypto.createHash('sha256').update(String(tokenValue || '')).digest('hex');
}

async function supabaseAuthRequest(pathname, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase غير مضبوط في متغيرات البيئة');
  const isAdminEndpoint = /^\/auth\/v1\/admin\//.test(pathname);
  const explicitHeaders = options.headers || {};
  const headers = {
    apikey: isAdminEndpoint ? SUPABASE_KEY : SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
    ...explicitHeaders
  };

  if (isAdminEndpoint) {
    // IMPORTANT: sb_secret_* is an opaque API key, not a JWT. Do NOT send it
    // in Authorization: Bearer. The Supabase API gateway authenticates the
    // server/admin request from the apikey header. If a legacy service_role
    // JWT is configured, keep compatibility with it by using Bearer instead.
    if (SUPABASE_LEGACY_SERVICE_ROLE_KEY) {
      headers.Authorization = `Bearer ${SUPABASE_LEGACY_SERVICE_ROLE_KEY}`;
    } else {
      delete headers.Authorization;
    }
  } else if (!headers.Authorization) {
    // Auth endpoints that need a signed-in user get their user JWT from the
    // caller. Public auth endpoints use the publishable key as apikey only.
    delete headers.Authorization;
  }

  const response = await fetch(`${SUPABASE_URL}${pathname}`, { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
  if (!response.ok) { const e = new Error(data?.msg || data?.message || data?.error_description || data?.error || `Supabase Auth HTTP ${response.status}`); e.status=response.status; throw e; }
  return data;
}
function authIdentityEmail(user) {
  const raw = String(user?.id || user?.username || user?.email || 'user').trim().toLowerCase();
  return `trend-${Buffer.from(raw).toString('base64url').slice(0,48)}@auth.trend.local`;
}
async function findSupabaseAuthUserByEmail(email) {
  for (let page=1; page<=20; page++) {
    const data=await supabaseAuthRequest(`/auth/v1/admin/users?page=${page}&per_page=1000`,{method:'GET'});
    const users=Array.isArray(data?.users)?data.users:[];
    const found=users.find(u=>String(u.email||'').toLowerCase()===String(email).toLowerCase());
    if(found)return found;
    if(users.length<1000)break;
  }
  return null;
}
async function ensureSupabaseAuthUser(user,password) {
  const email=authIdentityEmail(user);
  let authUser=await findSupabaseAuthUserByEmail(email);
  if(!authUser){
    try{
      const created=await supabaseAuthRequest('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:String(password),email_confirm:true,user_metadata:{trend_user_id:String(user.id),trend_role:String(user.role||'employee'),trend_company_id:user.company_id||null,trend_name:user.name||'',trend_username:user.username||'',trend_email:user.email||null,trend_language:user.language||'ar'}})});
      authUser=created?.user||created;
    }catch(error){
      if(error.status===409||error.status===422)authUser=await findSupabaseAuthUserByEmail(email);
      if(!authUser)throw error;
    }
  }
  if(!authUser?.id)throw new Error('تعذر إنشاء حساب المصادقة الدائم');
  await supabaseAuthRequest(`/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`,{method:'PUT',body:JSON.stringify({password:String(password),email_confirm:true,user_metadata:{...(authUser.user_metadata||{}),trend_user_id:String(user.id),trend_role:String(user.role||'employee'),trend_company_id:user.company_id||null,trend_name:user.name||'',trend_username:user.username||'',trend_email:user.email||null,trend_language:user.language||'ar'}})});
  return email;
}
async function supabasePasswordLogin(email,password){
  const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  const text=await response.text(); let data={}; try{data=text?JSON.parse(text):{};}catch(_){}
  if(!response.ok){const e=new Error(data?.msg||data?.error_description||data?.error||'Supabase Auth login failed');e.status=response.status;throw e;}
  return data;
}
function isLikelyUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function sessionSigningSecrets() {
  return [...new Set([SESSION_SIGNING_SECRET, SESSION_STABLE_SECRET, LEGACY_SESSION_SECRET].filter(Boolean))];
}

function createStatelessSessionToken(user) {
  const payload = {
    v: 7,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    user: {
      id: user?.id || '',
      name: user?.name || '',
      username: user?.username || '',
      email: user?.email || '',
      role: user?.role || 'employee',
      company_id: user?.company_id || null,
      language: user?.language || 'ar',
      permissions: user?.permissions || roles[user?.role] || roles.employee
    }
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_STABLE_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function readStatelessSessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  let verified = false;
  for (const secret of sessionSigningSecrets()) {
    try {
      const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
      if (signature.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        verified = true;
        break;
      }
    } catch (_) {}
  }
  if (!verified) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload?.v !== 7 || !payload?.exp || Number(payload.exp) <= Date.now()) return null;
    const u = payload.user;
    if (!u?.id) return null;
    return {
      id: String(u.id),
      name: String(u.name || ''),
      username: String(u.username || ''),
      email: u.email ? String(u.email) : null,
      role: String(u.role || 'employee'),
      company_id: u.company_id || null,
      language: String(u.language || 'ar'),
      permissions: u.permissions || roles[u.role] || roles.employee
    };
  } catch (_) { return null; }
}

async function createPersistentSession(user) {
  // Authentication is intentionally self-contained: the signed HttpOnly
  // cookie is the session. It survives refresh/redeploy as long as the
  // stable TREND_SESSION_SECRET remains unchanged. No database read/write is
  // required to restore a valid session.
  return { token: createStatelessSessionToken(user), persistent: true };
}

async function readPersistentSession(token) {
  // The signed token is the authoritative session. Database availability must
  // never turn a valid browser session into an unexpected logout.
  return readStatelessSessionToken(token);
}

async function revokePersistentSession(token) {
  if (!token) return true;
  const tokenHash = hashSessionToken(token);
  try {
    const user = readStatelessSessionToken(token);
    // A cryptographically invalid token is already unusable; logout can still
    // clear the browser cookie without treating it as a server failure.
    if (!user) return true;
    const filters = { token_hash: `eq.${tokenHash}` };
    const existing = firstRow(await dbSelect('app_sessions', { select: 'token_hash,revoked_at', ...filters, limit: 1 }));
    const patch = { revoked_at: new Date().toISOString() };
    if (existing) {
      if (!existing.revoked_at) {
        const updated = await dbUpdate('app_sessions', filters, patch);
        const updatedRow = firstRow(updated);
        if (!updatedRow || !updatedRow.revoked_at) throw new Error('لم يتم تأكيد إلغاء الجلسة');
      }
      return true;
    }
    const inserted = await dbInsert('app_sessions', {
      token_hash: tokenHash,
      user_id: isLikelyUuid(user?.id) ? user.id : null,
      expires_at: new Date((Date.now() + SESSION_TTL_MS)).toISOString(),
      revoked_at: patch.revoked_at
    }, { prefer: 'return=representation' });
    const insertedRow = firstRow(inserted);
    if (!insertedRow || !insertedRow.revoked_at) throw new Error('لم يتم تأكيد إلغاء الجلسة');
    return true;
  } catch (error) {
    console.error('PERSISTENT LOGOUT ERROR:', error);
    return false;
  }
}

const SESSION_ACTIVE_CACHE_TTL_MS = 10000;
const sessionActiveCache = new Map();
const sessionActiveInFlight = new Map();
async function validateSessionUserActive(user, forceRefresh = false) {
  if (!user?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(user.id))) return user;
  const userId = String(user.id);
  const now = Date.now();
  const cached = sessionActiveCache.get(userId);
  if (!forceRefresh && cached && cached.expiresAt > now) return cached.active ? (cached.user || user) : null;
  if (!forceRefresh && sessionActiveInFlight.has(userId)) {
    const result = await sessionActiveInFlight.get(userId);
    return result.active ? result.user : null;
  }
  const check = (async () => {
    try {
      const row = firstRow(await dbSelect('users', {
        select: 'id,active,company_id', id: `eq.${userId}`, limit: 1
      }));
      if (row?.active === false) {
        const result = { active: false, user: null };
        sessionActiveCache.set(userId, { ...result, expiresAt: Date.now() + SESSION_ACTIVE_CACHE_TTL_MS });
        return result;
      }

      // Signed cookies contain a login-time permission snapshot. Refresh it
      // from the current role/group so reassigned permissions take effect
      // without requiring the employee to log out and back in.
      const freshUser = { ...user };
      if (row?.company_id) freshUser.company_id = row.company_id;
      const userRoleLink = firstRow(await dbSelect('user_roles', {
        select: 'role_id', user_id: `eq.${userId}`, limit: 1
      }).catch(() => []));
      let roleRecord = null;
      if (userRoleLink?.role_id) {
        roleRecord = firstRow(await dbSelect('roles', {
          select: 'id,name,company_id', id: `eq.${userRoleLink.role_id}`, limit: 1
        }).catch(() => []));
      }
      const roleName = String(roleRecord?.name || userRoleLink?.role_name || userRoleLink?.role || freshUser.role || 'employee');
      freshUser.role = roleName;
      freshUser.permissions = await getUserPermissions(userId, roleName, { userRoleLink, roleRecord });
      const result = { active: true, user: freshUser };
      sessionActiveCache.set(userId, { ...result, expiresAt: Date.now() + SESSION_ACTIVE_CACHE_TTL_MS });
      if (sessionActiveCache.size > 5000) {
        for (const [key, entry] of sessionActiveCache) if (entry.expiresAt <= Date.now()) sessionActiveCache.delete(key);
        while (sessionActiveCache.size > 5000) sessionActiveCache.delete(sessionActiveCache.keys().next().value);
      }
      return result;
    } catch (error) {
      // Keep the existing signed session during a transient database issue;
      // do not cache the failed refresh, so permissions can refresh next time.
      console.warn('Session permission refresh unavailable; preserving signed session:', error?.message || error);
      return { active: true, user };
    } finally {
      sessionActiveInFlight.delete(userId);
    }
  })();
  sessionActiveInFlight.set(userId, check);
  return (await check).user;
}
async function auth(req, res, options = {}) {
  // Prefer the HttpOnly cookie, but do not let an old/invalid cookie mask a
  // valid bearer session saved by the frontend. This can otherwise look like
  // an unexpected logout when a new tab opens after a deployment.
  const cookieToken = cookieValue(req, SESSION_COOKIE_NAME);
  if (cookieToken) {
    const cookieUser = readStatelessSessionToken(cookieToken);
    if (cookieUser && !(await isRevokedSessionToken(cookieToken))) return await validateSessionUserActive(cookieUser, options.forceRefresh === true);
  }

  const authHeader = String(req.headers.authorization || '');
  const bearerToken = /^Bearer\s+/i.test(authHeader)
    ? authHeader.replace(/^Bearer\s+/i, '').trim()
    : '';
  if (bearerToken) {
    const bearerUser = readStatelessSessionToken(bearerToken);
    if (bearerUser && !(await isRevokedSessionToken(bearerToken))) return await validateSessionUserActive(bearerUser, options.forceRefresh === true);
  }
  return null;
}

async function requireAuth(req,res, options = {}){
  try {
    const user = await auth(req,res, options);
    if (!user) { json(res,401,{success:false,error:'غير مصرح — سجل الدخول أولاً'}); return null; }
    return user;
  } catch (error) {
    console.error('AUTH ERROR:', error);
    if (error?.code === 'SESSION_STORE_UNAVAILABLE') {
      json(res,503,{success:false,error:'خدمة الجلسة غير متاحة مؤقتًا'});
      return null;
    }
    json(res,500,{success:false,error:'تعذر التحقق من الجلسة'});
    return null;
  }
}

const RESTRICTED_INTELLIGENCE_PERMISSIONS = new Set(['delivery_intelligence','order_monitor','order_distributor','accounts_monitor','system_delivery_ai']);
function isSystemAdminUser(user) {
  return user?.id === 'env-admin' || user?.is_system_admin === true;
}
function isRestrictedIntelligencePermission(code) {
  return RESTRICTED_INTELLIGENCE_PERMISSIONS.has(String(code || '').trim().toLowerCase());
}
async function roleHasRestrictedIntelligencePermission(roleId) {
  if (!roleId) return false;
  const links = await dbSelect('role_permissions', { select:'permission_id', role_id:`eq.${roleId}`, limit:500 });
  if (!links.length) return false;
  const ids = new Set(links.map(link => String(link.permission_id)));
  const permissions = await dbSelect('permissions', { select:'id,code', limit:500 });
  return permissions.some(permission => ids.has(String(permission.id)) && isRestrictedIntelligencePermission(permission.code));
}

async function requireRole(req, res, permission) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  // The resolved permission snapshot is the single source of truth for
  // employees. Merging built-in role defaults here can silently grant access
  // that the assigned permission group did not select, making permissions
  // appear fixed to the employee's role label rather than the database group.
  // System-admin permissions are explicitly supplied by loginUser.
  const role = user.permissions && typeof user.permissions === 'object'
    ? user.permissions
    : {};
  if (permission && !role[permission] && !(permission === 'jobs' && role.shipments) && !(permission === 'backup_restore' && role.admin_tools)) { json(res,403,{success:false,error:'ليس لديك صلاحية لتنفيذ هذه العملية'}); return null; }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (String(user.role || '').toLowerCase() !== 'admin') {
    json(res, 403, { success: false, error: 'هذه العملية متاحة لحساب Admin فقط' });
    return null;
  }
  return user;
}

async function getCompanyBranding(companyId) {
  const fallback = { name: settings.appName, logo_url: '/trend-logo.jpeg' };
  if (!companyId) return fallback;
  // Branding must not depend on the optional menu_config column. If that column
  // is absent or inaccessible, the previous combined SELECT failed and silently
  // returned the default name/logo even when the branding columns were saved.
  // Read only the core columns used by branding; keep timezone on its existing
  // in-memory/default value so this read remains compatible with older schemas.
  const rows = await dbSelect('companies', {
    select: 'id,display_name,logo_url,name',
    id: `eq.${companyId}`,
    limit: 1
  });
  const row = firstRow(rows);
  if (!row) return fallback;
  return {
    name: cleanString(row.display_name || row.name) || fallback.name,
    logo_url: cleanString(row.logo_url) || fallback.logo_url,
    system_timezone: SYSTEM_TIME_ZONE
  };
}

async function verifyAdminCredential(user, password) {
  const pass = String(password || '');
  if (!pass) return false;
  if (user?.id === 'env-admin') {
    if (ADMIN_PASSWORD && pass === ADMIN_PASSWORD) return true;
    try {
      const companyId = await resolveCompanyId(user);
      const row = firstRow(await dbSelect('companies', { select: 'admin_password_hash', id: `eq.${companyId}`, limit: 1 }));
      if (row?.admin_password_hash) return verifyPassword(pass, row.admin_password_hash);
    } catch (_) {}
    return false;
  }
  try {
    const row = firstRow(await dbSelect('users', { select: 'password_hash,active', id: `eq.${user.id}`, company_id: `eq.${user.company_id}`, limit: 1 }));
    return Boolean(row && row.active !== false && verifyPassword(pass, row.password_hash));
  } catch (_) { return false; }
}

async function storageEnsurePrivateBucket(bucket) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase غير مضبوط في متغيرات البيئة');
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (SUPABASE_LEGACY_SERVICE_ROLE_KEY) headers.Authorization = `Bearer ${SUPABASE_LEGACY_SERVICE_ROLE_KEY}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST', headers,
    body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 8 * 1024 * 1024, allowed_mime_types: ['image/jpeg','image/png','image/webp','application/pdf'] })
  });
  const text = await response.text();
  if (response.ok || response.status === 409 || /already exists|duplicate/i.test(text)) return;
  throw new Error(text || `تعذر إنشاء مساحة حفظ إثباتات المرتجعات (${response.status})`);
}

async function storageUpload(bucket, objectPath, buffer, contentType) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase غير مضبوط في متغيرات البيئة');
  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'false' };
  if (SUPABASE_LEGACY_SERVICE_ROLE_KEY) headers.Authorization = `Bearer ${SUPABASE_LEGACY_SERVICE_ROLE_KEY}`;
  let response = await fetch(url, { method: 'POST', headers, body: buffer });
  let text = await response.text();
  if (!response.ok && response.status === 404 && /bucket.*not found|no such bucket/i.test(text)) {
    await storageEnsurePrivateBucket(bucket);
    response = await fetch(url, { method: 'POST', headers, body: buffer });
    text = await response.text();
  }
  if (!response.ok) throw new Error(text || `Storage upload failed (${response.status})`);
  return { bucket, path: objectPath };
}

async function storageDownload(bucket, objectPath) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase غير مضبوط في متغيرات البيئة');
  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { apikey: SUPABASE_KEY };
  if (SUPABASE_LEGACY_SERVICE_ROLE_KEY) headers.Authorization = `Bearer ${SUPABASE_LEGACY_SERVICE_ROLE_KEY}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Storage download failed (${response.status})`);
  return response;
}

async function wooRequest(config, endpoint, options = {}) {
  const base = cleanString(config?.url).replace(/\/$/, '');
  const key = cleanString(config?.consumer_key);
  const secret = cleanString(config?.consumer_secret);
  if (!base || !key || !secret) throw new Error('إعدادات WooCommerce ناقصة');
  const target = `${base}/wp-json/wc/v3/${String(endpoint || '').replace(/^\//,'')}`;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(target, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${auth}`,
        'User-Agent': 'Trend-Delivery-Service/1.0'
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) {
      const message = data?.message || data?.code || `WooCommerce HTTP ${response.status}`;
      const err = new Error(String(message));
      err.status = response.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeIntegration(row) {
  if (!row) return row;
  const config = row.config && typeof row.config === 'object' ? {...row.config} : {};
  delete config.consumer_secret;
  if (config.consumer_key) config.consumer_key = '••••••••';
  return {...row, config};
}

function bodyJson(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (_) {
        reject(new Error('JSON غير صالح'));
      }
    });
    req.on('error', reject);
  });
}

function safeIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error('Invalid table name');
  return value;
}

async function supabaseRequest(table, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase غير مضبوط في متغيرات البيئة');
  }

  const tableName = safeIdentifier(table);
  const params = new URLSearchParams();
  const query = options.query || {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      let queryValue = String(value);
      // Callers historically passed encodeURIComponent() inside PostgREST
      // filters. URLSearchParams encodes again, so normalize one layer here.
      try { queryValue = decodeURIComponent(queryValue); } catch (_) {}
      params.set(key, queryValue);
    }
  }

  const url = `${SUPABASE_URL}/rest/v1/${tableName}${params.toString() ? `?${params.toString()}` : ''}`;
  const headers = {
    apikey: SUPABASE_KEY,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  // New Supabase sb_secret_* keys are opaque API keys, not JWTs. Only the
  // legacy service_role JWT should be sent as Authorization: Bearer.
  if (SUPABASE_LEGACY_SERVICE_ROLE_KEY) {
    headers.Authorization = `Bearer ${SUPABASE_LEGACY_SERVICE_ROLE_KEY}`;
  }

  if (options.returning !== false) headers.Prefer = 'return=representation';
  if (options.prefer) headers.Prefer = options.prefer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 15000);

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = text;
    }

    if (!response.ok) {
      const message =
        data && typeof data === 'object'
          ? (data.message || data.details || data.hint || data.error || `Supabase HTTP ${response.status}`)
          : `Supabase HTTP ${response.status}: ${text}`;
      const err = new Error(String(message));
      err.status = response.status;
      err.supabase = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function dbSelect(table, query = {}) {
  return await supabaseRequest(table, { query });
}

// Fetch every row in stable pages instead of silently stopping at Supabase/PostgREST's row cap.
// A 500-row page stays below the usual Supabase 1,000-row API cap; offset pagination
// continues until a short page is returned. Use this for complete operational lists.
async function dbSelectAll(table, query = {}, pageSize = 500) {
  const size = Math.max(1, Math.min(500, Number(pageSize) || 500));
  const base = { ...query };
  delete base.offset;
  delete base.limit;
  if (!base.order) base.order = 'id.asc';
  const all = [];
  // Fetch the first page alone to keep small tables to one request. If it is
  // full, retrieve subsequent pages in small parallel batches instead of a
  // serial network round trip for every 500 rows.
  let first = await dbSelect(table, { ...base, limit: size, offset: 0 });
  if (!Array.isArray(first) || first.length === 0) return [];
  all.push(...first);
  if (first.length < size) return all;
  let offset = size;
  for (let batchNo = 0; batchNo < 500; batchNo += 1) {
    const offsets = [offset, offset + size, offset + size * 2, offset + size * 3];
    const batches = await Promise.all(offsets.map(pageOffset => dbSelect(table, { ...base, limit: size, offset: pageOffset })));
    let stop = false;
    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];
      if (!Array.isArray(batch) || batch.length === 0) { stop = true; break; }
      all.push(...batch);
      if (batch.length < size) { stop = true; break; }
    }
    if (stop) break;
    offset += size * offsets.length;
  }
  return all;
}

async function dbRpc(fn, args = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase غير مضبوط في متغيرات البيئة');
  const url = `${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(fn)}`;
  const headers = { apikey: SUPABASE_KEY, 'Content-Type':'application/json', Accept:'application/json' };
  if (SUPABASE_LEGACY_SERVICE_ROLE_KEY) headers.Authorization = `Bearer ${SUPABASE_LEGACY_SERVICE_ROLE_KEY}`;
  const response = await fetch(url,{method:'POST',headers,body:JSON.stringify(args)});
  const text=await response.text(); let data=null; try{data=text?JSON.parse(text):null;}catch(_){data=text;}
  if(!response.ok) throw new Error(data?.message||data?.details||data?.hint||data?.error||`Supabase RPC HTTP ${response.status}`);
  return data;
}

async function dbInsert(table, row, options = {}) {
  return await supabaseRequest(table, {
    method: 'POST',
    body: row,
    prefer: options.prefer || 'return=representation'
  });
}

async function dbDelete(table, filters) {
  return await supabaseRequest(table, { method: 'DELETE', query: filters, prefer: 'return=representation' });
}

async function dbUpdate(table, filters, patch) {
  const query = { ...filters };
  return await supabaseRequest(table, {
    method: 'PATCH',
    query,
    body: patch,
    prefer: 'return=representation'
  });
}

function firstRow(data) {
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

async function getFirstCompanyId() {
  try {
    const rows = await dbSelect('companies', {
      select: 'id',
      limit: 1,
      order: 'created_at.asc'
    });
    const id = firstRow(rows)?.id || null;
    if (id) return id;
  } catch (_) {}

  // Compatibility fallback for databases where the companies table is
  // populated after the other company-scoped tables.
  for (const table of ['merchants', 'orders', 'drivers', 'governorates', 'areas', 'users']) {
    try {
      const rows = await dbSelect(table, { select: 'company_id', limit: 1 });
      const id = firstRow(rows)?.company_id || null;
      if (id) return id;
    } catch (_) {}
  }
  return null;
}

async function resolveCompanyId(user) {
  const id = user?.company_id || await getFirstCompanyId();
  if (!id) throw new Error('لم يتم العثور على الشركة المرتبط بها الحساب. تأكد من وجود شركة في قاعدة البيانات.');
  return id;
}

function generateTrackingNumber(serialNo) {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const serial = String(Number(serialNo) || 0).padStart(6, '0');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TRK-${y}${m}${day}-${serial}-${random}`;
}

async function getUserByUsername(username) {
  const value = String(username || '').trim().toLowerCase();
  if (!value) return null;
  try {
    const rows = await dbSelect('users', { select: '*', username: `eq.${encodeURIComponent(value)}`, limit: 1 });
    return firstRow(rows);
  } catch (_) {
    try {
      const rows = await dbSelect('users', { select: '*', username: `eq.${value}`, limit: 1 });
      return firstRow(rows);
    } catch (_) { return null; }
  }
}

async function getUserByEmail(email) {
  try {
    const rows = await dbSelect('users', { select: '*', email: `eq.${encodeURIComponent(String(email).trim().toLowerCase())}`, limit: 1 });
    return firstRow(rows);
  } catch (error) {
    try {
      const rows = await dbSelect('users', { select: '*', email: `eq.${String(email).trim().toLowerCase()}`, limit: 1 });
      return firstRow(rows);
    } catch (_) { throw error; }
  }
}

async function getUserRole(userId) {
  try {
    const rows = await dbSelect('user_roles', {
      select: '*',
      user_id: `eq.${userId}`,
      limit: 1
    });
    const link = firstRow(rows);
    if (!link) return 'employee';

    if (link.role && typeof link.role === 'string') return link.role;
    if (link.role_name && typeof link.role_name === 'string') return link.role_name;

    if (link.role_id) {
      const roleRows = await dbSelect('roles', {
        select: '*',
        id: `eq.${link.role_id}`,
        limit: 1
      });
      const role = firstRow(roleRows);
      return role?.name || role?.code || role?.slug || 'employee';
    }
  } catch (_) {}
  return 'employee';
}

async function ensureRoleRecord(companyId, roleName) {
  const name = cleanString(roleName) || 'employee';
  const existing = firstRow(await dbSelect('roles', {
    select: 'id,name', company_id: `eq.${companyId}`, name: `eq.${encodeURIComponent(name)}`, limit: 1
  }).catch(() => []));
  if (existing?.id) return existing;
  // Built-in roles are defined in the server, but older databases may not
  // have a corresponding row in public.roles. Create the missing row so a
  // newly-created/edited employee can actually receive that role.
  if (!roles[name]) return null;
  try {
    const created = firstRow(await dbInsert('roles', { company_id: companyId, name }));
    return created || null;
  } catch (error) {
    // A concurrent request may have created the role between SELECT/INSERT.
    const retry = firstRow(await dbSelect('roles', {
      select: 'id,name', company_id: `eq.${companyId}`, name: `eq.${encodeURIComponent(name)}`, limit: 1
    }).catch(() => []));
    if (retry?.id) return retry;
    throw error;
  }
}

async function getUserPermissions(userId, roleName, resolved = {}) {
  let normalizedRoleName = String(roleName || '').trim().toLowerCase();
  let base = roles[normalizedRoleName];
  const permissions = { users:false, orders:false, shipments:false, jobs:false, drivers:false, merchants:false, accounting:false, expenses:false, audit:false, chat:false, backup_restore:false, admin_tools:false, completed_without_proof:false, system_delivery_ai:false, order_monitor:false, order_distributor:false, accounts_monitor:false };
  let hasExplicitRoleAssignment = Boolean(resolved.roleRecord?.id || resolved.userRoleLink?.role_id);
  try {
    // Resolve the assigned role through this user's user_roles link first.
    // Looking up roles by name alone can select another company's role with
    // the same name, causing valid permissions to appear missing.
    const userRoleLink = resolved.userRoleLink || firstRow(await dbSelect('user_roles', {
      select:'role_id',
      user_id:`eq.${userId}`,
      limit:1
    }).catch(() => []));
    hasExplicitRoleAssignment = Boolean(resolved.roleRecord?.id || resolved.userRoleLink?.role_id || userRoleLink?.role_id);
    let role = resolved.roleRecord || null;
    if (!role?.id && userRoleLink?.role_id) {
      role = firstRow(await dbSelect('roles', {
        select:'id,name,company_id',
        id:`eq.${userRoleLink.role_id}`,
        limit:1
      }).catch(() => []));
    }
    if (!role?.id) {
      const lookupName = userRoleLink?.role_name || userRoleLink?.role || roleName;
      const roleRows = await dbSelect('roles', {
        select:'id,name,company_id',
        name:`eq.${encodeURIComponent(lookupName)}`,
        limit:100
      });
      role = firstRow(roleRows.filter(row => String(row.name || '') === String(lookupName || '')));
    }
    normalizedRoleName = String(role?.name || userRoleLink?.role_name || userRoleLink?.role || roleName || 'employee').trim().toLowerCase();
    base = roles[normalizedRoleName];
    // Employee access must come from a real assigned permission group.
    // Never replace a missing/stale group link with hard-coded role defaults.
    if (!role?.id) return permissions;
    const [links, perms] = await Promise.all([
      dbSelect('role_permissions', { select:'permission_id', role_id:`eq.${role.id}`, limit:500 }),
      dbSelect('permissions', { select:'id,code', limit:500 })
    ]);
    const ids = links.map(x=>x.permission_id).filter(Boolean);
    // If a custom role has no assigned permissions, do not silently grant
    // unrelated defaults. Built-in roles retain their documented defaults.
    // An explicitly assigned group with zero permission links grants no access.
    // Do not silently inherit static role defaults.
    if (!ids.length) return permissions;
    // Split camelCase before lowercasing so page-specific permission codes remain recognizable.
    const normalizePermissionCode = value => String(value || '').trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const allowed = new Set(perms.filter(x => ids.some(id => String(id) === String(x.id))).map(x => normalizePermissionCode(x.code)));
    const aliases = {
      users: ['users', 'user', 'employees', 'employee', 'employee_permissions', 'staff', 'roles', 'permissions'],
      orders: ['orders', 'order', 'new_order', 'edit_order', 'booking', 'order_import', 'wanted_customers'],
      shipments: ['shipments', 'shipment', 'operations_dashboard', 'scan', 'scan_driver', 'tracking', 'return', 'returns', 'return_archive', 'driver_return', 'driver_returns', 'outscan', 'delivery_job', 'deliveryjob', 'jobs', 'job', 'job_code', 'jobcode', 'update_delivery_job_code'],
      jobs: ['jobs', 'job', 'delivery_job', 'deliveryjob', 'job_code', 'jobcode', 'update_delivery_job_code'],
      drivers: ['drivers', 'driver', 'driver_account', 'driver_accounts', 'driver_commission', 'driver_wages', 'payroll', 'salary', 'live_map'],
      merchants: ['merchants', 'merchant', 'shippers', 'shipper', 'customers', 'customer'],
      accounting: ['accounting', 'finance', 'merchant_financial', 'company_financial', 'daily_company_report', 'employee_wages', 'orders_verification', 'settlement_archive', 'invoice', 'invoice_report', 'settlement', 'receivable', 'adjustment', 'driver_commission'],
      expenses: ['expenses', 'expense', 'company_expenses', 'driver_expenses'],
      audit: ['audit', 'audit_log'],
      chat: ['chat', 'employee_chat'],
      backup_restore: ['backup_restore'],
      admin_tools: ['admin_tools'],
      completed_without_proof: ['completed_without_proof'],
      system_delivery_ai: ['system_delivery_ai', 'systemdeliveryai', 'ai_assistant', 'aiassistant'],
      order_monitor: ['order_monitor'], order_distributor: ['order_distributor'], accounts_monitor: ['accounts_monitor']
    };
    // Permission codes can include action/page prefixes around the menu key.
    // Match whole underscore-delimited tokens, not just codes starting with the key.
    const matchesAlias = (code, alias) => {
      const normalizedCode = normalizePermissionCode(code);
      const normalizedAlias = normalizePermissionCode(alias);
      return normalizedCode === normalizedAlias ||
        normalizedCode.startsWith(normalizedAlias + '_') ||
        normalizedCode.endsWith('_' + normalizedAlias) ||
        normalizedCode.includes('_' + normalizedAlias + '_');
    };
    for (const key of Object.keys(permissions)) {
      const names = aliases[key] || [key];
      if ([...allowed].some(code => names.some(alias => matchesAlias(code, alias)))) permissions[key] = true;
    }
    // Legacy employee-management names grant access to the Users page only.
    if ([...allowed].some(code => ['employees', 'employee', 'employee_permissions', 'staff', 'roles', 'permissions'].some(alias => matchesAlias(code, alias)))) {
      permissions.users = true;
    }
    return permissions;
  } catch (error) {
    console.error('PERMISSION GROUP RESOLUTION ERROR:', error?.message || error);
    // Fail closed on database/schema errors; returning role defaults here makes
    // the employee appear to keep fixed permissions instead of following groups.
    return permissions;
  }
}

async function loginUser(username, password) {
  const identifier = String(username || '').trim().toLowerCase();
  if ((ADMIN_USERNAME && identifier === ADMIN_USERNAME) || identifier === ADMIN_EMAIL) {
    const companyId = await getFirstCompanyId();
    let valid = Boolean(ADMIN_PASSWORD && String(password) === ADMIN_PASSWORD);
    try {
      const row = firstRow(await dbSelect('companies', { select: 'admin_password_hash', id: `eq.${companyId}`, limit: 1 }));
      if (row?.admin_password_hash) valid = verifyPassword(password, row.admin_password_hash);
    } catch (_) {}
    if (valid) {
      return { id: 'env-admin', name: 'Administrator', username: ADMIN_USERNAME || ADMIN_EMAIL, email: ADMIN_EMAIL, role: 'admin', company_id: companyId, language: 'ar', active: true, permissions: roles.admin };
    }
  }
  let user = await getUserByUsername(identifier);
  if (!user && identifier.includes('@')) user = await getUserByEmail(identifier);
  if (!user || user.active === false) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  // Resolve the role link once and reuse it for permission lookup. The old
  // flow queried user_roles and roles again inside getUserPermissions, adding
  // avoidable sequential database round trips to every successful login.
  const roleLink = firstRow(await dbSelect('user_roles', {
    select:'role_id', user_id:`eq.${user.id}`, limit:1
  }).catch(() => []));
  let roleRecord = null;
  if (roleLink?.role_id) {
    roleRecord = firstRow(await dbSelect('roles', {
      select:'id,name,company_id', id:`eq.${roleLink.role_id}`, limit:1
    }).catch(() => []));
  }
  // The linked role record is authoritative; legacy text columns can be stale
  // after an employee is moved to another permission group.
  const role = String(roleRecord?.name || roleLink?.role_name || roleLink?.role || 'employee');
  const permissions = await getUserPermissions(user.id, role, { userRoleLink: roleLink, roleRecord });
  return { id: user.id, name: user.name || user.username || user.email || identifier, username: user.username || identifier, email: user.email || null, role, company_id: user.company_id || null, language: user.language || 'ar', active: user.active !== false, permissions };
}

const revokedSessionCache = new Map();
async function isRevokedSessionToken(token) {
  if (!token) return false;
  const tokenHash = hashSessionToken(token), cached = revokedSessionCache.get(tokenHash);
  if (cached && cached.until > Date.now()) return cached.revoked;
  try {
    const row = firstRow(await dbSelect('app_sessions', { select: 'revoked_at', token_hash: 'eq.' + tokenHash, limit: 1 }));
    const revoked = Boolean(row?.revoked_at);
    revokedSessionCache.set(tokenHash, { revoked, until: Date.now() + 5000 });
    return revoked;
  } catch (error) { console.warn('SESSION REVOCATION CHECK WARNING:', error?.message || error); return false; }
}
async function revokeSessionTokenHash(tokenHash, userId) {
  const filters = { token_hash: 'eq.' + tokenHash }, now = new Date().toISOString();
  const existing = firstRow(await dbSelect('app_sessions', { select: 'token_hash,revoked_at', ...filters, limit: 1 }));
  if (existing) {
    if (!existing.revoked_at) {
      const updated = firstRow(await dbUpdate('app_sessions', filters, { revoked_at: now }));
      if (!updated?.revoked_at) throw new Error('لم يتم تأكيد إلغاء الجلسة');
    }
  } else {
    const inserted = firstRow(await dbInsert('app_sessions', { token_hash: tokenHash, user_id: isLikelyUuid(userId) ? userId : null, expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(), revoked_at: now }));
    if (!inserted?.revoked_at) throw new Error('لم يتم تأكيد إلغاء الجلسة');
  }
  revokedSessionCache.set(tokenHash, { revoked: true, until: Date.now() + 60000 });
}
async function audit(user, action, entityType, entityId, details = null) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    // Never write a NULL company_id into audit_logs. Some installations have
    // users created before company_id was populated, while audit_logs requires
    // company_id. Resolve it from the logged-in user first, then from the
    // existing company-scoped data as a safe compatibility fallback.
    const companyId = user?.company_id || await getFirstCompanyId();
    if (!companyId) {
      console.warn('AUDIT WARNING: company_id could not be resolved; audit entry skipped.');
      return;
    }
    const row = {
      company_id: companyId,
      user_id: user?.id && user.id !== 'env-admin' ? user.id : null,
      action,
      entity_type: entityType,
      // UUID-backed audit_logs.entity_id must never receive virtual identifiers
      // such as "env-admin" or human-readable order/job codes.
      entity_id: isLikelyUuid(entityId) ? entityId : null,
      details: details || (entityId && !isLikelyUuid(entityId) ? { entity_id_label: String(entityId).slice(0, 180) } : null)
    };
    await dbInsert('audit_logs', row, { prefer: 'return=minimal' });
  } catch (error) {
    // Audit failure must never make a successfully-created order look like it
    // failed, especially on legacy databases with stricter audit constraints.
    console.warn('AUDIT WARNING:', error.message);
  }
}

function cleanNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function uniqueArray(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

async function safeSelect(table, query = []) {
  try {
    return await dbSelect(table, Object.fromEntries(query));
  } catch (error) {
    console.warn(`SELECT ${table} failed:`, error.message);
    return [];
  }
}

async function dashboardData(user, requestedDate = '') {
  const companyId = await resolveCompanyId(user);
  const today = isValidISODate(String(requestedDate || '')) ? String(requestedDate) : egyptTodayISO();
  // Some deployments have slightly different legacy columns. Retry failed
  // projections with select=* instead of silently showing false zero counters.
  const dashboardRead = async (table, query) => {
    try { return await dbSelect(table, query); }
    catch (firstError) {
      try { return await dbSelect(table, { ...query, select: '*' }); }
      catch (secondError) {
        console.warn(`Dashboard read failed for ${table}:`, secondError?.message || firstError?.message || 'unknown error');
        return [];
      }
    }
  };
  const [recentOrders, scheduledOrders, shipments, deliveryJobs, drivers, merchants] = await Promise.all([
    dashboardRead('orders', {
      select: 'id,created_at,status,status_changed_at,actual_delivery_date,delivered_at,delivery_completed_at,driver_scheduled_date,driver_statement_action,driver_action_at,cash_collection_status,paid_status,commission_paid_status,commission_payment_status',
      company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000
    }),
    dashboardRead('orders', {
      select: 'id,created_at,status,driver_scheduled_date,driver_statement_action,driver_action_at,cash_collection_status,paid_status,commission_paid_status,commission_payment_status',
      company_id: `eq.${companyId}`, driver_scheduled_date: `eq.${today}`, limit: 10000
    }),
    dashboardRead('shipments', {
      select: 'id,order_id,status,created_at,driver_id,current_driver_id',
      company_id: `eq.${companyId}`, limit: 30000
    }),
    dashboardRead('delivery_jobs', {
      select: 'id,driver_id,job_date,date,created_at',
      company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 20000
    }),
    dashboardRead('drivers', { select: 'id,name,driver_no', company_id: `eq.${companyId}`, limit: 10000 }),
    dashboardRead('merchants', { select: 'id', company_id: `eq.${companyId}`, limit: 10000 })
  ]);

  const orderById = new Map();
  for (const order of [...(recentOrders || []), ...(scheduledOrders || [])]) {
    if (order?.id) orderById.set(String(order.id), { ...(orderById.get(String(order.id)) || {}), ...order });
  }
  const todayOrders = (recentOrders || []).filter(order => accountingDay(order.created_at) === today);
  const jobIds = (deliveryJobs || []).map(job => String(job.id || '')).filter(Boolean);
  const linkBatches = [];
  for (let i = 0; i < jobIds.length; i += 100) {
    const ids = jobIds.slice(i, i + 100).map(id => `"${id.replace(/"/g, '')}"`).join(',');
    linkBatches.push(dashboardRead('delivery_job_shipments', {
      select: 'id,shipment_id,delivery_job_id', delivery_job_id: `in.(${ids})`, limit: 30000
    }));
  }
  const links = [];
  for (let i = 0; i < linkBatches.length; i += 10) {
    links.push(...(await Promise.all(linkBatches.slice(i, i + 10))).flat());
  }
  // Some legacy deployments store Delivery Job membership in delivery_job_orders
  // rather than delivery_job_shipments. If the primary relation has no rows,
  // recover its links and normalize order_id to shipment_id where possible.
  if (!links.length && (deliveryJobs || []).length) {
    const ids = jobIds.map(id => `"${id.replace(/"/g, '')}"`).join(',');
    try {
      const legacyRows = await dashboardRead('delivery_job_orders', {
        select: '*', delivery_job_id: `in.(${ids})`, limit: 30000
      });
      const shipmentByOrderId = new Map((Array.isArray(shipments) ? shipments : []).map(s => [String(s.order_id || ''), String(s.id || '')]).filter(([orderId, shipmentId]) => orderId && shipmentId));
      for (const row of legacyRows || []) {
        const shipmentId = String(row.shipment_id || row.shipment?.id || shipmentByOrderId.get(String(row.order_id || '')) || '');
        const deliveryJobId = String(row.delivery_job_id || '');
        if (shipmentId && deliveryJobId) links.push({ id: row.id, shipment_id: shipmentId, delivery_job_id: deliveryJobId });
      }
    } catch (error) {
      console.warn('Dashboard legacy assignment-link fallback failed:', error?.message || error);
    }
  }
  // Compatibility fallback: some PostgREST deployments reject large IN filters
  // for legacy IDs. Read links once when the batched lookup returns no rows.
  // latestDeliveryJobAssignments still restricts the result to this company's
  // delivery_jobs, so links from other companies cannot affect these counters.
  if (!links.length && (deliveryJobs || []).length) {
    try {
      links.push(...await dbSelect('delivery_job_shipments', {
        select: 'id,shipment_id,delivery_job_id', limit: 30000
      }));
    } catch (error) {
      console.warn('Dashboard assignment-link fallback failed:', error?.message || error);
    }
  }
  const latestAssignments = latestDeliveryJobAssignments(deliveryJobs, links);
  const shipmentRows = Array.isArray(shipments) ? shipments : [];
  const statusOf = row => String(row?.status || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const orderForShipment = shipment => orderById.get(String(shipment?.order_id || '')) || null;
  // The order record is the source updated by status actions. Shipment rows can
  // retain an older status, so prefer the live order status when available.
  // Terminal statuses must be defined before shipmentStatus is called.
  // Otherwise dashboardData throws a ReferenceError and both counters fail.
  const terminalDriverStatuses = new Set([
    'delivered', 'deliverd', 'half delivered', 'half deliverd', 'replaced',
    'cancelled', 'canceled', 'cancel', 'cancelled by shipper', 'cancelled by receiver',
    'return completed', 'returned', 'return to shipper', 'return to origin'
  ]);
  const activeOperationalStatusKeys = new Set([
    'assigned with driver', 'assign with driver', 'assigned to driver', 'driver assigned',
    'in ops', 'in operation', 'out for delivery', 'with driver', 'to be pickedup',
    'to be picked up', 'future delivery', 'location change', 'return by driver',
    'schedule for tomorrow', 'sudolle for tomorrow'
  ]);
  // The operational assignment status can be newer than the legacy order status.
  // Prefer an active shipment status when present; otherwise fall back to the order.
  const shipmentStatus = shipment => {
    const orderStatus = statusOf(orderForShipment(shipment));
    const shipmentState = statusOf(shipment);
    // A persisted final order status always overrides an old active status
    // retained on a shipment row (especially cancellations).
    if (terminalDriverStatuses.has(orderStatus)) return orderStatus;
    if (activeOperationalStatusKeys.has(shipmentState)) return shipmentState;
    if (activeOperationalStatusKeys.has(orderStatus)) return orderStatus;
    return orderStatus || shipmentState;
  };
  const latestTodayShipments = shipmentRows.filter(shipment => {
    const assignment = latestAssignments.get(String(shipment.id || ''));
    const order = orderForShipment(shipment);
    if (assignment) return operationalOrderDay(order, shipment, assignment.job) === today;
    // Compatibility fallback for legacy rows that store the driver directly on
    // the shipment but do not have a delivery_job_shipments link.
    const directDriverId = String(shipment.driver_id || shipment.current_driver_id || '');
    return Boolean(directDriverId) && operationalOrderDay(order, shipment, null) === today;
  });
  const todayAssignedShipmentIds = new Set(latestTodayShipments.map(shipment => String(shipment.id || '')).filter(Boolean));
  const eligiblePaidStatuses = new Set(['delivered', 'deliverd', 'half delivered', 'half deliverd', 'replaced', 'cancelled by shipper', 'cancelled by receiver']);
  const uniqueOrderIdsFor = rows => new Set(rows.map(row => String(row.order_id || row.id)).filter(Boolean));
  const counts = {};
  counts.orders = todayOrders.length;
  const driversById = new Map((drivers || []).map(driver => [String(driver.id), driver]));
  const activeAssignedByShipment = new Map();
  const shipmentById = new Map(shipmentRows.map(shipment => [String(shipment.id || ''), shipment]).filter(([id]) => id));
  for (const shipment of shipmentRows) {
    const shipmentId = String(shipment.id || '');
    if (!shipmentId) continue;
    const assignment = latestAssignments.get(shipmentId);
    const driverId = String(assignment?.job?.driver_id || shipment.driver_id || shipment.current_driver_id || '');
    if (!driverId || terminalDriverStatuses.has(shipmentStatus(shipment))) continue;
    activeAssignedByShipment.set(shipmentId, { ...shipment, __driver_id: driverId, __assignment: assignment || null });
  }
  // If the shipment projection is unavailable/legacy but a current Delivery Job
  // link exists, count that assigned shipment from the link rather than showing
  // a misleading zero. A known terminal shipment status still excludes it.
  for (const [shipmentId, assignment] of latestAssignments) {
    const driverId = String(assignment?.job?.driver_id || '');
    if (!shipmentId || !driverId || activeAssignedByShipment.has(shipmentId)) continue;
    const shipment = shipmentById.get(shipmentId);
    if (shipment && terminalDriverStatuses.has(shipmentStatus(shipment))) continue;
    activeAssignedByShipment.set(shipmentId, {
      ...(shipment || {}), id: shipmentId, __driver_id: driverId, __assignment: assignment
    });
  }
  const activeAssignedShipments = [...activeAssignedByShipment.values()];
  // Dashboard assignment totals are scoped to the selected operational date.
  // Do not include assignments carried over from earlier days in these tiles.
  const activeAssignedForSelectedDate = activeAssignedShipments.filter(shipment => {
    const linked = latestAssignments.get(String(shipment.id || '')) || shipment.__assignment;
    const order = orderForShipment(shipment);
    // For current assignments, use the actual linked Delivery Job day first.
    // Scheduled retry metadata must not hide an order assigned on this job day.
    const assignedDay = linked?.job
      ? deliveryJobOperationalDay(linked.job)
      : accountingDay(shipment?.assigned_at || shipment?.updated_at || shipment?.created_at || '');
    return assignedDay === today || (!linked?.job && operationalOrderDay(order, shipment, null) === today);
  });
  counts.shipments = uniqueOrderIdsFor(activeAssignedForSelectedDate).size;
  counts.jobs = uniqueOrderIdsFor(latestTodayShipments.filter(shipment => eligiblePaidStatuses.has(shipmentStatus(shipment)))).size;
  const activeDriverIds = [...new Set(activeAssignedForSelectedDate.map(shipment => String(
    shipment.__driver_id || shipment.__assignment?.job?.driver_id || shipment.driver_id || shipment.current_driver_id || ''
  )).filter(Boolean))];
  counts.driversToday = activeDriverIds.map(id => {
    const driver = driversById.get(id) || {};
    const assignment = activeAssignedForSelectedDate.find(row => String(row.__driver_id || row.__assignment?.job?.driver_id || row.driver_id || row.current_driver_id || '') === id)?.__assignment;
    const code = driver.driver_no || assignment?.job?.driver_no || '';
    const name = driver.name || assignment?.job?.driver_name || assignment?.job?.name || (code ? `Driver ${code}` : `Driver ${id.slice(-6)}`);
    return { id, name, code };
  }).sort((a, b) => String(a.name || a.code || a.id).localeCompare(String(b.name || b.code || b.id)));
  counts.drivers = counts.driversToday.length;
  counts.merchants = (merchants || []).length;
  const isActuallyPaid = order => [
    order?.cash_collection_status, order?.payment_status, order?.paid_status,
    order?.commission_paid_status, order?.commission_payment_status
  ].some(value => ['paid', 'settled'].includes(String(value || '').trim().toLowerCase()));
  // Count payment state, not just statuses eligible for settlement/commission.
  counts.delivered = uniqueOrderIdsFor(latestTodayShipments.filter(shipment => isActuallyPaid(orderForShipment(shipment)))).size;
  const cancellationStatuses = new Set(['cancel', 'cancelled', 'canceled', 'cancelled by shipper', 'cancelled by receiver']);
  counts.cancelled = uniqueOrderIdsFor(shipmentRows.filter(shipment => {
    const order = orderForShipment(shipment);
    const currentStatus = statusOf(order) || statusOf(shipment);
    if (!cancellationStatuses.has(currentStatus)) return false;
    // Cancellation belongs to the day the cancellation was recorded, not the
    // original order/assignment date. Older cancelled orders must not leak into today's tile.
    const cancellationDay = accountingDay(order?.status_changed_at || order?.updated_at ||
      shipment?.updated_at || order?.driver_action_at || '');
    return cancellationDay === today;
  })).size;
  // "In Ops" is the live status after a job code is saved, so it must be included
  // in the current with-driver counter instead of being incorrectly shown as zero.
  counts.pending = uniqueOrderIdsFor(latestTodayShipments.filter(shipment => {
    const status = shipmentStatus(shipment);
    return ['assigned with driver', 'assign with driver'].includes(status);
  })).size;
  counts.executionTasks = uniqueOrderIdsFor(latestTodayShipments.filter(shipment => ['schedule for tomorrow', 'scheduled for tomorrow', 'sudolle for tomorrow', 'location change', 'return by driver', 'future delivery'].includes(shipmentStatus(shipment)))).size;
  return { counts, recentOrders: [] };
}

let atomicCounterSupport = 'unknown';
async function nextAtomicNumber(user, kind, periodKey = '') {
  if (atomicCounterSupport === 'missing') return null;
  try {
    const companyId = await resolveCompanyId(user);
    const value = await dbRpc('tds_next_number', {
      p_company_id: companyId,
      p_kind: kind,
      p_period_key: periodKey || ''
    });
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1) throw new Error('Invalid atomic counter result');
    atomicCounterSupport = 'available';
    return n;
  } catch (error) {
    // Compatibility with deployments that have not run the optional performance migration.
    if (/tds_next_number|function .* does not exist|Could not find the function|schema cache/i.test(String(error?.message || error))) {
      atomicCounterSupport = 'missing';
    } else {
      console.warn('ATOMIC COUNTER WARNING:', error.message || error);
    }
    return null;
  }
}
async function atomicCounterHealth(user) {
  try {
    await resolveCompanyId(user);
    const result = await dbRpc('tds_counter_health', {});
    return result === true || result?.available === true;
  } catch (_) { return false; }
}

async function nextSerial(user) {
  const today = egyptTodayISO();
  const atomic = await nextAtomicNumber(user, 'serial', today);
  if (atomic !== null) return atomic;
  let rows = [];
  try {
    rows = await dbSelect('orders', {
      select: 'serial_no,created_at',
      order: 'serial_no.desc',
      limit: 1000
    });
  } catch (_) {}

  const nums = rows
    .filter(r => !r.created_at || String(r.created_at).slice(0, 10) === today)
    .map(r => Number(r.serial_no))
    .filter(Number.isFinite);

  return (nums.length ? Math.max(...nums) : 0) + 1;
}

// delivery_job_shipments.serial_no is NOT NULL in the current schema.
// Always derive it from the shipment/order first; only generate a new value
// as a last resort for legacy rows that were created without a serial number.
async function resolveShipmentSerial(user, shipment, order) {
  const candidates = [order?.serial_no, shipment?.shipment_no];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return await nextSerial(user);
}


async function nextOrderCode(user) {
  const atomic = await nextAtomicNumber(user, 'order_code');
  if (atomic !== null) return `ORD-${atomic}`;
  const companyId = await resolveCompanyId(user);
  let rows = [];
  try {
    rows = await dbSelect('orders', {
      select: 'order_code',
      company_id: `eq.${companyId}`,
      limit: 10000
    });
  } catch (_) {}

  const nums = (rows || [])
    .map(r => {
      const m = String(r.order_code || '').match(/(?:ORD-)?(\d+)$/i);
      return m ? Number(m[1]) : NaN;
    })
    .filter(Number.isFinite);

  return `ORD-${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

async function nextCustomerNo(user) {
  const atomic = await nextAtomicNumber(user, 'customer_no');
  if (atomic !== null) return String(atomic).padStart(6, '0');
  const companyId = await resolveCompanyId(user);
  let rows = [];
  try {
    rows = await dbSelect('customers', {
      select: 'customer_no',
      company_id: `eq.${companyId}`,
      limit: 10000
    });
  } catch (_) {
    // Older customer tables may not have company_id. The INSERT fallback below
    // still handles that schema.
    try {
      rows = await dbSelect('customers', { select: 'customer_no', limit: 10000 });
    } catch (_) {}
  }
  const nums = (rows || [])
    .map(r => Number(String(r.customer_no ?? '').replace(/\D/g, '')))
    .filter(Number.isFinite);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return String(next).padStart(6, '0');
}

async function nextJobCode(user) {
  const atomic = await nextAtomicNumber(user, 'job_code');
  if (atomic !== null) return atomic;
  const companyId = await resolveCompanyId(user);
  // delivery_jobs has a company-scoped UNIQUE constraint on job_code. The
  // sequence must therefore be derived from delivery_jobs, not shipments
  // (shipment codes can lag behind or be reused).
  let rows = [];
  try {
    rows = await dbSelect('delivery_jobs', {
      select: 'job_code',
      company_id: `eq.${companyId}`,
      limit: 10000
    });
  } catch (error) {
    throw new Error('تعذر قراءة أكواد مهام التوصيل لتوليد Job Code جديد.');
  }
  const nums = rows.map(r => Number(String(r.job_code ?? '').trim()))
    .filter(n => Number.isSafeInteger(n) && n >= 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}


async function resolveShipperRate(user, { merchant_id, governorate_id, area_id, at = new Date() } = {}) {
  const companyId = await resolveCompanyId(user);
  if (!merchant_id) return null;
  try {
    const rates = await dbSelect('shipper_rates', {
      select: '*', company_id: `eq.${companyId}`, merchant_id: `eq.${merchant_id}`,
      status: 'eq.Active', effective_date: `lte.${new Date(at).toISOString()}`,
      order: 'effective_date.desc,created_at.desc', limit: 1000
    });
    const gid = String(governorate_id || '');
    const aid = String(area_id || '');
    const eligible = (rates || []).filter(r => {
      const rg = String(r.governorate_id || '');
      const ra = String(r.area_id || '');
      return (!rg && !ra) || (rg === gid && !ra) || (rg === gid && ra === aid);
    }).sort((a,b) => {
      const score = r => (r.area_id ? 3 : r.governorate_id ? 2 : 1);
      const ds = score(b)-score(a);
      if (ds) return ds;
      return new Date(b.effective_date||0)-new Date(a.effective_date||0);
    });
    return eligible[0] || null;
  } catch (e) {
    // Migration may not have been run yet; keep legacy merchant fallback working.
    console.warn('SHIPPER RATE WARNING:', e.message);
    return null;
  }
}

async function createOrder(user, body) {
  const companyId = await resolveCompanyId(user);
  // The order-entry form normally sends serial_no. Do not eagerly query up to
  // 1,000 existing orders for a fallback when the serial is already supplied.
  const suppliedSerial = Number(body.serial_no);
  const serialNo = Number.isFinite(suppliedSerial) && suppliedSerial > 0
    ? suppliedSerial
    : await nextSerial(user);
  const merchantId = cleanString(body.merchant_id);
  const merchantOrderNo = cleanString(body.merchant_order_no);
  if (!merchantId) throw new Error('اختيار الشاحن مطلوب');
  if (!merchantOrderNo) throw new Error('رقم الأوردر الخاص بالشاحن مطلوب');
  // Merchant lookup, order-code generation, and duplicate-number validation are
  // independent network calls. Start them together to avoid serial round trips.
  const duplicateCheckPromise=dbSelect('orders',{
    select:'id,order_code',
    company_id:`eq.${companyId}`,
    merchant_id:`eq.${merchantId}`,
    merchant_order_no:`eq.${encodeURIComponent(merchantOrderNo)}`,
    limit:1
  }).catch(()=>[]);
  // Allocate the tracking number before inserting the order. If the migration
  // is missing or the RPC fails, fail fast instead of inserting then rolling
  // back the order/customer after a long save attempt.
  const trackingNumberPromise = dbRpc('next_tracking_number',{p_company_id:companyId}).then(value => {
    const numeric = Number(String(value));
    if (!Number.isFinite(numeric)) throw new Error('invalid tracking number');
    return String(Math.max(9999998, Math.floor(numeric))).padStart(11, '0');
  }).catch(error => {
    console.warn('TRACKING NUMBER RPC WARNING:', error?.message || error);
    throw new Error('تعذر توليد Tracking Number تلقائيًا. شغّل migration الخاصة بـ Tracking Number.');
  });
  const [merchantRows, generatedOrderCode, duplicateRows, trackingNumber] = await Promise.all([
    dbSelect('merchants',{select:'id,name,company_id,tax_enabled,tax_rate,base_delivery_fee',id:`eq.${merchantId}`,company_id:`eq.${companyId}`,limit:1}),
    nextOrderCode(user),
    duplicateCheckPromise,
    trackingNumberPromise
  ]);
  let merchantRecord = firstRow(merchantRows);
  if(!merchantRecord) {
    merchantRecord = firstRow(await dbSelect('merchants',{select:'id,name,company_id,tax_enabled,tax_rate,base_delivery_fee',id:`eq.${merchantId}`,limit:1}));
  }
  if(!merchantRecord) throw new Error('الشاحن غير موجود داخل الشركة الحالية');
  const effectiveCompanyId = merchantRecord.company_id || companyId;

  // Merchant order numbers are required and must not be duplicated for the same merchant.
  const duplicate = firstRow(duplicateRows);
  if (duplicate) throw new Error(`رقم أوردر التاجر مستخدم بالفعل. Tracking: ${duplicate.tracking_number || duplicate.order_code || duplicate.id}`);

  // order_code is UNIQUE per company. Do not derive it from the daily serial,
  // because the serial can restart while order_code must never repeat.
  let orderCode = generatedOrderCode;

  // orders.customer_id is a required relation in the current database.
  // Always resolve/create the customer before inserting the order so we never
  // send customer_id = null to Supabase.
  let customer = null;
  let customerCreated = false;
  const customerPhone = cleanString(body.customer_phone) || cleanString(body.customer_phone_2);
  const customerName = cleanString(body.customer_name);
  const customerAddress = cleanString(body.address);
  // These lookups do not depend on the customer insert. Start them now so their
  // network latency overlaps with customer resolution/creation.
  const shipperRatePromise = resolveShipperRate(user, {
    merchant_id: merchantId,
    governorate_id: body.governorate_id,
    area_id: body.area_id
  });
  const requestedJobCode = cleanString(body.job_code);
  const suggestedJobCodePromise = requestedJobCode ? Promise.resolve(null) : nextJobCode(user);
  let customerLookupError = null;

  if (customerPhone) {
    try {
      const customerRows = await dbSelect('customers', {
        select: '*',
        phone: `eq.${encodeURIComponent(customerPhone)}`,
        company_id: `eq.${effectiveCompanyId}`,
        limit: 1
      });
      customer = firstRow(customerRows);
    } catch (error) {
      customerLookupError = error;
      // Some older installations do not have company_id on customers.
      try {
        const customerRows = await dbSelect('customers', {
          select: '*',
          phone: `eq.${encodeURIComponent(customerPhone)}`,
          limit: 1
        });
        customer = firstRow(customerRows);
      } catch (_) {}
    }
  }

  if (!customer) {
    const generatedCustomerNo = await nextCustomerNo(user);
    const customerPayload = {
      company_id: effectiveCompanyId,
      customer_no: generatedCustomerNo,
      name: customerName || 'Customer',
      phone: customerPhone || null,
      address: customerAddress || null,
      governorate_id: body.governorate_id || null,
      area_id: body.area_id || null
    };
    let createError = null;
    try {
      customer = firstRow(await dbInsert('customers', customerPayload));
      customerCreated = !!customer?.id;
    } catch (error) {
      createError = error;
      // Only omit company_id for a genuinely old schema where that column
      // does not exist. Never do this for a NOT NULL/FK failure: that would
      // recreate the exact "null value in company_id" error.
      const missingCompanyColumn = /company_id.*(does not exist|not found)|could not find the ['"]company_id['"] column|schema cache.*company_id/i.test(String(error?.message||''));
      if (missingCompanyColumn) {
        try {
          const legacyCustomerPayload = { ...customerPayload };
          delete legacyCustomerPayload.company_id;
          customer = firstRow(await dbInsert('customers', legacyCustomerPayload));
          customerCreated = !!customer?.id;
        } catch (legacyError) {
          createError = legacyError;
        }
      }
    }

    // A trigger/RLS/schema can sometimes reject the INSERT while the row is
    // already present. Re-check by phone before failing the order creation.
    if (!customer && customerPhone) {
      try {
        const customerRows = await dbSelect('customers', {
          select: '*',
          phone: `eq.${encodeURIComponent(customerPhone)}`,
          limit: 1
        });
        customer = firstRow(customerRows);
      } catch (_) {}
    }

    if (!customer?.id) {
      const detail = createError?.message || customerLookupError?.message || 'Unknown customer error';
      throw new Error(`تعذر إنشاء/العثور على العميل، لذلك لم يتم حفظ الأوردر. تفاصيل قاعدة البيانات: ${detail}`);
    }
  }

  const orderValue = cleanNumber(body.value);
  let merchantTaxEnabled = false;
  let merchantTaxRate = 0;
  if (body.merchant_id) {
    try {
      const merchant = merchantRecord;
      merchantTaxEnabled = merchant?.tax_enabled === true;
      merchantTaxRate = Math.min(100, Math.max(0, cleanNumber(merchant?.tax_rate)));
    } catch (error) { console.warn('MERCHANT TAX WARNING:', error.message); }
  }
  const merchantForFee = merchantRecord;
  const shipperRate = await shipperRatePromise;
  const requestedDeliveryFee = Number(body.delivery_fee);
  // The shipper rate is the default/prefill only. The employee is allowed to
  // edit Service Charges before saving the order, and the edited value must win.
  const deliveryFee = Number.isFinite(requestedDeliveryFee) && requestedDeliveryFee >= 0
    ? cleanNumber(requestedDeliveryFee)
    : (shipperRate ? cleanNumber(shipperRate.delivery_rate) : cleanNumber(merchantForFee?.base_delivery_fee));
  // Shipper VAT is charged on delivery/service charges only, never on the COD/order value.
  const taxAmount = merchantTaxEnabled ? Number((deliveryFee * merchantTaxRate / 100).toFixed(2)) : 0;
  const merchantNetValue = Number((orderValue - taxAmount).toFixed(2));

  // The entry form supplies the sequential Job Code. Otherwise the lookup was
  // started earlier in parallel with customer resolution.
  const suggestedJobCode = await suggestedJobCodePromise;
  const jobCode = requestedJobCode || String(suggestedJobCode);

  const orderPayload = {
    company_id: effectiveCompanyId, created_by: user.id === 'env-admin' ? null : user.id, created_by_name: cleanString(user.name||user.username||user.email||'Administrator'), serial_no: serialNo, serial_date: cleanString(body.serial_date) || egyptTodayISO(), order_code: orderCode, merchant_id: merchantId,
    merchant_order_no: merchantOrderNo, reference_number: cleanString(body.reference_number) || null, customer_id: customer?.id || null,
    customer_name: cleanString(body.customer_name) || null, customer_phone: cleanString(body.customer_phone) || null, customer_phone_2: cleanString(body.customer_phone_2) || null,
    governorate_id: body.governorate_id || null, area_id: body.area_id || null, address: cleanString(body.address) || null,
    value: orderValue, delivery_fee: deliveryFee, service_charges: deliveryFee,
    shipper_rate_id: shipperRate?.id || null, shipper_rate_value: shipperRate ? cleanNumber(shipperRate.delivery_rate) : null,
    shipper_cod_rate: shipperRate ? cleanNumber(shipperRate.cod_rate) : null,
    tax_enabled: merchantTaxEnabled, tax_rate: merchantTaxRate, tax_amount: taxAmount, merchant_net_value: merchantNetValue, status: 'Receive at Hub', notes: cleanString(body.notes) || null
  };

  let order;
  try {
    order = firstRow(await dbInsert('orders', orderPayload));
  } catch (error) {
    // A concurrent employee may have received the same next code. Retry once
    // with a freshly calculated unique code instead of exposing a raw
    // orders_company_id_order_code_key error to the user.
    if (/orders_company_id_order_code_key|duplicate key.*order_code|unique constraint.*order_code/i.test(String(error?.message || ''))) {
      orderCode = await nextOrderCode(user);
      orderPayload.order_code = orderCode;
      try {
        order = firstRow(await dbInsert('orders', orderPayload));
      } catch (retryError) {
        throw new Error(`تعذر إنشاء رقم أوردر فريد تلقائيًا: ${retryError.message || retryError}`);
      }
    }
  }
  if (order?.id) {
    // already inserted; continue below
  } else {
    // Some existing schemas may not have the customer_name/customer_phone columns.
    const fallback = { ...orderPayload };
    delete fallback.customer_name;
    delete fallback.customer_phone;
    delete fallback.customer_phone_2;
    delete fallback.reference_number;
    delete fallback.created_by_name;
    try {
      order = firstRow(await dbInsert('orders', fallback));
    } catch (taxSchemaError) {
      const legacyFallback = { ...fallback };
      delete legacyFallback.tax_enabled; delete legacyFallback.tax_rate; delete legacyFallback.tax_amount; delete legacyFallback.merchant_net_value;
      try {
        order = firstRow(await dbInsert('orders', legacyFallback));
      } catch (legacySchemaError) {
        const rateFallback = { ...legacyFallback };
        delete rateFallback.shipper_rate_id; delete rateFallback.shipper_rate_value; delete rateFallback.shipper_cod_rate; delete rateFallback.created_by;
        order = firstRow(await dbInsert('orders', rateFallback));
        console.warn('ORDER RATE COLUMNS WARNING:', legacySchemaError.message);
      }
      console.warn('ORDER TAX COLUMNS WARNING:', taxSchemaError.message);
    }
  }

  if (!order?.id) throw new Error('لم يتم إنشاء الأوردر في Supabase');

  // The REST API does not wrap multiple calls in one DB transaction.  Therefore
  // every failure after the order INSERT must compensate by deleting everything
  // created by this request, otherwise a failed shipment can leave a ghost order
  // that causes a duplicate on the next retry.
  let cleanupDone = false;
  const rollbackFailedCreate = async (reason) => {
    if (cleanupDone) return;
    cleanupDone = true;
    try {
      const shRows = await dbSelect('shipments', { select: 'id', order_id: `eq.${order.id}`, limit: 20 }).catch(() => []);
      for (const sh of (shRows || [])) {
        try { await dbDelete('shipment_status_history', { shipment_id: `eq.${sh.id}` }); } catch (_) {}
        try { await dbDelete('delivery_job_shipments', { shipment_id: `eq.${sh.id}` }); } catch (_) {}
        try { await dbDelete('shipments', { id: `eq.${sh.id}`, company_id: `eq.${companyId}` }); } catch (_) {}
      }
    } catch (_) {}
    try { await dbDelete('orders', { id: `eq.${order.id}`, company_id: `eq.${companyId}` }); } catch (_) {}
    if (customerCreated && customer?.id) {
      try {
        const linked = await dbSelect('orders', { select: 'id', customer_id: `eq.${customer.id}`, limit: 1 }).catch(() => []);
        if (!linked.length) await dbDelete('customers', { id: `eq.${customer.id}`, company_id: `eq.${companyId}` }).catch(() => {});
      } catch (_) {}
    }
    console.warn('CREATE ORDER ROLLBACK:', reason?.message || reason || 'unknown error');
  };

  let shipment = null;
  // Shipment Number is system-generated and must be globally unique.
  // Never derive it from the company-local serial number because that serial
  // can repeat across imports/companies and can collide with old records.
  let shipmentNo = cleanString(body.shipment_no);
  // The tracking number has already been allocated in parallel with the
  // initial merchant/order checks, before any order/customer insert.
  const shipmentNoResult = await Promise.resolve(
    shipmentNo ? { status:'fulfilled', value:shipmentNo } : dbRpc('next_shipment_number', {}).then(value=>({status:'fulfilled',value}), reason=>({status:'rejected',reason}))
  );
  if (!shipmentNo) {
    if (shipmentNoResult.status === 'fulfilled') shipmentNo = String(shipmentNoResult.value);
    else shipmentNo = `SH-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }
  const existingTracking = await dbSelect('shipments',{select:'id',company_id:`eq.${companyId}`,tracking_number:`eq.${encodeURIComponent(trackingNumber)}`,limit:1}).catch(()=>[]);
  if (existingTracking.length) { const error = new Error('Tracking Number مستخدم بالفعل. اختر رقمًا آخر.'); await rollbackFailedCreate(error); throw error; }

  const shipmentPayload = {
    company_id: companyId,
    order_id: order.id,
    shipment_no: shipmentNo,
    tracking_number: trackingNumber,
    job_code: jobCode,
    status: 'Receive at Hub'
  };

  try {
    shipment = firstRow(await dbInsert('shipments', shipmentPayload));
  } catch (error) {
    // A collision can still happen if another request inserted between the
    // generator and INSERT. Regenerate once under the DB-backed sequence.
    if (/shipments_company_id_shipment_no_key|shipments_shipment_no_global_unique_idx|duplicate key.*shipment_no|unique constraint.*shipment_no/i.test(String(error?.message || '')) && !cleanString(body.shipment_no)) {
      try {
        shipmentNo = String(await dbRpc('next_shipment_number', {}));
        shipmentPayload.shipment_no = shipmentNo;
        shipment = firstRow(await dbInsert('shipments', shipmentPayload));
      } catch (retryError) {
        await rollbackFailedCreate(retryError);
        throw new Error(`فشل إنشاء رقم الشحنة بشكل فريد: ${retryError.message || retryError}`);
      }
    } else {
      // Older schemas may lack the optional status column, but Job Code is required by this version.
      const fallback = { ...shipmentPayload };
      delete fallback.status;
      try {
        shipment = firstRow(await dbInsert('shipments', fallback));
      } catch (schemaError) {
        const msg = String(schemaError?.message || schemaError);
        await rollbackFailedCreate(schemaError);
        if (/shipment_no.*unique|unique.*shipment_no|shipments_company_id_shipment_no_key/i.test(msg)) {
          throw new Error('رقم الشحنة مكرر في قاعدة البيانات. شغّل آخر migration الخاصة برقم الشحنة ثم أعد المحاولة.');
        }
        throw new Error(`فشل إنشاء الشحنة: ${msg}`);
      }
    }
  }

  if (!shipment?.id) { const error = new Error('تم إنشاء الأوردر لكن فشل إنشاء الشحنة'); await rollbackFailedCreate(error); throw error; }

  // Run independent post-insert work concurrently to shorten save latency.
  // Scan Driver matching and the initial status history do not depend on each other.
  let scanRecord = null;
  const scanLookupPromise = dbSelect('scan_driver_records',{select:'*',company_id:`eq.${companyId}`,order_number:`eq.${encodeURIComponent(merchantOrderNo)}`,matched_order_id:'is.null',order:'created_at.asc',limit:1})
    .then(rows => { scanRecord = firstRow(rows); return scanRecord; })
    .catch(scanError => { console.warn('SCAN LINK WARNING:', scanError.message); return null; });
  const initialHistoryPromise = dbInsert('shipment_status_history',{shipment_id:shipment.id,status:'Receive at Hub',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}).catch(() => {});
  // Start the duplicate check alongside initial history and scan lookup, then await it with the audit write.
  const jobCodeDuplicateCheckPromise = (async () => {
    try {
      const today = egyptTodayISO();
      const todayStart = systemDayStartUTCISO(today);
      const tomorrowStart = systemDayStartUTCISO(addEgyptDaysISO(1, today));
      const duplicateRows = await dbSelect('shipments', {
        select: 'id',
        company_id: `eq.${companyId}`,
        job_code: `eq.${encodeURIComponent(jobCode)}`,
        and: `(created_at.gte.${todayStart},created_at.lt.${tomorrowStart})`,
        limit: 10
      });
      return duplicateRows.some(r => String(r.id) !== String(shipment.id));
    } catch (duplicateCheckError) {
      console.warn('TODAY JOB CODE DUPLICATE CHECK WARNING:', duplicateCheckError.message);
      return false;
    }
  })();
  await Promise.all([scanLookupPromise, initialHistoryPromise]);
  if (scanRecord?.id) {
    try {
      await Promise.all([
        dbUpdate('scan_driver_records',{id:`eq.${scanRecord.id}`,company_id:`eq.${companyId}`},{matched_order_id:order.id,matched_at:new Date().toISOString()},{prefer:'return=minimal'}),
        dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{scan_driver_id:scanRecord.driver_id,scan_at:scanRecord.scanned_at||scanRecord.created_at,scan_by_user_id:scanRecord.employee_id||null},{prefer:'return=minimal'}).catch(() => {})
      ]);
      const drv=firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${scanRecord.driver_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
      await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:`Scan by ${drv?.name||'Driver'}`,user_id:scanRecord.employee_id|| (user.id==='env-admin'?null:user.id)},{prefer:'return=minimal'}).catch(() => {});
    } catch (scanError) { console.warn('SCAN LINK WARNING:', scanError.message); }
  }

  try {
    const [, jobCodeDuplicate] = await Promise.all([
      audit(user, 'create_order', 'order', order.id, { shipment_id: shipment.id, job_code: jobCode }),
      jobCodeDuplicateCheckPromise
    ]);
    return {
      order,
      shipment,
      trackingNumber: shipment.tracking_number || trackingNumber,
      jobCode: shipment.job_code || jobCode,
      jobCodeDuplicate,
      serialDuplicate: false
    };
  } catch (auditError) {
    await rollbackFailedCreate(auditError);
    throw new Error(`فشل تسجيل العملية، لذلك لم يتم حفظ الأوردر: ${auditError.message || auditError}`);
  }

}


async function getOrderById(id) {
  if (!id) return null;
  const rows = await dbSelect('orders', { select: '*', id: `eq.${id}`, limit: 1 });
  return firstRow(rows);
}

async function getOrderDetails(id) {
  const order = await getOrderById(id);
  if (!order) return null;
  let shipment = null;
  let merchant = null;
  let area = null;
  let governorate = null;
  let customer = null;
  let history = [];
  try { shipment = firstRow(await dbSelect('shipments', { select: '*', order_id: `eq.${id}`, limit: 1 })); } catch (_) {}
  try { merchant = firstRow(await dbSelect('merchants', { select: '*', id: `eq.${order.merchant_id}`, limit: 1 })); } catch (_) {}
  try { customer = order.customer_id ? firstRow(await dbSelect('customers', { select: '*', id: `eq.${order.customer_id}`, limit: 1 })) : null; } catch (_) {}
  // Resolve location from the order first; legacy shipment/customer links are fallbacks.
  const areaIds = [order.area_id, shipment?.area_id, customer?.area_id].filter((v,i,a)=>v && a.indexOf(v)===i);
  for (const areaId of areaIds) {
    try {
      area = firstRow(await dbSelect('areas', { select: 'id,name_ar,name_en,governorate_id', id: `eq.${areaId}`, limit: 1 }));
      if (area) break;
    } catch (_) {}
  }
  const governorateIds = [area?.governorate_id, order.governorate_id, shipment?.governorate_id, customer?.governorate_id].filter((v,i,a)=>v && a.indexOf(v)===i);
  for (const governorateId of governorateIds) {
    try {
      governorate = firstRow(await dbSelect('governorates', { select: 'id,name_ar,name_en', id: `eq.${governorateId}`, limit: 1 }));
      if (governorate) break;
    } catch (_) {}
  }
  if (area) { order.area_name = area.name_ar || area.name_en || ''; order.area_name_en = area.name_en || area.name_ar || ''; }
  if (governorate) { order.governorate_name = governorate.name_ar || governorate.name_en || ''; order.governorate_name_en = governorate.name_en || governorate.name_ar || ''; }
  if (shipment?.id) {
    try { history = await dbSelect('shipment_status_history', { select: '*', shipment_id: `eq.${shipment.id}`, order: 'created_at.desc', limit: 100 }); } catch (_) {}
  }
  return { order, shipment, merchant, customer, area, governorate, history };
}

async function getOrderAuditTrail(orderId, shipmentId = null) {
  const ids = [orderId, shipmentId].filter(Boolean);
  if (!ids.length) return [];
  const wanted = new Set(ids.map(String));
  let auditRows = [];
  let statusRows = [];
  try {
    const allAudit = await dbSelect('audit_logs', { select: '*', order: 'created_at.desc', limit: 2000 });
    auditRows = allAudit.filter(r => wanted.has(String(r.entity_id)));
  } catch (_) {}
  if (shipmentId) {
    try {
      statusRows = await dbSelect('shipment_status_history', { select: '*', shipment_id: `eq.${shipmentId}`, order: 'created_at.desc', limit: 500 });
    } catch (_) {}
  }
  const userIds = [...new Set([...auditRows, ...statusRows].map(r => r.user_id).filter(Boolean).map(String))];
  const users = userIds.length ? await dbSelect('users', { select: 'id,name,username,employee_code,email', limit: 1000 }).catch(() => []) : [];
  const byUser = new Map(users.map(u => [String(u.id), u]));
  const audits = auditRows.map(r => {
    const u = byUser.get(String(r.user_id));
    return {
      ...r,
      history_type: 'audit',
      user_name: u?.name || u?.username || u?.email || (r.user_id ? String(r.user_id) : 'System'),
      employee_code: u?.employee_code || ''
    };
  });
  const statuses = statusRows.map(r => {
    const u = byUser.get(String(r.user_id));
    return {
      ...r,
      action: 'update_shipment_status',
      history_type: 'status',
      details: { status: r.status },
      entity_type: 'shipment',
      entity_id: shipmentId,
      user_name: u?.name || u?.username || u?.email || (r.user_id ? String(r.user_id) : 'System'),
      employee_code: u?.employee_code || ''
    };
  });
  return [...audits, ...statuses].sort((a,b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
}

function displayShipmentStatusServer(r){
  const actual=canonicalOrderStatus(r?.current_status||r?.status||r?.order?.status||'');
  if(actual) return actual;
  const action=String(r?.order?.driver_statement_action||r?.driver_statement_action||'').toLowerCase();
  const map={return_by_driver:'Return by Driver',location_change:'Location Change',future_delivery:'Future Delivery',schedule_for_tomorrow:'Schedule for Tomorrow',cancelled:'Cancelled'};
  return map[action] || '';
}

async function listShipments(from, to, companyId = null) {
  // Scope operational datasets to the signed-in company before downloading them.
  // This avoids transferring unrelated tenants' rows. Link/history tables are
  // kept unscoped where the schema does not consistently expose company_id.
  const scoped = companyId ? { company_id: `eq.${companyId}` } : {};
  const [shipments, merchants, drivers, areas, governorates, deliveryJobs, customers, users] = await Promise.all([
    dbSelectAll('shipments', { select: '*', ...scoped, order: 'created_at.desc,id.asc' }),
    dbSelectAll('merchants', { select: 'id,name,merchant_no,code', ...scoped }),
    dbSelectAll('drivers', { select: 'id,name,driver_no', ...scoped }),
    dbSelectAll('areas', { select: 'id,name_ar,name_en,governorate_id', ...scoped }),
    dbSelectAll('governorates', { select: 'id,name_ar,name_en', ...scoped }).catch(() => []),
    dbSelectAll('delivery_jobs', { select: '*', ...scoped, order: 'created_at.desc,id.asc' }),
    dbSelectAll('customers', { select: '*', ...scoped }).catch(() => []),
    dbSelectAll('users', { select: 'id,name,username,employee_code', ...scoped }).catch(() => [])
  ]);
  // Only download shipment links belonging to this company's jobs, in bounded
  // ID batches to avoid huge PostgREST URLs and unrelated companies' link rows.
  const jobIds = deliveryJobs.map(job => String(job.id || '')).filter(Boolean);
  const jobLinkBatches = [];
  for (let i = 0; i < jobIds.length; i += 100) {
    const ids = jobIds.slice(i, i + 100).map(id => `"${id.replace(/"/g, '')}"`).join(',');
    jobLinkBatches.push(dbSelectAll('delivery_job_shipments', {
      select: 'id,shipment_id,delivery_job_id,delivery_job_code',
      delivery_job_id: `in.(${ids})`
    }));
  }
  const jobLinks = (await Promise.all(jobLinkBatches)).flat();
  const linksByJob = new Map();
  for (const link of jobLinks) {
    const key = String(link.delivery_job_id || '');
    if (!key) continue;
    if (!linksByJob.has(key)) linksByJob.set(key, []);
    linksByJob.get(key).push(link);
  }
  const latestJobByShipment = new Map();
  for (const job of deliveryJobs) {
    for (const link of linksByJob.get(String(job.id)) || []) {
      const sid = String(link.shipment_id || '');
      if (!sid || latestJobByShipment.has(sid)) continue;
      latestJobByShipment.set(sid, { ...job, delivery_job_code: link.delivery_job_code || job.job_code || '' });
    }
  }
  let orders = [];
  try {
    orders = await dbSelectAll('orders', { select: '*', ...scoped, order: 'created_at.desc,id.asc' });
  } catch (error) {
    // Compatibility with older databases whose orders table is missing newer columns.
    orders = await dbSelectAll('orders', { select: 'id,company_id,serial_no,order_code,merchant_id,merchant_order_no,customer_id,customer_name,customer_phone,customer_phone_2,governorate_id,area_id,address,value,delivery_fee,notes,status,created_at', ...scoped, order: 'created_at.desc,id.asc' });
  }
  const usersById = new Map((users || []).map(u => [String(u.id), u]));
  orders = orders.map(o => { const creator=usersById.get(String(o.created_by||o.created_by_user_id||''))||{}; return {...o,created_by_name:o.created_by_name||creator.name||creator.username||creator.employee_code||''}; });
  const byOrder = new Map(orders.map(x => [String(x.id), x]));
  const byCustomer = new Map(customers.map(x => [String(x.id), x]));
  const byMerchant = new Map(merchants.map(x => [String(x.id), x]));
  const byDriver = new Map(drivers.map(x => [String(x.id), x]));
  const byArea = new Map(areas.map(x => [String(x.id), x]));
  const byGovernorate = new Map(governorates.map(x => [String(x.id), x]));
  const areaByName = new Map(); for (const a of areas) for (const k of [a.name_ar,a.name_en]) if (k) areaByName.set(String(k).trim().toLowerCase(),a);
  const governorateByName = new Map(); for (const g of governorates) for (const k of [g.name_ar,g.name_en]) if (k) governorateByName.set(String(k).trim().toLowerCase(),g);
  const shipmentByOrder = new Map(shipments.map(x => [String(x.order_id), x]));

  let statusHistory = [];
  try {
    // Status history has no dependable company_id in every deployed schema.
    // Query it only for shipments already scoped to this company, and keep the
    // response projection minimal because the dashboard uses only the latest status.
    const shipmentIds = shipments.map(shipment => String(shipment.id || '')).filter(Boolean);
    const historyBatches = [];
    for (let i = 0; i < shipmentIds.length; i += 100) {
      const ids = shipmentIds.slice(i, i + 100).map(id => `"${id.replace(/"/g, '')}"`).join(',');
      historyBatches.push(dbSelectAll('shipment_status_history', {
        select: 'id,shipment_id,status,created_at',
        shipment_id: `in.(${ids})`,
        order: 'created_at.desc,id.asc'
      }));
    }
    statusHistory = (await Promise.all(historyBatches)).flat();
  } catch (_) {}
  const latestStatusByShipment = new Map();
  const latestCompletionStatusByShipment = new Map();
  const completionHistoryStatuses = new Set(['delivered','half delivered','cancelled by shipper','cancelled by receiver','replaced']);
  for (const h of statusHistory) {
    const key = String(h.shipment_id || '');
    if (!key) continue;
    if (!latestStatusByShipment.has(key)) latestStatusByShipment.set(key, h);
    const rawStatus = String(h.status || '').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\\s+/g,' ');
    const historyStatus = rawStatus === 'cancelled by reciver' ? 'cancelled by receiver' : commissionStatusKey(rawStatus);
    if (completionHistoryStatuses.has(historyStatus) && !latestCompletionStatusByShipment.has(key)) {
      latestCompletionStatusByShipment.set(key, h);
    }
  }

  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;

  return orders.map(o => {
    const s = shipmentByOrder.get(String(o.id)) || {};
    const m = byMerchant.get(String(o.merchant_id)) || {};
    const customer = byCustomer.get(String(o.customer_id || '')) || {};
    // Legacy orders often store the area only on the linked customer, not on the order/shipment.
    const areaId = s.area_id || o.area_id || customer.area_id || '';
    const areaText = o.area_name || o.area || s.area_name || s.area_name_en || customer.area_name || customer.area || customer.region || '';
    const area = byArea.get(String(areaId)) || areaByName.get(String(areaText).trim().toLowerCase()) || (areaText ? { id: areaId || null, governorate_id: o.governorate_id || s.governorate_id || customer.governorate_id || null, name_ar: areaText, name_en: o.area_name_en || s.area_name_en || customer.area_name_en || areaText } : null);
    const governorateId = s.governorate_id || o.governorate_id || customer.governorate_id || area?.governorate_id || null;
    const governorateText = o.governorate_name || o.governorate || s.governorate_name || customer.governorate_name || '';
    const governorate = byGovernorate.get(String(governorateId || '')) || governorateByName.get(String(governorateText).trim().toLowerCase()) || null;
    if (area && !area.governorate_id && governorateId) area.governorate_id = governorateId;
    const driver = byDriver.get(String(s.driver_id || '')) || (latestJobByShipment.get(String(s.id || ''))?.driver_id ? byDriver.get(String(latestJobByShipment.get(String(s.id || ''))?.driver_id)) : null) || null;
    const latest = latestStatusByShipment.get(String(s.id || '')) || null;
    const latestCompletion = latestCompletionStatusByShipment.get(String(s.id || '')) || null;
    const status = effectiveOrderStatus(o, s) || latest?.status || '';
    const latestJob = latestJobByShipment.get(String(s.id || '')) || null;
    // Keep Operation Dashboard aligned with Delivery Jobs: assigned special
    // actions use their scheduled operational day; normal jobs use assignment day.
    // No linked Delivery Job means no Days Out age, even if the order is old.
    const actionKey = String(o.driver_statement_action || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    const scheduledActions = new Set(['future delivery', 'return by driver', 'location change', 'schedule for tomorrow']);
    const scheduledDay = String(o.driver_scheduled_date || '').slice(0, 10);
    const operationalJobDate = latestJob
      ? (scheduledActions.has(actionKey) && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDay)
          ? scheduledDay
          : (latestJob.job_date || latestJob.delivery_date || latestJob.date || latestJob.created_at || ''))
      : '';
    // Prefer a real status-history timestamp. If history is unavailable, use update
    // timestamps only; creation time is not a status-change date.
    const lastStatusAt = latest?.created_at || o.status_changed_at || s.status_changed_at || s.updated_at || o.updated_at || '';
    return {
      ...s,
      order_id: o.id,
      order: o,
      customer,
      merchant: m,
      area,
      governorate,
      governorate_id: governorate?.id || governorateId || null,
      area_id: area?.id || areaId || null,
      driver,
      current_status: status,
      last_status_at: lastStatusAt,
      latest_status: latest || null,
      last_completion_status: latestCompletion?.status || null,
      last_completion_status_at: latestCompletion?.created_at || null,
      delivery_job: latestJob,
      delivery_job_date: operationalJobDate || null,
      delivery_job_code: latestJob?.delivery_job_code || latestJob?.job_code || s.job_code || '',
      // Days Out starts from the same operational date as Delivery Jobs.
      days_out: (() => {
        if (!operationalJobDate) return 0;
        const start = new Date(String(operationalJobDate).slice(0,10) + 'T12:00:00').getTime();
        const today = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: SYSTEM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) + 'T12:00:00').getTime();
        if (!Number.isFinite(start) || !Number.isFinite(today)) return 0;
        return Math.max(0, Math.floor((today-start)/86400000));
      })()
    };
  }).filter(row => {
    // The Orders date filter uses the date that actually controls the order
    // on the selected day. For the three special statuses, this is the
    // scheduled/action date stored on the order, NOT the date the status was
    // created/updated. This keeps Future Delivery, Return by Driver and
    // Location Change visible only on their selected date.
    const specialKey = String(row.order?.driver_statement_action || '').toLowerCase();
    const specialDate = ['future_delivery','return_by_driver','location_change','schedule_for_tomorrow'].includes(specialKey)
      ? String(row.order?.driver_scheduled_date || '').slice(0,10)
      : '';
    // The dashboard follows the same date used by the Delivery Job.
    // Special driver actions use their scheduled date; normal assigned jobs use job_date.
    const jobDate = String(row.delivery_job_date || '').slice(0,10);
    const displayDate = specialDate || jobDate || String(row.last_status_at || '').slice(0,10);
    const stamp = displayDate ? new Date(`${displayDate}T12:00:00`).getTime() : 0;
    if (fromMs !== null && stamp < fromMs) return false;
    if (toMs !== null && stamp > toMs) return false;
    row.display_date = displayDate;
    row.special_scheduled_date = specialDate || null;
    row.delivery_job_date = jobDate || null;
    return true;
  });
}

async function updateOrder(user, id, body) {
  const companyId = await resolveCompanyId(user);
  const existing = firstRow(await dbSelect('orders', { select: '*', id: `eq.${id}`, company_id: `eq.${companyId}`, limit: 1 }));
  if (!existing) throw new Error('الأوردر غير موجود');
  const linkedShipment = firstRow(await dbSelect('shipments', { select: '*', order_id: `eq.${id}`, company_id: `eq.${companyId}`, limit: 1 }).catch(() => []));
  if (paidLockValues(existing, linkedShipment)) throw new Error('الأوردر Paid ومغلق للتعديل');

  const merchantId = cleanString(body.merchant_id) || existing.merchant_id;
  if (!merchantId) throw new Error('اختيار الشاحن مطلوب');
  let merchant = firstRow(await dbSelect('merchants', { select: 'id,name,company_id', id: `eq.${merchantId}`, company_id: `eq.${companyId}`, limit: 1 }));
  if (!merchant) merchant = firstRow(await dbSelect('merchants', { select: 'id,name,company_id', id: `eq.${merchantId}`, limit: 1 }));
  if (!merchant) throw new Error('الشاحن غير موجود داخل الشركة الحالية');
  const effectiveCompanyId = merchant.company_id || companyId;

  const merchantOrderNo = cleanString(body.merchant_order_no) || existing.merchant_order_no || null;
  if (!merchantOrderNo) throw new Error('رقم الأوردر الخاص بالشاحن مطلوب');
  try {
    const duplicate = firstRow(await dbSelect('orders', {
      select:'id', company_id:`eq.${companyId}`, merchant_id:`eq.${merchantId}`,
      merchant_order_no:`eq.${encodeURIComponent(merchantOrderNo)}`, limit:5
    }));
    if (duplicate && String(duplicate.id) !== String(id)) throw new Error('رقم أوردر الشاحن مستخدم بالفعل لشاحن آخر/أوردر آخر');
  } catch (error) {
    if (String(error.message||'').includes('مستخدم بالفعل')) throw error;
  }

  // Preserve the existing customer relation when possible. If the old order
  // has no customer_id, create/resolve one now so future saves can never write
  // a null required customer_id.
  let customerId = existing.customer_id || null;
  const customerPhone = cleanString(body.customer_phone) || cleanString(body.customer_phone_2) || cleanString(existing.customer_phone) || cleanString(existing.customer_phone_2);
  if (!customerId && customerPhone) {
    let customer = firstRow(await dbSelect('customers',{select:'*',phone:`eq.${encodeURIComponent(customerPhone)}`,company_id:`eq.${effectiveCompanyId}`,limit:1}).catch(()=>[]));
    if (!customer) {
      const customerPayload={company_id:effectiveCompanyId,name:cleanString(body.customer_name)||cleanString(existing.customer_name)||'Customer',phone:customerPhone,address:cleanString(body.address)||cleanString(existing.address)||null,governorate_id:body.governorate_id||existing.governorate_id||null,area_id:body.area_id||existing.area_id||null};
      try {
        customer=firstRow(await dbInsert('customers',customerPayload));
      } catch(error) {
        const missingCompanyColumn=/company_id.*(does not exist|not found)|could not find the ['"]company_id['"] column|schema cache.*company_id/i.test(String(error?.message||''));
        if(missingCompanyColumn){
          try { const legacy={...customerPayload}; delete legacy.company_id; customer=firstRow(await dbInsert('customers',legacy)); } catch(_) {}
        }
      }
    }
    customerId=customer?.id||null;
  }
  if (!customerId) throw new Error('الأوردر مرتبط بدون Customer. لا يمكن حفظه قبل إنشاء/ربط العميل.');

  const value = cleanNumber(body.value);
  const serviceCharges = Math.max(0, cleanNumber(body.service_charges !== undefined ? body.service_charges : body.delivery_fee));
  const targetMerchant=firstRow(await dbSelect('merchants',{select:'id,tax_enabled,tax_rate',id:`eq.${merchantId}`,company_id:`eq.${effectiveCompanyId}`,limit:1}).catch(()=>[]))||{};
  const taxEnabled=String(existing.merchant_id||'')===String(merchantId)&&existing.tax_enabled!==undefined&&existing.tax_enabled!==null?existing.tax_enabled===true:targetMerchant.tax_enabled===true;
  const taxRate=Math.max(0,Math.min(100,cleanNumber(String(existing.merchant_id||'')===String(merchantId)&&existing.tax_rate!==undefined&&existing.tax_rate!==null?existing.tax_rate:targetMerchant.tax_rate)));
  const statusForTax=String(body.status!==undefined?body.status:existing.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  const taxAmount=statusForTax==='cancelled by shipper'||!taxEnabled?0:Number((serviceCharges*taxRate/100).toFixed(2));
  const patch = {
    company_id: companyId,
    merchant_id: merchantId,
    merchant_order_no: merchantOrderNo,
    reference_number: cleanString(body.reference_number) || null,
    customer_id: customerId,
    customer_name: cleanString(body.customer_name) || null,
    customer_phone: cleanString(body.customer_phone) || null,
    customer_phone_2: cleanString(body.customer_phone_2) || null,
    governorate_id: body.governorate_id || null,
    area_id: body.area_id || null,
    address: cleanString(body.address) || null,
    value,
    cod: value,
    delivery_fee: serviceCharges,
    service_charges: serviceCharges,
    tax_amount: taxAmount,
    merchant_net_value: Number((value-taxAmount).toFixed(2)),
    notes: cleanString(body.notes) || null
  };
  if (body.status !== undefined) patch.status = cleanString(body.status) || existing.status;
  if (body.order_code !== undefined) patch.order_code = cleanString(body.order_code) || existing.order_code || null;

  const data = firstRow(await dbUpdate('orders', { id:`eq.${id}`, company_id:`eq.${companyId}` }, patch));
  if (!data) throw new Error('فشل تحديث الأوردر');

  try {
    await dbUpdate('customers', { id:`eq.${customerId}`, company_id:`eq.${companyId}` }, {
      name:patch.customer_name || '', phone:patch.customer_phone || patch.customer_phone_2 || null,
      address:patch.address || null, governorate_id:patch.governorate_id, area_id:patch.area_id
    });
  } catch (_) {
    try { await dbUpdate('customers',{id:`eq.${customerId}`},{name:patch.customer_name||'',phone:patch.customer_phone||patch.customer_phone_2||null,address:patch.address||null,governorate_id:patch.governorate_id,area_id:patch.area_id}); } catch(__) {}
  }

  const shipment = firstRow(await dbSelect('shipments',{select:'id,tracking_number,job_code,company_id',order_id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
  if (shipment?.id) {
    const shipmentPatch={};
    if (Object.prototype.hasOwnProperty.call(body,'job_code')) shipmentPatch.job_code=cleanString(body.job_code)||null;
    if (Object.prototype.hasOwnProperty.call(body,'shipment_no')) shipmentPatch.shipment_no=cleanString(body.shipment_no)||null;
    // Tracking Number is intentionally excluded from shipmentPatch.
    if (Object.keys(shipmentPatch).length) await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},shipmentPatch);
  }
  // Tracking Number is intentionally NEVER updated here. It is generated by
  // the system and displayed read-only on Edit Order.
  await audit(user,'update_order','order',id,{before:{merchant_id:existing.merchant_id,merchant_order_no:existing.merchant_order_no,customer_id:existing.customer_id,value:existing.value,delivery_fee:existing.delivery_fee,service_charges:existing.service_charges},after:patch,tracking_number:shipment?.tracking_number||null,job_code:body.job_code});
  return await getOrderDetails(id);
}

async function getMerchant(id) {
  return firstRow(await dbSelect('merchants', { select: '*', id: `eq.${id}`, limit: 1 }));
}

async function searchAll(q, companyId = null, options = {}) {
  const needle = cleanString(q).trim().toLowerCase();
  if (!needle || needle === '__none__') return { type: 'none', data: null, results: [] };

  // Global search returns the closest matches first instead of requiring an
  // exact full-value match. This is especially useful for partial numeric
  // shipment/tracking/phone searches.
  const configs = options.single ? [
    ['shipments', ['shipment_no', 'tracking_number', 'job_code']],
    ['orders', ['merchant_order_no', 'order_code', 'customer_phone', 'customer_phone_2']]
  ] : [
    ['shipments', ['shipment_no', 'tracking_number', 'job_code']],
    ['orders', ['merchant_order_no', 'order_code', 'customer_phone', 'customer_phone_2']],
    ['customers', ['phone']]
  ];
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const compact = value => normalize(value).replace(/[^a-z0-9\u0600-\u06ff]/gi, '');
  const digits = value => String(value ?? '').replace(/\D/g, '');
  const levenshtein = (a,b) => {
    a=String(a); b=String(b);
    if(a===b)return 0;
    if(!a)return b.length; if(!b)return a.length;
    if(a.length>b.length){const t=a;a=b;b=t;}
    let prev=Array.from({length:a.length+1},(_,i)=>i);
    for(let j=1;j<=b.length;j++){
      const cur=[j];
      for(let i=1;i<=a.length;i++) cur[i]=Math.min(cur[i-1]+1,prev[i]+1,prev[i-1]+(a[i-1]===b[j-1]?0:1));
      prev=cur;
    }
    return prev[a.length];
  };
  const scoreValue = value => {
    const raw=normalize(value), val=compact(value), q=compact(needle);
    if(!val||!q)return Infinity;
    const numericQuery=/^\d+$/.test(q);
    if(numericQuery){
      const vd=digits(val);
      if(!vd.includes(q))return Infinity;
      if(vd===q)return 0;
      if(vd.startsWith(q))return 10 + (vd.length-q.length);
      return 20 + vd.indexOf(q) + Math.max(0,vd.length-q.length)*0.01;
    }
    if(raw===needle || val===q)return 0;
    if(val.startsWith(q))return 10 + (val.length-q.length);
    if(val.includes(q))return 20 + val.indexOf(q) + Math.max(0,val.length-q.length)*0.01;
    return Infinity;
  };

  const candidates=[];
  for (const [table, fields] of configs) {
    let rows=[];
    try {
      const query={select:'*',limit:10000,order:'created_at.desc'};
      // Keep global search inside the logged-in company. Without this filter,
      // an edit-order lookup can scan/display records from other companies.
      if(companyId) query.company_id=`eq.${companyId}`;
      rows=await dbSelect(table,query);
    } catch (_) { continue; }
    for (const row of (Array.isArray(rows)?rows:[])) {
      let best=Infinity, matchedField=null;
      for(const field of fields){const sc=scoreValue(row[field]);if(sc<best){best=sc;matchedField=field;}}
      if(!matchedField || !Number.isFinite(best))continue;
      candidates.push({table,row,score:best,matchedField});
    }
  }
  candidates.sort((a,b)=>a.score-b.score || String(b.row?.created_at||'').localeCompare(String(a.row?.created_at||'')));

  const results=[]; const seen=new Set();
  // Edit Order needs one best match, not a global result list.
  const candidateLimit=options.single ? 1 : 120;
  for(const c of candidates.slice(0,candidateLimit)){
    const {table,row,matchedField,score}=c;
    let item=null;
    if(table==='shipments' && row.order_id){
      const details=await getOrderDetails(row.order_id); if(!details?.order)continue;
      const audit=await getOrderAuditTrail(details.order.id,details.shipment?.id||row.id);
      item={...row,order:details.order,shipment:details.shipment||row,merchant:details.merchant||null,history:details.history||[],audit,matched_field:matchedField,match_score:score};
    }else if(table==='orders' && row.id){
      const details=await getOrderDetails(row.id); if(!details?.order)continue;
      const audit=await getOrderAuditTrail(details.order.id,details.shipment?.id);
      item={...(details||{}),audit,matched_field:matchedField,match_score:score};
    }else if(table==='customers'){
      item={...row,matched_field:matchedField,match_score:score};
    }
    if(!item)continue;
    const orderId=item.order?.id || (table==='orders'?item.id:null) || item.order_id || null;
    const key=orderId?`order:${orderId}`:`${table}:${item.id||JSON.stringify(item)}`;
    if(seen.has(key))continue;
    seen.add(key); results.push(item);
    if(results.length>=50)break;
  }
  if(!results.length)return {type:'none',data:null,results:[]};
  // Attach the generated accounting settlement number(s) and Return to Origin operation number(s)
  // to every matching order so both search entry points show the same references.
  if(results.length){
    const orderIds=[...new Set(results.map(item=>String(item.order?.id||item.order_id||item.id||'')).filter(Boolean))];
    const [settlementItems,returnRows]=await Promise.all([
      dbSelect('shipper_settlement_items',{select:'order_id,settlement_id,company_id',...(companyId?{company_id:`eq.${companyId}`}:{ }),limit:50000}).catch(()=>[]),
      dbSelect('return_transactions',{select:'id,order_id,return_operation_id,return_operation_no,return_status,original_status,created_at',...(companyId?{company_id:`eq.${companyId}`}:{ }),order:'created_at.desc',limit:50000}).catch(()=>[])
    ]);
    const relevantItems=(settlementItems||[]).filter(r=>orderIds.includes(String(r.order_id||'')));
    const settlementIds=[...new Set(relevantItems.map(r=>String(r.settlement_id||'')).filter(Boolean))];
    const settlementRecords=settlementIds.length?await dbSelect('shipper_settlement_records',{select:'id,transaction_number,merchant_id,settlement_date',...(companyId?{company_id:`eq.${companyId}`}:{ }),limit:50000}).catch(()=>[]):[];
    const settlementMap=new Map((settlementRecords||[]).map(r=>[String(r.id),r]));
    const operations=await dbSelect('return_operations',{select:'id,operation_no,created_at',...(companyId?{company_id:`eq.${companyId}`}:{ }),limit:50000}).catch(()=>[]);
    const operationMap=new Map((operations||[]).map(r=>[String(r.id),r]));
    for(const item of results){
      const oid=String(item.order?.id||item.order_id||item.id||'');
      const refs=relevantItems.filter(r=>String(r.order_id)===oid).map(r=>settlementMap.get(String(r.settlement_id||''))).filter(Boolean);
      item.account_transaction_numbers=[...new Set(refs.map(r=>r.transaction_number).filter(Boolean))];
      item.account_transaction_number=item.account_transaction_numbers[0]||null;
      const rtRows=(returnRows||[]).filter(r=>String(r.order_id)===oid);
      item.return_operation_numbers=[...new Set(rtRows.map(r=>r.return_operation_no||operationMap.get(String(r.return_operation_id||''))?.operation_no).filter(Boolean))];
      item.return_operation_number=item.return_operation_numbers[0]||null;
      item.return_transaction=rtRows[0]||null;
    }
    // Attach lightweight proof references to search results so users can preview
    // existing accounting and return receipts directly from either search UI.
    const relevantReturnIds=[...new Set(results.map(item=>String(item.return_transaction?.id||'')).filter(Boolean))];
    const relevantSettlementIds=[...new Set(relevantItems.map(r=>String(r.settlement_id||'')).filter(Boolean))];
    const [returnProofRows,accountProofRows]=await Promise.all([
      relevantReturnIds.length?dbSelect('return_transaction_attachments',{select:'id,return_transaction_id,file_name,content_type,uploaded_at',...(companyId?{company_id:`eq.${companyId}`}:{ }),limit:20000}).catch(()=>[]):Promise.resolve([]),
      relevantSettlementIds.length?dbSelect('settlement_proofs',{select:'id,settlement_id,file_name,content_type,uploaded_at',...(companyId?{company_id:`eq.${companyId}`}:{ }),limit:20000}).catch(()=>[]):Promise.resolve([])
    ]);
    const returnProofById=new Map();
    for(const proof of (returnProofRows||[])){
      const k=String(proof.return_transaction_id||'');
      if(k&&!returnProofById.has(k))returnProofById.set(k,proof);
    }
    const accountProofById=new Map();
    for(const proof of (accountProofRows||[])){
      const k=String(proof.settlement_id||'');
      if(k&&!accountProofById.has(k))accountProofById.set(k,proof);
    }
    for(const item of results){
      const oid=String(item.order?.id||item.order_id||item.id||'');
      const returnId=String(item.return_transaction?.id||'');
      const rproof=returnProofById.get(returnId)||null;
      const settlementIdsForOrder=[...new Set(relevantItems.filter(r=>String(r.order_id)===oid).map(r=>String(r.settlement_id||'')).filter(Boolean))];
      const aproofs=settlementIdsForOrder.map(id=>accountProofById.get(id)).filter(Boolean);
      item.search_proofs={
        accounting:[...new Map(aproofs.map(p=>[String(p.id),p])).values()].map(p=>({id:p.id,file_name:p.file_name,content_type:p.content_type,uploaded_at:p.uploaded_at})),
        return:rproof?{id:rproof.id,return_transaction_id:rproof.return_transaction_id,file_name:rproof.file_name,content_type:rproof.content_type,uploaded_at:rproof.uploaded_at}:null
      };
    }
  }

  // For a single tracking/order match, preserve the invoice/original status separately
  // from the latest shipment status (e.g. Return to Origin while invoice status is Replaced).
  if(results.length===1){
    const item=results[0];
    const orderId=item.order?.id || item.order_id || item.id;
    if(orderId){
      const returns=await dbSelect('return_transactions',{select:'id,order_id,original_status,return_status,created_at',order_id:`eq.${orderId}`,...(companyId?{company_id:`eq.${companyId}`}:{ }),order:'created_at.desc',limit:1}).catch(()=>[]);
      item.return_transaction=Array.isArray(returns)?returns[0]||null:null;
      item.invoice_status=cleanString(item.return_transaction?.original_status || item.order?.invoice_status || item.order?.original_status || item.order?.status || '');
    }
  }
  // Enrich search results with the assigned driver and Scan Driver record.
  // Scan records are matched against coupon/order/tracking identifiers, not just the order UUID.
  if(results.length){
    const [drivers,scanRows,jobs,jobLinks]=await Promise.all([
      dbSelect('drivers',{select:'id,name,driver_no',...(companyId?{company_id:`eq.${companyId}`}:{ }),limit:5000}).catch(()=>[]),
      dbSelect('scan_driver_records',{select:'id,driver_id,order_number,scan_date,scanned_at,employee_name',...(companyId?{company_id:`eq.${companyId}`}:{ }),order:'created_at.desc',limit:10000}).catch(()=>[]),
      dbSelect('delivery_jobs',{select:'id,driver_id,job_date,created_at',...(companyId?{company_id:`eq.${companyId}`}:{ }),order:'job_date.desc',limit:10000}).catch(()=>[]),
      dbSelect('delivery_job_shipments',{select:'shipment_id,delivery_job_id',limit:20000}).catch(()=>[])
    ]);
    const driverMap=new Map((drivers||[]).map(v=>[String(v.id),v]));
    const jobMap=new Map((jobs||[]).map(v=>[String(v.id),v]));
    const assignedDriverByShipment=new Map();
    for(const link of (jobLinks||[])){
      const job=jobMap.get(String(link.delivery_job_id));
      if(job&&link.shipment_id&&!assignedDriverByShipment.has(String(link.shipment_id)))assignedDriverByShipment.set(String(link.shipment_id),job.driver_id);
    }
    const normalizeCode=v=>String(v??'').trim().toLowerCase().replace(/[^a-z0-9\\u0600-\\u06ff]/gi,'');
    const scansByCode=new Map();
    for(const sr of (scanRows||[])){
      const key=normalizeCode(sr.order_number);
      if(key&&!scansByCode.has(key))scansByCode.set(key,sr);
    }
    for(const item of results){
      const order=item.order||item;
      const shipment=item.shipment||item;
      const driverId=shipment.driver_id||item.driver_id||order.scan_driver_id||assignedDriverByShipment.get(String(shipment.id||item.shipment_id||''))||'';
      item.driver=driverMap.get(String(driverId))||item.driver||null;
      item.driver_name=item.driver?.name||'';
      const codes=[shipment.tracking_number,shipment.shipment_no,shipment.coupon_number,shipment.coupon_no,shipment.coupon_code,shipment.waybill_number,order.tracking_number,order.merchant_order_no,order.order_code,order.coupon_number,order.coupon_no,order.coupon_code,order.waybill_number,order.reference_number,order.reference_no,order.reference].map(normalizeCode).filter(Boolean);
      let scan=null;
      for(const code of codes){if(scansByCode.has(code)){scan=scansByCode.get(code);break;}}
      if(scan){
        const scanDriver=driverMap.get(String(scan.driver_id));
        item.scan={driver_name:scanDriver?.name||'—',employee_name:scan.employee_name||'—',scan_date:scan.scan_date||String(scan.scanned_at||'').slice(0,10)||'—',order_number:scan.order_number||''};
      }else item.scan=null;
    }
  }
  return {type:results.length===1?(results[0].order?'order':'result'):'multiple',data:results.length===1?results[0]:null,results};
}

async function nextEmployeeCode(companyId) {
  const users=await dbSelect('users',{select:'employee_code',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);
  let max=0;
  for(const u of users||[]){const m=String(u.employee_code||'').match(/(\d+)$/);if(m)max=Math.max(max,Number(m[1]));}
  return `EMP${String(max+1).padStart(6,'0')}`;
}

async function ensureEmployeeCode(userRow, companyId) {
  let code = cleanString(userRow?.employee_code);
  if (code) return code;
  try {
    const users = await dbSelect('users',{select:'employee_code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
    let max=0;
    for(const u of users){ const m=String(u.employee_code||'').match(/(\d+)$/); if(m) max=Math.max(max,Number(m[1])); }
    code=`EMP${String(max+1).padStart(6,'0')}`;
    if(userRow?.id) await dbUpdate('users',{id:`eq.${userRow.id}`,company_id:`eq.${companyId}`},{employee_code:code},{prefer:'return=minimal'}).catch(()=>{});
  } catch(_) {}
  return code;
}

async function syncDriverUsers(companyId) {
  try {
    const [users, roles, userRoles, drivers] = await Promise.all([
      dbSelect('users',{select:'id,name,employee_code,active,company_id',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
      dbSelect('roles',{select:'id,name,company_id',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
      dbSelect('user_roles',{select:'user_id,role_id',limit:10000}).catch(()=>[]),
      dbSelect('drivers',{select:'id,name,driver_no,company_id,active,user_id',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[])
    ]);
    const driverRoleIds=new Set((roles||[]).filter(r=>String(r.name||'').trim().toLowerCase()==='driver').map(r=>String(r.id)));
    const driverUserIds=new Set((userRoles||[]).filter(ur=>driverRoleIds.has(String(ur.role_id))).map(ur=>String(ur.user_id)));
    const existingByCode=new Map((drivers||[]).filter(d=>d.driver_no).map(d=>[String(d.driver_no),d]));
    const existingByName=new Map((drivers||[]).filter(d=>d.name).map(d=>[String(d.name).trim().toLowerCase(),d]));
    for(const u of users||[]) {
      if(!driverUserIds.has(String(u.id))) continue;
      const code=await ensureEmployeeCode(u,companyId);
      let d=existingByCode.get(String(code)) || existingByName.get(String(u.name||'').trim().toLowerCase());
      if(d) {
        const patch={name:u.name||d.name,active:u.active!==false,driver_no:d.driver_no||code,user_id:u.id};
        try { await dbUpdate('drivers',{id:`eq.${d.id}`,company_id:`eq.${companyId}`},patch,{prefer:'return=minimal'}); } catch(_) {}
      } else {
        try {
          const created=firstRow(await dbInsert('drivers',{company_id:companyId,name:u.name||code,driver_no:code,active:u.active!==false,user_id:u.id}));
          if(created){ existingByCode.set(String(created.driver_no||code),created); existingByName.set(String(created.name||u.name||'').trim().toLowerCase(),created); }
        } catch(e) { console.warn('DRIVER SYNC WARNING:',e.message); }
      }
    }
  } catch(e) { console.warn('DRIVER USER SYNC WARNING:',e.message); }
}

async function enrichOrderCreatorNames(rows, companyId) {
  const data = Array.isArray(rows) ? rows : [];
  if (!data.length) return data;
  const ids = [...new Set(data.map(o => String(o?.created_by || o?.created_by_user_id || '')).filter(id => id && id !== 'null' && id !== 'undefined'))];
  if (!ids.length) return data.map(o => ({ ...o, created_by_name: o.created_by_name || '' }));
  const users = await dbSelect('users', { select: 'id,name,username,employee_code', company_id: `eq.${companyId}`, id: `in.(${ids.join(',')})`, limit: Math.max(1000, ids.length) }).catch(() => []);
  const byId = new Map((users || []).map(u => [String(u.id), u]));
  return data.map(o => {
    const creator = byId.get(String(o?.created_by || o?.created_by_user_id || '')) || {};
    return { ...o, created_by_name: o.created_by_name || creator.name || creator.username || creator.employee_code || '' };
  });
}

async function getRows(table, user, order = 'created_at.desc', limit = 500) {
  const companyId = await resolveCompanyId(user);
  const rows = await dbSelect(table, { select: '*', company_id: `eq.${companyId}`, order, limit });
  return table === 'orders' ? enrichOrderCreatorNames(rows, companyId) : rows;
}


// ===== CENTRAL BUSINESS RULES =====
// Canonicalize legacy spelling/case/underscore variants before any business logic.
function canonicalOrderStatus(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const aliases = {
    'receive at hub': 'Receive at Hub',
    'in ops': 'In Ops',
    'assigned with driver': 'Assigned with Driver',
    'delivered': 'Delivered',
    'half delivered': 'Half Delivered',
    'replaced': 'Replaced',
    'refund delivery': 'Refund Delivery', 'refund_delivery': 'Refund Delivery',
    'cancelled': 'Cancelled', 'canceled': 'Cancelled',
    'cancelled by shipper': 'Cancelled by Shipper', 'canceled by shipper': 'Cancelled by Shipper',
    'cancelled by receiver': 'Cancelled by Receiver', 'canceled by receiver': 'Cancelled by Receiver',
    'return by driver': 'Return by Driver', 'return by driver ': 'Return by Driver', 'return_by_driver': 'Return by Driver',
    'return to origin': 'Return to Origin', 'return_to_origin': 'Return to Origin', 'return completed': 'Return Completed', 'return_completed': 'Return Completed',
    'future delivery': 'Future Delivery', 'location change': 'Location Change',
    'schedule for tomorrow': 'Schedule for Tomorrow',
    'to be pickedup': 'To be pickedup', 'to be picked up': 'To be pickedup', 'to_be_pickedup': 'To be pickedup', 'to_be_picked_up': 'To be pickedup'
  };
  return aliases[key] || raw;
}

const ORDER_STATUS_RULES = Object.freeze({
  'Receive at Hub': { from: null },
  'In Ops': { from: ['Receive at Hub','Assigned with Driver','Future Delivery','Location Change','Schedule for Tomorrow','Return by Driver','Delivered','Half Delivered','Replaced','Cancelled','Cancelled by Shipper','Cancelled by Receiver'] },
  'Assigned with Driver': { from: ['Receive at Hub','In Ops','To be pickedup','Future Delivery','Location Change','Schedule for Tomorrow','Return by Driver','Delivered','Half Delivered','Replaced','Cancelled','Cancelled by Shipper','Cancelled by Receiver'] },
  'Delivered': { from: ['Assigned with Driver','In Ops','Cancelled','Cancelled by Shipper','Cancelled by Receiver','Replaced','Half Delivered','Return by Driver','Future Delivery','Location Change','Schedule for Tomorrow'] },
  'Half Delivered': { from: ['Assigned with Driver','In Ops','Cancelled','Cancelled by Shipper','Cancelled by Receiver','Replaced','Delivered','Return by Driver','Future Delivery','Location Change','Schedule for Tomorrow'] },
  'Replaced': { from: ['Assigned with Driver','In Ops','Delivered','Half Delivered','Cancelled','Cancelled by Shipper','Cancelled by Receiver','Refund Delivery'] },
  'Refund Delivery': { from: ['Assigned with Driver','In Ops','Delivered','Half Delivered','Replaced','Cancelled','Cancelled by Shipper','Cancelled by Receiver','Return by Driver'] },
  'Cancelled': { from: ['Receive at Hub','In Ops','Assigned with Driver','Future Delivery','Location Change','Delivered','Half Delivered','Replaced'] },
  'Cancelled by Shipper': { from: ['Receive at Hub','In Ops','Assigned with Driver','Future Delivery','Location Change','Delivered','Half Delivered','Replaced'] },
  'Cancelled by Receiver': { from: ['Assigned with Driver','In Ops','Future Delivery','Location Change','Delivered','Half Delivered','Replaced'] },
  'Return by Driver': { from: ['Assigned with Driver','In Ops','Future Delivery','Location Change','Schedule for Tomorrow','Delivered','Half Delivered','Replaced','Cancelled','Cancelled by Shipper','Cancelled by Receiver'] },
  'Future Delivery': { from: ['Assigned with Driver','In Ops'] },
  'Location Change': { from: ['Assigned with Driver','In Ops','Future Delivery'] },
  'Schedule for Tomorrow': { from: ['Assigned with Driver','In Ops'] },
  'Return to Origin': { from: ['Cancelled','Cancelled by Shipper','Cancelled by Receiver','Half Delivered','Replaced'] },
  'Return Completed': { from: ['Return to Origin'] },
  'To be pickedup': { from: ['Receive at Hub','In Ops'] }
});

async function createSystemNotification(user, { userId=null, title, message, type='system', entityType=null, entityId=null, data=null } = {}) {
  try {
    const companyId = user?.company_id || await resolveCompanyId(user);
    const row = {
      company_id: companyId,
      user_id: isLikelyUuid(userId) ? userId : null,
      title: cleanString(title) || 'Notification',
      message: cleanString(message) || '',
      type: cleanString(type) || 'system',
      entity_type: entityType || null,
      entity_id: isLikelyUuid(entityId) ? entityId : null,
      data: data || (entityId && !isLikelyUuid(entityId) ? { entity_id_label: String(entityId).slice(0, 180) } : null),
      read_at: null,
      created_at: new Date().toISOString()
    };
    let saved = null;
    try { saved = firstRow(await dbInsert('notifications', row, {prefer:'return=representation'})); }
    catch (_) {
      try { saved = firstRow(await dbInsert('notifications', {company_id:companyId,user_id:userId||null,title:row.title,message:row.message,type:row.type,read_at:null,created_at:row.created_at}, {prefer:'return=representation'})); } catch(__) {}
    }
    return saved;
  } catch (_) { return null; }
}

async function transitionOrderCentral(user, order, shipment, requestedStatus, extraPatch={}) {
  const status = canonicalOrderStatus(requestedStatus);
  const current = canonicalOrderStatus(order?.status);
  if (!status) throw new Error('الحالة مطلوبة');
  // Business rule requested for Trend Delivery: any unpaid order can move from
  // any operational status to any other operational status. Do not apply a
  // source-status transition matrix here; it incorrectly blocked valid fixes
  // such as Return by Driver -> Replaced.
  if (paidLockValues(order, shipment)) {
    throw new Error('الأوردر Paid ومغلق ولا يمكن تغيير حالته');
  }
  // Paid orders remain locked; all other status transitions are permitted.
  // The deployed orders table does not have updated_at. Do not send it in
  // order PATCH requests; status history/audit records track the transition.
  const now = new Date().toISOString();
  const patch = { status, ...extraPatch };
  const companyId = order.company_id || await resolveCompanyId(user);
  const updatedOrder = firstRow(await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},patch));
  if (!updatedOrder) throw new Error('لم يتم حفظ الحالة في الأوردر. تحقق من صلاحيات قاعدة البيانات ثم أعد المحاولة.');
  if (shipment?.id) {
    // Some deployed schemas do not expose shipments.updated_at. Retry without
    // that optional field so a missing timestamp column cannot silently block status changes.
    let updatedShipment = null;
    try { updatedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status, updated_at: now})); }
    catch (_) { updatedShipment = null; }
    if (!updatedShipment) updatedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status}));
    if (!updatedShipment) {
      try { await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:order.status, ...Object.fromEntries(Object.keys(extraPatch||{}).map(key => [key, order[key] ?? null]))}); } catch (_) {}
      throw new Error('تم تحديث الأوردر لكن لم يتم تحديث حالة الشحنة؛ أُعيدت بيانات الأوردر السابقة قدر الإمكان.');
    }
    // History insertion and read-back verification are independent; overlap them to reduce status-change latency.
    const [historyResult, verification] = await Promise.all([
      dbInsert('shipment_status_history',{shipment_id:shipment.id,status,user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}).catch(() => null),
      Promise.all([
        dbSelect('orders',{select:'id,status',id:`eq.${order.id}`,company_id:`eq.${companyId}`,limit:1}).then(firstRow),
        dbSelect('shipments',{select:'id,status',id:`eq.${shipment.id}`,company_id:`eq.${companyId}`,limit:1}).then(firstRow)
      ])
    ]);
    void historyResult;
    var checkOrder = verification[0];
    var checkShipment = verification[1];
    if (!checkOrder || canonicalOrderStatus(checkOrder.status) !== status || (shipment?.id && (!checkShipment || canonicalOrderStatus(checkShipment.status) !== status))) throw new Error('لم يتم تأكيد تطابق حالة الأوردر والشحنة بعد الحفظ.');
  } else {
    var checkOrder = firstRow(await dbSelect('orders',{select:'id,status',id:`eq.${order.id}`,company_id:`eq.${companyId}`,limit:1}));
    if (!checkOrder || canonicalOrderStatus(checkOrder.status) !== status) throw new Error('لم يتم تأكيد حفظ حالة الأوردر بعد التحديث.');
  }
  // Audit and notification writes do not depend on one another.
  await Promise.all([
    audit(user,'central_status_transition','order',order.id,{from:current,to:status,shipment_id:shipment?.id||null}),
    createSystemNotification(user,{userId: null,title:'Order status changed',message:`${order.merchant_order_no || order.order_code || order.id}: ${current || '—'} → ${status}`,type:'order_status',entityType:'order',entityId:order.id,data:{from:current,to:status}})
  ]);
  return updatedOrder || {...order,...patch};
}

const SYSTEM_STATUSES = [
  'Receive at Hub','In Ops','Assigned with Driver','Delivered','Half Delivered','Replaced','Refund Delivery',
  'Cancelled','Cancelled by Shipper','Cancelled by Receiver','Return by Driver','Return to Origin',
  'Future Delivery','Location Change','Schedule for Tomorrow','Return Completed','To be pickedup'
];
const ACCOUNTING_STATUSES = new Set(['Delivered','Half Delivered','Cancelled by Receiver','Cancelled by Shipper','Replaced']);
const RETURN_STATUSES = new Set(['Cancelled','Cancelled by Shipper','Cancelled by Receiver','Half Delivered','Replaced']);
const RETURN_BY_DRIVER_STATUS = 'Return by Driver';
function canonicalReturnStatus(value) {
  const key = String(value || '').trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
  const map = {
    'cancelled': 'Cancelled',
    'cancelled by shipper': 'Cancelled by Shipper',
    'cancelled by receiver': 'Cancelled by Receiver',
    'replaced': 'Replaced',
    'half delivered': 'Half Delivered'
  };
  return map[key] || String(value || '').trim();
}
async function ensureShipperDeliveryFeeDebit(user, order, shipment){
  // Cancelled by Shipper: customer refused and did not pay delivery.
  // The delivery fee is therefore charged to the merchant as a negative
  // merchant adjustment. Keep it idempotent by using the order reference.
  const fee=cleanNumber(order?.service_charges ?? order?.delivery_fee ?? 0);
  if(!order?.merchant_id || fee<=0) return null;
  const companyId=await resolveCompanyId(user);
  const reference=`ORDER:${order.id}:CANCELLED_BY_SHIPPER_DELIVERY_FEE`;
  const existing=firstRow(await dbSelect('merchant_adjustments',{select:'*',company_id:`eq.${companyId}`,merchant_id:`eq.${order.merchant_id}`,reference:`eq.${reference}`,limit:1}).catch(()=>[]));
  if(existing) return existing;
  const row={company_id:companyId,merchant_id:order.merchant_id,type:'debit',amount:fee,signed_amount:-fee,reason:'Cancelled by Shipper — delivery fee charged to merchant',reference,adjustment_date:new Date().toISOString(),employee_id:user.id==='env-admin'?null:user.id};
  const data=firstRow(await dbInsert('merchant_adjustments',row,{prefer:'return=representation'}));
  await audit(user,'auto_shipper_delivery_fee_debit','merchant_adjustment',data?.id||null,{order_id:order.id,shipment_id:shipment?.id||null,merchant_id:order.merchant_id,amount:fee,reference});
  return data;
}
async function nextReturnTransactionNumber(companyId, day=egyptTodayISO().replace(/-/g,'')){
  const value=await dbRpc('next_return_transaction_number',{p_company_id:companyId,p_day:day}).catch(error=>{
    console.error('RETURN TRANSACTION COUNTER ERROR:',error?.message||error);
    throw new Error('تعذر توليد رقم معاملة المرتجع بأمان. يلزم تطبيق migration الخاصة بأرقام المرتجعات.');
  });
  const number=String(value||'');
  if(!/^RTN-\d{8}-\d{4,}$/.test(number)) throw new Error('رقم معاملة المرتجع الناتج غير صالح.');
  return number;
}
async function ensureReturnTransactionNumber(user, row){
  if(!row?.id || String(row.return_transaction_no||'').trim()) return row;
  const companyId=await resolveCompanyId(user);
  const number=await nextReturnTransactionNumber(companyId);
  const updated=firstRow(await dbUpdate('return_transactions',{id:`eq.${row.id}`,company_id:`eq.${companyId}`},{return_transaction_no:number,updated_at:new Date().toISOString()},{prefer:'return=representation'}));
  if(!updated) throw new Error('تعذر حفظ رقم معاملة المرتجع.');
  return updated;
}
async function ensureReturnTransaction(user, order, shipment, status){
  const canonicalStatus = canonicalReturnStatus(status); if(!order?.id || !shipment?.id || !RETURN_STATUSES.has(canonicalStatus)) return null;
  const companyId=await resolveCompanyId(user);
  let row=firstRow(await dbSelect('return_transactions',{select:'*',order_id:`eq.${order.id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
  if(row) return await ensureReturnTransactionNumber(user,row);
  const returnTransactionNo=await nextReturnTransactionNumber(companyId);
  row=firstRow(await dbInsert('return_transactions',{
    company_id:companyId,
    order_id:order.id,
    shipment_id:shipment.id,
    merchant_id:order.merchant_id||null,
    return_transaction_no:returnTransactionNo,
    original_status:canonicalStatus,
    return_status:canonicalStatus,
    return_date:egyptTodayISO(),
    created_by:user.id==='env-admin'?null:user.id
  },{prefer:'return=representation'}));
  await audit(user,'create_return_transaction','return_transaction',row?.id||null,{order_id:order.id,shipment_id:shipment.id,status});
  return row;
}
async function getReturnTransactions(user, completedOnly=null, from='', to=''){
  const companyId=await resolveCompanyId(user);
  const rows=await dbSelect('return_transactions',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:20000});
  const orders=await dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
  const shipments=await dbSelect('shipments',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
  const merchants=await dbSelect('merchants',{select:'id,name',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
  const drivers=await dbSelect('drivers',{select:'id,name,driver_no',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
  const users=await dbSelect('users',{select:'id,name,username,employee_code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
  const settlementItems=await dbSelect('shipper_settlement_items',{select:'order_id,settlement_id,company_id',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]);
  const settlementIds=[...new Set(settlementItems.map(x=>String(x.settlement_id||'')).filter(Boolean))];
  const settlementRecords=settlementIds.length?await dbSelect('shipper_settlement_records',{select:'id,transaction_number',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]):[];
  const settlementMap=new Map(settlementRecords.map(x=>[String(x.id),x]));
  // Environment-admin sessions do not have a users-table UUID. Preserve their
  // identity in the audit detail so the archive can still show who completed
  // a return without proof.
  const completionAuditRows = rows.some(r => Boolean(r.completed_without_proof) && !r.completed_by)
    ? await dbSelect('audit_logs',{select:'entity_id,details,created_at',company_id:`eq.${companyId}`,action:'eq.return_completed_without_proof',order:'created_at.desc',limit:20000}).catch(()=>[])
    : [];
  const completedActorByReturn = new Map();
  for (const entry of completionAuditRows) {
    const actorName = entry?.details?.actor_name || entry?.details?.completed_by_name || '';
    const key = String(entry?.entity_id || '');
    if (key && actorName && !completedActorByReturn.has(key)) completedActorByReturn.set(key, String(actorName));
  }
  const transactionNoByOrder=new Map();
  for(const si of settlementItems){const no=settlementMap.get(String(si.settlement_id||''))?.transaction_number;const key=String(si.order_id||'');if(key&&no&&!transactionNoByOrder.has(key))transactionNoByOrder.set(key,no);}
  const um=new Map(users.map(x=>[String(x.id),x])),om=new Map(orders.map(x=>[String(x.id),x])),sm=new Map(shipments.map(x=>[String(x.id),x])),mm=new Map(merchants.map(x=>[String(x.id),x])),dm=new Map(drivers.map(x=>[String(x.id),x]));
  const out=[];
  for(const r of rows){
    const o=om.get(String(r.order_id))||{}, sh=sm.get(String(r.shipment_id))||{}, m=mm.get(String(r.merchant_id||o.merchant_id))||{};
    const attachments=await dbSelect('return_transaction_attachments',{select:'id,file_name,content_type,uploaded_at,storage_path',return_transaction_id:`eq.${r.id}`,company_id:`eq.${companyId}`,order:'uploaded_at.desc',limit:100}).catch(()=>[]);
    const date=String(r.return_date||r.created_at||'').slice(0,10);
    if(from && date<from) continue; if(to && date>to) continue;
    const completed=canonicalReturnStatus(r.return_status)==='Return Completed';
    const linkedStatuses=[r.return_status,o.status,sh.status].map(canonicalReturnStatus);
    // The active Shipper Returns page must never show orders already moved to Return to Origin,
    // even when an older return_transactions row still contains a stale status.
    if(completedOnly===true && !completed) continue;
    if(completedOnly==='archive' && !linkedStatuses.some(st=>st==='Return to Origin'||st==='Return Completed')) continue;
    if(completedOnly===false && (completed || linkedStatuses.includes('Return to Origin'))) continue;
    // Archive display follows the linked order/shipment state so stale legacy
    // return_transactions rows cannot show the wrong status after a transition.
    const effectiveReturnStatus = linkedStatuses.includes('Return Completed') ? 'Return Completed' : (linkedStatuses.includes('Return to Origin') ? 'Return to Origin' : r.return_status);
    const driver=dm.get(String(r.driver_id||sh.driver_id||''))||{};
    let operation=null;
    if(r.return_operation_id){operation=firstRow(await dbSelect('return_operations',{select:'*',id:`eq.${r.return_operation_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]))||null;}
    out.push({
      ...r,
      ...(completedOnly==='archive' ? {return_status:effectiveReturnStatus} : {}),
      completed_without_proof:Boolean(r.completed_without_proof && effectiveReturnStatus==='Return Completed'),
      tracking_number:sh.tracking_number||o.tracking_number||'',
      shipment_no:sh.shipment_no||sh.shipment_number||'',
      generation_operation_no:transactionNoByOrder.get(String(o.id||''))||null,
      order_number:o.merchant_order_no||o.order_number||'',
      order_status:o.status||'',
      shipment_status:sh.status||'',
      merchant_id:o.merchant_id||r.merchant_id||null,
      shipper_id:o.merchant_id||r.merchant_id||null,
      shipper_name:m.name||o.merchant_name||o.shipper_name||'',
      shipper_code:m.merchant_no||m.code||m.external_code||'',
      customer_name:o.customer_name||'',
      customer_phone:o.customer_phone||o.phone||'',
      created_by:o.created_by||null,
      created_by_name:o.created_by_name||((um.get(String(o.created_by||o.created_by_user_id||''))||{}).name)||((um.get(String(o.created_by||o.created_by_user_id||''))||{}).username)||((um.get(String(o.created_by||o.created_by_user_id||''))||{}).employee_code)||'',
      completed_by_name:(um.get(String(r.completed_by||''))||{}).name||(um.get(String(r.completed_by||''))||{}).username||(um.get(String(r.completed_by||''))||{}).employee_code||completedActorByReturn.get(String(r.id))||'',
      cod:o.value ?? o.cod ?? 0,
      original_status:r.original_status||((r.return_status!=='Return Completed')?r.return_status:''),
      driver_name:driver.name||'',
      driver_no:driver.driver_no||'',
      attachment_count:attachments.length,
      attachments,
      proof_id:attachments[0]?.id||null,
      return_operation_id:r.return_operation_id||null,
      return_operation_no:r.return_operation_no||operation?.operation_no||null,
      operation:operation?{...operation,driver_name:driver.name||'',driver_no:driver.driver_no||''}:null
    });
  }
  return out;
}

const DRIVER_ACTION_LABELS = {
  return_by_driver:'Return by Driver',
  location_change:'Location Change',
  future_delivery:'Future Delivery',
  schedule_for_tomorrow:'Schedule for Tomorrow',
  cancelled:'Cancelled'
};
function effectiveOrderStatus(order, shipment=null){
  // The shipment/order status is the live operational state. A historical driver
  // action (e.g. Location Change) must not mask a later status update.
  const shipmentStatus=String(shipment?.status||'').trim();
  if(shipmentStatus) return shipmentStatus;
  const orderStatus=String(order?.status||'').trim();
  if(orderStatus) return orderStatus;
  const action=String(order?.driver_statement_action||'').toLowerCase();
  return DRIVER_ACTION_LABELS[action] || '';
}

const ORDERS_VERIFICATION_ALLOWED_STATUSES = new Set(['delivered','half delivered','cancelled by shipper','cancelled by receiver','replaced']);
const COMMISSION_ELIGIBLE_STATUSES = new Set([
  'delivered', 'half delivered', 'cancelled by shipper', 'cancelled by receiver', 'replaced',
  'half_delivered', 'cancelled_by_shipper', 'cancelled_by_receiver'
]);
function commissionStatusKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
  // Normalize common historical spelling/label variants to one accounting key.
  if (key === 'replace') return 'replaced';
  if (key === 'deliverd') return 'delivered';
  if (key === 'half deliverd') return 'half delivered';
  return key;
}
function isCommissionEligibleStatus(value) {
  return COMMISSION_ELIGIBLE_STATUSES.has(commissionStatusKey(value));
}

const DRIVER_ACTIONS = new Set([
  'return_by_driver','future_delivery','location_change','schedule_for_tomorrow','cancelled'
]);
const DRIVER_STATUS_MAP = {
  'Return by Driver': { status: 'Return by Driver', action: 'return_by_driver' },
  'In Ops': { status: 'In Ops', action: null },
  'Delivered': { status: 'Delivered', action: null },
  'Half Delivered': { status: 'Half Delivered', action: null },
  'Cancelled by Shipper': { status: 'Cancelled by Shipper', action: null },
  'Cancelled by Receiver': { status: 'Cancelled by Receiver', action: null },
  'Replaced': { status: 'Replaced', action: null },
  'Cancel': { status: 'Cancelled', action: 'cancelled' },
  'Future Delivery': { status: 'Future Delivery', action: 'future_delivery' },
  'Location Change': { status: 'Location Change', action: 'location_change' },
  'Schedule for Tomorrow': { status: 'Schedule for Tomorrow', action: 'schedule_for_tomorrow' },
  'To be pickedup': { status: 'To be pickedup', action: null }
};

async function getLatestOrderAssignment(companyId, orderId) {
  const shipment = firstRow(await dbSelect('shipments', {
    select: '*', order_id: `eq.${orderId}`, company_id: `eq.${companyId}`, limit: 1
  }).catch(() => []));
  let job = null;
  if (shipment?.id) {
    const links = await dbSelect('delivery_job_shipments', {
      select: 'delivery_job_id', shipment_id: `eq.${shipment.id}`, limit: 100
    }).catch(() => []);
    const jobIds = links.map(x => x.delivery_job_id).filter(Boolean);
    if (jobIds.length) {
      const jobs = await dbSelect('delivery_jobs', {
        select: '*', id: `in.(${jobIds.join(',')})`, company_id: `eq.${companyId}`,
        order: 'created_at.desc', limit: 100
      }).catch(() => []);
      job = jobs[0] || null;
    }
  }
  return { shipment, job };
}
// Read the order's actual monetary value for display. This is intentionally
// separate from driverAccountingAmount: a refused order can show its real COD
// in the table while still contributing zero driver cash under the existing rule.
function driverOrderValue(order) {
  const amountCandidates = [order?.cod, order?.value, order?.order_value, order?.order_price, order?.price, order?.amount].map(cleanNumber);
  return amountCandidates.find(v => v > 0) ?? amountCandidates.find(v => v === 0) ?? 0;
}

// Single source of truth for the driver's amount due per order. When an order's
// current status was changed by the return workflow, use its preserved original
// status to retain the financial treatment of one of the five approved statuses.
// Delivered, Half Delivered and Replaced count the full order value;
// Cancelled by Receiver counts delivery fee only; Cancelled by Shipper
// contributes no collection amount (its commission eligibility is separate).
function driverAccountingAmount(order) {
  const currentStatus = commissionStatusKey(order?.status);
  const originalStatus = commissionStatusKey(order?.original_status || order?.invoice_status || order?.base_status);
  const eligibleStatuses = new Set(['delivered', 'half delivered', 'cancelled by shipper', 'cancelled by receiver', 'replaced']);
  const status = eligibleStatuses.has(currentStatus) ? currentStatus : (eligibleStatuses.has(originalStatus) ? originalStatus : currentStatus);
  const orderValue = driverOrderValue(order);
  const deliveryFee = [order?.service_charges, order?.service_charge, order?.delivery_fee, order?.delivery_charge, order?.shipping_fee].map(cleanNumber).find(v => v > 0) ?? 0;
  if (status === 'cancelled by shipper') return 0;
  if (status === 'cancelled by receiver') return deliveryFee;
  if (['delivered', 'half delivered', 'replaced'].includes(status)) return orderValue;
  return 0;
}

function commissionState(order) {
  const statusKey = commissionStatusKey(order?.status);
  const paid = [order?.commission_paid_status, order?.cash_collection_status, order?.payment_status, order?.paid_status]
    .some(value => String(value || '').trim().toLowerCase() === 'paid') || Boolean(order?.commission_paid_at || order?.cash_collected_at);
  const verified = String(order?.commission_verify_status || '').toLowerCase() === 'verified';
  // Return workflow is separate from driver-account approval. Moving an already
  // approved Half Delivered / Replaced order into Return to Origin must not
  // revoke its approval; the original verified flag remains the source of truth.
  const linkedReturn = ['return to origin', 'return completed'].includes(statusKey);
  const eligible = isCommissionEligibleStatus(order?.status) || (linkedReturn && verified);
  return { eligible, verify_status: paid ? 'paid' : (verified && (eligible || linkedReturn) ? 'verified' : (eligible ? 'unverified' : 'unverified')), paid_status: paid ? 'paid' : 'unpaid' };
}


async function getOrdersVerificationRows(user, filters = {}) {
  const companyId = await resolveCompanyId(user);
  const q = String(filters.q || '').trim().toLowerCase();
  const driverId = String(filters.driver_id || '').trim();
  const verification = String(filters.verification || 'all').trim().toLowerCase();
  const statusFilter = String(filters.status || 'all').trim().toLowerCase();

  const [jobs, shipments, orders, drivers, merchants, returnTransactions] = await Promise.all([
    dbSelect('delivery_jobs', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000 }).catch(() => []),
    dbSelect('shipments', { select: '*', company_id: `eq.${companyId}`, limit: 10000 }).catch(() => []),
    dbSelect('orders', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000 }),
    dbSelect('drivers', { select: 'id,name,driver_no,company_id', company_id: `eq.${companyId}`, limit: 5000 }).catch(() => []),
    dbSelect('merchants', { select: '*', company_id: `eq.${companyId}`, limit: 5000 }).catch(() => []),
    dbSelect('return_transactions', { select: 'id,order_id,original_status,return_status,created_at', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 50000 }).catch(() => [])
  ]);

  const orderMap = new Map(orders.map(o => [String(o.id), o]));
  // Keep the latest return workflow statuses available for the driver's statement.
  // Some older orders only have their secondary state in return_transactions,
  // not in orders.driver_statement_action / orders.sub_status.
  const returnStatusByOrder = new Map();
  for (const rt of returnTransactions) {
    const key = String(rt.order_id || '');
    if (key && !returnStatusByOrder.has(key)) returnStatusByOrder.set(key, rt);
  }
  const shipmentMap = new Map(shipments.map(sh => [String(sh.id), sh]));
  const driverMap = new Map(drivers.map(d => [String(d.id), d]));
  const merchantMap = new Map(merchants.map(m => [String(m.id), m]));
  const latestAssignment = new Map();

  // The newest delivery job containing a shipment is treated as its current statement assignment.
  for (const job of jobs) {
    const links = await dbSelect('delivery_job_shipments', { select: '*', delivery_job_id: `eq.${job.id}`, limit: 10000 }).catch(() => []);
    for (const link of links) {
      const sid = String(link.shipment_id || '');
      const sh = shipmentMap.get(sid);
      const oid = String(sh?.order_id || '');
      if (!oid || !orderMap.has(oid) || latestAssignment.has(oid)) continue;
      latestAssignment.set(oid, { job, shipment: sh, link });
    }
  }

  const rows = [];
  for (const [oid, assignment] of latestAssignment) {
    const o = orderMap.get(oid);
    if (!o) continue;
    // In Ops orders and explicitly removed statement orders are not part of the daily statement.
    if (o.statement_removed_at || commissionStatusKey(o.status) === 'in ops' || commissionStatusKey(o.status) === 'in_ops') continue;
    const statementDate = filters.statement_date || '';
    // The statement day follows the current retry/scheduled date while pending,
    // then switches to the actual final status-action day when completed.
    const statementOperationalDay = operationalOrderDay(o, assignment.shipment, assignment.job);
    if (statementDate && statementOperationalDay !== statementDate) continue;

    const driver = driverMap.get(String(assignment.job?.driver_id || assignment.shipment?.driver_id || ''));
    const merchant = merchantMap.get(String(o.merchant_id || o.shipper_id || o.merchant || '')) || {};
    if (driverId && String(driver?.id || '') !== driverId) continue;

    const state = commissionState(o);
    const verifyStatus = state.verify_status === 'verified' || state.paid_status === 'paid' ? 'verified' : 'unverified';
    const normalizedStatus = commissionStatusKey(o.status);
    // Driver Account shows every order currently linked to Delivery Job.
    // Only the five approved statuses are eligible for Verify; other states
    // remain visible but can never be verified from this page.
    const verifyEligible = state.eligible && ORDERS_VERIFICATION_ALLOWED_STATUSES.has(normalizedStatus);
    if (verification === 'verified' && verifyStatus !== 'verified') continue;
    if (verification === 'unverified' && verifyStatus === 'verified') continue;
    if (statusFilter !== 'all' && normalizedStatus !== commissionStatusKey(statusFilter)) continue;

    const hay = [
      o.id, o.order_code, o.tracking_number, o.merchant_order_no, o.customer_name,
      o.customer_phone, o.customer_phone_2, o.address, driver?.name, driver?.driver_no, o.status,
      merchant.name, merchant.merchant_no, merchant.code, merchant.external_code, o.merchant_code, o.shipper_code, o.merchant_no
    ].filter(Boolean).join(' ').toLowerCase();
    if (q && !hay.includes(q)) continue;

    const linkedReturnStatus = returnStatusByOrder.get(String(o.id)) || {};
    const primaryStatus = o.status || assignment.shipment?.status || '';
    const actionRaw = String(o.driver_statement_action || '').toLowerCase().replace(/[ _-]+/g, ' ').trim();
    const actionMap = { replace: 'Replace', return_to_origin: 'Return to Origin', 'return to origin': 'Return to Origin', return_by_driver: 'Return by Driver', 'return by driver': 'Return by Driver', cancelled: 'Cancelled', 'location change': 'Location Change', location_change: 'Location Change', future_delivery: 'Future Delivery', 'future delivery': 'Future Delivery', schedule_for_tomorrow: 'Schedule for Tomorrow', 'schedule for tomorrow': 'Schedule for Tomorrow' };
    const secondaryStatus = o.secondary_status || o.sub_status || o.substatus || o.return_status ||
      (actionRaw ? (actionMap[actionRaw] || actionRaw.replace(/\b\w/g, c => c.toUpperCase())) : '') ||
      (linkedReturnStatus.return_status && commissionStatusKey(linkedReturnStatus.return_status) !== commissionStatusKey(primaryStatus) ? linkedReturnStatus.return_status : '') || '';

    rows.push({
      id: o.id,
      order_id: o.id,
      order_code: o.order_code || '',
      tracking_number: assignment.shipment?.tracking_number || o.tracking_number || '',
      shipment_no: assignment.shipment?.shipment_no || '',
      job_code: assignment.job?.job_code || assignment.shipment?.job_code || '',
      customer_name: o.customer_name || '',
      customer_phone: o.customer_phone || '',
      customer_phone_2: o.customer_phone_2 || '',
      merchant_id: merchant.id || o.merchant_id || o.shipper_id || null,
      merchant_name: merchant.name || '',
      merchant_code: merchant.merchant_no || merchant.code || merchant.external_code || '',
      address: o.address || '',
      cod: cleanNumber(o.cod ?? o.value ?? o.order_value),
      order_amount: cleanNumber(o.value ?? o.cod ?? o.order_value),
      delivery_fee: cleanNumber(o.delivery_fee),
      status: primaryStatus,
      secondary_status: secondaryStatus,
      verification_status: verifyStatus,
      paid_status: state.paid_status === 'paid' ? 'paid' : 'unpaid',
      commission_paid_status: o.commission_paid_status || 'unpaid',
      verify_eligible: Boolean(verifyEligible),
      commission_verify_status: o.commission_verify_status || 'unverified',
      commission_verified_at: o.commission_verified_at || null,
      commission_verified_by: o.commission_verified_by || null,
      driver_id: driver?.id || assignment.job?.driver_id || assignment.shipment?.driver_id || null,
      driver_name: driver?.name || '',
      driver_no: driver?.driver_no || '',
      created_at: o.created_at || assignment.shipment?.created_at || null,
      updated_at: null,
      driver_statement_action: o.driver_statement_action || null,
      driver_scheduled_date: o.driver_scheduled_date || null,
      driver_location_emirate_id: o.driver_location_emirate_id || null,
      driver_location_area_id: o.driver_location_area_id || null
    });
  }

  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return { rows, drivers };
}

async function getShipmentDeliveryDate(shipmentId, fallbackDate = null) {
  if (!shipmentId) return fallbackDate;
  try {
    const rows = await dbSelect('shipment_status_history', { select: '*', shipment_id: `eq.${shipmentId}`, order: 'created_at.desc', limit: 100 });
    const eligibleKeys = new Set(['delivered','half delivered','cancelled by shipper','cancelled by receiver','replaced','half_delivered','cancelled_by_shipper','cancelled_by_receiver']);
    const hit = rows.find(r => eligibleKeys.has(commissionStatusKey(r.status)));
    if (hit?.created_at) return hit.created_at;
  } catch (_) {}
  return fallbackDate;
}


async function getDriverStatementReturnOrders(companyId, driverId, date) {
  const jobs = await dbSelect('delivery_jobs',{select:'*',driver_id:`eq.${driverId}`,company_id:`eq.${companyId}`,order:'created_at.desc',limit:5000});
  const jobIds=jobs.map(j=>j.id).filter(Boolean);
  let links=[];
  for(const jobId of jobIds) links.push(...await dbSelect('delivery_job_shipments',{select:'*',delivery_job_id:`eq.${jobId}`,limit:5000}).catch(()=>[]));
  const shipmentIds=[...new Set(links.map(x=>x.shipment_id).filter(Boolean))];
  let shipments=[];
  for(const sid of shipmentIds) shipments.push(...await dbSelect('shipments',{select:'*',id:`eq.${sid}`,limit:1}).catch(()=>[]));
  const orderIds=[...new Set(shipments.map(x=>x.order_id).filter(Boolean))];
  let orders=[];
  for(const oid of orderIds) orders.push(...await dbSelect('orders',{select:'*',id:`eq.${oid}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
  const om=new Map(orders.map(o=>[String(o.id),o]));
  return shipments.map(sh=>{
    const o=om.get(String(sh.order_id));
    if(!o || o.driver_scheduled_date!==date) return null;
    if(!['return_by_driver','future_delivery','location_change'].includes(String(o.driver_statement_action||'').toLowerCase())) return null;
    return {...o,shipment_id:sh.id,shipment_no:sh.shipment_no,tracking_number:sh.tracking_number||o.tracking_number||'',return_reason:o.driver_statement_action};
  }).filter(Boolean);
}

// Read-only source guidance for System Delivery AI. Only these application source files
// are eligible; environment files, secrets, customer records, and runtime logs are never read.
function getSystemDeliveryAISourceContext(message) {
  const text = String(message || '').toLowerCase();
  const files = [];
  const add = (relative, label, terms) => files.push({ relative, label, terms });
  const common = ['status','order','shipment','driver','merchant','settlement','expense','permission','company_id'];
  if (/مصاريف|مصروف|expense|financial|profit|loss|حسابات|تسوي|كشف مالي|إيراد|ارباح|خسائر/i.test(text)) {
    add(path.join(__dirname, 'server.js'), 'src/server.js', ['expense','settlement','accounting','financial','profit','loss','company_id','cancelled by receiver','cancelled by shipper']);
    add(path.join(__dirname, '..', 'public', 'app.js'), 'public/app.js', ['expense','settlement','accounting','financial','profit','loss','companyExpenses','merchantFinancial','driverExpenses']);
  } else if (/صلاح|permission|employee|موظف|role|أيقون/i.test(text)) {
    add(path.join(__dirname, 'server.js'), 'src/server.js', ['requireRole','requireAdmin','canAccessPage','permission','employee','role']);
    add(path.join(__dirname, '..', 'public', 'app.js'), 'public/app.js', ['canAccessPage','permission','employee','role','renderSidebar','NAV_ICONS']);
  } else if (/عداد|dashboard|لوحة التحكم|counter|عدد الشحنات/i.test(text)) {
    add(path.join(__dirname, '..', 'public', 'app.js'), 'public/app.js', ['dashboard','counter','shipment','assigned with driver','operationsDashboard']);
    add(path.join(__dirname, 'server.js'), 'src/server.js', ['dashboard','counter','shipment','assigned with driver','company_id']);
  } else if (/بحث|search|تتبع|timeline/i.test(text)) {
    add(path.join(__dirname, '..', 'public', 'app.js'), 'public/app.js', ['search','timeline','tracking','shipment']);
    add(path.join(__dirname, 'server.js'), 'src/server.js', ['search','tracking','shipment']);
  } else if (/دخول|تسجيل|login|logout|جلسة|session|auth|token/i.test(text)) {
    add(path.join(__dirname, 'server.js'), 'src/server.js', ['login','logout','session','jwt','cookie','authenticate','requireAdmin']);
    add(path.join(__dirname, '..', 'public', 'app.js'), 'public/app.js', ['login','logout','session','token','auth']);
  } else {
    const words = text.split(' ').filter(w => w.length >= 3).slice(0, 12);
    const terms = [...new Set([...words, ...common])];
    add(path.join(__dirname, 'server.js'), 'src/server.js', terms);
    add(path.join(__dirname, '..', 'public', 'app.js'), 'public/app.js', terms);
  }
  const results = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file.relative, 'utf8');
      const lines = content.split('\n');
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 1200) continue;
        if (/(?:GEMINI_API_KEY|GROQ_API_KEY|JWT_SECRET|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|password\s*[:=]|authorization\s*[:=])/i.test(line)) continue;
        const lower = line.toLowerCase();
        const score = file.terms.reduce((n, term) => n + (term && lower.includes(term.toLowerCase()) ? 1 : 0), 0);
        if (score) matches.push({ line: i + 1, score, text: line.trim().slice(0, 500) });
      }
      matches.sort((a,b) => b.score - a.score || a.line - b.line);
      const chosen = matches.slice(0, 22).sort((a,b) => a.line - b.line);
      if (chosen.length) results.push({ file: file.label, source: 'deployed application files, read-only', matches: chosen });
    } catch (_) {
      results.push({ file: file.label, unavailable: true, note: 'Source file is not present in this deployment.' });
    }
  }
  return { source_type: 'deployed_source_code_excerpts', source_of_truth: 'read-only files from the currently running deployment', note: 'These excerpts describe the deployed version and may differ from a GitHub branch that has not been deployed.', files: results };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  requests.count++;

  // System Delivery AI is owner/admin-only unless an owner explicitly grants
  // the dedicated system_delivery_ai permission to an employee's group.
  async function requireSystemDeliveryAIAccess() {
    const user = await requireAuth(req, res);
    if (!user) return null;
    const roleName = String(user.role || '').toLowerCase();
    const granted = user.permissions && typeof user.permissions === 'object' && user.permissions.system_delivery_ai === true;
    if (!isSystemAdminUser(user) && !granted) {
      json(res, 403, { success: false, error: 'المساعد الذكي متاح لمدير النظام أو لمن مُنح صلاحية المساعد الذكي' });
      return null;
    }
    return user;
  }
  if (pathname === '/api/system-delivery-ai/status' && req.method === 'GET') {
    const user = await requireSystemDeliveryAIAccess(); if (!user) return;
    return json(res, 200, { success: true, ...systemDeliveryAI.status() });
  }
  if (pathname === '/api/system-delivery-ai/chat' && req.method === 'POST') {
    const user = await requireSystemDeliveryAIAccess(); if (!user) return;
    try {
      const body = await bodyJson(req, 16 * 1024);
      const message = String(body.message || '').trim();
      const companyId = await resolveCompanyId(user);
      const aiUserId = String(user.id || user.user_id || user.email || '');
      const aiRoleName = String(user.role || '').toLowerCase();
      const aiCanTeach = aiRoleName === 'admin' || user.is_system_admin === true;
      const normalizeMemoryKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
      let memoryRows = [];
      let memoryReady = true;
      const needsPendingMemory = /^(احفظ القاعدة|اعتمد التعديل على القاعدة|ارفض التعديل على القاعدة)/i.test(message);
      try {
        const cachedMemory = !needsPendingMemory ? SYSTEM_DELIVERY_AI_MEMORY_CACHE.get(String(companyId)) : null;
        if (cachedMemory && cachedMemory.expiresAt > Date.now()) {
          memoryRows = cachedMemory.rows;
        } else {
          memoryRows = await dbSelect('system_delivery_ai_memory', {
            select: 'id,memory_type,memory_key,content,status,proposed_content,created_by_user_id',
            company_id: `eq.${companyId}`,
            status: 'eq.active',
            order: 'updated_at.desc',
            limit: 200
          });
          memoryRows = Array.isArray(memoryRows) ? memoryRows : [];
          if (!needsPendingMemory) {
            SYSTEM_DELIVERY_AI_MEMORY_CACHE.set(String(companyId), {
              rows: memoryRows,
              expiresAt: Date.now() + SYSTEM_DELIVERY_AI_MEMORY_CACHE_TTL_MS
            });
          }
        }
        if (needsPendingMemory) {
          const pendingRows = await dbSelect('system_delivery_ai_memory', {
            select: 'id,memory_type,memory_key,content,status,proposed_content,created_by_user_id',
            company_id: `eq.${companyId}`,
            status: 'eq.pending',
            limit: 100
          });
          memoryRows = [...(Array.isArray(memoryRows) ? memoryRows : []), ...(Array.isArray(pendingRows) ? pendingRows : [])];
        }
      } catch (_) {
        SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
        // Keep ordinary AI chat available if the optional memory migration has not been applied yet.
        memoryReady = false;
      }
      const memories = Array.isArray(memoryRows) ? memoryRows : [];
      const modeRow = memories.find(row => row.memory_type === 'learning_mode' && row.memory_key === aiUserId && row.status === 'active');
      const isMidoPhrase = /^(انا ميدو|أنا ميدو|انا ميدو\s*[.!؟]?|أنا ميدو\s*[.!؟]?)$/i.test(message.trim());
      if (!memoryReady && (isMidoPhrase || /^(احفظ القاعدة|اعتمد التعديل على القاعدة|ارفض التعديل على القاعدة)/i.test(message.trim()))) {
        return json(res, 503, { success: false, error: 'ميزة الذاكرة الدائمة لم تجهز بعد. شغّل ملف sql/system-delivery-ai-memory.sql في Supabase ثم أعد المحاولة.' });
      }
      if (isMidoPhrase) {
        if (!aiCanTeach || !aiUserId) {
          return json(res, 403, { success: false, error: 'تفعيل وضع التعليم متاح لحساب مدير النظام المصرح له فقط.' });
        }
        const existingMode = memories.find(row => row.memory_type === 'learning_mode' && row.memory_key === aiUserId);
        if (existingMode) {
          SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
          await dbUpdate('system_delivery_ai_memory', { id: `eq.${existingMode.id}`, company_id: `eq.${companyId}` }, { status: 'active', content: 'learning mode enabled', updated_at: new Date().toISOString() });
        } else {
          SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
          await dbInsert('system_delivery_ai_memory', { company_id: companyId, created_by_user_id: aiUserId, memory_type: 'learning_mode', memory_key: aiUserId, content: 'learning mode enabled', status: 'active' });
        }
        return json(res, 200, { success: true, reply: 'أهلاً يا ميدو. وضع التعليم اتفعّل. ابعت القاعدة بصيغة: احفظ القاعدة [اسم الموضوع]: [القاعدة]. لو فيه قاعدة بنفس الموضوع ومختلفة، هوقف التغيير وأسألك قبل ما أستبدلها.' , provider: 'memory' });
      }
      if (aiCanTeach && /^(انهاء وضع التعليم|إنهاء وضع التعليم|اقفل وضع التعليم|أوقف وضع التعليم)$/i.test(message.trim())) {
        const currentMode = memories.find(row => row.memory_type === 'learning_mode' && row.memory_key === aiUserId);
        if (currentMode) { SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId)); await dbUpdate('system_delivery_ai_memory', { id: `eq.${currentMode.id}`, company_id: `eq.${companyId}` }, { status: 'inactive', updated_at: new Date().toISOString() }); }
        return json(res, 200, { success: true, reply: 'تم إيقاف وضع التعليم. القواعد المعتمدة تظل محفوظة ومتاحة للمساعد.' , provider: 'memory' });
      }
      const saveRuleMatch = message.match(/^احفظ القاعدة\s+(.{2,120}?)\s*:\s*([\s\S]{5,2000})$/i);
      if (aiCanTeach && modeRow && saveRuleMatch) {
        const memoryKey = normalizeMemoryKey(saveRuleMatch[1]);
        const ruleContent = String(saveRuleMatch[2] || '').trim();
        if (!memoryKey || !ruleContent) return json(res, 400, { success: false, error: 'اكتب اسم الموضوع والقاعدة بوضوح.' });
        const activeRule = memories.find(row => row.memory_type === 'rule' && row.memory_key === memoryKey && row.status === 'active');
        if (activeRule && String(activeRule.content).trim() !== ruleContent) {
          const pending = memories.find(row => row.memory_type === 'pending_rule' && row.memory_key === memoryKey && row.status === 'pending');
          if (pending) {
            SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
            await dbUpdate('system_delivery_ai_memory', { id: `eq.${pending.id}`, company_id: `eq.${companyId}` }, { proposed_content: ruleContent, content: ruleContent, created_by_user_id: aiUserId, updated_at: new Date().toISOString() });
          } else {
            SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
            await dbInsert('system_delivery_ai_memory', { company_id: companyId, created_by_user_id: aiUserId, memory_type: 'pending_rule', memory_key: memoryKey, content: ruleContent, proposed_content: ruleContent, status: 'pending' });
          }
          return json(res, 200, { success: true, reply: 'يا ميدو، عندي قاعدة معتمدة للموضوع ده: «' + activeRule.content + '». والقاعدة الجديدة بتقول: «' + ruleContent + '». ما غيرتش القديمة. لو الجديدة هي الصح، اكتب: اعتمد التعديل على القاعدة ' + memoryKey + '. لو القديمة تفضل، اكتب: ارفض التعديل على القاعدة ' + memoryKey + '.' , provider: 'memory' });
        }
        if (activeRule) return json(res, 200, { success: true, reply: 'القاعدة دي محفوظة بالفعل بنفس النص، يا ميدو. ما احتجتش أغير حاجة.' , provider: 'memory' });
        SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
        await dbInsert('system_delivery_ai_memory', { company_id: companyId, created_by_user_id: aiUserId, memory_type: 'rule', memory_key: memoryKey, content: ruleContent, status: 'active' });
        return json(res, 200, { success: true, reply: 'حفظت القاعدة المعتمدة تحت موضوع «' + memoryKey + '». هستخدمها في إجابات المساعد لكل الموظفين داخل الشركة.' , provider: 'memory' });
      }
      const approveMatch = aiCanTeach && message.match(/^اعتمد التعديل على القاعدة\s+(.{2,120})$/i);
      if (approveMatch) {
        const memoryKey = normalizeMemoryKey(approveMatch[1]);
        const pending = memories.find(row => row.memory_type === 'pending_rule' && row.memory_key === memoryKey && row.status === 'pending');
        const activeRule = memories.find(row => row.memory_type === 'rule' && row.memory_key === memoryKey && row.status === 'active');
        if (!pending || !activeRule) return json(res, 404, { success: false, reply: 'مش لاقي تعديل معلّق للقاعدة دي. راجع اسم الموضوع زي ما ظهر في رسالة الاختلاف.' });
        SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
        await dbUpdate('system_delivery_ai_memory', { id: `eq.${activeRule.id}`, company_id: `eq.${companyId}` }, { content: pending.proposed_content || pending.content, created_by_user_id: aiUserId, updated_at: new Date().toISOString() });
        SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId));
        await dbDelete('system_delivery_ai_memory', { id: `eq.${pending.id}`, company_id: `eq.${companyId}` });
        return json(res, 200, { success: true, reply: 'اعتمدت تصحيحك واستبدلت القاعدة القديمة بالجديدة. هستخدم النسخة الجديدة بعد كده.' , provider: 'memory' });
      }
      const rejectMatch = aiCanTeach && message.match(/^ارفض التعديل على القاعدة\s+(.{2,120})$/i);
      if (rejectMatch) {
        const memoryKey = normalizeMemoryKey(rejectMatch[1]);
        const pending = memories.find(row => row.memory_type === 'pending_rule' && row.memory_key === memoryKey && row.status === 'pending');
        if (pending) { SYSTEM_DELIVERY_AI_MEMORY_CACHE.delete(String(companyId)); await dbDelete('system_delivery_ai_memory', { id: `eq.${pending.id}`, company_id: `eq.${companyId}` }); }
        return json(res, 200, { success: true, reply: pending ? 'تمام يا ميدو، رفضت التعديل واحتفظت بالقاعدة المعتمدة القديمة.' : 'مفيش تعديل معلّق للقاعدة دي؛ القاعدة المعتمدة لم تتغير.' , provider: 'memory' });
      }
      // Inject only approved company rules into every employee's assistant context.
      const approvedRules = memories.filter(row => row.memory_type === 'rule' && row.status === 'active').map(row => ({ topic: row.memory_key, rule: row.content }));
      // Use deployed source files as code evidence, separately from live database figures.
      const asksImplementation = /كود|ملف|سورس|source|code|implementation|bug|خطأ برمجي|إصلاح|اصلح|أصلح|github|deplexo|نشر|deploy|route|api|endpoint|دالة|function|syntax|فشل الاختبار/i.test(message);
      const sourceContext = asksImplementation ? getSystemDeliveryAISourceContext(message) : null;
      let context = { ...(sourceContext ? { source_code: sourceContext } : {}), approved_company_rules: approvedRules };
      const asksDriverStatement = /كشف\s*(?:حساب\s*)?(?:المندوب|السائق)|تسوية\s*(?:المندوب|السائق)|driver\s*(?:settlement|statement|account)/i.test(message);
      const asksMerchantStatement = /كشف\s*(?:حساب\s*)?التاجر|فاتورة\s*(?:التاجر|الشاحن)|merchant\s*(?:statement|invoice)/i.test(message);
      const asksDeliveredCount = /عدد\s*(?:الأوردرات|الطلبات|التسليم).*?(?:المندوب|السائق)|عدد\s*(?:الأوردرات|الطلبات)\s*(?:لدى|مع)\s*(?:المندوب|السائق)|delivered\s*count/i.test(message);
      const asksOperationalReport = asksDriverStatement || asksMerchantStatement || asksDeliveredCount;
      let reportRange = null;
      if (asksOperationalReport) {
        const explicitDates = [...message.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(m => m[1]).filter(isValidISODate);
        const today = egyptTodayISO();
        if (explicitDates.length >= 2) reportRange = { from: explicitDates[0], to: explicitDates[1] };
        else if (explicitDates.length === 1) reportRange = { from: explicitDates[0], to: explicitDates[0] };
        else if (/اليوم|النهارده|النهاردا|today/i.test(message)) reportRange = { from: today, to: today };
        else if (/امبارح|أمس|البارحة|yesterday/i.test(message)) { const d = addEgyptDaysISO(-1); reportRange = { from: d, to: d }; }
        else if (/الشهر\s*(?:الحالي|ده)|من\s*أول\s*الشهر|this\s*month/i.test(message)) reportRange = { from: today.slice(0,8)+'01', to: today };
        if (!reportRange) {
          return json(res,200,{success:true,provider:'memory',reply:'عشان أطلع التقرير من بيانات النظام الفعلية، ابعت التاريخ أو الفترة المطلوبة (مثال: 2026-10-22 أو من 2026-10-20 إلى 2026-10-23).'});
        }
        if (reportRange.from > reportRange.to) return json(res,400,{success:false,error:'تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له.'});
        const mentionMatches = (entity, fields) => fields.some(value => {
          const field = String(value || '').trim().toLowerCase();
          if (!field) return false;
          if (field.length >= 3) return message.toLowerCase().includes(field);
          return /^\d+$/.test(field) && new RegExp('(?:مندوب|سائق|driver|merchant|تاجر)\\s*#?' + field + '(?:\\b|$)','i').test(message);
        });
        const inReportRange = value => { const day=accountingDay(value); return !!day && day>=reportRange.from && day<=reportRange.to; };
        if (asksDriverStatement || asksDeliveredCount) {
          const drivers = await dbSelectAll('drivers',{select:'id,name,driver_no,code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
          const matchedDrivers = (drivers||[]).filter(d=>mentionMatches(d,[d.name,d.driver_no,d.code]));
          if (!matchedDrivers.length) return json(res,200,{success:true,provider:'memory',reply:'حدد اسم المندوب أو كوده كما هو مسجل في النظام، مع التاريخ المطلوب، عشان ما أخلطش بين حسابات مندوبين.'});
          if (matchedDrivers.length>1) return json(res,200,{success:true,provider:'memory',reply:'فيه أكثر من مندوب مطابق. اكتب الاسم الكامل أو كود المندوب، وسأكمل التقرير على الشخص الصحيح.'});
          const driver = matchedDrivers[0];
          const [reportOrders,reportShipments,reportJobs,reportLinks] = await Promise.all([
            dbSelectAll('orders',{select:'*',company_id:`eq.${companyId}`,limit:50000}),
            listShipments('', '', companyId),
            dbSelectAll('delivery_jobs',{select:'*',company_id:`eq.${companyId}`,limit:20000}),
            dbSelectAll('delivery_job_shipments',{select:'*',limit:100000}).catch(()=>[])
          ]);
          const latestAssignments=latestDeliveryJobAssignments(reportJobs,reportLinks);
          const shipmentByOrder=new Map((reportShipments||[]).map(sh=>[String(sh.order_id||''),sh]));
          const qualifyingStatuses=new Set(['delivered','half delivered','cancelled by shipper','cancelled by receiver','replaced']);
          const eligibleOrders=(reportOrders||[]).map(order=>{
            const shipment=shipmentByOrder.get(String(order.id||''))||null;
            const assignment=shipment?latestAssignments.get(String(shipment.id||'')):null;
            const driverId=String(shipment?.driver_id||shipment?.current_driver_id||assignment?.job?.driver_id||order.driver_id||'');
            const rawOrderStatus=String(order.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
            const rawShipmentStatus=String(shipment?.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
            const outcomeStatus=String(shipment?.last_completion_status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
            const rawStatus=rawOrderStatus==='paid'?(outcomeStatus||rawShipmentStatus||rawOrderStatus):(rawOrderStatus||outcomeStatus||rawShipmentStatus);
            const status=rawStatus==='cancelled by reciver'?'cancelled by receiver':commissionStatusKey(rawStatus);
            const day=accountingDay((qualifyingStatuses.has(status)&&shipment?.last_completion_status_at)||operationalOrderDay(order,shipment,assignment?.job)||order.actual_delivery_date||order.delivered_at||order.status_changed_at||order.created_at||'');
            const paid=rawOrderStatus==='paid'||paidLockValues(order);
            return {order,shipment,assignment,driverId,status,day,paid};
          }).filter(x=>x.driverId===String(driver.id)&&inReportRange(x.day));
          if (asksDeliveredCount) {
            const counted=eligibleOrders.filter(x=>qualifyingStatuses.has(x.status));
            const byStatus={};
            for(const x of counted) byStatus[x.status]=(byStatus[x.status]||0)+1;
            context.delivery_report={type:'driver_delivered_count',title:'عدد أوردرات المندوب',from:reportRange.from,to:reportRange.to,entity:driver.name||driver.driver_no,summary:{total_orders:counted.length},sections:[{title:'العدد حسب الحالة',columns:[{key:'status',label:'الحالة'},{key:'count',label:'العدد'}],rows:Object.entries(byStatus).map(([status,count])=>({status,count}))}]};
          } else {
            const paidOrders=eligibleOrders.filter(x=>qualifyingStatuses.has(x.status)&&x.paid);
            const [expenses,settlements,transactions] = await Promise.all([
              dbSelectAll('expenses',{select:'*',company_id:`eq.${companyId}`,driver_id:`eq.${driver.id}`,limit:10000}).catch(()=>[]),
              dbSelectAll('driver_settlements',{select:'*',company_id:`eq.${companyId}`,driver_id:`eq.${driver.id}`,limit:10000}).catch(()=>[]),
              dbSelectAll('transactions',{select:'*',company_id:`eq.${companyId}`,driver_id:`eq.${driver.id}`,limit:20000}).catch(()=>[])
            ]);
            const expenseRows=(expenses||[]).filter(x=>inReportRange(x.expense_date||x.created_at)).map(x=>({date:accountingDay(x.expense_date||x.created_at),category:x.category||x.expense_type||'مصروف',details:x.details||x.notes||'',amount:cleanNumber(x.amount)}));
            const settlementRows=(settlements||[]).filter(x=>inReportRange(x.paid_at||x.created_at)).map(x=>{
              const note=String(x.notes||'');
              const cash=Number(note.match(/cash(?:\s*portion)?\s*[=:|]\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1]||0);
              const credit=Number(note.match(/credit(?:\s*portion)?\s*[=:|]\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1]||0);
              return {date:accountingDay(x.paid_at||x.created_at),amount:cleanNumber(x.amount),cash,credit,method:x.payment_method||'',status:x.status||'saved'};
            });
            const commissionByShipment=new Map();
            for(const tx of transactions||[]) if(String(tx.transaction_type||'').trim().toLowerCase()==='commission'&&tx.shipment_id) commissionByShipment.set(String(tx.shipment_id),(commissionByShipment.get(String(tx.shipment_id))||0)+Math.abs(cleanNumber(tx.amount)));
            const orderRows=paidOrders.map(x=>({date:x.day,order_no:x.order.merchant_order_no||x.order.order_code||'',tracking_number:x.shipment?.tracking_number||x.order.tracking_number||'',job_code:x.assignment?.job?.job_code||x.shipment?.job_code||'',status:x.status,cod:cleanNumber(x.order.cod??x.order.value),delivery_fee:cleanNumber(x.order.service_charges??x.order.delivery_fee),commission:commissionByShipment.get(String(x.shipment?.id||''))||0}));
            const sum=(rows,key)=>rows.reduce((n,x)=>n+cleanNumber(x[key]),0);
            context.delivery_report={type:'driver_settlement_statement',title:'كشف تسوية المندوب',from:reportRange.from,to:reportRange.to,entity:driver.name||driver.driver_no,summary:{orders_count:orderRows.length,cod_total:sum(orderRows,'cod'),delivery_fees:sum(orderRows,'delivery_fee'),commission_total:sum(orderRows,'commission'),expenses_total:sum(expenseRows,'amount'),settlement_total:sum(settlementRows,'amount'),cash_total:sum(settlementRows,'cash'),credit_total:sum(settlementRows,'credit')},signature_label:'توقيع المندوب',sections:[{title:'الأوردرات المدفوعة المؤهلة',columns:[{key:'date',label:'التاريخ'},{key:'order_no',label:'رقم الأوردر'},{key:'tracking_number',label:'Tracking Number'},{key:'job_code',label:'Job Code'},{key:'status',label:'الحالة'},{key:'cod',label:'قيمة الأوردر'},{key:'delivery_fee',label:'رسوم التوصيل'},{key:'commission',label:'العمولة'}],rows:orderRows.slice(0,500),truncated:orderRows.length>500},{title:'مصاريف المندوب',columns:[{key:'date',label:'التاريخ'},{key:'category',label:'التصنيف'},{key:'details',label:'التفاصيل'},{key:'amount',label:'المبلغ'}],rows:expenseRows.slice(0,300),truncated:expenseRows.length>300},{title:'التسويات المحفوظة',columns:[{key:'date',label:'التاريخ'},{key:'amount',label:'الإجمالي'},{key:'cash',label:'كاش'},{key:'credit',label:'كريدت'},{key:'method',label:'طريقة الدفع'},{key:'status',label:'الحالة'}],rows:settlementRows.slice(0,100),truncated:settlementRows.length>100}]};
          }
        } else if (asksMerchantStatement) {
          const merchants=await dbSelectAll('merchants',{select:'id,name,code,merchant_no,external_code',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);
          const matched=(merchants||[]).filter(m=>mentionMatches(m,[m.name,m.code,m.merchant_no,m.external_code]));
          if(!matched.length) return json(res,200,{success:true,provider:'memory',reply:'حدد اسم التاجر أو كوده كما هو مسجل في النظام، مع التاريخ المطلوب، عشان أطلع كشف التاجر الصحيح.'});
          if(matched.length>1) return json(res,200,{success:true,provider:'memory',reply:'فيه أكثر من تاجر مطابق. اكتب الاسم الكامل أو الكود، وسأكمل كشف التاجر الصحيح.'});
          const merchant=matched[0];
          const statusFilter=/\bunpaid\b|غير\s*مدفوع|غير\s*مسدد/i.test(message)?'unpaid':(/\bpaid\b|مدفوع|مسدد/i.test(message)?'paid':'');
          const [records,items,orders,shipments]=await Promise.all([
            dbSelectAll('shipper_settlement_records',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
            dbSelectAll('shipper_settlement_items',{select:'*',company_id:`eq.${companyId}`,limit:100000}).catch(()=>[]),
            dbSelectAll('orders',{select:'*',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]),
            dbSelectAll('shipments',{select:'id,order_id,tracking_number,company_id',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[])
          ]);
          const orderById=new Map((orders||[]).map(o=>[String(o.id),o]));
          const trackingByOrder=new Map((shipments||[]).map(s=>[String(s.order_id||''),s.tracking_number||'']));
          const merchantRecords=(records||[]).filter(r=>String(r.merchant_id||'')===String(merchant.id)&&inReportRange(r.settlement_date||r.generated_at||r.created_at)&&(!statusFilter||String(r.status||'').trim().toLowerCase()===statusFilter));
          const recordById=new Map(merchantRecords.map(r=>[String(r.id),r]));
          const merchantItems=(items||[]).filter(i=>recordById.has(String(i.settlement_id||'')));
          const orderRows=merchantItems.map(item=>{const order=orderById.get(String(item.order_id||''))||{};const record=recordById.get(String(item.settlement_id||''))||{};return {date:accountingDay(record.settlement_date||record.generated_at||record.created_at),invoice_status:record.status||'',order_no:order.merchant_order_no||order.order_code||'',tracking_number:trackingByOrder.get(String(order.id||''))||order.tracking_number||'',cod:cleanNumber(item.cod??order.cod??order.value),delivery_fee:cleanNumber(item.service_charges??order.service_charges??order.delivery_fee),merchant_due:cleanNumber(item.merchant_net),settlement_id:record.id||''};});
          const sum=(rows,key)=>rows.reduce((n,x)=>n+cleanNumber(x[key]),0);
          context.delivery_report={type:'merchant_statement',title:'كشف التاجر',from:reportRange.from,to:reportRange.to,entity:merchant.name||merchant.code,summary:{invoice_count:merchantRecords.length,orders_count:orderRows.length,cod_total:sum(orderRows,'cod'),delivery_fees:sum(orderRows,'delivery_fee'),merchant_due:sum(orderRows,'merchant_due'),status_filter:statusFilter||'all'},sections:[{title:'الأوردرات في الفواتير المولدة',columns:[{key:'date',label:'تاريخ الفاتورة'},{key:'invoice_status',label:'حالة الفاتورة'},{key:'order_no',label:'رقم الأوردر'},{key:'tracking_number',label:'Tracking Number'},{key:'cod',label:'قيمة الأوردر'},{key:'delivery_fee',label:'رسوم التوصيل'},{key:'merchant_due',label:'مستحق التاجر'}],rows:orderRows.slice(0,500),truncated:orderRows.length>500}]};
        }
        if (context.delivery_report) {
          const report = context.delivery_report;
          const summaryText = Object.entries(report.summary||{}).map(([key,value])=>key+': '+String(value)).join('، ');
          context.delivery_report.summary_text = summaryText;
        }
      }
      const asksExpenses = /مصروف|مصاريف|كشف\s*المصاريف|expense|expenses|operating cost/i.test(message);
      if (asksExpenses) {
        const companyId = await resolveCompanyId(user);
        const today = egyptTodayISO();
        let from = today.slice(0, 8) + '01';
        let to = today;
        const explicitDates = [...message.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(m => m[1]);
        if (explicitDates.length >= 2) { from = explicitDates[0]; to = explicitDates[1]; }
        else if (explicitDates.length === 1) { from = explicitDates[0]; to = explicitDates[0]; }
        else if (/امبارح|أمس|البارحة/i.test(message)) { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-1); from = to = d.toISOString().slice(0,10); }
        else if (/اليوم|النهارده|النهاردا/i.test(message)) { from = to = today; }
        else if (/من\s*أول\s*الشهر|بداية\s*الشهر|الشهر\s*الحالي/i.test(message)) { from = today.slice(0,8)+'01'; to = today; }
        else if (/كل\s*الفترة|كل\s*المصاريف|من\s*البداية/i.test(message)) { from = ''; to = today; }
        const [rows, companyExpenseAdjustments] = await Promise.all([
          dbSelectAll('expenses', { select:'*', company_id:`eq.${companyId}`, order:'expense_date.desc,created_at.desc', limit:10000 }).catch(()=>[]),
          dbSelectAll('company_financial_adjustments', { select:'*', company_id:`eq.${companyId}`, order:'transaction_date.desc,created_at.desc', limit:10000 }).catch(()=>[])
        ]);
        const inExpenseRange = e => {
          const day = accountingDay(e.expense_date || e.transaction_date || e.adjustment_date || e.created_at);
          return day && (!from || day >= from) && (!to || day <= to);
        };
        const filtered = (rows || []).filter(inExpenseRange);
        const companyFiltered = (companyExpenseAdjustments || []).filter(e => String(e.type||'').trim().toLowerCase()==='expense' && inExpenseRange(e));
        const drivers = await dbSelectAll('drivers', { select:'id,name,driver_no', company_id:`eq.${companyId}`, limit:5000 }).catch(() => []);
        const driverMap = new Map((drivers || []).map(d => [String(d.id), d.name || d.driver_no || '']));
        const safeRows = [
          ...filtered.map(e => ({
            date: accountingDay(e.expense_date || e.created_at),
            amount: cleanNumber(e.amount),
            category: String(e.category || e.expense_type || 'غير مصنف').slice(0,100),
            type: String(e.expense_type || '').slice(0,80),
            source: e.driver_id ? 'مصروفات مندوب' : 'المصروفات',
            driver: driverMap.get(String(e.driver_id || '')) || (e.driver_id ? 'مندوب غير معروف' : '')
          })),
          ...companyFiltered.map(e => ({
            date: accountingDay(e.transaction_date || e.adjustment_date || e.created_at),
            amount: Math.abs(cleanNumber(e.amount ?? e.signed_amount)),
            category: 'مصروفات الشركة',
            type: String(e.reason || e.reference || 'مصروف شركة').slice(0,80),
            source: 'Cashier / Company Expenses',
            driver: ''
          }))
        ];
        const total = safeRows.reduce((sum, e) => sum + e.amount, 0);
        const byCategory = {};
        for (const e of safeRows) { const key = e.category || 'غير مصنف'; byCategory[key] = (byCategory[key] || 0) + e.amount; }
        context.expense_report = { type:'actual_expense_report', source:'expenses table, read-only', from:from || 'بداية السجلات', to, currency:'عملة النظام كما هي مسجلة', count:safeRows.length, total:Number(total.toFixed(2)), by_category:Object.fromEntries(Object.entries(byCategory).map(([k,v])=>[k,Number(v.toFixed(2))])), rows:safeRows.slice(0,150), truncated:safeRows.length>150 };
      }
      let result;
      try {
        result = await systemDeliveryAI.reply(message, context);
      } catch (providerError) {
        // Structured reports come from the live database and remain useful even
        // if an external AI provider is temporarily slow or unavailable.
        if (!context.delivery_report) throw providerError;
        await audit(user, 'system_delivery_ai_report', 'system_delivery_ai', null, { message_length: message.length, provider_fallback: true }).catch(()=>{});
        return json(res,200,{success:true,provider:'database-report',reply:'جهزت التقرير من بيانات النظام الفعلية. تقدر تراجعه وتحفظه PDF من زر التقرير بالأسفل.',report:context.delivery_report});
      }
      await audit(user, 'system_delivery_ai_chat', 'system_delivery_ai', null, { provider: result.provider, message_length: message.length, used_expense_context: Boolean(context.expense_report), used_delivery_report: Boolean(context.delivery_report) });
      return json(res, 200, { success: true, reply: result.reply, provider: result.provider, ...(context.delivery_report ? { report: context.delivery_report } : {}) });
    } catch (error) {
      const status = Number(error.status) || 502;
      const safeStatus = [400, 413, 429, 503, 504].includes(status) ? status : 502;
      if (safeStatus >= 500) {
        // Log diagnostic detail without credentials or long upstream payloads.
        const diagnostic = String(error.message || 'unknown error')
          .replace(/(?:AIza[0-9A-Za-z_-]{20,})/g, '[API_KEY_REDACTED]')
          .replace(/https?:\/\/\S+/g, '[URL_REDACTED]')
          .slice(0, 350);
        console.warn('[SYSTEM_DELIVERY_AI] provider request failed:', safeStatus, diagnostic);
      }
      return json(res, safeStatus, { success: false, error: String(error.message || 'تعذر الاتصال بمساعد الذكاء الاصطناعي.') });
    }
  }

  if (pathname === '/api/drivers/locations' && req.method === 'GET') {
    const user = await requireRole(req, res, 'drivers'); if (!user) return;
    try {
      const companyId=await resolveCompanyId(user);
      const [locations,drivers]=await Promise.all([
        dbSelect('driver_locations',{select:'*',order:'recorded_at.desc',limit:5000}),
        dbSelect('drivers',{select:'id,name,driver_no,phone,user_id',company_id:`eq.${companyId}`,limit:5000})
      ]);
      const dm=new Map(drivers.map(d=>[String(d.id),d]));
      const seen=new Set(); const data=locations.filter(x=>{const d=dm.get(String(x.driver_id));if(!d||seen.has(String(x.driver_id)))return false;seen.add(String(x.driver_id));return true;}).map(x=>{const d=dm.get(String(x.driver_id))||{};return {...x,driver_name:d.name||'',driver_no:d.driver_no||'',phone:d.phone||''};}).filter(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))); return json(res,200,{success:true,data});
    } catch(e) { return json(res,500,{success:false,error:`تعذر تحميل مواقع المندوبين: ${e.message}. تأكد من تشغيل migration الخاصة بالمواقع.`}); }
  }
  if (pathname === '/api/drivers/location' && req.method === 'POST') {
    const user=await requireAuth(req,res); if(!user)return;
    if(String(user.role||'').toLowerCase()!=='driver') return json(res,403,{success:false,error:'مشاركة الموقع متاحة لحساب المندوب فقط'});
    try {
      const body=await bodyJson(req),lat=Number(body.latitude),lon=Number(body.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180) return json(res,400,{success:false,error:'إحداثيات GPS غير صحيحة'});
      const companyId=await resolveCompanyId(user);
      const drivers=await dbSelect('drivers',{select:'id,user_id',company_id:`eq.${companyId}`,limit:5000});
      const driver=drivers.find(d=>String(d.user_id||'')===String(user.id)||String(d.id)===String(user.driver_id||''));
      if(!driver)return json(res,403,{success:false,error:'لم يتم ربط حساب المستخدم بسجل مندوب. اربط user_id في جدول drivers أولاً.'});
      const accuracy=Number(body.accuracy);
      const row={company_id:companyId,driver_id:driver.id,latitude:lat,longitude:lon,...(Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=100000?{accuracy}:{}),recorded_at:new Date().toISOString()};
      await dbInsert('driver_locations',row,{prefer:'return=minimal'});
      return json(res,200,{success:true,recorded_at:row.recorded_at});
    } catch(e) { return json(res,500,{success:false,error:`تعذر حفظ موقع GPS: ${e.message}. تأكد من تشغيل migration الخاصة بالمواقع.`}); }
  }

  // Admin-only application data backup. Export is paginated and reports
  // table failures instead of silently turning failed queries into empty data.
  const BACKUP_TABLES = ['companies','users','merchants','drivers','governorates','areas','orders','shipments','delivery_jobs','delivery_job_shipments','delivery_job_orders','order_history','return_orders','return_transactions','return_transaction_attachments','return_operations','deleted_orders','scan_driver_records','merchant_settlements','shipper_settlement_records','shipper_settlement_items','driver_settlements','driver_commissions','driver_commission_payments','expenses','driver_expenses','shipment_status_history','audit_logs','company_financial_transactions','company_financial_adjustments','merchant_adjustments','adjustment_proofs','settlement_proofs','shipper_rates','shipper_rate_history','driver_locations','notifications','chat_conversations','chat_conversation_members','chat_messages','payroll_employees','payroll_periods','payroll_items','payroll_adjustments','payroll_receipts'];
  const scrubBackupRow = (table, row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const out = {...row};
    if (table === 'users') for (const k of Object.keys(out)) if (/password|token|secret|refresh|session|credential/i.test(k)) delete out[k];
    for (const k of Object.keys(out)) if (/consumer_secret|access_token|refresh_token|api_secret|private_key/i.test(k)) delete out[k];
    return out;
  };
  async function exportBackupForUser(user) {
    const companyId = await resolveCompanyId(user);
    const tables = {}, tableErrors = [];
    for (const table of BACKUP_TABLES) {
      const rows = []; let offset = 0;
      try {
        while (true) {
          const query = {select:'*', limit:1000, offset};
          if (table === 'companies' && companyId) query.id = `eq.${companyId}`;
          else if (companyId) query.company_id = `eq.${companyId}`;
          const page = await dbSelect(table, query);
          if (!Array.isArray(page)) throw new Error('استجابة قاعدة البيانات غير متوقعة');
          rows.push(...page.map(row => scrubBackupRow(table,row)));
          if (page.length < 1000) break;
          offset += page.length;
          if (offset > 500000) throw new Error('تجاوز الجدول حد النسخ الآمن 500000 سجل');
        }
        tables[table] = rows;
      } catch(e) {
        const message=String(e.message||e);
        // Legacy installations do not have every optional table. Record it as a warning;
        // only fail the backup when one of the core operational tables is unavailable.
        const missingTable = /does not exist|Could not find the table|schema cache|relation .* not found|PGRST205/i.test(message);
        const core = ['users','drivers','merchants','orders','shipments'].includes(table);
        if (missingTable && !core) { tables[table]=[]; tableErrors.push({table,error:message.slice(0,220),optional:true}); }
        else tableErrors.push({table,error:message.slice(0,220),optional:false});
      }
    }
    const fatalErrors=tableErrors.filter(x=>!x.optional);
    return {success:fatalErrors.length===0,format:'trend-delivery-backup-v2',created_at:new Date().toISOString(),company_id:companyId,tables,table_errors:tableErrors,backup_warnings:tableErrors.filter(x=>x.optional)};
  }
  if (pathname === '/api/settings/backup' && req.method === 'GET') {
    const user = await requireRole(req,res,'backup_restore'); if (!user) return;
    try { const backup=await exportBackupForUser(user); if(!backup.success) return json(res,503,{...backup,error:'تعذر نسخ الجداول الأساسية؛ راجع تفاصيل table_errors.'}); return json(res,200,backup); }
    catch(e) { return json(res,500,{success:false,error:`تعذر إنشاء النسخة الاحتياطية: ${e.message}`}); }
  }
  if (pathname === '/api/settings/backup-email' && req.method === 'POST') {
    const user = await requireRole(req,res,'backup_restore'); if (!user) return;
    try {
      const body=await bodyJson(req), email=String(body.email||'').trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res,400,{success:false,error:'اكتب بريدًا إلكترونيًا صحيحًا'});
      if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS||!process.env.SMTP_FROM) return json(res,503,{success:false,error:'إرسال البريد غير مضبوط. أضف SMTP_HOST وSMTP_PORT وSMTP_USER وSMTP_PASS وSMTP_FROM في متغيرات بيئة الاستضافة.'});
      const backup=await exportBackupForUser(user);
      if(!backup.success) return json(res,503,{success:false,error:'لم يتم إرسال النسخة لأن جدولًا أساسيًا فشل نسخه.',table_errors:backup.table_errors});
      const nodemailer=require('nodemailer'), port=Number(process.env.SMTP_PORT||587), payload=Buffer.from(JSON.stringify(backup,null,2),'utf8');
      if(payload.length>20*1024*1024) return json(res,413,{success:false,error:'حجم النسخة أكبر من 20MB؛ استخدم تنزيل النسخة.'});
      const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:String(process.env.SMTP_SECURE||'').toLowerCase()==='true'||port===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
      await transporter.sendMail({from:process.env.SMTP_FROM,to:email,subject:`Trend Delivery Service Backup ${egyptTodayISO()}`,text:`نسخة احتياطية لبيانات Trend Delivery Service.\nوقت الإنشاء: ${backup.created_at}\nاحتفظ بالمرفق في مكان آمن.`,attachments:[{filename:`trend-delivery-backup-${egyptTodayISO()}.json`,content:payload,contentType:'application/json'}]});
      await audit(user,'email_application_backup','backup',null,{email,bytes:payload.length});
      return json(res,200,{success:true,message:'تم إرسال النسخة الاحتياطية إلى البريد المحدد.'});
    } catch(e) { return json(res,500,{success:false,error:`تعذر إرسال النسخة بالبريد: ${String(e.message||e).slice(0,250)}`}); }
  }
  if (pathname === '/api/settings/backup-schedule' && (req.method === 'GET' || req.method === 'POST')) {
    const user=await requireRole(req,res,'backup_restore'); if(!user)return;
    const companyId=await resolveCompanyId(user),smtpConfigured=Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASS&&process.env.SMTP_FROM);
    if(req.method==='GET'){
      try{const cfg=firstRow(await dbSelect('backup_schedules',{select:'*',company_id:`eq.${companyId}`,limit:1}));return json(res,200,{success:true,enabled:!!cfg?.enabled,frequency:cfg?.frequency||'weekly',email:cfg?.email||'',day:Number(cfg?.day??1),hour:Number(cfg?.hour??2),last_run_key:cfg?.last_run_key||'',last_run_at:cfg?.last_run_at||null,last_attempt_at:cfg?.last_attempt_at||null,last_error:cfg?.last_error||'',updated_at:cfg?.updated_at||null,smtp_configured:smtpConfigured});}
      catch(e){return json(res,503,{success:false,error:'تعذر قراءة إعدادات النسخ الاحتياطي. شغّل backup-schedule-migration.sql في Supabase أولاً. '+e.message,smtp_configured:smtpConfigured});}
    }
    try{
      const body=await bodyJson(req),email=String(body.email||'').trim(),frequency=String(body.frequency||'weekly'),day=Number(body.day),hour=Number(body.hour??2),enabled=body.enabled===true;
      if(enabled&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json(res,400,{success:false,error:'اكتب بريدًا إلكترونيًا صحيحًا'});
      if(!['weekly','monthly'].includes(frequency))return json(res,400,{success:false,error:'اختار أسبوعي أو شهري'});
      if(!Number.isInteger(hour)||hour<0||hour>23)return json(res,400,{success:false,error:'الساعة غير صحيحة'});
      if(!Number.isInteger(day)||day<(frequency==='weekly'?0:1)||day>(frequency==='weekly'?6:28))return json(res,400,{success:false,error:frequency==='weekly'?'اختار يوم الأسبوع (0 الأحد إلى 6 السبت)':'اختار يوم الشهر من 1 إلى 28'});
      if(enabled&&!smtpConfigured)return json(res,503,{success:false,error:'لا يمكن تفعيل النسخ التلقائي قبل ضبط SMTP_HOST وSMTP_PORT وSMTP_USER وSMTP_PASS وSMTP_FROM في متغيرات بيئة الاستضافة.'});
      const existing=firstRow(await dbSelect('backup_schedules',{select:'last_run_key,last_run_at,last_attempt_at,last_error',company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
      const cfg={company_id:companyId,enabled,frequency,day,hour,email,updated_at:new Date().toISOString(),last_run_key:existing?.last_run_key||'',last_run_at:existing?.last_run_at||null,last_attempt_at:existing?.last_attempt_at||null,last_error:existing?.last_error||''};
      await supabaseRequest('backup_schedules',{method:'POST',query:{on_conflict:'company_id'},body:cfg,prefer:'resolution=merge-duplicates,return=representation'});
      return json(res,200,{success:true,message:enabled?'تم حفظ جدول النسخ الاحتياطي التلقائي.':'تم إيقاف النسخ الاحتياطي التلقائي.',...cfg,smtp_configured:smtpConfigured});
    }catch(e){return json(res,500,{success:false,error:`تعذر حفظ جدول النسخ الاحتياطي: ${e.message}`});}
  }
  if (pathname === '/api/settings/restore' && req.method === 'POST') {
    const user = await requireRole(req,res,'backup_restore'); if (!user) return;
    try {
      const body=await bodyJson(req,100*1024*1024);
      if(!['trend-delivery-backup-v1','trend-delivery-backup-v2'].includes(body.format)||!body.tables||typeof body.tables!=='object'||Array.isArray(body.tables)) return json(res,400,{success:false,error:'ملف النسخة الاحتياطية غير صالح أو غير مدعوم'});
      const companyId=await resolveCompanyId(user), results=[];
      for(const table of BACKUP_TABLES){
        const rows=body.tables[table]; if(rows===undefined) continue;
        if(!Array.isArray(rows)){results.push({table,count:0,status:'skipped',reason:'بيانات الجدول ليست قائمة'});continue;}
        if(rows.length>500000)return json(res,400,{success:false,error:`عدد السجلات كبير في ${table}`});
        const scoped=rows.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)&&(!companyId||(table==='companies'?String(row.id)===String(companyId):(!row.company_id||String(row.company_id)===String(companyId))))).map(row=>scrubBackupRow(table,row));
        if(!scoped.length){results.push({table,count:0,status:'empty'});continue;}
        if(scoped.some(row=>!row.id)){results.push({table,count:0,status:'skipped',reason:'بعض السجلات لا تحتوي id لاستعادة آمنة'});continue;}
        try { for(let i=0;i<scoped.length;i+=250) await supabaseRequest(table,{method:'POST',query:{on_conflict:'id'},body:scoped.slice(i,i+250),prefer:'resolution=merge-duplicates,return=minimal',timeout:30000}); results.push({table,count:scoped.length,status:'restored'}); }
        catch(e){results.push({table,count:0,status:'failed',reason:String(e.message||'').slice(0,180)});}
      }
      await audit(user,'restore_application_backup','backup',null,{tables:results.map(x=>({table:x.table,count:x.count,status:x.status}))});
      const failed=results.filter(x=>['failed','skipped'].includes(x.status));
      return json(res,failed.length?207:200,{success:failed.length===0,message:failed.length?'اكتملت الاستعادة جزئيًا؛ راجع نتائج الجداول.':'تم دمج السجلات المدعومة. لم يتم حذف السجلات غير الموجودة في الملف.',results});
    } catch(e){return json(res,500,{success:false,error:`تعذرت الاستعادة: ${e.message}`});}
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    return json(res, 200, {
      success: true,
      status: 'ok',
      app: settings.appName,
      port: PORT,
      supabase: Boolean(SUPABASE_URL && SUPABASE_KEY),
      environment: NODE_ENV,
      requests: requests.count,
      time: new Date().toISOString()
    });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = await bodyJson(req);
      const username = cleanString(body.username || body.email).toLowerCase();
      const password = String(body.password || '');
      if (!username || !password) return json(res, 400, { success: false, error: 'أدخل اسم المستخدم وكلمة المرور' });

      const loginAuthStartedAt = Date.now();
      const user = await loginUser(username, password);
      console.info('[LOGIN TIMING] credential_and_permission_lookup_ms=' + (Date.now() - loginAuthStartedAt));
      if (!user) {
        try {
          const ipAddress = String(req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '').slice(0, 100);
          const companyId = await getFirstCompanyId();
          const recent = await dbSelect('audit_logs', { select: 'details,created_at', company_id: 'eq.' + companyId, action: 'eq.login_failed', order: 'created_at.desc', limit: 100 });
          const cutoff = Date.now() - 15 * 60 * 1000;
          const attempts = (recent || []).filter(row => Date.parse(row.created_at || '') >= cutoff && String(row.details?.username || '').toLowerCase() === username && String(row.details?.ip_address || '') === ipAddress).length + 1;
          await dbInsert('audit_logs', { company_id: companyId, user_id: null, action: 'login_failed', entity_type: 'security', entity_id: null, details: { username: username.slice(0, 120), ip_address: ipAddress, attempts_in_15m: attempts, event_at: new Date().toISOString() } }, { prefer: 'return=minimal' });
          if (attempts >= 3 && [3, 5, 10].includes(attempts)) await dbInsert('audit_logs', { company_id: companyId, user_id: null, action: 'suspicious_activity', entity_type: 'security', entity_id: null, details: { reason: 'repeated_failed_logins', username: username.slice(0, 120), ip_address: ipAddress, attempts_in_15m: attempts, event_at: new Date().toISOString() } }, { prefer: 'return=minimal' });
        } catch (securityLogError) { console.warn('FAILED LOGIN AUDIT WARNING:', securityLogError?.message || securityLogError); }
        return json(res, 401, { success: false, error: 'بيانات الدخول غير صحيحة' });
      }
      const deviceToken = cookieValue(req, 'trend_device_id') || crypto.randomUUID();
      let loginDeviceAuditDetails = null;

      // Record a browser/device fingerprint and client IP for login auditing.
      // Authentication tokens and passwords are never stored in the audit log.
      try {
        const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
        const platform = String(req.headers['sec-ch-ua-platform'] || '').slice(0, 80);
        const language = String(req.headers['accept-language'] || '').split(',')[0].slice(0, 20);
        // A first-party random cookie distinguishes separate browser profiles,
        // unlike a user-agent-only fingerprint that merges every phone of one type.
        const deviceId = sha256(deviceToken).slice(0, 32);
        const deviceLabel = /iphone|ipad/i.test(userAgent) ? 'iPhone/iPad' :
          /android/i.test(userAgent) ? 'Android' :
          /windows/i.test(userAgent) ? 'Windows' :
          /macintosh|mac os/i.test(userAgent) ? 'Mac' :
          /linux/i.test(userAgent) ? 'Linux' : 'Browser/Unknown';
        const ipAddress = String(req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '').slice(0, 100);
        loginDeviceAuditDetails = { device_id: deviceId, device_label: deviceLabel, user_agent: userAgent.slice(0, 180), ip_address: ipAddress, platform, language, login_at: new Date().toISOString() };
      } catch (deviceLogError) {
        console.warn('LOGIN DEVICE AUDIT WARNING:', deviceLogError?.message || deviceLogError);
      }

      // Do not make login dependent on Supabase Auth Admin. The application
      // already authenticates the Trend user above. Create one stable, signed,
      // HttpOnly first-party session that survives refresh/redeploy.
      try {
        const session = await createPersistentSession(user);
        const secure = requestIsSecure(req) ? '; Secure' : '';
        res.setHeader('Set-Cookie', [
          sessionCookie(req, session.token),
          `trend_device_id=${encodeURIComponent(deviceToken)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
        ]);

        // Device/security audit remains enabled, but it must not hold the
        // successful login response open while several optional audit queries
        // complete on a slow or degraded database connection.
        const auditDetails = loginDeviceAuditDetails
          ? { ...loginDeviceAuditDetails, token_hash: hashSessionToken(session.token) }
          : null;
        loginDeviceAuditDetails = null;
        const response = json(res, 200, { success: true, user, sessionToken: session.token });
        if (auditDetails) {
          setImmediate(() => {
            void (async () => {
              const companyId = user.company_id || await getFirstCompanyId();
              const previous = await dbSelect('audit_logs', {
                select: 'details', company_id: 'eq.' + companyId,
                user_id: user.id === 'env-admin' ? 'is.null' : 'eq.' + user.id,
                action: 'eq.login_device', order: 'created_at.desc', limit: 100
              }).catch(() => []);
              const isNewDevice = !(previous || []).some(row =>
                row.details && String(row.details.device_id || '') === String(auditDetails.device_id)
              );
              await audit(user, 'login_device', 'user', user.id, auditDetails);
              if (isNewDevice && companyId) {
                await dbInsert('audit_logs', {
                  company_id: companyId, user_id: null, action: 'suspicious_activity',
                  entity_type: 'security', entity_id: null,
                  details: {
                    reason: 'new_device_login', user_id: user.id,
                    username: user.username || user.name, device_id: auditDetails.device_id,
                    device_label: auditDetails.device_label, ip_address: auditDetails.ip_address,
                    event_at: new Date().toISOString()
                  }
                }, { prefer: 'return=minimal' });
              }
            })().catch(deviceLogError => console.warn('LOGIN DEVICE AUDIT WARNING:', deviceLogError?.message || deviceLogError));
          });
        }
        return response;
      } catch (sessionError) {
        console.error('PERSISTENT SESSION CREATE ERROR:', sessionError);
        try { const companyId = user.company_id || await getFirstCompanyId(); if (companyId) await dbInsert('audit_logs', { company_id: companyId, user_id: user.id === 'env-admin' ? null : user.id, action: 'system_error', entity_type: 'security', entity_id: null, details: { source: 'session_create', message: String(sessionError?.message || sessionError).slice(0, 300), username: user.username || user.name, event_at: new Date().toISOString() } }, { prefer: 'return=minimal' }); } catch (_) {}
        return json(res, 503, { success: false, error: 'تعذر حفظ جلسة الدخول. لم يتم تسجيل الدخول؛ حاول مرة أخرى.' });
      }
    } catch (error) {
      console.error('LOGIN ERROR:', error);
      return json(res, 500, { success: false, error: error.message || 'فشل تسجيل الدخول' });
    }
  }

  if (pathname === '/api/build-info' && req.method === 'GET') {
    return json(res, 200, {
      success: true,
      build: 'GPS-RETURN-HISTORY-REFRESH-20261019-28',
      server: 'trend-delivery-service',
      features: { companyNameReadbackVerification: true, companyLogoReadbackVerification: true, brandingDiagnostic: true, wantedCustomersWarning: true, shipperSettlementEligibilityFix: true, invoiceGroupedByMerchant: true, merchantOrderDetailPdf: true, settlementStatusAndProofActions: true, permissionGroupEditorTwoColumns: true, returnTimelineFromStatusHistory: true, historicalDriverAssignmentTimeline: true, driverGpsAccuracyAndRefresh: true, merchantPortalAccountManagement: true }
    });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    // The sidebar is built from /api/me. Force a fresh group lookup here so a
    // cached empty/stale permission snapshot cannot keep every page hidden
    // after the employee or permission group was edited on another instance.
    const user = await requireAuth(req, res, { forceRefresh: true });
    if (!user) return;
    let deviceUsage = null;
    if (String(user.role || '').toLowerCase() === 'admin') {
      try {
        const companyId = await resolveCompanyId(user);
        const loginRows = await dbSelect('audit_logs', {
          select: 'user_id,entity_id,details,created_at',
          company_id: `eq.${companyId}`, action: 'eq.login_device',
          order: 'created_at.desc', limit: 5000
        });
        const byUser = new Map();
        for (const row of loginRows || []) {
          const targetUserId = String(row.user_id || row.entity_id || '');
          if (!targetUserId) continue;
          const details = row.details && typeof row.details === 'object' ? row.details : {};
          const deviceId = String(details.device_id || '');
          if (!deviceId) continue;
          const entry = byUser.get(targetUserId) || { devices: new Set(), last_login_at: '' };
          entry.devices.add(deviceId);
          if (!entry.last_login_at || String(row.created_at || '') > entry.last_login_at) entry.last_login_at = String(row.created_at || '');
          byUser.set(targetUserId, entry);
        }
        const own = byUser.get(String(user.id));
        deviceUsage = { tracked: true, devices: own ? own.devices.size : 0, last_login_at: own?.last_login_at || null,
          note: 'Device counting starts when device tracking is enabled; older logins are not available.' };
      } catch (deviceReadError) {
        deviceUsage = { tracked: false, error: 'تعذر قراءة سجل الأجهزة؛ تحقق من صلاحية قراءة audit_logs.' };
      }
    }
    return json(res, 200, { success: true, user, ...(deviceUsage ? { deviceUsage } : {}) });
  }

  if (pathname === '/api/admin/device-usage/revoke' && req.method === 'POST') {
    const admin = await requireAdmin(req, res); if (!admin) return;
    try {
      const body = await bodyJson(req), targetUserId = String(body.user_id || ''), deviceId = String(body.device_id || '');
      if (!targetUserId || !deviceId) return json(res, 400, { success: false, error: 'حدد المستخدم والجهاز أولاً' });
      const companyId = await resolveCompanyId(admin);
      const rows = await dbSelect('audit_logs', { select: 'user_id,entity_id,details,created_at', company_id: 'eq.' + companyId, action: 'eq.login_device', order: 'created_at.desc', limit: 10000 });
      const matches = (rows || []).filter(row => String(row.user_id || row.entity_id || '') === targetUserId && String(row.details?.device_id || '') === deviceId && row.details?.token_hash);
      if (!matches.length) return json(res, 404, { success: false, error: 'لا توجد جلسة قابلة للإلغاء لهذا الجهاز. سجّل الدخول من الجهاز مرة واحدة بعد التحديث.' });
      const hashes = [...new Set(matches.map(row => String(row.details.token_hash)))];
      for (const tokenHash of hashes) await revokeSessionTokenHash(tokenHash, targetUserId);
      await audit(admin, 'admin_revoke_device_session', 'user', targetUserId, { device_id: deviceId, revoked_sessions: hashes.length, ip_address: matches[0].details.ip_address || null });
      return json(res, 200, { success: true, message: 'تم إنهاء ' + hashes.length + ' جلسة مرتبطة بهذا الجهاز.' });
    } catch (error) { return json(res, 500, { success: false, error: error.message || 'تعذر إنهاء الجلسة' }); }
  }

  if (pathname === '/api/admin/security-monitor' && req.method === 'GET') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const [suspicious, failed, errors, backups] = await Promise.all([
        dbSelect('audit_logs', { select: 'action,details,created_at', company_id: 'eq.' + companyId, action: 'eq.suspicious_activity', order: 'created_at.desc', limit: 100 }).catch(() => []),
        dbSelect('audit_logs', { select: 'action,details,created_at', company_id: 'eq.' + companyId, action: 'eq.login_failed', order: 'created_at.desc', limit: 100 }).catch(() => []),
        dbSelect('audit_logs', { select: 'action,details,created_at', company_id: 'eq.' + companyId, action: 'eq.system_error', order: 'created_at.desc', limit: 100 }).catch(() => []),
        dbSelect('backup_schedules', { select: '*', company_id: 'eq.' + companyId, limit: 1 }).catch(() => [])
      ]);
      const backup = firstRow(backups) || null;
      return json(res, 200, { success: true, suspicious: suspicious || [], failed_logins: failed || [], errors: errors || [],
        backup: backup ? { configured: true, enabled: Boolean(backup.enabled), frequency: backup.frequency || backup.schedule || null, last_success_at: backup.last_run_at || backup.last_success_at || null, last_attempt_at: backup.last_attempt_at || null, last_error: backup.last_error || backup.error_message || null } : { configured: false, enabled: false, last_success_at: null, last_attempt_at: null, last_error: 'لا توجد بيانات إعدادات النسخ الاحتياطي في الجدول المتوقع' },
        server: { checked_at: new Date().toISOString(), uptime_seconds: Math.round(process.uptime()), environment: NODE_ENV } });
    } catch (error) { return json(res, 500, { success: false, error: error.message || 'تعذر قراءة مراقبة النظام' }); }
  }

  if (pathname === '/api/admin/device-usage' && req.method === 'GET') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const [users, loginRows] = await Promise.all([
        dbSelect('users', { select: 'id,name,username,employee_code', company_id: `eq.${companyId}`, limit: 5000 }),
        dbSelect('audit_logs', { select: 'user_id,entity_id,details,created_at', company_id: `eq.${companyId}`, action: 'eq.login_device', order: 'created_at.desc', limit: 10000 })
      ]);
      const byId = new Map((users || []).map(row => [String(row.id), row]));
      const usage = new Map();
      for (const row of loginRows || []) {
        const id = String(row.user_id || row.entity_id || '');
        const details = row.details && typeof row.details === 'object' ? row.details : {};
        const deviceId = String(details.device_id || '');
        if (!id || !deviceId) continue;
        const entry = usage.get(id) || { deviceIds: new Set(), devices: [], last_login_at: null };
        entry.deviceIds.add(deviceId);
        if (!entry.devices.some(d => d.device_id === deviceId)) entry.devices.push({
          device_id: deviceId, device_label: String(details.device_label || 'Browser/Unknown'),
          ip_address: String(details.ip_address || ''),
          last_login_at: row.created_at || details.login_at || null
        });
        if (!entry.last_login_at || String(row.created_at || '') > entry.last_login_at) entry.last_login_at = String(row.created_at || '');
        usage.set(id, entry);
      }
      const data = [...usage.entries()].map(([id, entry]) => {
        const employee = byId.get(id) || {};
        return { user_id: id, username: employee.username || employee.name || employee.employee_code || id,
          device_count: entry.deviceIds.size, last_login_at: entry.last_login_at,
          devices: entry.devices.slice(0, 20) };
      }).sort((a, b) => b.device_count - a.device_count || String(b.last_login_at || '').localeCompare(String(a.last_login_at || '')));
      return json(res, 200, { success: true, tracked_since: 'feature activation', data,
        note: 'Counts represent distinct browser/device fingerprints seen at login, not a guaranteed count of physical devices. Historical logins before activation are unavailable.' });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message || 'تعذر قراءة سجل الأجهزة' });
    }
  }

  if (pathname === '/api/permission-diagnostic' && req.method === 'GET') {
    // Safe, read-only diagnostic for the currently authenticated account only.
    // Never return tokens, passwords, or data belonging to another employee.
    const user = await requireAuth(req, res, { forceRefresh: true });
    if (!user) return;
    const diagnostic = {
      build: 'PERMISSION-DIAGNOSTIC-20261021-1',
      user: { id: user.id, role: user.role || null, company_id: user.company_id || null },
      roleLink: null,
      roleRecord: null,
      rolePermissionIds: [],
      permissionCodes: [],
      effectivePermissions: user.permissions || {},
      checks: {},
      errors: []
    };
    try {
      const links = await dbSelect('user_roles', {
        select: 'user_id,role_id',
        user_id: `eq.${user.id}`,
        limit: 10
      });
      diagnostic.checks.userRoleLinkCount = links.length;
      diagnostic.roleLink = links[0] || null;
      if (links.length !== 1) diagnostic.errors.push(`Expected exactly one user_roles row; found ${links.length}`);
      const roleId = diagnostic.roleLink?.role_id;
      if (roleId) {
        const roleRows = await dbSelect('roles', {
          select: 'id,name,company_id',
          id: `eq.${roleId}`,
          limit: 2
        });
        diagnostic.checks.roleRecordCount = roleRows.length;
        diagnostic.roleRecord = roleRows[0] || null;
        if (!diagnostic.roleRecord) diagnostic.errors.push('Assigned role_id does not resolve to a roles row');
        if (diagnostic.roleRecord?.company_id && user.company_id && String(diagnostic.roleRecord.company_id) !== String(user.company_id)) {
          diagnostic.errors.push('Assigned role company_id does not match the employee company_id');
        }
        const [rolePermissionRows, allPermissions] = await Promise.all([
          dbSelect('role_permissions', { select: 'permission_id', role_id: `eq.${roleId}`, limit: 1000 }),
          dbSelect('permissions', { select: 'id,code,name', limit: 1000 })
        ]);
        diagnostic.rolePermissionIds = rolePermissionRows.map(row => String(row.permission_id || '')).filter(Boolean);
        const idSet = new Set(diagnostic.rolePermissionIds);
        diagnostic.permissionCodes = allPermissions
          .filter(row => idSet.has(String(row.id)))
          .map(row => ({ id: String(row.id), code: String(row.code || ''), name: String(row.name || '') }));
        diagnostic.checks.rolePermissionLinkCount = rolePermissionRows.length;
        diagnostic.checks.matchedPermissionCount = diagnostic.permissionCodes.length;
        diagnostic.checks.unmatchedPermissionLinkCount = Math.max(0, rolePermissionRows.length - diagnostic.permissionCodes.length);
        if (diagnostic.checks.unmatchedPermissionLinkCount) diagnostic.errors.push('Some role_permissions permission_id values do not match permissions.id');
      } else {
        diagnostic.errors.push('No role_id is assigned to this employee; permissions cannot be resolved from a group');
      }
    } catch (error) {
      diagnostic.errors.push(String(error?.message || error));
    }
    diagnostic.checks.hasAnyEffectivePermission = Object.entries(diagnostic.effectivePermissions)
      .some(([key, value]) => key !== 'admin_tools' && (value === true || value === 1 || value === 'true' || value === '1'));
    return json(res, 200, { success: true, diagnostic });
  }

  if (pathname === '/api/session-diagnostic' && req.method === 'GET') {
    const cookieToken = cookieValue(req, SESSION_COOKIE_NAME);
    const authHeader = String(req.headers.authorization || '');
    const bearerToken = /^Bearer\s+/i.test(authHeader) ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    const cookieUser = readStatelessSessionToken(cookieToken);
    const bearerUser = readStatelessSessionToken(bearerToken);
    return json(res, 200, {
      success: true,
      build: 'AUTH-SESSION-RECOVERY-20261012-10',
      hasCookie: Boolean(cookieToken),
      cookieValid: Boolean(cookieUser),
      hasBearer: Boolean(bearerToken),
      bearerValid: Boolean(bearerUser),
      user: cookieUser || bearerUser || null
    });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    // The authentication session is the HttpOnly signed cookie. Clearing it is
    // the only operation needed for a manual logout. There is no database
    // dependency that can accidentally keep the user logged in or log them out.
    res.writeHead(200,{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'Set-Cookie':clearSessionCookie(req),
      'Access-Control-Allow-Origin':APP_ORIGIN||'*',
      'Access-Control-Allow-Headers':'Content-Type',
      'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'
    });
    return res.end(JSON.stringify({success:true}));
  }

  if (pathname === '/api/dashboard' && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const url = new URL(req.url, 'http://localhost');
      const requestedDate = cleanString(url.searchParams.get('date'));
      const data = await dashboardData(user, requestedDate);
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/order/next-serial' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders');
    if (!user) return;
    try {
      const serial = await nextSerial(user);
      return json(res, 200, { success: true, serial, next: serial });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/order/next-job-code' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders');
    if (!user) return;
    try {
      const next = await nextJobCode(user);
      return json(res, 200, { success: true, next });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/orders' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders');
    if (!user) return;
    try {
      const data = await getRows('orders', user);
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  // Company-scoped wanted-customer list. This is warning-only and never blocks order creation.
  if (pathname === '/api/wanted-customers' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const data = await dbSelect('wanted_customers', { select: 'id,company_id,phone,phone_normalized,reason,created_at,updated_at', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 5000 });
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: `تعذر تحميل قائمة المطلوبين. تأكد من تنفيذ wanted-customers-migration.sql: ${error.message}` }); }
  }

  if (pathname === '/api/wanted-customers' && req.method === 'POST') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const body = await bodyJson(req); const companyId = await resolveCompanyId(user);
      const toDigits = value => String(value || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '');
      const phone = cleanString(body.phone); const phoneNormalized = toDigits(phone); const reason = cleanString(body.reason);
      if (phoneNormalized.length < 5) return json(res, 400, { success: false, error: 'أدخل رقم هاتف صحيحًا' });
      if (!reason) return json(res, 400, { success: false, error: 'سبب الإضافة مطلوب' });
      const duplicate = firstRow(await dbSelect('wanted_customers', { select: 'id', company_id: `eq.${companyId}`, phone_normalized: `eq.${phoneNormalized}`, limit: 1 }));
      if (duplicate) return json(res, 409, { success: false, error: 'رقم العميل موجود بالفعل في قائمة المطلوبين' });
      const inserted = firstRow(await dbInsert('wanted_customers', { company_id: companyId, phone, phone_normalized: phoneNormalized, reason, created_by: user.id, updated_by: user.id }));
      if (!inserted) throw new Error('لم يتم تأكيد حفظ الرقم في قاعدة البيانات');
      await audit(user, 'wanted_customer_add', 'wanted_customer', inserted.id, { phone: phoneNormalized });
      return json(res, 200, { success: true, data: inserted });
    } catch (error) { return json(res, 500, { success: false, error: `تعذر حفظ الرقم. تأكد من تنفيذ wanted-customers-migration.sql: ${error.message}` }); }
  }

  const wantedCustomerMatch = pathname.match(/^\/api\/wanted-customers\/([^/]+)$/);
  if (wantedCustomerMatch && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const id = decodeURIComponent(wantedCustomerMatch[1]); const body = await bodyJson(req); const companyId = await resolveCompanyId(user);
      const toDigits = value => String(value || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '');
      const phone = cleanString(body.phone); const phoneNormalized = toDigits(phone); const reason = cleanString(body.reason);
      if (phoneNormalized.length < 5) return json(res, 400, { success: false, error: 'أدخل رقم هاتف صحيحًا' });
      if (!reason) return json(res, 400, { success: false, error: 'سبب الإضافة مطلوب' });
      const duplicate = firstRow(await dbSelect('wanted_customers', { select: 'id', company_id: `eq.${companyId}`, phone_normalized: `eq.${phoneNormalized}`, limit: 1 }));
      if (duplicate && String(duplicate.id) !== String(id)) return json(res, 409, { success: false, error: 'رقم العميل موجود بالفعل في قائمة المطلوبين' });
      const updated = firstRow(await dbUpdate('wanted_customers', { id: `eq.${id}`, company_id: `eq.${companyId}` }, { phone, phone_normalized: phoneNormalized, reason, updated_by: user.id, updated_at: new Date().toISOString() }));
      if (!updated) return json(res, 404, { success: false, error: 'لم يتم العثور على الرقم المطلوب تعديله' });
      await audit(user, 'wanted_customer_update', 'wanted_customer', id, { phone: phoneNormalized });
      return json(res, 200, { success: true, data: updated });
    } catch (error) { return json(res, 500, { success: false, error: `تعذر تعديل الرقم: ${error.message}` }); }
  }
  if (wantedCustomerMatch && req.method === 'DELETE') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const id = decodeURIComponent(wantedCustomerMatch[1]); const companyId = await resolveCompanyId(user);
      const deleted = await dbDelete('wanted_customers', { id: `eq.${id}`, company_id: `eq.${companyId}` });
      if (!Array.isArray(deleted) || !deleted.length) return json(res, 404, { success: false, error: 'لم يتم العثور على الرقم المطلوب حذفه' });
      await audit(user, 'wanted_customer_delete', 'wanted_customer', id, {});
      return json(res, 200, { success: true });
    } catch (error) { return json(res, 500, { success: false, error: `تعذر حذف الرقم: ${error.message}` }); }
  }

  if (pathname === '/api/orders/check-duplicate' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const merchantId = cleanString(url.searchParams.get('merchant_id'));
      const orderNo = cleanString(url.searchParams.get('merchant_order_no'));
      if (!merchantId || !orderNo) return json(res,200,{success:true,duplicate:false});
      const row = firstRow(await dbSelect('orders',{select:'id,merchant_order_no,merchant_id',company_id:`eq.${companyId}`,merchant_id:`eq.${merchantId}`,merchant_order_no:`eq.${encodeURIComponent(orderNo)}`,limit:1}).catch(()=>[]));
      return json(res,200,{success:true,duplicate:!!row,data:row||null});
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    const user = await requireRole(req, res, 'orders');
    if (!user) return;
    const createOrderStartedAt=Date.now();
    try {
      const body = await bodyJson(req);
      const result = await createOrder(user, body);
      return json(res, 200, { success: true, ...result, duration_ms: Date.now()-createOrderStartedAt });
    } catch (error) {
      console.error('CREATE ORDER ERROR:', error);
      return json(res, 500, { success: false, error: error.message || 'فشل إنشاء الأوردر', duration_ms: Date.now()-createOrderStartedAt });
    }
  }


  if (pathname === '/api/orders/export' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const orders = await dbSelect('orders', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 5000 });
      const merchants = await dbSelect('merchants', { select: 'id,name,merchant_no,code', company_id: `eq.${companyId}`, limit: 5000 }).catch(() => []);
      const merchantMap = new Map(merchants.map(m => [String(m.id), m]));
      const ids = orders.map(o => o.id).filter(Boolean);
      const shipments = [];
      for (const id of ids) {
        try { const rows = await dbSelect('shipments', { select: 'order_id,shipment_no,tracking_number,status', order_id: `eq.${id}`, limit: 1 }); if (rows[0]) shipments.push(rows[0]); } catch (_) {}
      }
      const shMap = new Map(shipments.map(x => [String(x.order_id), x]));
      return json(res, 200, { success: true, data: orders.map(o => {
        const m = merchantMap.get(String(o.merchant_id)) || {}; const sh = shMap.get(String(o.id)) || {};
        return { ...o, shipment_no: sh.shipment_no || '', tracking_number: sh.tracking_number || '', shipment_status: sh.status || '', merchant_name: m.name || '', merchant_no: m.merchant_no || m.code || '' };
      }) });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/orders/import' && req.method === 'POST') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    const importStartedAt = Date.now();
    try {
      const body = await bodyJson(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const defaultMerchantId = body.default_merchant_id || body.defaultMerchantId || '';
      if (!rows.length) return json(res, 400, { success: false, error: 'ملف الأوردرات فارغ' });
      const requiredExcelColumns = ['اسم العميل','رقم العميل 1','سعر الاوردر cod'];
      const importedColumns = Object.keys(rows[0] || {}).map(k => String(k).replace(/^\uFEFF/, '').trim());
      const missingColumns = requiredExcelColumns.filter(k => !importedColumns.includes(k));
      if (missingColumns.length) return json(res, 400, { success: false, error: `أعمدة Excel ناقصة: ${missingColumns.join('، ')}` });
      const results = { imported: 0, skipped: 0, errors: [], labels: [] };
      const companyId = await resolveCompanyId(user);
      const merchants = await dbSelect('merchants', { select: 'id,name,merchant_no,code', company_id: `eq.${companyId}`, limit: 5000 });
      const importAreas = await dbSelect('areas', { select: 'id,name_ar,name_en,governorate_id', company_id: `eq.${companyId}`, limit: 5000 }).catch(() => []);
      const importGovernorates = await dbSelect('governorates', { select: 'id,name_ar,name_en', company_id: `eq.${companyId}`, limit: 2000 }).catch(() => []);
      const importAreaById = new Map(importAreas.map(a => [String(a.id), a]));
      const importGovernorateById = new Map(importGovernorates.map(g => [String(g.id), g]));
      const normalizeExcel = (value) => String(value ?? '').trim().toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ');
      const emirateNames = (g) => [g?.id, g?.name_ar, g?.name_en].filter(Boolean).map(normalizeExcel);
      const areaNames = (a) => [a?.id, a?.name_ar, a?.name_en].filter(Boolean).map(normalizeExcel);
      const merchantByKey = new Map();
      for (const m of merchants) {
        const name = normalizeExcel(m.name);
        const code = normalizeExcel(m.merchant_no || m.code);
        if (name && code) {
          merchantByKey.set(`${name} - ${code}`, m);
          merchantByKey.set(`${name} — ${code}`, m);
          merchantByKey.set(`${name} ${code}`, m);
        }
      }
      // Parallelize only when atomic counters are installed and this file has no
      // repeated phone/order keys. Otherwise keep the safe sequential legacy path.
      const normalizedOrderKey = (r) => normalizeExcel(r?.['رقم الاوردر'] || r?.merchant_order_no || r?.order_number || r?.order_no || r?.['رقم الأوردر'] || r?.['رقم أوردر التاجر'] || '');
      const normalizedPhoneKey = (r) => normalizeExcel(r?.['رقم العميل 1'] || r?.customer_phone || r?.phone || r?.['هاتف العميل'] || r?.['رقم العميل'] || '');
      const orderKeys = rows.map(normalizedOrderKey).filter(Boolean);
      const phoneKeys = rows.map(normalizedPhoneKey).filter(Boolean);
      const hasRepeatedKeys = new Set(orderKeys).size !== orderKeys.length || new Set(phoneKeys).size !== phoneKeys.length;
      const canParallelize = !hasRepeatedKeys && await atomicCounterHealth(user);
      const rowLabels = new Array(rows.length);
      let nextImportIndex = 0;
      const processImportRow = async (i) => {
        const r = rows[i] || {};
        try {
          const merchantCell = cleanString(r['اسم التاجر وكوده'] || r.merchant_display || r.merchant || '');
          let merchantId = r.merchant_id || r.merchantId || r['معرف التاجر'] || r['merchant_id'] || defaultMerchantId;
          if (!merchantId && merchantCell) {
            const normalizedCell = normalizeExcel(merchantCell);
            const exact = merchantByKey.get(normalizedCell);
            if (exact) merchantId = exact.id;
            else {
              const matches = merchants.filter(m => {
                const name = normalizeExcel(m.name);
                const code = normalizeExcel(m.merchant_no || m.code);
                return name && code && (normalizedCell === `${name} - ${code}` || normalizedCell === `${name} — ${code}` || normalizedCell === `${name} ${code}`);
              });
              if (matches.length === 1) merchantId = matches[0].id;
              else if (matches.length > 1) throw new Error('بيانات التاجر والكود غير واضحة أو مكررة');
            }
          }
          if (!merchantId) throw new Error('التاجر غير موجود. استخدم اسم التاجر والكود الموجودين في النظام بنفس الصيغة.');
          const emirateCell = cleanString(r['الإمارة'] || r['اسم الإمارة'] || r.Emirate || r.emirate || r.governorate || r.Governorate || '');
          const regionCell = cleanString(r['المنطقة'] || r['اسم المنطقة'] || r.Region || r.region || r.Area || r.area || r.District || r.district || '');
          let resolvedGovId = null;
          let resolvedAreaId = null;
          {
            if (!emirateCell || !regionCell) throw new Error('يجب إدخال الإمارة والمنطقة معًا');
            const emirateKey = normalizeExcel(emirateCell);
            const emirateMatches = importGovernorates.filter(g => emirateNames(g).includes(emirateKey));
            if (emirateMatches.length !== 1) throw new Error(`الإمارة غير موجودة أو غير واضحة: ${emirateCell}`);
            resolvedGovId = emirateMatches[0].id;
            const regionKey = normalizeExcel(regionCell);
            const regionMatches = importAreas.filter(a => String(a.governorate_id || '') === String(resolvedGovId) && areaNames(a).includes(regionKey));
            if (regionMatches.length !== 1) throw new Error(`المنطقة غير موجودة داخل الإمارة المحددة: ${regionCell}`);
            resolvedAreaId = regionMatches[0].id;
          }
          const created = await createOrder(user, {
            merchant_id: merchantId,
            governorate_id: resolvedGovId,
            area_id: resolvedAreaId,
            merchant_order_no: r['رقم الاوردر'] || r.merchant_order_no || r.order_number || r.order_no || r['رقم الأوردر'] || r['رقم أوردر التاجر'],
            customer_name: r['اسم العميل'] || r.customer_name || r.customer || '',
            customer_phone: r['رقم العميل 1'] || r.customer_phone || r.phone || r['هاتف العميل'] || r['رقم العميل'],
            customer_phone_2: r['رقم العميل 2'] || r.customer_phone_2 || '',
            tracking_number: '', // Always generate tracking number in the system during import.
            shipment_no: '', // Always generate shipment number in the system during import.
            value: r['سعر الاوردر cod'] ?? r.value ?? r.order_value ?? r['قيمة الأوردر'],
            notes: r['ملاحظات'] || r.notes || '',
            shipment_status: 'to_be_pickup'
          });
          results.imported++;
          const order = created.order || {};
          const shipment = created.shipment || {};
          const merchant = merchants.find(m => String(m.id) === String(order.merchant_id)) || {};
          const area = importAreaById.get(String(shipment.area_id || order.area_id || '')) || null;
          const governorateId = shipment.governorate_id || order.governorate_id || area?.governorate_id || '';
          const governorate = importGovernorateById.get(String(governorateId)) || null;
          rowLabels[i] = {
            ...order,
            order,
            shipment,
            merchant,
            area,
            governorate,
            tracking_number: created.trackingNumber || shipment.tracking_number || '',
            shipment_no: shipment.shipment_no || shipment.shipment_number || shipment.serial_no || '',
            job_code: created.jobCode || shipment.job_code || '',
            merchant_label: merchant.name || '',
            area_name: area?.name_ar || area?.name_en || order.area_name || '',
            governorate_name: governorate?.name_ar || governorate?.name_en || order.governorate_name || ''
          };
        } catch (e) { results.skipped++; results.errors.push({ row: i + 2, error: e.message }); }
      };
      if (canParallelize) {
        const workerCount = Math.min(4, rows.length);
        await Promise.all(Array.from({ length: workerCount }, async () => {
          while (true) {
            const i = nextImportIndex++;
            if (i >= rows.length) return;
            await processImportRow(i);
          }
        }));
      } else {
        for (let i = 0; i < rows.length; i++) await processImportRow(i);
      }
      results.labels = rowLabels.filter(Boolean);
      results.errors.sort((a,b) => a.row - b.row);
      return json(res, 200, { success: true, ...results, import_mode: canParallelize ? 'parallel-batch' : 'safe-sequential', duration_ms: Date.now() - importStartedAt });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/orders' && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'orders');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      if (!body.id) return json(res, 400, { success: false, error: 'معرّف الأوردر مطلوب' });
      const data = await updateOrder(user, body.id, body);
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname.startsWith('/api/orders/') && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const id = pathname.split('/').pop();
      const companyId = await resolveCompanyId(user);
      const scoped = firstRow(await dbSelect('orders',{select:'id',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!scoped) return json(res,404,{success:false,error:'الأوردر غير موجود'});
      const data = await getOrderDetails(id);
      if (!data) return json(res, 404, { success: false, error: 'الأوردر غير موجود' });
      data.audit = await getOrderAuditTrail(data.order?.id, data.shipment?.id);
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/delivery-intelligence/data' && req.method === 'GET') {
    const tool = String(url.searchParams.get('tool') || '').trim().toLowerCase();
    if (!['order_monitor','order_distributor','accounts_monitor'].includes(tool)) return json(res,400,{success:false,error:'أداة غير صالحة'});
    const user = await requireRole(req,res,tool);
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const shipments = await listShipments('', '', companyId);
      let expenses = [], driverExpenses = [], driverSettlements = [], merchantSettlements = [], merchantStatements = [], merchantDirectory = [];
      let merchantStatementItems = [], merchantStatementItemsAvailable = false;
      let commissions = [], driverAccountEntries = [], commissionPayments = [], financialAdjustments = [];
      if (tool === 'accounts_monitor') {
        // Every source is company-scoped and independently optional for compatibility
        // with older database snapshots. In the current schema driver expenses are
        // rows in expenses with driver_id, not a separate driver_expenses table.
        const scoped = { company_id: `eq.${companyId}` };
        let allExpenses = [], legacyDriverExpenses = [];
        [allExpenses, legacyDriverExpenses, driverSettlements, merchantSettlements, merchantStatements, merchantDirectory,
          commissions, driverAccountEntries, commissionPayments, financialAdjustments] = await Promise.all([
          dbSelectAll('expenses',{select:'*',...scoped,order:'expense_date.desc,created_at.desc'}).catch(()=>[]),
          dbSelectAll('driver_expenses',{select:'*',...scoped,order:'created_at.desc'}).catch(()=>[]),
          dbSelectAll('driver_settlements',{select:'*',...scoped,order:'created_at.desc'}).catch(()=>[]),
          dbSelectAll('merchant_settlements',{select:'*',...scoped,order:'created_at.desc'}).catch(()=>[]),
          dbSelectAll('shipper_settlement_records',{select:'*',...scoped,order:'settlement_date.desc,created_at.desc'}).catch(()=>[]),
          dbSelectAll('merchants',{select:'id,name,merchant_no,code',...scoped,order:'name.asc'}).catch(()=>[]),
          dbSelectAll('driver_commissions',{select:'*',...scoped,order:'created_at.desc'}).catch(()=>[]),
          dbSelectAll('transactions',{select:'*',...scoped,order:'created_at.desc'}).catch(()=>[]),
          dbSelectAll('driver_commission_payments',{select:'*',...scoped,order:'created_at.desc'}).catch(()=>[]),
          dbSelectAll('company_financial_adjustments',{select:'*',...scoped,order:'transaction_date.desc,created_at.desc'}).catch(()=>[])
        ]);
        try {
          merchantStatementItems = await dbSelectAll('shipper_settlement_items',{select:'settlement_id,order_id,cod,company_id',...scoped,order:'created_at.desc'});
          merchantStatementItemsAvailable = true;
        } catch (error) {
          console.warn('ACCOUNTS MONITOR STATEMENT ITEMS WARNING:', error?.message || error);
        }
        expenses = (allExpenses || []).filter(x => !x.driver_id);
        const merchantNameById = new Map((merchantDirectory || []).map(x => [String(x.id), x.name || x.merchant_no || x.code || '']));
        merchantStatements = (merchantStatements || []).map(x => ({ ...x, merchant_name: merchantNameById.get(String(x.merchant_id || '')) || '' }));
        driverExpenses = (legacyDriverExpenses || []).length
          ? legacyDriverExpenses
          : (allExpenses || []).filter(x => Boolean(x.driver_id));
      }
      let drivers = [];
      if (tool === 'order_distributor') {
        drivers = await dbSelectAll('drivers',{select:'id,name,driver_no,active',company_id:`eq.${companyId}`,order:'name.asc'}).catch(()=>[]);
      }
      return json(res,200,{success:true,data:{shipments,expenses,driverExpenses,driverSettlements,merchantSettlements,merchantStatements,merchantStatementItems,merchantStatementItemsAvailable,commissions,driverAccountEntries,commissionPayments,financialAdjustments,drivers}});
    } catch (error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/delivery-intelligence/assign' && req.method === 'POST') {
    const user = await requireRole(req,res,'order_distributor');
    if (!user) return;
    let createdJob = null;
    try {
      const body = await bodyJson(req), companyId = await resolveCompanyId(user);
      const shipmentIds = uniqueArray(Array.isArray(body.shipment_ids) ? body.shipment_ids : []);
      if (!body.driver_id) return json(res,400,{success:false,error:'اختر المندوب قبل الإسناد'});
      if (!shipmentIds.length) return json(res,400,{success:false,error:'حدد أوردرًا واحدًا على الأقل'});
      const driver = firstRow(await dbSelect('drivers',{select:'id,name,active',id:`eq.${body.driver_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
      if (!driver || driver.active === false) return json(res,400,{success:false,error:'المندوب غير موجود أو غير نشط'});
      const rejected = [];
      for (const shipmentId of shipmentIds) {
        const sh = firstRow(await dbSelect('shipments',{select:'id,order_id,status,driver_id',id:`eq.${shipmentId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        if (!sh) { rejected.push(shipmentId); continue; }
        const o = firstRow(await dbSelect('orders',{select:'id,status',id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        const st = commissionStatusKey(o?.status || sh.status);
        const links = await dbSelect('delivery_job_shipments',{select:'id,delivery_job_id',shipment_id:`eq.${shipmentId}`,limit:20}).catch(()=>[]);
        if (sh.driver_id || st === 'assigned with driver' || links.length || !['receive at hub','in ops'].includes(st)) rejected.push(shipmentId);
      }
      if (rejected.length) return json(res,400,{success:false,error:'بعض الأوردرات لم تعد متاحة للإسناد؛ حدّث الكشف وحاول مرة أخرى.',rejected});
      const jobDate = cleanString(body.job_date) || egyptTodayISO();
      const jobCode = String(await nextJobCode(user));
      createdJob = firstRow(await dbInsert('delivery_jobs',{company_id:companyId,driver_id:body.driver_id,job_code:jobCode,status:'created',job_date:jobDate,expected_count:shipmentIds.length,received_count:0}));
      if (!createdJob?.id) throw new Error('فشل إنشاء كشف المندوب');
      for (const shipmentId of shipmentIds) {
        const sh = firstRow(await dbSelect('shipments',{select:'id,order_id',id:`eq.${shipmentId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        const order = sh?.order_id ? firstRow(await dbSelect('orders',{select:'id,serial_no,status',id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])) : null;
        const serialNo = await resolveShipmentSerial(user,sh,order);
        await dbInsert('delivery_job_shipments',{delivery_job_id:createdJob.id,shipment_id:shipmentId,serial_no:serialNo,serial_date:jobDate,delivery_job_code:createdJob.job_code},{prefer:'return=minimal'});
        await dbUpdate('shipments',{id:`eq.${shipmentId}`,company_id:`eq.${companyId}`},{status:'Assigned with Driver',driver_id:body.driver_id});
        await dbInsert('shipment_status_history',{shipment_id:shipmentId,status:'Assigned with Driver',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}).catch(()=>{});
        if (sh?.order_id) {
          await dbUpdate('orders',{id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`},{status:'Assigned with Driver',statement_removed_at:null,statement_removed_by:null,statement_removed_from_driver_id:null});
          await audit(user,'assign_order_to_driver','order',sh.order_id,{driver_id:body.driver_id,new_status:'Assigned with Driver',source:'delivery_intelligence_distributor'});
        }
      }
      await audit(user,'create_delivery_job','delivery_job',createdJob.id,{shipment_ids:shipmentIds,source:'delivery_intelligence_distributor'});
      return json(res,200,{success:true,data:createdJob});
    } catch (error) {
      console.error('INTELLIGENCE ASSIGN ERROR:',error);
      return json(res,500,{success:false,error:error.message||'تعذر إسناد الأوردرات'});
    }
  }


  if (pathname === '/api/delivery-intelligence/transfer' && req.method === 'POST') {
    const user = await requireRole(req,res,'order_distributor');
    if (!user) return;
    let createdJob = null;
    const touched = [];
    try {
      const body = await bodyJson(req), companyId = await resolveCompanyId(user);
      const shipmentIds = uniqueArray(Array.isArray(body.shipment_ids) ? body.shipment_ids : []);
      if (!body.driver_id) return json(res,400,{success:false,error:'اختر المندوب الجديد قبل النقل'});
      if (!shipmentIds.length) return json(res,400,{success:false,error:'حدد أوردرًا واحدًا على الأقل للنقل'});
      const driver = firstRow(await dbSelect('drivers',{select:'id,name,active',id:`eq.${body.driver_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
      if (!driver || driver.active === false) return json(res,400,{success:false,error:'المندوب الجديد غير موجود أو غير نشط'});
      const targets = [], rejected = [];
      for (const shipmentId of shipmentIds) {
        const sh = firstRow(await dbSelect('shipments',{select:'id,order_id,status,driver_id',id:`eq.${shipmentId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        if (!sh) { rejected.push(shipmentId); continue; }
        const order = firstRow(await dbSelect('orders',{select:'id,status,serial_no',id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        const links = await dbSelect('delivery_job_shipments',{select:'*',shipment_id:`eq.${shipmentId}`,limit:50}).catch(()=>[]);
        let oldDriverId = sh.driver_id || '';
        if (!oldDriverId && links.length) {
          const priorJob = firstRow(await dbSelect('delivery_jobs',{select:'id,driver_id',id:`eq.${links[0].delivery_job_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
          oldDriverId = priorJob?.driver_id || '';
        }
        const status = commissionStatusKey(effectiveOrderStatus(order,sh) || sh.status || order?.status);
        const terminal = ['paid','deliverd','delivered','half deliverd','cancelled by shipper','cancelled by reciver','cancelled by receiver','replace'].includes(status);
        if (!oldDriverId || String(oldDriverId)===String(body.driver_id) || terminal) { rejected.push(shipmentId); continue; }
        targets.push({sh,order,links,oldDriverId,oldStatus:sh.status,oldOrderStatus:order?.status||null});
      }
      if (rejected.length) return json(res,400,{success:false,error:'بعض الأوردرات غير مسندة حاليًا، أو مسندة للمندوب نفسه، أو وصلت لحالة نهائية؛ لم يتم نقل أي أوردر.',rejected});
      const jobDate = cleanString(body.job_date) || egyptTodayISO();
      const jobCode = String(await nextJobCode(user));
      createdJob = firstRow(await dbInsert('delivery_jobs',{company_id:companyId,driver_id:body.driver_id,job_code:jobCode,status:'created',job_date:jobDate,expected_count:targets.length,received_count:0}));
      if (!createdJob?.id) throw new Error('فشل إنشاء كشف النقل');
      for (const target of targets) {
        const {sh,order,links,oldDriverId,oldStatus,oldOrderStatus}=target;
        const serialNo = await resolveShipmentSerial(user,sh,order);
        touched.push(target);
        if (links.length) {
          for (const link of links) {
            await dbUpdate('delivery_job_shipments',{id:`eq.${link.id}`},{delivery_job_id:createdJob.id,delivery_job_code:createdJob.job_code,serial_date:jobDate});
          }
        } else {
          await dbInsert('delivery_job_shipments',{delivery_job_id:createdJob.id,shipment_id:sh.id,serial_no:serialNo,serial_date:jobDate,delivery_job_code:createdJob.job_code},{prefer:'return=minimal'});
        }
        await dbUpdate('shipments',{id:`eq.${sh.id}`,company_id:`eq.${companyId}`},{status:'Assigned with Driver',driver_id:body.driver_id});
        if (order?.id) await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:'Assigned with Driver'});
        target.oldDriverId=oldDriverId;target.oldStatus=oldStatus;target.oldOrderStatus=oldOrderStatus;
      }
      for (const target of targets) {
        await dbInsert('shipment_status_history',{shipment_id:target.sh.id,status:'Assigned with Driver',note:'Transferred to another driver',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}).catch(()=>{});
        await audit(user,'transfer_order_to_driver','order',target.sh.order_id,{from_driver_id:target.oldDriverId,to_driver_id:body.driver_id,delivery_job_id:createdJob.id,source:'delivery_intelligence_distributor'});
      }
      await audit(user,'create_delivery_job','delivery_job',createdJob.id,{shipment_ids:shipmentIds,source:'delivery_intelligence_transfer'});
      return json(res,200,{success:true,data:{...createdJob,transferred_count:targets.length}});
    } catch (error) {
      // Best-effort compensation keeps an interrupted transfer from leaving
      // orders assigned to the new driver without their prior job association.
      for (const target of touched.reverse()) {
        try { await dbUpdate('shipments',{id:`eq.${target.sh.id}`},{driver_id:target.sh.driver_id||null,status:target.oldStatus}); } catch (_) {}
        try { if(target.order?.id) await dbUpdate('orders',{id:`eq.${target.order.id}`},{status:target.oldOrderStatus}); } catch (_) {}
        try {
          if (target.links.length) {
            for (const link of target.links) await dbUpdate('delivery_job_shipments',{id:`eq.${link.id}`},{delivery_job_id:link.delivery_job_id,delivery_job_code:link.delivery_job_code,serial_date:link.serial_date});
          } else if (createdJob?.id) {
            await dbDelete('delivery_job_shipments',{delivery_job_id:`eq.${createdJob.id}`,shipment_id:`eq.${target.sh.id}`});
          }
        } catch (_) {}
      }
      if (createdJob?.id) { try { await dbDelete('delivery_jobs',{id:`eq.${createdJob.id}`,company_id:`eq.${await resolveCompanyId(user)}`}); } catch (_) {} }
      console.error('INTELLIGENCE TRANSFER ERROR:',error);
      return json(res,500,{success:false,error:error.message||'تعذر نقل الأوردرات للمندوب الجديد'});
    }
  }

  if (pathname === '/api/shipments' && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const companyId = await resolveCompanyId(user);
      return json(res, 200, { success: true, data: await listShipments(from, to, companyId) });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  const shipmentCommentMatch = pathname.match(/^\/api\/shipments\/([^/]+)\/comments$/);
  if (shipmentCommentMatch && req.method === 'POST') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const shipmentId = decodeURIComponent(shipmentCommentMatch[1]);
      const body = await bodyJson(req);
      const comment = cleanString(body.comment || body.note);
      if (!comment) return json(res, 400, { success: false, error: 'اكتب التعليق أولًا' });
      if (comment.length > 4000) return json(res, 400, { success: false, error: 'التعليق طويل جدًا (الحد 4000 حرف)' });
      const companyId = await resolveCompanyId(user);
      const shipment = firstRow(await dbSelect('shipments', { select: 'id,company_id', id: `eq.${shipmentId}`, company_id: `eq.${companyId}`, limit: 1 }));
      if (!shipment) return json(res, 404, { success: false, error: 'الشحنة غير موجودة' });
      let saved;
      try {
        saved = await dbInsert('shipment_status_history', { shipment_id: shipmentId, status: 'Comment', note: comment, user_id: user.id === 'env-admin' ? null : user.id }, { prefer: 'return=representation' });
      } catch (insertError) {
        const message = String(insertError?.message || insertError || '');
        if (/column .*note.* does not exist|could not find the ['\"]?note['\"]? column|schema cache.*note/i.test(message)) {
          throw new Error('قاعدة البيانات تحتاج تحديثًا: أضف عمود note إلى shipment_status_history باستخدام ملف comment-speed-migration.sql في Supabase SQL Editor.');
        }
        throw insertError;
      }
      return json(res, 201, { success: true, data: firstRow(saved) || null });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname.startsWith('/api/shipments/') && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const id = pathname.split('/').pop();
      const rows = await dbSelect('shipments', { select: '*', id: `eq.${id}`, limit: 1 });
      const shipment = firstRow(rows);
      if (!shipment) return json(res, 404, { success: false, error: 'الشحنة غير موجودة' });
      const data = await getOrderDetails(shipment.order_id);
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  const searchProofMatch = pathname.match(/^\/api\/search\/proof\/(accounting|return)\/([^/]+)$/);
  if(searchProofMatch && req.method==='GET'){
    const user=await requireRole(req,res,'shipments'); if(!user)return;
    try{
      const companyId=await resolveCompanyId(user), kind=searchProofMatch[1], proofId=searchProofMatch[2];
      let proof=null;
      if(kind==='accounting') proof=firstRow(await dbSelect('settlement_proofs',{select:'*',id:`eq.${proofId}`,company_id:`eq.${companyId}`,limit:1}));
      else proof=firstRow(await dbSelect('return_transaction_attachments',{select:'*',id:`eq.${proofId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!proof)return json(res,404,{success:false,error:'الإثبات غير موجود'});
      const response=await storageDownload(proof.storage_bucket,proof.storage_path);
      const raw=Buffer.from(await response.arrayBuffer());
      res.writeHead(200,{'Content-Type':proof.content_type||'application/octet-stream','Content-Length':raw.length,'Content-Disposition':`inline; filename="${String(proof.file_name||'proof').replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, max-age=120'});
      return res.end(raw);
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/search' && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const q = url.searchParams.get('q') || '';
      const companyId = await resolveCompanyId(user);
      const editMode = url.searchParams.get('mode') === 'edit';
      const result = await searchAll(q, companyId, {single: editMode});
      return json(res, 200, { success: true, ...result });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/shipments/status' && req.method === 'POST') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const requestedStatus = canonicalOrderStatus(body.status);
      if ((!body.shipment_id && !body.order_id) || !requestedStatus) return json(res, 400, { success: false, error: 'بيانات الحالة ناقصة' });
      const companyId = await resolveCompanyId(user);
      let shipment = null;
      if (body.shipment_id) shipment = firstRow(await dbSelect('shipments',{select:'*',id:`eq.${body.shipment_id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!shipment && body.order_id) shipment = firstRow(await dbSelect('shipments',{select:'*',order_id:`eq.${body.order_id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!shipment) return json(res,404,{success:false,error:'الشحنة غير موجودة'});
      if (requestedStatus === 'Return to Origin') {
        const driverId=cleanString(body.driver_id);
        if(!driverId) return json(res,400,{success:false,error:'يجب اختيار المندوب قبل Return to Origin'});
        const driver=firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${driverId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        if(!driver) return json(res,400,{success:false,error:'المندوب غير موجود'});
        const order=firstRow(await dbSelect('orders',{select:'*',id:`eq.${shipment.order_id}`,company_id:`eq.${companyId}`,limit:1}));
        if(!order) return json(res,404,{success:false,error:'الأوردر غير موجود'});
        const preservePaidOrderStatus = String(order.status||'').trim().toLowerCase() === 'paid';
        const existingRt=firstRow(await dbSelect('return_transactions',{select:'*',order_id:`eq.${order.id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        const statusCandidates=[order.status,shipment.status,existingRt?.return_status,existingRt?.original_status].map(canonicalReturnStatus);
        const current=statusCandidates.find(st=>RETURN_STATUSES.has(st));
        if(!current) return json(res,400,{success:false,error:'Return to Origin متاح فقط للأوردرات المرتجعة أو الملغاة من التاجر/العميل'});
        const rt=await ensureReturnTransaction(user,order,shipment,current);
        const op=await createReturnOperation(user,driverId,[rt?.id].filter(Boolean));
        const now=new Date().toISOString();
        // Separate return operations from financial state: when the order status itself
        // is Paid, keep that status untouched. The shipment and return transaction
        // carry the operational Return to Origin state. Other payment/approval/
        // commission fields are never included in this operational patch.
        if (!preservePaidOrderStatus) {
          await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:'Return to Origin',driver_statement_action:null,driver_scheduled_date:null,driver_action_at:now,driver_action_by:user.id==='env-admin'?null:user.id,return_operation_id:op.id,return_operation_no:op.operation_no});
        }
        await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:'Return to Origin',driver_id:driverId});
        if(rt) await dbUpdate('return_transactions',{id:`eq.${rt.id}`,company_id:`eq.${companyId}`},{return_status:'Return to Origin',driver_id:driverId,return_operation_id:op.id,return_operation_no:op.operation_no,updated_at:now,updated_by:user.id==='env-admin'?null:user.id});
        try{await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:'Return to Origin',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});}catch(_){ }
        await audit(user,'return_to_origin','shipment',shipment.id,{order_id:order.id,driver_id:driverId,return_operation_id:op.id,return_operation_no:op.operation_no});
        return json(res,200,{success:true,data:{shipment_id:shipment.id,status:'Return to Origin',operation:{...op,driver_name:driver.name,driver_no:driver.driver_no}}});
      }

      const order = firstRow(await dbSelect('orders',{select:'*',id:`eq.${shipment.order_id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!order) return json(res,404,{success:false,error:'الأوردر المرتبط بالشحنة غير موجود'});
      if(paidLockValues(order,shipment)) return json(res,400,{success:false,error:'الأوردر Paid ومغلق؛ استخدم إجراءات المرتجع المخصصة دون تعديل الحالة المالية'});
      if (requestedStatus === 'Return Completed') { const rt=firstRow(await dbSelect('return_transactions',{select:'id',order_id:`eq.${order.id}`,company_id:`eq.${companyId}`,order:'created_at.desc',limit:1}).catch(()=>[])); const proof=rt?firstRow(await dbSelect('return_transaction_attachments',{select:'id',return_transaction_id:`eq.${rt.id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])):null; if(!proof) return json(res,400,{success:false,error:'يجب رفع إثبات استلام التاجر قبل Return Completed'}); }

      if (requestedStatus === 'Return to Origin') {
        const currentReturnStatus = canonicalReturnStatus(order.status);
        const allowedReturnToOrigin = new Set(['Cancelled','Cancelled by Shipper','Cancelled by Receiver','Replaced','Half Delivered']);
        if (!allowedReturnToOrigin.has(currentReturnStatus)) return json(res,400,{success:false,error:'Return to Origin متاح فقط للأوردرات Cancelled / Cancelled by Shipper / Cancelled by Receiver / Replaced / Half Delivered'});
        const driverId = cleanString(body.driver_id);
        let driver = null;
        if (driverId) { driver = firstRow(await dbSelect('drivers',{select:'*',id:`eq.${driverId}`,company_id:`eq.${companyId}`,limit:1})); if (!driver) return json(res,404,{success:false,error:'السائق غير موجود'}); }
        const orderPatch = {status:'Return to Origin',driver_statement_action:null,driver_scheduled_date:null,driver_action_at:new Date().toISOString(),driver_action_by:user.id==='env-admin'?null:user.id,statement_removed_at:null,statement_removed_by:null,statement_removed_from_driver_id:null};
        const updatedOrder = firstRow(await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},orderPatch));
        await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:'Return to Origin',...(driverId?{driver_id:driverId}:{})});
        try { await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:'Return to Origin',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}); } catch(_){}
        const rt=firstRow(await dbSelect('return_transactions',{select:'*',order_id:`eq.${order.id}`,company_id:`eq.${companyId}`,order:'created_at.desc',limit:1}).catch(()=>[]));
        if(rt) await dbUpdate('return_transactions',{id:`eq.${rt.id}`,company_id:`eq.${companyId}`},{return_status:'Return to Origin',note:driver?`Return to Origin assigned to ${driver.name||driver.driver_no||driverId}`:'Return to Origin',updated_at:new Date().toISOString(),updated_by:user.id==='env-admin'?null:user.id});
        await audit(user,'return_to_origin','shipment',shipment.id,{order_id:order.id,driver_id:driverId||null,driver_name:driver?.name||driver?.driver_no||null});
        return json(res,200,{success:true,data:{shipment_id:shipment.id,order:updatedOrder||{...order,...orderPatch},status:'Return to Origin',driver_id:driverId||null}});
      }

      if (requestedStatus === 'Location Change') {
        let emirateId = body.emirate_id || null;
        let areaId = body.area_id || null;
        const uuidLike = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));
        if (emirateId && !uuidLike(emirateId)) {
          const g = firstRow(await dbSelect('governorates',{select:'id',company_id:`eq.${companyId}`,or:`name_ar.eq.${encodeURIComponent(String(emirateId))},name_en.eq.${encodeURIComponent(String(emirateId))}`,limit:1}).catch(()=>[]));
          emirateId = g?.id || null;
        }
        if (areaId && !uuidLike(areaId)) {
          const a = firstRow(await dbSelect('areas',{select:'id,governorate_id',company_id:`eq.${companyId}`,or:`name_ar.eq.${encodeURIComponent(String(areaId))},name_en.eq.${encodeURIComponent(String(areaId))}`,limit:1}).catch(()=>[]));
          areaId = a?.id || null;
          if (a?.governorate_id && emirateId && String(a.governorate_id)!==String(emirateId)) areaId = null;
        }
        if (!emirateId || !areaId) return json(res,400,{success:false,error:'الإمارة والمنطقة مطلوبتان لتغيير الموقع'});
        const selectedGov = firstRow(await dbSelect('governorates',{select:'id',id:`eq.${emirateId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        const selectedArea = firstRow(await dbSelect('areas',{select:'id,governorate_id',id:`eq.${areaId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        if (!selectedGov || !selectedArea) return json(res,400,{success:false,error:'الإمارة أو المنطقة المحددة غير موجودة'});
        if (selectedArea.governorate_id && String(selectedArea.governorate_id) !== String(emirateId)) return json(res,400,{success:false,error:'المنطقة لا تتبع الإمارة المحددة'});
        const scheduledDate = String(body.date || body.scheduled_date || egyptTodayISO()).trim();
        const dateError = validateScheduledDate('Location Change', scheduledDate);
        if (dateError) return json(res,400,{success:false,error:dateError});
        const orderPatch = {
          status:'Location Change', driver_statement_action:'location_change', driver_scheduled_date:scheduledDate,
          driver_location_emirate_id:emirateId, driver_location_area_id:areaId,
          driver_action_at:new Date().toISOString(), driver_action_by:user.id==='env-admin'?null:user.id,
          statement_removed_at:null, statement_removed_by:null, statement_removed_from_driver_id:null
        };
        const updatedOrder = firstRow(await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},orderPatch));
        if (!updatedOrder) throw new Error('لم يتم حفظ Location Change في الأوردر.');
        let updatedShipment = null;
        try { updatedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:'Location Change',updated_at:new Date().toISOString()})); } catch (_) {}
        if (!updatedShipment) updatedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:'Location Change'}));
        if (!updatedShipment) {
          try { await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:order.status,driver_statement_action:order.driver_statement_action||null,driver_scheduled_date:order.driver_scheduled_date||null,driver_location_emirate_id:order.driver_location_emirate_id||null,driver_location_area_id:order.driver_location_area_id||null,governorate_id:order.governorate_id||null,area_id:order.area_id||null}); } catch (_) {}
          throw new Error('تعذر تحديث الشحنة؛ لم يكتمل تغيير الموقع. أُعيدت بيانات الأوردر السابقة قدر الإمكان.');
        }
        const verifyOrder = firstRow(await dbSelect('orders',{select:'id,status,driver_statement_action,driver_scheduled_date,driver_location_emirate_id,driver_location_area_id',id:`eq.${order.id}`,company_id:`eq.${companyId}`,limit:1}));
        const verifyShipment = firstRow(await dbSelect('shipments',{select:'id,status',id:`eq.${shipment.id}`,company_id:`eq.${companyId}`,limit:1}));
        if (!verifyOrder || verifyOrder.status !== 'Location Change' || verifyOrder.driver_scheduled_date !== scheduledDate || !verifyShipment || verifyShipment.status !== 'Location Change') throw new Error('لم يتم تأكيد حفظ Location Change في الأوردر والشحنة. حدّث الصفحة قبل إعادة المحاولة.');
        try { await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:'Location Change',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}); } catch(historyError){ console.warn('STATUS HISTORY WARNING:',historyError.message); }
        await audit(user,'location_change','shipment',shipment.id,{order_id:order.id,emirate_id:emirateId,area_id:areaId,date:scheduledDate});
        return json(res,200,{success:true,data:{shipment_id:shipment.id,order:verifyOrder,status:'Location Change'}});
      }

      const specialStatus = ['Return by Driver','Future Delivery','Location Change','Schedule for Tomorrow'].includes(requestedStatus);
      if (requestedStatus === 'Future Delivery' || requestedStatus === 'Return by Driver' || requestedStatus === 'Schedule for Tomorrow') {
        const scheduledDate = cleanString(body.date || body.scheduled_date) || ((requestedStatus === 'Return by Driver' || requestedStatus === 'Schedule for Tomorrow') ? addEgyptDaysISO(1) : null);
        if ((requestedStatus === 'Future Delivery' || requestedStatus === 'Schedule for Tomorrow') && !scheduledDate) return json(res,400,{success:false,error:'يجب تحديد تاريخ التسليم'});
        if (scheduledDate) {
          // Delivery Job status edits keep Return by Driver on the selected job sheet date.
          // The driver app and other workflows retain the default next-day scheduling behavior.
          const preserveDeliveryJobDate = requestedStatus === 'Return by Driver' && body.preserve_delivery_job_date === true && isValidISODate(scheduledDate);
          const dateError = preserveDeliveryJobDate ? '' : validateScheduledDate(requestedStatus, scheduledDate);
          if (dateError) return json(res,400,{success:false,error:dateError});
        }
        const specialOrderPatch = {
          status:requestedStatus,
          driver_statement_action: requestedStatus === 'Future Delivery' ? 'future_delivery' : (requestedStatus === 'Schedule for Tomorrow' ? 'schedule_for_tomorrow' : 'return_by_driver'),
          driver_scheduled_date: scheduledDate,
          driver_action_at:new Date().toISOString(),
          driver_action_by:user.id==='env-admin'?null:user.id,
          statement_removed_at:null, statement_removed_by:null, statement_removed_from_driver_id:null
        };
        const savedSpecialOrder = firstRow(await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},specialOrderPatch));
        if (!savedSpecialOrder) throw new Error('لم يتم حفظ الحالة الجديدة في الأوردر. لم يتم تأكيد التغيير.');
        let savedSpecialShipment = null;
        try { savedSpecialShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:requestedStatus,updated_at:new Date().toISOString()})); } catch (_) {}
        if (!savedSpecialShipment) savedSpecialShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:requestedStatus}));
        if (!savedSpecialShipment) throw new Error('تم حفظ حالة الأوردر لكن تعذر تحديث الشحنة. لم يتم تأكيد اكتمال تغيير الحالة.');
        try { await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:requestedStatus,user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}); } catch(_) {}
      } else {
        const standardStatus = SYSTEM_STATUSES.includes(requestedStatus) || /^Scan by\s+/i.test(String(requestedStatus||''));
        if (standardStatus) {
          const clearAction = { driver_statement_action:null, driver_scheduled_date:null, driver_location_emirate_id:null, driver_location_area_id:null, driver_action_at:new Date().toISOString(), driver_action_by:user.id==='env-admin'?null:user.id };
          await transitionOrderCentral(user, order, shipment, requestedStatus, clearAction);
        } else {
          // Unknown/legacy operational statuses must update both source records and
          // clear stale driver actions; otherwise Delivery Job can keep showing an
          // old Return by Driver / Future Delivery / Location Change badge.
          const statusPatch = {
            status: requestedStatus,
            driver_statement_action: null,
            driver_scheduled_date: null,
            driver_location_emirate_id: null,
            driver_location_area_id: null,
            driver_action_at: new Date().toISOString(),
            driver_action_by: user.id === 'env-admin' ? null : user.id
          };
          const savedOrder = firstRow(await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},statusPatch));
          if (!savedOrder) throw new Error('لم يتم حفظ الحالة الجديدة في الأوردر.');
          let savedShipment = null;
          try { savedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:requestedStatus,updated_at:new Date().toISOString()})); } catch (_) {}
          if (!savedShipment) savedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:requestedStatus}));
          if (!savedShipment) throw new Error('تم تحديث الأوردر لكن تعذر تحديث حالة الشحنة.');
          try { await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:requestedStatus,note:`Status changed from ${canonicalOrderStatus(order.status)||'—'} to ${requestedStatus}`,user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'}); } catch(_) {}
          await audit(user,'update_shipment_status','shipment',shipment.id,{from:canonicalOrderStatus(order.status),status:requestedStatus,order_id:order.id});
        }
      }
      const updated = firstRow(await dbSelect('shipments',{select:'*',id:`eq.${shipment.id}`,company_id:`eq.${companyId}`,limit:1}));
      const verifiedOrder = firstRow(await dbSelect('orders',{select:'id,status,driver_statement_action,driver_scheduled_date',id:`eq.${order.id}`,company_id:`eq.${companyId}`,limit:1}));
      const expectedAction = requestedStatus === 'Future Delivery' ? 'future_delivery' : requestedStatus === 'Return by Driver' ? 'return_by_driver' : requestedStatus === 'Location Change' ? 'location_change' : requestedStatus === 'Schedule for Tomorrow' ? 'schedule_for_tomorrow' : null;
      const scheduledDateMismatch = expectedAction && (String(verifiedOrder?.driver_statement_action || '') !== expectedAction || String(verifiedOrder?.driver_scheduled_date || '').slice(0,10) !== String(body.date || body.scheduled_date || (requestedStatus === 'Return by Driver' || requestedStatus === 'Schedule for Tomorrow' ? addEgyptDaysISO(1) : '')).slice(0,10));
      if (!verifiedOrder || canonicalOrderStatus(verifiedOrder.status) !== requestedStatus || !updated || canonicalOrderStatus(updated.status) !== requestedStatus || scheduledDateMismatch) {
        throw new Error(`لم يتم تأكيد حفظ الحالة أو التاريخ الجديد (${requestedStatus}) في الأوردر والشحنة. حدّث الصفحة وحاول مرة أخرى.`);
      }
      if (RETURN_STATUSES.has(String(requestedStatus))) {
        await ensureReturnTransaction(user, order, shipment, requestedStatus);
        // Cancelled by Receiver remains reference-only: do not create a merchant
        // delivery-fee credit/offset and do not charge delivery to the merchant.
        if (requestedStatus === 'Cancelled by Shipper') {
          try { await ensureShipperDeliveryFeeDebit(user, order, shipment); }
          catch (accountingError) { console.warn('SHIPPER FEE ACCOUNTING WARNING:', accountingError.message); }
        }
      } else if (ACCOUNTING_STATUSES.has(String(requestedStatus))) {
        // Delivered / Half Delivered belong to Driver Account verification, not Returns.
        // Clear any stale driver-return action so the order can enter accounting cleanly.
        try {
          await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{driver_statement_action:null,driver_scheduled_date:null,driver_action_at:new Date().toISOString(),driver_action_by:user.id==='env-admin'?null:user.id});
        } catch (_) {}
      }
      if (requestedStatus === 'Return Completed') {
        const rt=firstRow(await dbSelect('return_transactions',{select:'*',order_id:`eq.${order.id}`,company_id:`eq.${companyId}`,order:'created_at.desc',limit:1}).catch(()=>[]));
        if(rt) await dbUpdate('return_transactions',{id:`eq.${rt.id}`,company_id:`eq.${companyId}`},{return_status:'Return Completed',completed_at:new Date().toISOString(),completed_by:user.id==='env-admin'?null:user.id});
      }
      return json(res, 200, { success: true, data: { ...updated, status: requestedStatus, order: verifiedOrder, confirmed: true } });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }
  if (pathname === '/api/settings/import-shippers' && req.method === 'POST') {
    const user=await requireRole(req,res,'merchants'); if(!user)return;
    try{const body=await bodyJson(req);const rows=Array.isArray(body.rows)?body.rows:[];const companyId=await resolveCompanyId(user);if(!rows.length)return json(res,400,{success:false,error:'الملف فارغ'});const existing=await dbSelect('merchants',{select:'id,merchant_no,code,external_code,name',company_id:`eq.${companyId}`,limit:10000});const usedExternal=new Map(existing.filter(x=>x.external_code).map(x=>[String(x.external_code).trim().toLowerCase(),x]));let max=existing.map(x=>{const m=String(x.code||'').match(/^AB(\d{6})$/);return m?Number(m[1]):0;}).reduce((a,b)=>Math.max(a,b),0);let imported=0,skipped=0,errors=[];for(let i=0;i<rows.length;i++){const r=rows[i]||{};try{const name=cleanString(r['Shipper Name']||r['اسم التاجر']||r.name||r.merchant_name);const old=cleanString(r['Old Code']||r['الكود القديم']||r.external_code||r.old_code);if(!name||!old)throw new Error('اسم التاجر والكود القديم مطلوبان');const key=old.toLowerCase();if(usedExternal.has(key))throw new Error('الكود القديم مستخدم بالفعل');max++;const code='AB'+String(max).padStart(6,'0');const row={company_id:companyId,name,merchant_no:old,code,external_code:old,phone:cleanString(r['Phone']||r['الهاتف']||r.phone)||null,address:cleanString(r['Address']||r['العنوان']||r.address)||null,active:true};const data=firstRow(await dbInsert('merchants',row));usedExternal.set(key,data||row);imported++;}catch(e){skipped++;errors.push({row:i+2,error:e.message});}}return json(res,200,{success:true,imported,skipped,errors});}catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/merchants' && req.method === 'GET') {
    const user = await requireRole(req, res, 'merchants');
    if (!user) return;
    try {
      const safeRows = (await getRows('merchants', user)).map(({ password_hash, portal_password_hash, ...row }) => row);
      return json(res, 200, { success: true, data: safeRows });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/merchants' && req.method === 'POST') {
    const user = await requireRole(req, res, 'merchants');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      if (!body.name) return json(res, 400, { success: false, error: 'اسم التاجر مطلوب' });
      // Generate the internal shipper code through the database lock when available.
      // The RPC prevents duplicate codes when two employees create shippers at the same time.
      let generatedCode = '';
      try { generatedCode = String(await dbRpc('next_shipper_code', { p_company_id: companyId }) || ''); } catch (_) {}
      if (!/^AB\d{6}$/.test(generatedCode)) {
        const existing = await dbSelect('merchants',{select:'code',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);
        const maxCode = existing.map(x=>{const m=String(x.code||'').match(/^AB(\d{6})$/i);return m?Number(m[1]):0;}).reduce((a,b)=>Math.max(a,b),0);
        generatedCode = `AB${String(maxCode+1).padStart(6,'0')}`;
      }
      const oldCode = cleanString(body.external_code || body.old_code || body.merchant_no);
      const row = {
        company_id: companyId, merchant_no: generatedCode, code: generatedCode, external_code: oldCode || null,
        name: cleanString(body.name), phone: cleanString(body.phone) || null, phone_2: cleanString(body.phone_2) || null, address: cleanString(body.address) || null,
        active: body.active !== false, tax_enabled: Boolean(body.tax_enabled), tax_rate: Math.max(0, Math.min(100, cleanNumber(body.tax_rate))),
        base_delivery_fee: Math.max(0, cleanNumber(body.base_delivery_fee)), store_type: cleanString(body.store_type) || null,
        store_name: cleanString(body.store_name) || null, store_url: cleanString(body.store_url) || null, store_active: Boolean(body.store_active),
        contact_person: cleanString(body.contact_person) || null, email: cleanString(body.email) || null, whatsapp: cleanString(body.whatsapp) || null,
        tax_number: cleanString(body.tax_number) || null, commercial_registration: cleanString(body.commercial_registration) || null, city: cleanString(body.city) || null,
        payout_method: cleanString(body.payout_method) || null, payout_account: cleanString(body.payout_account) || null,
        pickup_fee: Math.max(0, cleanNumber(body.pickup_fee)), return_fee: Math.max(0, cleanNumber(body.return_fee)), cod_fee: Math.max(0, cleanNumber(body.cod_fee)),
        notes: cleanString(body.notes) || null
      };
      let data;
      try {
        data = firstRow(await dbInsert('merchants', row));
      } catch (insertError) {
        const message=String(insertError.message||'');
        if (/column .* does not exist|schema cache|unknown column/i.test(message)) {
          const core={company_id:row.company_id,merchant_no:row.merchant_no,code:row.code,external_code:row.external_code,name:row.name,phone:row.phone,phone_2:row.phone_2,address:row.address,active:row.active,tax_enabled:row.tax_enabled,tax_rate:row.tax_rate,base_delivery_fee:row.base_delivery_fee,store_type:row.store_type,store_name:row.store_name,store_url:row.store_url,store_active:row.store_active};
          data=firstRow(await dbInsert('merchants',core));
        } else if (/duplicate|unique/i.test(message)) {
          const retryCode = String(await dbRpc('next_shipper_code', { p_company_id: companyId }) || '');
          if (!/^AB\d{6}$/.test(retryCode)) throw insertError;
          row.merchant_no = retryCode; row.code = retryCode;
          data = firstRow(await dbInsert('merchants', row));
        } else throw insertError;
      }
      await audit(user, 'create_merchant', 'merchant', data?.id || null, row);
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/merchants' && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'merchants');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      if (!body.id) return json(res, 400, { success: false, error: 'معرّف التاجر مطلوب' });
      const existing = firstRow(await dbSelect('merchants',{select:'*',id:`eq.${body.id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!existing) return json(res,404,{success:false,error:'الشاحن غير موجود'});
      const patch = {};
      for (const key of ['merchant_no','code','external_code','name','phone','phone_2','address','store_type','store_name','store_url','contact_person','email','whatsapp','tax_number','commercial_registration','city','payout_method','payout_account','notes']) {
        if (body[key] !== undefined) patch[key] = cleanString(body[key]) || null;
      }
      for (const key of ['active','store_active']) if (body[key] !== undefined) patch[key] = Boolean(body[key]);
      if (body.tax_enabled !== undefined) patch.tax_enabled = Boolean(body.tax_enabled);
      if (body.tax_rate !== undefined) patch.tax_rate = Math.max(0, Math.min(100, cleanNumber(body.tax_rate)));
      if (body.base_delivery_fee !== undefined) patch.base_delivery_fee = Math.max(0, cleanNumber(body.base_delivery_fee));
      for (const key of ['pickup_fee','return_fee','cod_fee']) if (body[key] !== undefined) patch[key] = Math.max(0, cleanNumber(body[key]));
      const data = await dbUpdate('merchants', { id: `eq.${body.id}`, company_id:`eq.${companyId}` }, patch);
      await audit(user, 'update_merchant', 'merchant', body.id, {before:existing,after:patch});
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/merchant-accounts' && (req.method === 'POST' || req.method === 'PATCH')) {
    const user = await requireRole(req, res, 'merchants');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const merchantId = cleanString(body.merchant_id || body.id);
      if (!merchantId) return json(res, 400, { success:false, error:'التاجر مطلوب' });
      const merchant = firstRow(await dbSelect('merchants', { select:'id,name,portal_username,portal_password_hash,company_id', id:`eq.${merchantId}`, company_id:`eq.${companyId}`, limit:1 }));
      if (!merchant) return json(res,404,{success:false,error:'التاجر غير موجود'});
      if (body.enabled === false) {
        // Disable access without deleting the merchant or changing employee/driver accounts.
        const result = await dbUpdate('merchants', { id:`eq.${merchantId}`, company_id:`eq.${companyId}` }, { portal_password_hash:null, portal_active:false });
        await audit(user,'disable_merchant_portal','merchant',merchantId,{username:merchant.portal_username||null});
        return json(res,200,{success:true,enabled:false,data:result});
      }
      const username = cleanString(body.username).toLowerCase();
      const password = String(body.password || '');
      if (!username || !/^[a-z0-9._@+-]{3,100}$/.test(username)) return json(res,400,{success:false,error:'اسم المستخدم يجب أن يكون 3 أحرف على الأقل ويحتوي على أحرف إنجليزية أو أرقام'});
      if (req.method === 'POST' && password.length < 8) return json(res,400,{success:false,error:'كلمة المرور يجب ألا تقل عن 8 أحرف'});
      if (password && password.length < 8) return json(res,400,{success:false,error:'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف'});
      const others = await dbSelect('merchants',{select:'id,portal_username',company_id:`eq.${companyId}`,portal_username:`eq.${encodeURIComponent(username)}`,limit:5});
      if (others.some(x=>String(x.id)!==String(merchantId))) return json(res,409,{success:false,error:'اسم المستخدم مستخدم لحساب تاجر آخر'});
      const patch = { portal_username:username, portal_active:true };
      if (password) patch.portal_password_hash = hashPassword(password);
      else if (!merchant.portal_password_hash) return json(res,400,{success:false,error:'أدخل كلمة مرور للحساب الجديد'});
      const data = await dbUpdate('merchants',{id:`eq.${merchantId}`,company_id:`eq.${companyId}`},patch);
      await audit(user,req.method==='POST'?'create_merchant_portal':'update_merchant_portal','merchant',merchantId,{username,enabled:true});
      return json(res,200,{success:true,enabled:true,username,data});
    } catch (error) {
      const message=String(error.message||'');
      if (/portal_active|column .* does not exist|schema cache/i.test(message)) return json(res,500,{success:false,error:'قاعدة البيانات تحتاج تشغيل ملف merchant-portal-account-migration.sql المرفق مع النسخة.'});
      return json(res,500,{success:false,error:message});
    }
  }

  if (pathname === '/api/merchant-integrations' && req.method === 'GET') {
    const user = await requireRole(req, res, 'merchants');
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const merchantId = cleanString(url.searchParams.get('merchant_id'));
      if (!merchantId) return json(res,400,{success:false,error:'التاجر مطلوب'});
      const merchant = firstRow(await dbSelect('merchants',{select:'id',id:`eq.${merchantId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!merchant) return json(res,404,{success:false,error:'التاجر غير موجود'});
      const data = await dbSelect('integrations', { select: '*', merchant_id: `eq.${merchantId}`, order: 'created_at.desc' });
      return json(res, 200, { success: true, data: data.map(sanitizeIntegration) });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/merchant-integrations' && req.method === 'POST') {
    const user = await requireRole(req, res, 'merchants');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      if (!body.merchant_id || !body.name) return json(res, 400, { success: false, error: 'التاجر واسم المتجر مطلوبان' });
      const merchant = firstRow(await dbSelect('merchants',{select:'id',company_id:`eq.${companyId}`,id:`eq.${body.merchant_id}`,limit:1}));
      if(!merchant) return json(res,404,{success:false,error:'التاجر غير موجود داخل الشركة الحالية'});
      const config = body.config && typeof body.config === 'object' ? {...body.config} : {};
      if(String(body.type||'').toLowerCase()==='woocommerce'){
        if(!cleanString(config.url)||!cleanString(config.consumer_key)||!cleanString(config.consumer_secret)){
          return json(res,400,{success:false,error:'رابط WooCommerce وConsumer Key وConsumer Secret مطلوبة'});
        }
      }
      const row = { merchant_id: body.merchant_id, type: cleanString(body.type) || 'ecommerce', name: cleanString(body.name), config, active: body.active !== false };
      const data = firstRow(await dbInsert('integrations', row));
      return json(res, 200, { success: true, data: sanitizeIntegration(data) });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  const wooTestMatch = pathname.match(/^\/api\/merchant-integrations\/([^/]+)\/test$/);
  if (wooTestMatch && req.method === 'POST') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const integration = firstRow(await dbSelect('integrations',{select:'*',id:`eq.${wooTestMatch[1]}`,limit:1}));
      if(!integration) return json(res,404,{success:false,error:'ربط WooCommerce غير موجود'});
      const merchant = firstRow(await dbSelect('merchants',{select:'id',company_id:`eq.${companyId}`,id:`eq.${integration.merchant_id}`,limit:1}));
      if(!merchant) return json(res,403,{success:false,error:'ليس لديك صلاحية على هذا الربط'});
      const data = await wooRequest(integration.config,'system_status');
      const patch={config:{...(integration.config||{}),last_test_at:new Date().toISOString(),last_error:null}};
      await dbUpdate('integrations',{id:`eq.${integration.id}`},patch,{prefer:'return=minimal'});
      await audit(user,'test_woocommerce_connection','integration',integration.id,{merchant_id:integration.merchant_id});
      return json(res,200,{success:true,sample_count:data?1:0,status:data?.environment||'connected'});
    }catch(error){
      try{
        const row=firstRow(await dbSelect('integrations',{select:'*',id:`eq.${wooTestMatch[1]}`,limit:1}));
        if(row) await dbUpdate('integrations',{id:`eq.${row.id}`},{config:{...(row.config||{}),last_test_at:new Date().toISOString(),last_error:String(error.message||'Connection failed')}},{prefer:'return=minimal'});
      }catch(_){}
      return json(res,502,{success:false,error:`فشل الاتصال بـ WooCommerce: ${error.message}`});
    }
  }

  const wooImportMatch = pathname.match(/^\/api\/merchant-integrations\/([^/]+)\/import$/);
  if (wooImportMatch && req.method === 'POST') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const integration = firstRow(await dbSelect('integrations',{select:'*',id:`eq.${wooImportMatch[1]}`,limit:1}));
      if(!integration) return json(res,404,{success:false,error:'ربط WooCommerce غير موجود'});
      const merchant = firstRow(await dbSelect('merchants',{select:'id,name,company_id',id:`eq.${integration.merchant_id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!merchant) return json(res,403,{success:false,error:'ليس لديك صلاحية على هذا الربط'});
      if(String(integration.type||'').toLowerCase()!=='woocommerce') return json(res,400,{success:false,error:'هذا الربط ليس WooCommerce'});
      const perPage=Math.min(100,Math.max(1,cleanNumber(body.per_page,50)));
      const page=Math.max(1,cleanNumber(body.page,1));
      const orders=await wooRequest(integration.config,`orders?per_page=${perPage}&page=${page}&orderby=date&order=desc&status=any`);
      if(!Array.isArray(orders)) throw new Error('استجابة WooCommerce غير صالحة');
      let imported=0,skipped=0; const errors=[];
      for(const w of orders){
        try{
          const wooNo=String(w.number||w.id||'').trim();
          if(!wooNo){skipped++;continue;}
          const existing=firstRow(await dbSelect('orders',{select:'id',company_id:`eq.${companyId}`,merchant_id:`eq.${merchant.id}`,merchant_order_no:`eq.${encodeURIComponent(wooNo)}`,limit:1}).catch(()=>[]));
          if(existing){skipped++;continue;}
          const billing=w.billing||{}, shipping=w.shipping||{};
          const phone=cleanString(billing.phone||shipping.phone);
          const name=cleanString([billing.first_name,billing.last_name].filter(Boolean).join(' ')||[shipping.first_name,shipping.last_name].filter(Boolean).join(' ')||'WooCommerce Customer');
          const address=cleanString([shipping.address_1,shipping.address_2,shipping.city,shipping.state,shipping.country].filter(Boolean).join(', ')||billing.address_1||'');
          const total=cleanNumber(w.total,0);
          const result=await createOrder(user,{merchant_id:merchant.id,merchant_order_no:wooNo,reference_number:`WC-${w.id}`,customer_name:name,customer_phone:phone,address,value:total,delivery_fee:cleanNumber(merchant.base_delivery_fee,0),notes:`WooCommerce #${w.id} — ${cleanString(w.status)}`});
          imported++;
          await audit(user,'import_woocommerce_order','order',result?.order?.id||null,{integration_id:integration.id,woocommerce_id:w.id,woocommerce_status:w.status});
        }catch(e){skipped++;errors.push({woocommerce_id:w?.id,error:e.message});}
      }
      await dbUpdate('integrations',{id:`eq.${integration.id}`},{config:{...(integration.config||{}),last_import_at:new Date().toISOString(),last_error:errors.length?`${errors.length} order(s) skipped with errors`:null}},{prefer:'return=minimal'});
      return json(res,200,{success:true,imported,skipped,errors:errors.slice(0,50)});
    }catch(error){return json(res,502,{success:false,error:`فشل سحب WooCommerce: ${error.message}`});}
  }


  if (pathname === '/api/shipper-rates' && req.method === 'GET') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const rates = await dbSelect('shipper_rates', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 5000 });
      const [merchants, govs, areas] = await Promise.all([dbSelect('merchants',{select:'id,name,merchant_no,code',company_id:`eq.${companyId}`,order:'name.asc',limit:2000}),dbSelect('governorates',{select:'id,name_ar,name_en',company_id:`eq.${companyId}`,order:'name_ar.asc',limit:2000}),dbSelect('areas',{select:'id,governorate_id,name_ar,name_en',company_id:`eq.${companyId}`,order:'name_ar.asc',limit:5000})]);
      const mm=new Map(merchants.map(x=>[String(x.id),x])), gm=new Map(govs.map(x=>[String(x.id),x])), am=new Map(areas.map(x=>[String(x.id),x]));
      return json(res,200,{success:true,data:rates.map(r=>({...r,merchant:mm.get(String(r.merchant_id))||null,governorate:gm.get(String(r.governorate_id))||null,area:am.get(String(r.area_id))||null}))});
    } catch(e){ return json(res,500,{success:false,error:e.message}); }
  }

  if (pathname === '/api/shipper-rates/history' && req.method === 'GET') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try { const companyId=await resolveCompanyId(user); const q=url.searchParams.get('merchant_id'); const filter={select:'*',company_id:`eq.${companyId}`,order:'changed_at.desc',limit:5000}; if(q) filter.merchant_id=`eq.${q}`; return json(res,200,{success:true,data:await dbSelect('shipper_rate_history',filter)}); }
    catch(e){ return json(res,500,{success:false,error:e.message}); }
  }

  if (pathname === '/api/shipper-rates' && req.method === 'POST') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const body=await bodyJson(req), companyId=await resolveCompanyId(user);
      if(!body.merchant_id || !body.delivery_rate || Number(body.delivery_rate)<0) return json(res,400,{success:false,error:'الشاحن وسعر التوصيل مطلوبان'});
      const areaId=cleanString(body.area_id)||null, govId=cleanString(body.governorate_id)||null;
      if(areaId && !govId) return json(res,400,{success:false,error:'اختيار الإمارة مطلوب مع المنطقة'});
      if(body.is_default){ await dbUpdate('shipper_rates',{company_id:`eq.${companyId}`,merchant_id:`eq.${body.merchant_id}`,is_default:'eq.true'},{is_default:false},{prefer:'return=minimal'}); }
      const row=firstRow(await dbInsert('shipper_rates',{company_id:companyId,merchant_id:body.merchant_id,governorate_id:govId,area_id:areaId,delivery_rate:Math.max(0,cleanNumber(body.delivery_rate)),cod_rate:Math.max(0,cleanNumber(body.cod_rate)),status:body.status==='Inactive'?'Inactive':'Active',is_default:!!body.is_default,effective_date:body.effective_date||new Date().toISOString()}));
      await audit(user,'create_shipper_rate','shipper_rate',row?.id,{after:row}); return json(res,200,{success:true,data:row});
    } catch(e){ return json(res,500,{success:false,error:e.message}); }
  }

  if (pathname === '/api/shipper-rates' && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const body=await bodyJson(req), id=cleanString(body.id), existing=firstRow(await dbSelect('shipper_rates',{select:'*',id:`eq.${id}`,limit:1}));
      if(!existing) return json(res,404,{success:false,error:'السعر غير موجود'});
      const patch={delivery_rate:Math.max(0,cleanNumber(body.delivery_rate)),cod_rate:Math.max(0,cleanNumber(body.cod_rate)),status:body.status==='Inactive'?'Inactive':'Active',effective_date:body.effective_date||existing.effective_date,is_default:!!body.is_default};
      if(body.is_default) await dbUpdate('shipper_rates',{company_id:`eq.${existing.company_id}`,merchant_id:`eq.${existing.merchant_id}`,is_default:'eq.true',id:`neq.${id}`},{is_default:false},{prefer:'return=minimal'});
      const row=firstRow(await dbUpdate('shipper_rates',{id:`eq.${id}`},patch));
      try{await dbInsert('shipper_rate_history',{company_id:existing.company_id,merchant_id:existing.merchant_id,shipper_rate_id:id,governorate_id:existing.governorate_id,area_id:existing.area_id,old_rate:cleanNumber(existing.delivery_rate),new_rate:cleanNumber(patch.delivery_rate),old_cod_rate:cleanNumber(existing.cod_rate),new_cod_rate:cleanNumber(patch.cod_rate),effective_date:patch.effective_date,changed_by:user.id&&user.id!=='env-admin'?user.id:null,change_type:'update'});}catch(_){}
      await audit(user,'update_shipper_rate','shipper_rate',id,{before:existing,after:row}); return json(res,200,{success:true,data:row});
    } catch(e){ return json(res,500,{success:false,error:e.message}); }
  }

  if (pathname === '/api/shipper-rates' && req.method === 'DELETE') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try { const body=await bodyJson(req), existing=firstRow(await dbSelect('shipper_rates',{select:'*',id:`eq.${body.id}`,limit:1})); if(!existing)return json(res,404,{success:false,error:'السعر غير موجود'}); await dbDelete('shipper_rates',{id:`eq.${body.id}`}); await audit(user,'delete_shipper_rate','shipper_rate',body.id,{before:existing}); return json(res,200,{success:true}); }
    catch(e){ return json(res,500,{success:false,error:e.message}); }
  }

  if (pathname === '/api/shipper-rates/import' && req.method === 'POST') {
    const user=await requireRole(req,res,'merchants'); if(!user)return;
    try{
      const body=await bodyJson(req), rows=Array.isArray(body.rows)?body.rows:[], companyId=await resolveCompanyId(user);
      const [merchants,govs,areas]=await Promise.all([dbSelect('merchants',{select:'id,name,merchant_no,code,tax_enabled,tax_rate,base_delivery_fee',company_id:`eq.${companyId}`,limit:5000}),dbSelect('governorates',{select:'id,name_ar,name_en',company_id:`eq.${companyId}`,limit:5000}),dbSelect('areas',{select:'id,governorate_id,name_ar,name_en',company_id:`eq.${companyId}`,limit:10000})]);
      const norm=v=>String(v??'').trim().toLowerCase(); const mm=new Map(); for(const m of merchants){for(const k of [m.id,m.name,m.merchant_no,m.code])if(k)mm.set(norm(k),m);} const gm=new Map();for(const g of govs){for(const k of [g.id,g.name_ar,g.name_en])if(k)gm.set(norm(k),g);} const am=new Map();for(const a of areas){for(const k of [a.id,a.name_ar,a.name_en])if(k)am.set(norm(k),a);}
      let imported=0,skipped=0;const errors=[];
      for(let i=0;i<rows.length;i++){const r=rows[i];const m=mm.get(norm(r.shipper_id||r.shipper_code||r.shipper||r['Shipper Code']||r['Shipper']||r['اسم الشاحن']));const g=gm.get(norm(r.governorate_id||r.emirate_id||r.emirate||r.governorate||r['Emirate']||r['الإمارة']));const a=am.get(norm(r.area_id||r.area||r['Area']||r['المنطقة']));const rate=Number(r.delivery_rate??r['Delivery Rate']??r['سعر التوصيل']);if(!m||!Number.isFinite(rate)||rate<0){skipped++;errors.push({row:i+2,error:'Shipper or Delivery Rate not found'});continue;}const aid=a?.id||null,gid=g?.id||a?.governorate_id||null;if(aid&&gid&&String(a.governorate_id)!==String(gid)){skipped++;errors.push({row:i+2,error:'Area does not belong to selected Emirate'});continue;}try{await dbInsert('shipper_rates',{company_id:companyId,merchant_id:m.id,governorate_id:gid,area_id:aid,delivery_rate:rate,cod_rate:Math.max(0,cleanNumber(r.cod_rate??r['COD Rate']??r['سعر COD'])),effective_date:r.effective_date||r['Effective Date']||new Date().toISOString(),status:norm(r.status||r['Status'])==='inactive'?'Inactive':'Active',is_default:['true','yes','1','default'].includes(norm(r.is_default||r['Default']))});imported++;}catch(e){skipped++;errors.push({row:i+2,error:e.message});}}
      await audit(user,'import_shipper_rates','shipper_rate',null,{imported,skipped}); return json(res,200,{success:true,imported,skipped,errors});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  // Coupon Booking: reserve a contiguous coupon range for exactly one merchant.
  if (pathname === '/api/bookings' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const q = cleanString(url.searchParams.get('q'));
      const filters = { company_id:`eq.${companyId}`, order:'created_at.desc', limit:5000 };
      const bookings = await dbSelect('coupon_bookings', { select:'*', ...filters });
      const merchantIds=[...new Set((bookings||[]).map(b=>String(b.merchant_id||'')).filter(Boolean))];
      const merchants=merchantIds.length?await dbSelect('merchants',{select:'id,name,merchant_no,code,external_code',company_id:`eq.${companyId}`,id:`in.(${merchantIds.join(',')})`,limit:Math.min(10000,merchantIds.length)}):[];
      const mm=new Map(merchants.map(m=>[String(m.id),m]));
      let data=bookings.map(b=>({...b,merchant:mm.get(String(b.merchant_id))||null}));
      if(q){const n=q.toLowerCase();data=data.filter(b=>[b.merchant?.name,b.merchant?.merchant_no,b.merchant?.code,b.merchant?.external_code,b.booked_by_name].some(v=>String(v||'').toLowerCase().includes(n)))}
      return json(res,200,{success:true,data});
    } catch(e){ return json(res,500,{success:false,error:e.message}); }
  }

  if (pathname === '/api/bookings' && req.method === 'POST') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const body=await bodyJson(req), companyId=await resolveCompanyId(user);
      const merchantId=cleanString(body.merchant_id); const first=Number(body.first_coupon), last=Number(body.last_coupon);
      if(!merchantId) return json(res,400,{success:false,error:'اختيار التاجر مطلوب'});
      if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first) return json(res,400,{success:false,error:'بداية ونهاية الكوبونات غير صحيحة'});
      const merchant=firstRow(await dbSelect('merchants',{select:'id,name,merchant_no,code,external_code',id:`eq.${merchantId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!merchant) return json(res,404,{success:false,error:'التاجر غير موجود'});
      const payload={company_id:companyId,merchant_id:merchantId,first_coupon:first,last_coupon:last,booked_by:user.id&&user.id!=='env-admin'?user.id:null,booked_by_name:user.name||user.username||'System'};
      const row=firstRow(await dbInsert('coupon_bookings',payload));
      Promise.resolve().then(()=>audit(user,'create_coupon_booking','coupon_booking',row?.id,{merchant_id:merchantId,first_coupon:first,last_coupon:last})).catch(err=>console.warn('Coupon booking audit failed:',err.message));
      return json(res,200,{success:true,data:{...row,merchant}});
    }catch(e){
      const msg=String(e.message||'');
      if(msg.toLowerCase().includes('exclusion')||msg.toLowerCase().includes('duplicate')||msg.includes('coupon_bookings_no_overlap')) return json(res,409,{success:false,error:'هذا النطاق يتداخل مع كوبونات محجوزة بالفعل لتاجر آخر. لم يتم حجز أي كوبون.'});
      return json(res,500,{success:false,error:msg});
    }
  }

  if (pathname === '/api/bookings' && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const body=await bodyJson(req), companyId=await resolveCompanyId(user), id=cleanString(body.id);
      if(!id) return json(res,400,{success:false,error:'الحجز غير محدد'});
      const existing=firstRow(await dbSelect('coupon_bookings',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!existing)return json(res,404,{success:false,error:'الحجز غير موجود'});
      const merchantId=cleanString(body.merchant_id)||existing.merchant_id; const first=Number(body.first_coupon),last=Number(body.last_coupon);
      if(!Number.isInteger(first)||!Number.isInteger(last)||first<0||last<first)return json(res,400,{success:false,error:'بداية ونهاية الكوبونات غير صحيحة'});
      const overlap=firstRow(await dbSelect('coupon_bookings',{select:'id,merchant_id,first_coupon,last_coupon',company_id:`eq.${companyId}`,first_coupon:`lte.${last}`,last_coupon:`gte.${first}`,limit:50}).then(rows=>(rows||[]).find(x=>String(x.id)!==String(id))||null).catch(()=>null));
      if(overlap)return json(res,409,{success:false,error:'النطاق الجديد يتداخل مع حجز كوبونات موجود. لم يتم تعديل الحجز.'});
      const merchant=firstRow(await dbSelect('merchants',{select:'id,name,merchant_no,code,external_code',id:`eq.${merchantId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!merchant)return json(res,404,{success:false,error:'التاجر غير موجود'});
      const row=firstRow(await dbUpdate('coupon_bookings',{id:`eq.${id}`,company_id:`eq.${companyId}`},{merchant_id:merchantId,first_coupon:first,last_coupon:last,updated_at:new Date().toISOString()}));
      Promise.resolve().then(()=>audit(user,'update_coupon_booking','coupon_booking',id,{before:existing,after:row})).catch(err=>console.warn('Coupon booking audit failed:',err.message));
      return json(res,200,{success:true,data:{...row,merchant}});
    }catch(e){
      const msg=String(e.message||'');
      if(msg.toLowerCase().includes('exclusion')||msg.toLowerCase().includes('duplicate')||msg.includes('coupon_bookings_no_overlap')) return json(res,409,{success:false,error:'التعديل يتداخل مع حجز موجود. لم يتم تعديل الحجز.'});
      return json(res,500,{success:false,error:msg});
    }
  }

  if (pathname === '/api/bookings' && req.method === 'DELETE') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try { const body=await bodyJson(req),companyId=await resolveCompanyId(user),id=cleanString(body.id); if(!id)return json(res,400,{success:false,error:'الحجز غير محدد'}); const existing=firstRow(await dbSelect('coupon_bookings',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1})); if(!existing)return json(res,404,{success:false,error:'الحجز غير موجود'}); await dbDelete('coupon_bookings',{id:`eq.${id}`,company_id:`eq.${companyId}`}); Promise.resolve().then(()=>audit(user,'delete_coupon_booking','coupon_booking',id,{before:existing})).catch(err=>console.warn('Coupon booking audit failed:',err.message)); return json(res,200,{success:true}); } catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/bookings/coupon' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try { const companyId=await resolveCompanyId(user), coupon=Number(url.searchParams.get('coupon')); if(!Number.isInteger(coupon)||coupon<0)return json(res,400,{success:false,error:'رقم الكوبون غير صحيح'}); const rows=await dbSelect('coupon_bookings',{select:'*',company_id:`eq.${companyId}`,first_coupon:`lte.${coupon}`,last_coupon:`gte.${coupon}`,limit:1}); if(!rows.length)return json(res,200,{success:true,data:null}); const b=rows[0]; const m=firstRow(await dbSelect('merchants',{select:'id,name,merchant_no,code,external_code',id:`eq.${b.merchant_id}`,company_id:`eq.${companyId}`,limit:1})); return json(res,200,{success:true,data:{...b,merchant:m||null}}); } catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/governorates' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders');
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const data = await dbSelect('governorates', { select:'id,company_id,name_ar,name_en', company_id:`eq.${companyId}`, order:'name_ar.asc', limit:5000 });
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/areas' && req.method === 'GET') {
    const user = await requireRole(req, res, 'orders');
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const data = await dbSelect('areas', { select:'id,company_id,governorate_id,name_ar,name_en', company_id:`eq.${companyId}`, order:'name_ar.asc', limit:10000 });
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }


  if (pathname === '/api/governorates' && req.method === 'POST') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const body = await bodyJson(req); const companyId = await resolveCompanyId(user);
      if (!body.name_ar) return json(res, 400, { success:false, error:'اسم الإمارة مطلوب' });
      const data = firstRow(await dbInsert('governorates', { company_id: companyId, name_ar: cleanString(body.name_ar), name_en: cleanString(body.name_en)||null }));
      return json(res, 200, {success:true,data});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/governorates' && req.method === 'DELETE') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const body = await bodyJson(req);
      const govId = cleanString(body.id);
      const deleteAll = body.all === true;
      if (!govId && !deleteAll) return json(res,400,{success:false,error:'حدد الإمارة المطلوب حذفها'});
      const filter = { company_id:`eq.${companyId}` };
      if (govId) filter.id = `eq.${govId}`;
      const govs = await dbSelect('governorates',{select:'id,name_ar,name_en',...filter,limit:5000});
      if (!govs.length) return json(res,200,{success:true,deleted:0,message:'لا توجد إمارات للحذف'});
      const ids = govs.map(x=>String(x.id));
      // Detach historical orders/rates first so clearing the master list never
      // destroys order history or financial data. Areas then cascade/delete.
      for (const id of ids) {
        // Detach every known governorate reference before deleting the master row.
        // Customers is especially important because older databases have a
        // restrictive FK (customers_governorate_id_fkey) that otherwise blocks
        // the whole reset operation.
        try { await dbUpdate('customers',{governorate_id:`eq.${id}`},{governorate_id:null,area_id:null},{prefer:'return=minimal'}); } catch(_) {
          // Compatibility with installations where customers has no company_id
          // or no area_id column. The governorate FK must still be detached.
          try { await dbUpdate('customers',{governorate_id:`eq.${id}`},{governorate_id:null},{prefer:'return=minimal'}); } catch(__) {}
        }
        try { await dbUpdate('orders',{company_id:`eq.${companyId}`,governorate_id:`eq.${id}`},{governorate_id:null,area_id:null},{prefer:'return=minimal'}); } catch(_) {}
        try { await dbUpdate('orders',{company_id:`eq.${companyId}`,driver_old_location_governorate_id:`eq.${id}`},{driver_old_location_governorate_id:null},{prefer:'return=minimal'}); } catch(_) {}
        try { await dbUpdate('shipper_rates',{company_id:`eq.${companyId}`,governorate_id:`eq.${id}`},{governorate_id:null,area_id:null},{prefer:'return=minimal'}); } catch(_) {}
      }
      const deletedRows = await dbDelete('governorates',filter);
      const deletedCount = Array.isArray(deletedRows) ? deletedRows.length : govs.length;
      await audit(user,'delete_governorates','governorate',govId||null,{count:deletedCount,all:deleteAll,detached_references:true});
      return json(res,200,{success:true,deleted:deletedCount});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/areas' && req.method === 'POST') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const body = await bodyJson(req); const companyId = await resolveCompanyId(user);
      if (!body.name_ar || !body.governorate_id) return json(res,400,{success:false,error:'الإمارة واسم المنطقة مطلوبان'});
      const data = firstRow(await dbInsert('areas',{company_id:companyId,governorate_id:body.governorate_id,name_ar:cleanString(body.name_ar),name_en:cleanString(body.name_en)||null}));
      return json(res,200,{success:true,data});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/areas' && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const body = await bodyJson(req); const companyId = await resolveCompanyId(user);
      const areaId = cleanString(body.id);
      if (!areaId) return json(res,400,{success:false,error:'معرّف المنطقة مطلوب'});
      const existing = firstRow(await dbSelect('areas',{select:'id,company_id,governorate_id,name_ar,name_en',id:`eq.${areaId}`,company_id:`eq.${companyId}`,limit:1}));
      if (!existing) return json(res,404,{success:false,error:'المنطقة غير موجودة'});
      const patch={};
      if (body.name_ar !== undefined) patch.name_ar=cleanString(body.name_ar);
      if (body.name_en !== undefined) patch.name_en=cleanString(body.name_en)||null;
      if (body.governorate_id !== undefined) {
        const gid=cleanString(body.governorate_id);
        if (!gid) return json(res,400,{success:false,error:'الإمارة مطلوبة'});
        const gov=firstRow(await dbSelect('governorates',{select:'id',id:`eq.${gid}`,company_id:`eq.${companyId}`,limit:1}));
        if (!gov) return json(res,400,{success:false,error:'الإمارة الجديدة غير موجودة'});
        patch.governorate_id=gid;
      }
      if (patch.name_ar === '') return json(res,400,{success:false,error:'اسم المنطقة مطلوب'});
      if (!Object.keys(patch).length) return json(res,400,{success:false,error:'لا توجد تعديلات'});
      const updated=firstRow(await dbUpdate('areas',{id:`eq.${areaId}`,company_id:`eq.${companyId}`},patch));
      await audit(user,'update_area','area',areaId,{before:existing,after:updated||patch});
      return json(res,200,{success:true,data:updated||{...existing,...patch}});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/areas' && req.method === 'DELETE') {
    const user = await requireRole(req, res, 'merchants'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const body = await bodyJson(req);
      const areaId = cleanString(body.id);
      const deleteAll = body.all === true;
      if (!areaId && !deleteAll) return json(res,400,{success:false,error:'حدد المنطقة المطلوب حذفها'});
      const filter = { company_id:`eq.${companyId}` };
      if (areaId) filter.id = `eq.${areaId}`;
      const areas = await dbSelect('areas',{select:'id,name_ar,name_en,governorate_id',...filter,limit:10000});
      if (!areas.length) {
        if (deleteAll) return json(res,200,{success:true,deleted:0,message:'لا توجد مناطق للحذف'});
        return json(res,404,{success:false,error:'المنطقة غير موجودة'});
      }
      // Detach existing references first, then delete in one database operation.
      // This keeps historical orders/rates intact while allowing an area to be removed
      // from the master area list without repeated confirmation dialogs or hangs.
      const ids = areas.map(x=>String(x.id));
      for (const id of ids) {
        try { await dbUpdate('orders',{company_id:`eq.${companyId}`,area_id:`eq.${id}`},{area_id:null},{prefer:'return=minimal'}); } catch(_) {}
        try { await dbUpdate('shipper_rates',{company_id:`eq.${companyId}`,area_id:`eq.${id}`},{area_id:null},{prefer:'return=minimal'}); } catch(_) {}
      }
      const deletedRows = await dbDelete('areas',filter);
      const deletedCount = Array.isArray(deletedRows) ? deletedRows.length : areas.length;
      await audit(user,'delete_area','area',areaId||null,{count:deletedCount,all:deleteAll,detached_references:true});
      return json(res,200,{success:true,deleted:deletedCount});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/areas/import' && req.method === 'POST') {
    const user = await requireRole(req, res, 'orders'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 400, { success:false, error:'ملف المناطق فارغ' });
      const companyId = await resolveCompanyId(user);
      let govs = await dbSelect('governorates',{select:'id,name_ar,name_en,company_id',company_id:`eq.${companyId}`,limit:5000});
      const areas = await dbSelect('areas',{select:'id,governorate_id,name_ar,name_en',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const normalize = v => String(v ?? '').normalize('NFKC').replace(/^\uFEFF/,'').trim().toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي')
        .replace(/[_–—-]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
      const pick = (r, keys) => {
        const entries = Object.keys(r || {}).map(k => [normalize(k), k]);
        for (const wanted of keys) {
          const key = normalize(wanted);
          const hit = entries.find(([nk]) => nk === key);
          if (hit && r[hit[1]] !== undefined && String(r[hit[1]]).trim() !== '') return r[hit[1]];
        }
        return '';
      };
      // IMPORTANT: Emirates/governorates are NOT hard-coded in the application.
      // The Excel file is the source of truth. Column D contains the emirate /
      // governorate value for each area row. We only normalize the value and
      // remove common zone suffixes such as "5" or "out"; we never translate
      // it through a fixed list of UAE emirates.
      const normalizeRegionName = raw => {
        // Column D is the exact Emirate/Zone value used by the application.
        // IMPORTANT: keep numeric suffixes such as "Dubai 1", "Dubai 2",
        // "Abu Dhabi 1" and "Abu Dhabi 2" as separate governorates.
        let s = cleanString(raw);
        if (!s) return '';
        s = s.replace(/\s+/g,' ').trim();
        return s;
      };
      const regionFor = raw => {
        const name = normalizeRegionName(raw);
        return name ? { en:name, ar:name, keys:[name] } : null;
      };
      const govByKey = new Map();
      const indexGov = g => {
        for (const k of [g.id,g.name_ar,g.name_en]) if (k) govByKey.set(normalize(k),g);
      };
      govs.forEach(indexGov);
      const ensureGovernorate = async raw => {
        const region=regionFor(raw);
        if(!region) return null;
        const key=normalize(region.en);
        let found=govByKey.get(key);
        if(found) return found;
        // Prefer an exact existing name in either language before creating.
        found=govs.find(g=>normalize(g.name_en||'')===key || normalize(g.name_ar||'')===key) || null;
        if(found){ indexGov(found); return found; }
        // The import can be triggered more than once, and two requests can
        // reach this point at the same time. The governorates table has a
        // unique constraint on (company_id, name_ar), so treat a duplicate
        // insert as "already exists" and fetch the existing row instead of
        // failing the whole Excel import.
        let created = null;
        try {
          created = firstRow(await dbInsert('governorates',{
            company_id:companyId,
            name_ar:region.ar,
            name_en:region.en
          }));
        } catch (e) {
          const msg = String(e?.message || e || '');
          if (/duplicate key|unique constraint|governorates_company_id_name_ar/i.test(msg)) {
            created = firstRow(await dbSelect('governorates',{
              select:'id,name_ar,name_en,company_id',
              company_id:`eq.${companyId}`,
              name_ar:`eq.${encodeURIComponent(region.ar)}`,
              limit:1
            }).catch(()=>[]));
            // Some PostgREST setups are strict about encoded filter values;
            // retry using the exact value if the first lookup returned none.
            if (!created) {
              created = govs.find(g => String(g.company_id)===String(companyId) && normalize(g.name_ar||'')===key) || null;
            }
          } else {
            throw e;
          }
        }
        if(!created?.id) return null;
        if(!govs.some(g=>String(g.id)===String(created.id))) govs.push(created);
        indexGov(created);
        return created;
      };
      const existing = new Set();
      for(const a of areas) {
        for(const n of [a.name_ar,a.name_en]) if(n) existing.add(`${String(a.governorate_id)}|${normalize(n)}`);
      }
      let imported=0, skipped=0, governoratesCreated=0; const errors=[];
      for(let i=0;i<rows.length;i++){
        const r=rows[i]||{};
        const areaEn=cleanString(pick(r,['AreaName','area_en','name_en','Area EN','Area English','English','Area EN / اسم المنطقة EN','اسم المنطقة EN / Area EN','اسم المنطقة EN','اسم المنطقة بالانجليزي']));
        const areaName=cleanString(pick(r,['AreaNameArabic','area_ar','name_ar','Arabic Area','Area Arabic','Area','Zone','District','Region','المنطقة','المنطقة / Area','اسم المنطقة','اسم المنطقة بالعربي','اسم المنطقة / Area'])) || areaEn;
        let govRaw=cleanString(r.__emirate_column_d || '');
        if(!areaName){ skipped++; errors.push({row:i+2,error:'اسم المنطقة غير موجود في الصف'}); continue; }
        // Column D is the source of the governorate/emirate. If D is empty,
        // accept an explicitly named Emirate/Governorate column as a fallback.
        if(!govRaw){
          govRaw=cleanString(pick(r,['Governorate','governorate','Emirate','emirate','governorate_ar','الإمارة','اسم الإمارة','الإمارة بالعربي','الإمارة / Governorate','Emirate / Governorate','اسم الإمارة / Governorate']));
        }
        const region=regionFor(govRaw);
        if(!govRaw || !region){ skipped++; errors.push({row:i+2,error:`الإمارة غير موجودة في Excel: ${govRaw||'فارغ'}`}); continue; }
        const gov=await ensureGovernorate(govRaw);
        if(!gov){ skipped++; errors.push({row:i+2,error:`الإمارة غير موجودة أو تعذر إنشاؤها: ${govRaw}`}); continue; }
        const keyAr=`${String(gov.id)}|${normalize(areaName)}`;
        const keyEn=areaEn?`${String(gov.id)}|${normalize(areaEn)}`:'';
        if(existing.has(keyAr) || (keyEn && existing.has(keyEn))){ skipped++; continue; }
        try {
          const inserted=firstRow(await dbInsert('areas',{company_id:companyId,governorate_id:gov.id,name_ar:areaName,name_en:areaEn||null}));
          if(!inserted) throw new Error('لم يؤكد النظام حفظ المنطقة');
          existing.add(keyAr); if(keyEn)existing.add(keyEn); imported++;
        } catch(e){ skipped++; errors.push({row:i+2,error:e.message}); }
      }
      return json(res,200,{success:true,imported,skipped,error_count:errors.length,errors:errors.slice(0,50),governorates_created:governoratesCreated});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if (pathname === '/api/drivers/statement' && req.method === 'GET') {
    const user = await requireRole(req, res, 'drivers');
    if (!user) return;
    try {
      const driverId = url.searchParams.get('driver_id') || '';
      if (!driverId) return json(res, 400, { success: false, error: 'السائق مطلوب' });
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const companyId = await resolveCompanyId(user);
      const driver = firstRow(await dbSelect('drivers', { select: '*', id: `eq.${driverId}`, company_id: `eq.${companyId}`, limit: 1 }));
      if (!driver) return json(res, 404, { success: false, error: 'السائق غير موجود' });
      const jobs = await dbSelect('delivery_jobs', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000 });
      const jobIds = jobs.map(j => j.id).filter(Boolean);
      const linkBatches = [];
      for (let i = 0; i < jobIds.length; i += 100) {
        const ids = jobIds.slice(i, i + 100).map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
        linkBatches.push(dbSelect('delivery_job_shipments', {
          select: '*', delivery_job_id: `in.(${ids})`, limit: 10000
        }).catch(() => []));
      }
      const links = [];
      for (let i = 0; i < linkBatches.length; i += 10) {
        links.push(...(await Promise.all(linkBatches.slice(i, i + 10))).flat());
      }
      const latestAssignments = latestDeliveryJobAssignments(jobs, links);
      const shipmentIds = [...new Set(links.map(x => x.shipment_id).filter(Boolean))];
      let shipments = [];
      for (const sid of shipmentIds) { try { shipments.push(...await dbSelect('shipments', { select: '*', id: `eq.${sid}`, limit: 1 })); } catch (_) {} }
      // Only the latest active Delivery Job assignment determines which driver's
      // operational statement owns this shipment; old assignments cannot duplicate it.
      shipments = shipments.filter(sh => String(latestAssignments.get(String(sh.id || ''))?.job?.driver_id || '') === String(driverId));
      const orderIds = [...new Set(shipments.map(x => x.order_id).filter(Boolean))];
      let orders = [];
      for (const oid of orderIds) { try { orders.push(...await dbSelect('orders', { select: '*', id: `eq.${oid}`, limit: 1 })); } catch (_) {} }
      const byOrder = new Map(orders.map(o => [String(o.id), o]));
      // Keep the original/base return status separately from the active shipment status.
      // Example: original_status=Replaced while the current status is Return to Origin.
      const returnStatusRows = await dbSelect('return_transactions', {
        select: 'id,order_id,shipment_id,original_status,return_status,created_at',
        company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 50000
      }).catch(() => []);
      const returnStatusByOrder = new Map();
      for (const rt of returnStatusRows) {
        const key = String(rt.order_id || '');
        if (key && !returnStatusByOrder.has(key)) returnStatusByOrder.set(key, rt);
      }
      // Compare calendar dates in the configured company timezone (Egypt by default),
      // not server-local midnight timestamps. This prevents saved settlements near
      // UTC midnight from appearing under the previous/next day in Driver Account.
      const settlementDay = (value) => {
        const text = String(value || '').trim();
        if (!text) return '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        return egyptDateISO(text);
      };
      const orderRowsRaw = [];
      for (const sh of shipments) {
        const o = byOrder.get(String(sh.order_id)) || {};
        const assignment = latestAssignments.get(String(sh.id || ''));
        const deliveryDay = operationalOrderDay(o, sh, assignment?.job);
        const stamp = deliveryDay ? new Date(`${deliveryDay}T12:00:00`).getTime() : NaN;
        const state = commissionState(o);
        const returnState = returnStatusByOrder.get(String(o.id)) || null;
        const actionKey = String(o.driver_statement_action || '').toLowerCase().replace(/[ _-]+/g, ' ').trim();
        const actionLabels = { replace: 'Replace', 'return to origin': 'Return to Origin', 'return by driver': 'Return by Driver', cancelled: 'Cancelled', 'location change': 'Location Change', 'future delivery': 'Future Delivery', 'schedule for tomorrow': 'Schedule for Tomorrow' };
        const secondaryStatus = o.secondary_status || o.sub_status || o.substatus || o.return_status ||
          (actionKey ? (actionLabels[actionKey] || actionKey.replace(/\b\w/g, c => c.toUpperCase())) : '') ||
          (returnState?.return_status && commissionStatusKey(returnState.return_status) !== commissionStatusKey(o.status) ? returnState.return_status : '');
        orderRowsRaw.push({ ...o, shipment_id: sh.id, shipment_no: sh.shipment_no, tracking_number: sh.tracking_number, job_code: sh.job_code || sh.delivery_job_code || '', original_status: returnState?.original_status || o.original_status || o.invoice_status || '', secondary_status: secondaryStatus, sub_status: o.sub_status || secondaryStatus, return_status: returnState?.return_status || o.return_status || '', job_id: assignment?.job?.id || null, eligible: state.eligible && Number.isFinite(stamp), verify_status: state.verify_status, paid_status: state.paid_status, driver_settlement_paid: String(o.commission_paid_status || '').trim().toLowerCase() === 'paid' || Boolean(o.commission_paid_at), paid_status: (String(o.commission_paid_status || '').trim().toLowerCase() === 'paid' || Boolean(o.commission_paid_at)) ? 'paid' : 'unpaid', driver_amount: driverOrderValue(o), driver_accounting_amount: driverAccountingAmount({ ...o, original_status: returnState?.original_status || o.original_status || o.invoice_status || '' }), delivery_date: deliveryDay, _stamp: stamp });
      }
      const statementDate = from || egyptTodayISO();
      const orderRows = orderRowsRaw.filter(o => {
        if (from && (!o.delivery_date || o.delivery_date < from)) return false;
        if (to && (!o.delivery_date || o.delivery_date > to)) return false;
        if (o.statement_removed_at || commissionStatusKey(o.status) === 'in ops') return false;
        if (isScheduledOperationalOrder(o) && o.driver_scheduled_date && o.driver_scheduled_date !== statementDate) return false;
        return true;
      });
      const returnRows = orderRowsRaw.filter(o =>
        o.driver_scheduled_date === statementDate &&
        isScheduledOperationalOrder(o) &&
        ['return by driver','future delivery','location change','schedule for tomorrow'].includes(String(o.driver_statement_action || o.status || '').toLowerCase().replace(/[_-]+/g, ' '))
      );
      const expensesAll = await dbSelect('expenses', { select: '*', driver_id: `eq.${driverId}`, company_id: `eq.${companyId}`, order: 'expense_date.desc', limit: 5000 }).catch(() => []);
      const expenses = expensesAll.filter(e => {
        const expenseDay = String(e.expense_date || e.created_at || '').slice(0, 10);
        if (!expenseDay) return false;
        // Expenses belong to their saved expense_date, not the day the page is opened.
        return (!from || expenseDay >= from) && (!to || expenseDay <= to);
      });
      const settlements = await dbSelect('driver_settlements', { select: '*', driver_id: `eq.${driverId}`, company_id: `eq.${companyId}`, order: 'paid_at.desc', limit: 5000 }).catch(() => []);
      for (const expense of expenses) {
        const expenseDay = String(expense.expense_date || expense.created_at || '').slice(0,10);
        const ordersById = new Map((orderRowsRaw || []).map(o => [String(o.id), o]));
        const settlementStillPaid = st => {
          const note = String(st.notes || '');
          if (!note.startsWith('TDS_DRIVER_SETTLEMENT|')) return false;
          const ids = (note.split('|')[2] || '').split(',').map(v => v.trim()).filter(Boolean);
          // Lock only while every order in the settlement group remains Paid.
          // Reverting any order to Unpaid restores the expense controls.
          return ids.length > 0 && ids.every(orderId => {
            const order = ordersById.get(orderId);
            return order && (String(order.commission_paid_status || '').trim() ? String(order.commission_paid_status || '').trim().toLowerCase() === 'paid' : Boolean(order.commission_paid_at));
          });
        };
        const isLocked = Boolean(expenseDay) && settlements.some(st => settlementDay(st.paid_at||st.created_at) === expenseDay && settlementStillPaid(st));
        expense.can_edit = !isLocked;
        if (isLocked) expense.edit_locked_reason = 'مقفل لوجود أوردرات مدفوعة في التسوية';
      }
      const filteredSettlements = settlements.filter(x => {
        const day = settlementDay(x.paid_at || x.created_at);
        return Boolean(day) && (!from || day >= from) && (!to || day <= to);
      });
      // Source of truth for Cash/Credit visibility: active saved settlement records
      // as well as order-level commission fields. Older deployments can successfully
      // save the settlement rows while the order flags are stale/not returned by the
      // schema cache; parse the order IDs stored in each active settlement group.
      const settledOrderIds = new Set();
      for (const settlement of filteredSettlements) {
        const note = String(settlement.notes || '');
        const match = note.match(/^TDS_DRIVER_SETTLEMENT\|[^|]+\|([^|]*)\|/);
        if (!match) continue;
        for (const id of String(match[1] || '').split(',').map(v => v.trim()).filter(Boolean)) settledOrderIds.add(id);
      }
      for (const order of orderRows) {
        if (settledOrderIds.has(String(order.id))) {
          order.driver_settlement_paid = true;
          order.paid_status = 'paid';
          order.verify_status = 'paid';
        }
      }
      const employeeIds = [...new Set([...expenses.map(e => e.employee_id), ...filteredSettlements.map(e => e.employee_id)].filter(Boolean).map(String))];
      const employeeRows = employeeIds.length ? await dbSelect('users', { select: 'id,name,username,employee_code', limit: 1000 }).catch(() => []) : [];
      const employeeMap = new Map(employeeRows.map(u => [String(u.id), u]));
      const expensesWithEmployee = expenses.map(e => { const u = employeeMap.get(String(e.employee_id)); return { ...e, created_by_name: u?.name || u?.username || '', created_by_code: u?.employee_code || '' }; });
      const settlementsWithEmployee = filteredSettlements.map(e => { const u = employeeMap.get(String(e.employee_id)); return { ...e, employee_name: u?.name || u?.username || '', employee_code: u?.employee_code || '' }; });
      // Normalize approval flags from legacy and current accounting fields. The
      // statement must not show zero merely because one historical flag is absent.
      const isAccountingApproved = (o) => {
        const state = commissionState(o);
        const flags = [o.commission_verify_status, o.verify_status, o.verification_status,
          o.accounting_status, o.approval_status, o.commission_paid_status, o.paid_status]
          .map(v => String(v || '').trim().toLowerCase().replace(/[_-]+/g, ' '));
        return state.verify_status === 'verified' || state.paid_status === 'paid' ||
          flags.some(v => ['verified','approved','paid','تم الاعتماد','معتمد','تم الدفع','مدفوع'].includes(v));
      };
      const approvedRows = orderRows.filter(o => isAccountingApproved(o) && o.paid_status !== 'paid');
      const orderTotal = approvedRows.reduce((sum, o) => sum + driverAccountingAmount(o), 0);
      const expenseTotal = expensesWithEmployee.filter(e => String(e.category || '').toLowerCase() !== 'shortage').reduce((sum,e)=>sum+cleanNumber(e.amount),0);
      const shortageTotal = expensesWithEmployee.filter(e => String(e.category || '').toLowerCase() === 'shortage').reduce((sum,e)=>sum+cleanNumber(e.amount),0);
      const settlementTotal = settlementsWithEmployee.reduce((sum,e)=>sum+cleanNumber(e.amount),0);
      // orderTotal contains only approved orders that are still unpaid. Therefore, subtracting
      // historical settlements again would double-deduct payments already reflected by excluding
      // paid orders, and make the UI Amount Due disagree with the settlement API. Expenses and
      // shortages both reduce the outstanding order value; settlementTotal remains informational.
      const deductions = expenseTotal + shortageTotal;
      const required = Math.max(0, Number((orderTotal - deductions).toFixed(2)));
      return json(res, 200, { success: true, data: { driver, orders: orderRows, returnOrders: returnRows, expenses: expensesWithEmployee, settlements: settlementsWithEmployee, totals: { orderTotal, approvedOrderTotal:orderTotal, expenseTotal, shortageTotal, settlementTotal, deductions, required } } });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/driver-settlements' && req.method === 'POST') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const settlementRole = { ...(roles[user.role] || roles.employee), ...(user.permissions || {}) };
    if (!settlementRole.drivers && !settlementRole.accounting) return json(res,403,{success:false,error:'ليس لديك صلاحية لتسوية حساب المندوب'});
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      if (!body.driver_id || !cleanNumber(body.amount)) return json(res, 400, { success: false, error: 'السائق والمبلغ مطلوبان' });
      const requestedTotal = Number((cleanNumber(body.cash_amount) + cleanNumber(body.credit_amount)).toFixed(2));
      const submittedAmount = Number(cleanNumber(body.amount).toFixed(2));
      if (body.cash_amount !== undefined || body.credit_amount !== undefined) {
        if (cleanNumber(body.cash_amount) < 0 || cleanNumber(body.credit_amount) < 0) return json(res,400,{success:false,error:'الكاش والكريدت لا يمكن أن يكونا بالسالب'});
        if (Math.abs(requestedTotal - submittedAmount) > 0.01) return json(res,400,{success:false,error:`إجمالي الكاش + الكريدت (${requestedTotal.toFixed(2)}) لا يساوي Amount (${submittedAmount.toFixed(2)})`});
      }
      const settlementAmount = requestedTotal > 0 ? requestedTotal : cleanNumber(body.amount);
      const hasSplit = body.cash_amount !== undefined || body.credit_amount !== undefined;
      // Load the order and shipment maps before resolving an implicit order selection.
      // The previous order referenced these const variables before initialization and
      // caused Save Settlement to fail with a temporal-dead-zone ReferenceError.
      const allDriverOrders = await dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const allDriverShipments = await dbSelect('shipments',{select:'id,order_id,driver_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      // Some deployments store the actual driver assignment on Delivery Job rather
      // than directly on shipments.driver_id. Resolve both shapes consistently.
      const companyJobs = await dbSelect('delivery_jobs',{select:'id,driver_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const companyJobIds = new Set(companyJobs.map(j=>String(j.id)));
      const jobDriverByShipment = new Map();
      const allJobLinks = await dbSelect('delivery_job_shipments',{select:'delivery_job_id,shipment_id',limit:30000}).catch(()=>[]);
      const jobDriverById = new Map(companyJobs.map(j=>[String(j.id),String(j.driver_id||'')]));
      for (const link of allJobLinks) {
        const jobId=String(link.delivery_job_id||'');
        const driverId=jobDriverById.get(jobId);
        if (companyJobIds.has(jobId) && driverId && link.shipment_id) jobDriverByShipment.set(String(link.shipment_id),driverId);
      }
      const shipmentByOrder = new Map(allDriverShipments.map(sh=>[String(sh.order_id),sh]));
      const driverForOrder = (orderId) => {
        const sh=shipmentByOrder.get(String(orderId));
        return String(sh?.driver_id || jobDriverByShipment.get(String(sh?.id||'')) || '');
      };
      // Settlement is scoped to the exact statement shown to the user, not every order ever assigned to this driver.
      let orderIds = Array.isArray(body.order_ids) ? [...new Set(body.order_ids.filter(Boolean).map(String))] : [];
      // Accounting page may submit a driver-level settlement without an explicit checklist.
      // Resolve only approved, unpaid orders assigned to this driver; never auto-verify an order here.
      if (hasSplit && !orderIds.length) {
        orderIds = allDriverOrders.filter(o => {
          const id=String(o.id);
          const did=driverForOrder(id);
          const flags=[o.commission_verify_status,o.verify_status,o.verification_status,o.accounting_status,o.approval_status].map(v=>String(v||'').trim().toLowerCase().replace(/[_-]+/g,' '));
          // Use the same normalized commission state as the statement page; older
          // records may store approval/payment in legacy columns instead of the
          // newest commission_* fields.
          const state=commissionState(o);
          const approved=state.verify_status==='verified' || flags.some(v=>['verified','approved','تم الاعتماد','معتمد'].includes(v));
          const paid=state.paid_status==='paid' || flags.some(v=>['paid','تم الدفع','مدفوع'].includes(v));
          return did===String(body.driver_id) && approved && state.eligible && !paid && !o.statement_removed_at && commissionStatusKey(o.status)!=='in ops';
        }).map(o=>String(o.id));
      }
      if (hasSplit && !orderIds.length) return json(res,400,{success:false,error:'لا توجد أوردرات معتمدة وغير مدفوعة لهذا المندوب'});
      const selectedOrders = [];
      for (const id of orderIds) {
        const o = allDriverOrders.find(x=>String(x.id)===id);
        if (!o) return json(res,400,{success:false,error:`الأوردر ${id} غير موجود داخل الشركة`});
        if (driverForOrder(id) !== String(body.driver_id)) return json(res,400,{success:false,error:`الأوردر ${id} غير تابع للمندوب المحدد`});
        if (String(o.commission_paid_status||'').toLowerCase()==='paid') return json(res,400,{success:false,error:`الأوردر ${id} تمت تسوية عمولته بالفعل`});
        const flags=[o.commission_verify_status,o.verify_status,o.verification_status,o.accounting_status,o.approval_status].map(v=>String(v||'').trim().toLowerCase().replace(/[_-]+/g,' '));
        const state=commissionState(o);
        if (!(state.verify_status==='verified' || flags.includes('verified') || flags.includes('approved') || flags.includes('تم الاعتماد') || flags.includes('معتمد'))) return json(res,400,{success:false,error:`الأوردر ${id} غير معتمد`});
        if (!state.eligible) return json(res,400,{success:false,error:`حالة الأوردر ${id} غير مؤهلة للتسوية`});
        selectedOrders.push(o);
      }
      const statementFrom = cleanString(body.statement_from);
      const statementTo = cleanString(body.statement_to);
      const inStatementRange = (value) => { const d=String(value||'').slice(0,10); return (!statementFrom||d>=statementFrom)&&(!statementTo||d<=statementTo); };
      const approvedOrderValue = selectedOrders.reduce((sum,o)=>sum+driverAccountingAmount(o),0);
      const driverExpenses = await dbSelect('expenses',{select:'amount,driver_id,category,expense_date,created_at',company_id:`eq.${companyId}`,driver_id:`eq.${body.driver_id}`,limit:10000}).catch(()=>[]);
      const expenseTotal = driverExpenses.filter(e=>inStatementRange(e.expense_date||e.created_at)).reduce((sum,e)=>sum+cleanNumber(e.amount),0);
      const previousSettlements = await dbSelect('driver_settlements',{select:'amount,paid_at,created_at,notes',company_id:`eq.${companyId}`,driver_id:`eq.${body.driver_id}`,limit:10000}).catch(()=>[]);
      const paidAt = body.paid_at || new Date().toISOString();
      const settlementDay = accountingDay(paidAt);
      // Prevent duplicate completed settlements, but allow retrying when an earlier partial save
      // left settlement rows without actually marking their referenced orders paid.
      if (hasSplit) {
        const ordersById = new Map(allDriverOrders.map(o => [String(o.id), o]));
        const activeSameDaySettlement = previousSettlements.some(e => {
          const note=String(e.notes||'');
          if (!note.startsWith('TDS_DRIVER_SETTLEMENT|') || accountingDay(e.paid_at||e.created_at) !== settlementDay) return false;
          const ids=String(note.split('|')[2]||'').split(',').filter(Boolean);
          if (!ids.length) return true; // protect legacy settlements without order references
          const referenced=ids.map(id=>ordersById.get(String(id)));
          if (referenced.some(o=>!o)) return true; // unknown references remain protected
          return referenced.some(o => {
            const state=commissionState(o);
            return state.paid_status==='paid' || String(o.commission_paid_status||'').toLowerCase()==='paid';
          });
        });
        if (activeSameDaySettlement) return json(res, 409, { success:false, error:'تم حفظ تسوية فعلية لهذا المندوب في نفس اليوم بالفعل. ألغِ التسوية السابقة أولاً إذا كنت تريد إعادة الحفظ.' });
      }
      const previousPaid = previousSettlements.filter(e=>!String(e.notes||'').startsWith('TDS_DRIVER_SETTLEMENT_CANCELLED')&&inStatementRange(e.paid_at||e.created_at)).reduce((sum,e)=>sum+cleanNumber(e.amount),0);
      // selectedOrders contains only unpaid orders, so subtracting previous settlements again double-deducts old payments.
      // For the driver statement page, Amount Due is already calculated by the
      // statement endpoint from the same approved/unpaid rows and dated expenses.
      // Recalculating it here from a second query can disagree when legacy approval,
      // delivery-date, or expense-date fields differ. Accept that displayed due only
      // when explicit order IDs are supplied, and never allow it to exceed the gross
      // value of those validated orders. The UI's due already includes deductions;
      // subtracting expenses a second time is the source of false short-payment errors.
      const suppliedDue = body.expected_due !== undefined && Number.isFinite(Number(body.expected_due))
        ? Number(Number(body.expected_due).toFixed(2)) : null;
      const balanceDue = hasSplit && orderIds.length && suppliedDue !== null
        ? Math.max(0, suppliedDue)
        : Math.max(0, Number((approvedOrderValue - expenseTotal).toFixed(2)));
      if (hasSplit && balanceDue > approvedOrderValue + 0.01) return json(res,400,{success:false,error:`المبلغ المستحق المرسل (${balanceDue.toFixed(2)}) أكبر من إجمالي الأوردرات المعتمدة (${approvedOrderValue.toFixed(2)})`});
      if (hasSplit && Math.abs(settlementAmount - balanceDue) > 0.01) return json(res,400,{success:false,error:`إجمالي الكاش + الكريدت (${settlementAmount.toFixed(2)}) يجب أن يساوي المتبقي الظاهر في كشف المندوب (${balanceDue.toFixed(2)})`});
      if (settlementAmount > balanceDue + 0.01) return json(res,400,{success:false,error:`مبلغ التسوية أكبر من المستحق الحالي (${balanceDue.toFixed(2)})`});
      const settlementGroup = cleanString(body.group_id) || `st${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
      const orderIdNote = orderIds.join(',');
      const employeeId = user.id === 'env-admin' ? null : user.id;
      if (hasSplit) {
        const cashAmount = cleanNumber(body.cash_amount);
        const creditAmount = cleanNumber(body.credit_amount);
        if (cashAmount < 0 || creditAmount < 0) return json(res, 400, { success: false, error: 'الكاش والكريدت لا يمكن أن يكونا بالسالب' });
        const total = Number((cashAmount + creditAmount).toFixed(2));
        if (total <= 0) return json(res, 400, { success: false, error: 'مبلغ التسوية مطلوب' });
        const rows = [];
        if (cashAmount > 0) rows.push({ company_id: companyId, driver_id: body.driver_id, amount: cashAmount, payment_method: 'cash', bank_name: null, transfer_reference: null, paid_at: paidAt, employee_id: employeeId, notes: `TDS_DRIVER_SETTLEMENT|${settlementGroup}|${orderIdNote}|Cash portion` });
        if (creditAmount > 0) rows.push({ company_id: companyId, driver_id: body.driver_id, amount: creditAmount, payment_method: 'bank', bank_name: null, transfer_reference: null, paid_at: paidAt, employee_id: employeeId, notes: `TDS_DRIVER_SETTLEMENT|${settlementGroup}|${orderIdNote}|Credit portion` });
        const created = [];
        for (const row of rows) { const data = firstRow(await dbInsert('driver_settlements', row)); if (data) created.push(data); await audit(user, 'create_driver_settlement', 'driver_settlement', data?.id || null, row); }
        for (const order of selectedOrders) {
          const patch = { commission_paid_status:'paid', commission_paid_at:paidAt, commission_paid_by:employeeId, commission_payment_method: cashAmount > 0 && creditAmount > 0 ? 'mixed' : (cashAmount > 0 ? 'cash' : 'credit') };
          await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},patch);
          await audit(user,'driver_account_settlement_paid_order','order',order.id,{settlement_group:settlementGroup,after:patch});
        }
        return json(res, 200, { success: true, data: { settlements: created, cash_amount: cashAmount, credit_amount: creditAmount, total, group_id:settlementGroup, paid_order_ids:orderIds } });
      }
      const method = cleanString(body.payment_method).toLowerCase();
      if (!['cash','bank','credit'].includes(method)) return json(res, 400, { success: false, error: 'طريقة الدفع غير صحيحة' });
      if (method === 'bank' && !cleanString(body.bank_name)) return json(res, 400, { success: false, error: 'اسم البنك مطلوب' });
      const storedMethod = method === 'credit' ? 'bank' : method;
      const row = { company_id: companyId, driver_id: body.driver_id, amount: cleanNumber(body.amount), payment_method: storedMethod, bank_name: cleanString(body.bank_name) || null, transfer_reference: cleanString(body.transfer_reference) || null, paid_at: paidAt, employee_id: employeeId, notes: cleanString(body.notes) || null };
      const data = firstRow(await dbInsert('driver_settlements', row));
      await audit(user, 'create_driver_settlement', 'driver_settlement', data?.id || null, row);
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/driver-settlements/cancel' && req.method === 'POST') {
    const user = await requireAuth(req, res); if (!user) return;
    const settlementRole = { ...(roles[user.role] || roles.employee), ...(user.permissions || {}) };
    if (!settlementRole.drivers && !settlementRole.accounting) return json(res,403,{success:false,error:'ليس لديك صلاحية لإلغاء التسوية'});
    try {
      const body = await bodyJson(req); const groupId = cleanString(body.group_id); const companyId = await resolveCompanyId(user);
      if (!groupId) return json(res,400,{success:false,error:'رقم التسوية مطلوب'});
      const records = await dbSelect('driver_settlements',{select:'*',company_id:`eq.${companyId}`,driver_id:`eq.${body.driver_id}`,limit:10000}).catch(()=>[]);
      const matched = records.filter(r=>String(r.notes||'').startsWith(`TDS_DRIVER_SETTLEMENT|${groupId}|`));
      if (!matched.length) return json(res,404,{success:false,error:'لم يتم العثور على التسوية أو أنها أُلغيت بالفعل'});
      const allIds = [...new Set(matched.flatMap(r=>{const a=String(r.notes||'').split('|');return (a[2]||'').split(',').filter(Boolean)}))];
      for (const id of allIds) {
        const order = firstRow(await dbSelect('orders',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
        if (!order) continue;
        const patch = { commission_paid_status:'unpaid', commission_paid_at:null, commission_paid_by:null, commission_payment_method:null };
        await dbUpdate('orders',{id:`eq.${id}`,company_id:`eq.${companyId}`},patch);
        await audit(user,'cancel_driver_account_settlement_order','order',id,{settlement_group:groupId,before:{commission_paid_status:order.commission_paid_status},after:patch});
      }
      for (const r of matched) if (r.id) await dbDelete('driver_settlements',{id:`eq.${r.id}`,company_id:`eq.${companyId}`});
      await audit(user,'cancel_driver_account_settlement','driver_settlement',groupId,{deleted_records:matched.length,unlocked_orders:allIds});
      return json(res,200,{success:true,data:{group_id:groupId,cancelled_records:matched.length,unlocked_orders:allIds.length}});
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  // Employee payroll is intentionally isolated from driver settlements and company cash/bank ledgers.
  if (pathname.startsWith('/api/payroll/')) {
    const user = await requireAuth(req, res); if (!user) return;
    const role = { ...(roles[user.role] || roles.employee), ...(user.permissions || {}) };
    if (!(role.accounting || user.role === 'admin' || user.role === 'manager')) return json(res,403,{success:false,error:'ليس لديك صلاحية لإدارة أجور الموظفين'});
    const companyId = await resolveCompanyId(user);
    const actor = user.id === 'env-admin' ? null : String(user.id || '');
    try {
      if (pathname === '/api/payroll/employees' && req.method === 'GET') {
        const data = await dbSelect('payroll_employees',{select:'*',company_id:`eq.${companyId}`,active:'eq.true',order:'name.asc',limit:10000});
        return json(res,200,{success:true,data});
      }
      const payrollEmployeeDelete = pathname.match(/^\/api\/payroll\/employees\/([^/]+)$/);
      if (payrollEmployeeDelete && req.method === 'DELETE') {
        const employeeId = decodeURIComponent(payrollEmployeeDelete[1]);
        const employee = firstRow(await dbSelect('payroll_employees', {
          select: 'id,name,active',
          id: `eq.${employeeId}`,
          company_id: `eq.${companyId}`,
          limit: 1
        }));
        if (!employee) return json(res, 404, {success:false, error:'الموظف غير موجود أو لا يتبع هذه الشركة'});
        // A true delete is allowed only when no paid receipt/history would be destroyed.
        const items=await dbSelect('payroll_items',{select:'id,paid_amount',company_id:`eq.${companyId}`,employee_id:`eq.${employeeId}`,limit:10000});
        for(const item of items){const receipts=await dbSelect('payroll_receipts',{select:'id',company_id:`eq.${companyId}`,item_id:`eq.${item.id}`,limit:1});if(Number(item.paid_amount||0)>0||receipts.length)return json(res,409,{success:false,error:'لا يمكن حذف الموظف نهائيًا لأن له سجلات صرف أو إيصالات مالية. تم الحفاظ على السجل المالي؛ استخدم إيقاف الموظف بدلًا من الحذف النهائي.'});}
        for(const item of items){await dbDelete('payroll_adjustments',{company_id:`eq.${companyId}`,item_id:`eq.${item.id}`});await dbDelete('payroll_items',{company_id:`eq.${companyId}`,id:`eq.${item.id}`});}
        const deleted=await dbDelete('payroll_employees',{id:`eq.${employeeId}`,company_id:`eq.${companyId}`});
        const remains=firstRow(await dbSelect('payroll_employees',{select:'id',id:`eq.${employeeId}`,company_id:`eq.${companyId}`,limit:1}));
        if(remains)return json(res,500,{success:false,error:'لم يتم حذف الموظف فعليًا من قاعدة البيانات. تحقق من صلاحيات DELETE في Supabase.'});
        await audit(user,'delete_payroll_employee','payroll_employee',employeeId,{name:employee.name,deleted_items:items.length});
        return json(res,200,{success:true,data:{id:employeeId,deleted:true},message:'تم حذف الموظف فعليًا من قاعدة البيانات وكشوف الرواتب غير المصروفة'});
      }
      const payrollEmployeeEdit = pathname.match(/^\/api\/payroll\/employees\/([^/]+)$/);
      if (payrollEmployeeEdit && req.method === 'PATCH') {
        const employeeId=decodeURIComponent(payrollEmployeeEdit[1]), b=await bodyJson(req);
        const name=cleanString(b.name), job=cleanString(b.job_title), salary=cleanNumber(b.base_salary), delivery=cleanNumber(b.delivery_commission), pickup=cleanNumber(b.pickup_commission), isDriver=Boolean(b.is_driver);
        if(!name||!job||salary<0||delivery<0||pickup<0)return json(res,400,{success:false,error:'بيانات الموظف والمبالغ مطلوبة ويجب ألا تكون سالبة'});
        const existing=firstRow(await dbSelect('payroll_employees',{select:'id',id:`eq.${employeeId}`,company_id:`eq.${companyId}`,limit:1}));
        if(!existing)return json(res,404,{success:false,error:'الموظف غير موجود أو لا يتبع هذه الشركة'});
        const patch={name,job_title:job,base_salary:salary,is_driver:isDriver,linked_driver_id:isDriver?(cleanString(b.linked_driver_id)||null):null,delivery_commission:isDriver?delivery:0,pickup_commission:isDriver?pickup:0,updated_at:new Date().toISOString()};
        const updated=firstRow(await dbUpdate('payroll_employees',{id:`eq.${employeeId}`,company_id:`eq.${companyId}`},patch));
        if(!updated)return json(res,500,{success:false,error:'تعذر حفظ تعديل الموظف'});
        // Refresh only unpaid salary snapshots; paid/part-paid payroll history remains unchanged.
        const items=await dbSelect('payroll_items',{select:'id,period_id,paid_amount',employee_id:`eq.${employeeId}`,company_id:`eq.${companyId}`,limit:10000});
        for(const item of items){if(Number(item.paid_amount||0)>0)continue;const period=firstRow(await dbSelect('payroll_periods',{select:'status',id:`eq.${item.period_id}`,company_id:`eq.${companyId}`,limit:1}));if(period?.status==='closed')continue;await dbUpdate('payroll_items',{id:`eq.${item.id}`,company_id:`eq.${companyId}`},{employee_name:name,job_title:job,base_salary:salary});}
        await audit(user,'update_payroll_employee','payroll_employee',employeeId,{name,job_title:job,base_salary:salary,is_driver:isDriver});
        return json(res,200,{success:true,data:updated});
      }
      if (pathname === '/api/payroll/employees' && req.method === 'POST') {
        const b = await bodyJson(req);
        const name=cleanString(b.name), job=cleanString(b.job_title), salary=cleanNumber(b.base_salary);
        if(!name||!job) return json(res,400,{success:false,error:'اسم الموظف والمهنة مطلوبان'});
        if(salary<0||cleanNumber(b.delivery_commission)<0||cleanNumber(b.pickup_commission)<0) return json(res,400,{success:false,error:'المبالغ لا يمكن أن تكون سالبة'});
        const isDriver=Boolean(b.is_driver);
        const row={company_id:companyId,name,job_title:job,is_driver:isDriver,linked_driver_id:isDriver?(cleanString(b.linked_driver_id)||null):null,base_salary:salary,delivery_commission:isDriver?cleanNumber(b.delivery_commission):0,pickup_commission:isDriver?cleanNumber(b.pickup_commission):0,active:true,created_by:actor};
        const data=firstRow(await dbInsert('payroll_employees',row));
        await audit(user,'create_payroll_employee','payroll_employee',data?.id||null,{name,job_title:job,is_driver:isDriver});
        return json(res,201,{success:true,data});
      }
      if (pathname === '/api/payroll/period' && req.method === 'GET') {
        const month=cleanString(url.searchParams.get('month'));
        if(!/^\d{4}-\d{2}$/.test(month)) return json(res,400,{success:false,error:'الشهر مطلوب بصيغة YYYY-MM'});
        const period=firstRow(await dbSelect('payroll_periods',{select:'*',company_id:`eq.${companyId}`,month_key:`eq.${month}`,limit:1}));
        if(!period) return json(res,200,{success:true,data:{period:null,items:[]}});
        const items=await dbSelect('payroll_items',{select:'*',company_id:`eq.${companyId}`,period_id:`eq.${period.id}`,order:'employee_name.asc',limit:10000});
        const adjustments=await dbSelect('payroll_adjustments',{select:'*',company_id:`eq.${companyId}`,limit:20000});
        const receipts=await dbSelect('payroll_receipts',{select:'*',company_id:`eq.${companyId}`,limit:20000});
        const data=items.map(i=>{const a=adjustments.filter(x=>String(x.item_id)===String(i.id));const additions=a.filter(x=>x.kind==='addition').reduce((n,x)=>n+cleanNumber(x.amount),0);const deductions=a.filter(x=>x.kind==='deduction').reduce((n,x)=>n+cleanNumber(x.amount),0);const paid=receipts.filter(x=>String(x.item_id)===String(i.id)).reduce((n,x)=>n+cleanNumber(x.amount),0);const net=cleanNumber(i.base_salary)+additions-deductions;return {...i,additions:Number(additions.toFixed(2)),deductions:Number(deductions.toFixed(2)),paid_amount:Number(paid.toFixed(2)),status:paid>=net?'paid':paid>0?'partial':'unpaid'};});
        return json(res,200,{success:true,data:{period,items:data}});
      }
      if (pathname === '/api/payroll/generate' && req.method === 'POST') {
        const b=await bodyJson(req), month=cleanString(b.month);
        if(!/^\d{4}-\d{2}$/.test(month)) return json(res,400,{success:false,error:'الشهر مطلوب بصيغة YYYY-MM'});
        let period=firstRow(await dbSelect('payroll_periods',{select:'*',company_id:`eq.${companyId}`,month_key:`eq.${month}`,limit:1}));
        if(!period) period=firstRow(await dbInsert('payroll_periods',{company_id:companyId,month_key:month,status:'open',created_by:actor}));
        if(!period) throw new Error('تعذر إنشاء فترة الرواتب');
        const employees=await dbSelect('payroll_employees',{select:'*',company_id:`eq.${companyId}`,active:'eq.true',limit:10000});
        const existing=await dbSelect('payroll_items',{select:'employee_id',company_id:`eq.${companyId}`,period_id:`eq.${period.id}`,limit:10000});
        const seen=new Set(existing.map(x=>String(x.employee_id)));
        for(const e of employees){if(seen.has(String(e.id)))continue;await dbInsert('payroll_items',{company_id:companyId,period_id:period.id,employee_id:e.id,employee_name:e.name,job_title:e.job_title,base_salary:cleanNumber(e.base_salary),additions:0,deductions:0,paid_amount:0,status:'unpaid'});}
        const items=await dbSelect('payroll_items',{select:'*',company_id:`eq.${companyId}`,period_id:`eq.${period.id}`,order:'employee_name.asc',limit:10000});
        const adjustments=await dbSelect('payroll_adjustments',{select:'*',company_id:`eq.${companyId}`,limit:20000});const receipts=await dbSelect('payroll_receipts',{select:'*',company_id:`eq.${companyId}`,limit:20000});
        const data=items.map(i=>{const a=adjustments.filter(x=>String(x.item_id)===String(i.id));const additions=a.filter(x=>x.kind==='addition').reduce((n,x)=>n+cleanNumber(x.amount),0);const deductions=a.filter(x=>x.kind==='deduction').reduce((n,x)=>n+cleanNumber(x.amount),0);const paid=receipts.filter(x=>String(x.item_id)===String(i.id)).reduce((n,x)=>n+cleanNumber(x.amount),0);const net=cleanNumber(i.base_salary)+additions-deductions;return {...i,additions:Number(additions.toFixed(2)),deductions:Number(deductions.toFixed(2)),paid_amount:Number(paid.toFixed(2)),status:paid>=net?'paid':paid>0?'partial':'unpaid'};});
        await audit(user,'prepare_payroll_period','payroll_period',period.id,{month,employees:data.length});
        return json(res,200,{success:true,data:{period,items:data}});
      }
      if (pathname === '/api/payroll/adjustments' && req.method === 'POST') {
        const b=await bodyJson(req),kind=cleanString(b.kind),amount=cleanNumber(b.amount),reason=cleanString(b.reason),itemId=cleanString(b.item_id);
        if(!itemId||!['addition','deduction'].includes(kind)||amount<=0||!reason)return json(res,400,{success:false,error:'نوع التسوية والمبلغ والسبب مطلوبة'});
        const item=firstRow(await dbSelect('payroll_items',{select:'id,period_id,employee_id',id:`eq.${itemId}`,company_id:`eq.${companyId}`,limit:1}));if(!item)return json(res,404,{success:false,error:'سجل الراتب غير موجود'});
        const period=firstRow(await dbSelect('payroll_periods',{select:'status',id:`eq.${item.period_id}`,company_id:`eq.${companyId}`,limit:1}));if(period?.status==='closed')return json(res,400,{success:false,error:'فترة الرواتب مغلقة'});
        const data=firstRow(await dbInsert('payroll_adjustments',{company_id:companyId,item_id:itemId,kind,amount,reason,created_by:actor}));
        await audit(user,'create_payroll_adjustment','payroll_item',itemId,{kind,amount,reason});return json(res,201,{success:true,data});
      }
      const payrollItemProofMatch = pathname.match(/^\/api\/payroll\/items\/([^/]+)\/proof$/);
      if (payrollItemProofMatch && req.method === 'POST') {
        const itemId=payrollItemProofMatch[1], b=await bodyJson(req), proof=b.proof;
        const item=firstRow(await dbSelect('payroll_items',{select:'id,employee_name',id:`eq.${itemId}`,company_id:`eq.${companyId}`,limit:1}));
        if(!item)return json(res,404,{success:false,error:'سجل الراتب غير موجود'});
        const match=String(proof?.data_url||'').match(/^data:([^;]+);base64,(.+)$/s);
        if(!match)return json(res,400,{success:false,error:'صورة إثبات الصرف غير صالحة'});
        const contentType=cleanString(proof.content_type||match[1]);if(!['image/jpeg','image/png','image/webp'].includes(contentType))return json(res,400,{success:false,error:'المسموح صور JPG أو PNG أو WEBP فقط'});
        const raw=Buffer.from(match[2],'base64');if(!raw.length||raw.length>7*1024*1024)return json(res,400,{success:false,error:'حجم صورة الإثبات يجب ألا يتجاوز 7MB'});
        const ext=contentType==='image/png'?'png':contentType==='image/webp'?'webp':'jpg',storagePath=`${companyId}/items/${itemId}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
        await storageUpload('payroll-receipts',storagePath,raw,contentType);
        const data=firstRow(await dbUpdate('payroll_items',{id:`eq.${itemId}`,company_id:`eq.${companyId}`},{proof_storage_bucket:'payroll-receipts',proof_storage_path:storagePath,proof_file_name:cleanString(proof.file_name)||`payment-proof.${ext}`,proof_content_type:contentType}));
        await audit(user,'attach_payroll_item_proof','payroll_item',itemId,{employee_name:item.employee_name});
        return json(res,200,{success:true,data:{attached:true}});
      }
      if (payrollItemProofMatch && req.method === 'GET') {
        const item=firstRow(await dbSelect('payroll_items',{select:'id,proof_storage_bucket,proof_storage_path,proof_file_name,proof_content_type',id:`eq.${payrollItemProofMatch[1]}`,company_id:`eq.${companyId}`,limit:1}));
        if(!item?.proof_storage_path)return json(res,404,{success:false,error:'لا يوجد إثبات مرفق'});
        const response=await storageDownload(item.proof_storage_bucket||'payroll-receipts',item.proof_storage_path),raw=Buffer.from(await response.arrayBuffer());
        res.writeHead(200,{'Content-Type':item.proof_content_type||'application/octet-stream','Content-Length':raw.length,'Content-Disposition':`inline; filename=\"${String(item.proof_file_name||'payment-proof').replace(/\"/g,'')}\"`});return res.end(raw);
      }
      const payrollProofMatch = pathname.match(/^\/api\/payroll\/receipts\/([^/]+)\/proof$/);
      if (payrollProofMatch && req.method === 'GET') {
        const receipt=firstRow(await dbSelect('payroll_receipts',{select:'id,company_id,storage_bucket,storage_path,proof_file_name,proof_content_type',id:`eq.${payrollProofMatch[1]}`,company_id:`eq.${companyId}`,limit:1}));
        if(!receipt?.storage_path)return json(res,404,{success:false,error:'إثبات الصرف غير موجود'});
        const response=await storageDownload(receipt.storage_bucket||'payroll-receipts',receipt.storage_path);const raw=Buffer.from(await response.arrayBuffer());
        res.writeHead(200,{'Content-Type':receipt.proof_content_type||'application/octet-stream','Content-Length':raw.length,'Content-Disposition':`inline; filename=\"${String(receipt.proof_file_name||'payment-proof').replace(/\"/g,'')}\"`});return res.end(raw);
      }
      if (pathname === '/api/payroll/receipts' && req.method === 'GET') {
        const itemId=cleanString(url.searchParams.get('item_id'));if(!itemId)return json(res,400,{success:false,error:'سجل الراتب مطلوب'});
        const item=firstRow(await dbSelect('payroll_items',{select:'*',id:`eq.${itemId}`,company_id:`eq.${companyId}`,limit:1}));if(!item)return json(res,404,{success:false,error:'سجل الراتب غير موجود'});
        const [receipts,adjustments]=await Promise.all([dbSelect('payroll_receipts',{select:'*',company_id:`eq.${companyId}`,item_id:`eq.${itemId}`,order:'paid_at.asc',limit:10000}),dbSelect('payroll_adjustments',{select:'kind,amount,reason,created_at',company_id:`eq.${companyId}`,item_id:`eq.${itemId}`,order:'created_at.asc',limit:10000})]);return json(res,200,{success:true,data:{item,receipts,adjustments}});
      }
      if (pathname === '/api/payroll/receipts' && req.method === 'POST') {
        const b=await bodyJson(req),itemId=cleanString(b.item_id),amount=cleanNumber(b.amount),paidAt=cleanString(b.paid_at)||egyptTodayISO();
        if(!itemId||amount<=0||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(paidAt))return json(res,400,{success:false,error:'سجل الراتب والمبلغ والتاريخ مطلوبة'});
        const item=firstRow(await dbSelect('payroll_items',{select:'*',id:`eq.${itemId}`,company_id:`eq.${companyId}`,limit:1}));if(!item)return json(res,404,{success:false,error:'سجل الراتب غير موجود'});
        const period=firstRow(await dbSelect('payroll_periods',{select:'status,month_key',id:`eq.${item.period_id}`,company_id:`eq.${companyId}`,limit:1}));if(period?.status==='closed')return json(res,400,{success:false,error:'فترة الرواتب مغلقة'});
        const [adjustments,receipts]=await Promise.all([dbSelect('payroll_adjustments',{select:'kind,amount',company_id:`eq.${companyId}`,item_id:`eq.${itemId}`,limit:10000}),dbSelect('payroll_receipts',{select:'amount',company_id:`eq.${companyId}`,item_id:`eq.${itemId}`,limit:10000})]);
        const adds=adjustments.filter(x=>x.kind==='addition').reduce((n,x)=>n+cleanNumber(x.amount),0),deds=adjustments.filter(x=>x.kind==='deduction').reduce((n,x)=>n+cleanNumber(x.amount),0),net=cleanNumber(item.base_salary)+adds-deds,paid=receipts.reduce((n,x)=>n+cleanNumber(x.amount),0),remaining=Math.max(0,net-paid);
        if(amount>remaining+0.001)return json(res,400,{success:false,error:`المبلغ أكبر من المتبقي (${remaining.toFixed(2)})`});
        let proofFields={};
        if(b.proof?.data_url){
          const proof=b.proof,match=String(proof.data_url).match(/^data:([^;]+);base64,(.+)$/s);
          if(!match)return json(res,400,{success:false,error:'صورة إثبات الصرف غير صالحة'});
          const contentType=cleanString(proof.content_type||match[1]);if(!['image/jpeg','image/png','image/webp'].includes(contentType))return json(res,400,{success:false,error:'المسموح صور JPG أو PNG أو WEBP فقط'});
          const raw=Buffer.from(match[2],'base64');if(!raw.length||raw.length>7*1024*1024)return json(res,400,{success:false,error:'حجم صورة الإثبات يجب ألا يتجاوز 7MB'});
          const ext=contentType==='image/png'?'png':contentType==='image/webp'?'webp':'jpg',storagePath=`${companyId}/${itemId}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
          await storageUpload('payroll-receipts',storagePath,raw,contentType);proofFields={storage_bucket:'payroll-receipts',storage_path:storagePath,proof_file_name:cleanString(proof.file_name)||`payment-proof.${ext}`,proof_content_type:contentType};
        }
        const receiptNo=`SAL-${period?.month_key||paidAt.slice(0,7).replace('-','')}-${Date.now().toString().slice(-7)}`;
        const receipt=firstRow(await dbInsert('payroll_receipts',{company_id:companyId,item_id:itemId,receipt_no:receiptNo,amount,paid_at:paidAt,created_by:actor,...proofFields}));
        const receiptAdjustments=await dbSelect('payroll_adjustments',{select:'kind,amount,reason,created_at',company_id:`eq.${companyId}`,item_id:`eq.${itemId}`,order:'created_at.asc',limit:10000});
        await audit(user,'create_payroll_receipt','payroll_receipt',receipt?.id||null,{receipt_no:receiptNo,item_id:itemId,amount,paid_at:paidAt,proof_attached:!!proofFields.storage_path});
        return json(res,201,{success:true,data:{receipt,item,adjustments:receiptAdjustments}});
      }
    } catch(error) { return json(res,500,{success:false,error:`تعذر تنفيذ عملية أجور الموظفين: ${error.message}`}); }
  }

  if (pathname === '/api/drivers' && req.method === 'GET') {
    const user = await requireAuth(req, res);
    if (!user) return;
    const role = { ...(roles[user.role] || roles.employee), ...(user.permissions || {}) };
    if (!role.drivers && !role.shipments && !role.jobs) { json(res,403,{success:false,error:'ليس لديك صلاحية لعرض المندوبين'}); return; }
    try {
      const companyId = await resolveCompanyId(user);
      await syncDriverUsers(companyId);
      const [drivers, roleRows, userRoleRows, employeeRows] = await Promise.all([
        dbSelect('drivers', { select:'id,name,driver_no,company_id,active,user_id', company_id:`eq.${companyId}`, order:'name.asc', limit:5000 }),
        dbSelect('roles', { select:'id,name,company_id', company_id:`eq.${companyId}`, limit:5000 }),
        dbSelect('user_roles', { select:'user_id,role_id', limit:10000 }),
        dbSelect('users', { select:'id,active,company_id', company_id:`eq.${companyId}`, limit:5000 })
      ]);
      const driverRoleIds = new Set((roleRows || []).filter(r => String(r.name || '').trim().toLowerCase() === 'driver').map(r => String(r.id)));
      const activeDriverUserIds = new Set((userRoleRows || []).filter(link => driverRoleIds.has(String(link.role_id))).map(link => String(link.user_id)));
      const activeEmployeeIds = new Set((employeeRows || []).filter(employee => employee.active !== false).map(employee => String(employee.id)));
      const data = (drivers || []).filter(driver => Boolean(driver.user_id) && activeDriverUserIds.has(String(driver.user_id)) && activeEmployeeIds.has(String(driver.user_id)) && driver.active !== false);
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }
  if (pathname === '/api/scan-driver' && req.method === 'GET') {
    const user = await requireRole(req,res,'shipments'); if(!user)return;
    try {
      const companyId=await resolveCompanyId(user), driverId=cleanString(url.searchParams.get('driver_id')), date=cleanString(url.searchParams.get('date'));
      const filter={company_id:`eq.${companyId}`,order:'created_at.desc',limit:10000};
      const searchAll=cleanString(url.searchParams.get('search_all'))==='1';
      const query=cleanString(url.searchParams.get('q')).toLowerCase();
      if(!searchAll && driverId) filter.driver_id=`eq.${driverId}`;
      if(!searchAll && date) filter.scan_date=`eq.${date}`;
      const rows=await dbSelect('scan_driver_records',{select:'*',...filter});
      if(searchAll){
        const drivers=await dbSelect('drivers',{select:'id,name,driver_no',company_id:`eq.${companyId}`,limit:5000});
        const driverNames=new Map((drivers||[]).map(d=>[String(d.id),d.name||'']));
        const matched=(rows||[]).filter(r=>!query || String(r.order_number||'').toLowerCase().includes(query) || String(r.employee_name||'').toLowerCase().includes(query) || String(driverNames.get(String(r.driver_id))||'').toLowerCase().includes(query));
        return json(res,200,{success:true,data:matched.map(r=>({driver_name:driverNames.get(String(r.driver_id))||'—',employee_name:r.employee_name||'—',scan_date:r.scan_date||'—'}))});
      }
      // Match every scanned coupon against saved booking ranges, normalizing leading zeros.
      const matchedOrderIds=[...new Set((rows||[]).map(r=>String(r.matched_order_id||'').trim()).filter(Boolean))];
      const cacheKey=String(companyId);
      const cachedLookups=SCAN_DRIVER_LOOKUP_CACHE.get(cacheKey);
      const lookupPromise=cachedLookups&&cachedLookups.expiresAt>Date.now()
        ? Promise.resolve(cachedLookups)
        : Promise.all([
            dbSelect('coupon_bookings',{select:'id,merchant_id,first_coupon,last_coupon',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
            dbSelect('merchants',{select:'id,name',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[])
          ]).then(([bookings,merchants])=>{
            const value={bookings,merchants,expiresAt:Date.now()+60000};
            SCAN_DRIVER_LOOKUP_CACHE.set(cacheKey,value);
            if(SCAN_DRIVER_LOOKUP_CACHE.size>50){const firstKey=SCAN_DRIVER_LOOKUP_CACHE.keys().next().value;if(firstKey!==undefined)SCAN_DRIVER_LOOKUP_CACHE.delete(firstKey);}
            return value;
          });
      const matchedOrdersPromise=matchedOrderIds.length
        ? dbSelect('orders',{select:'id,merchant_order_no',company_id:`eq.${companyId}`,id:`in.(${matchedOrderIds.join(',')})`,limit:Math.min(20000,matchedOrderIds.length)}).catch(()=>[])
        : Promise.resolve([]);
      const [lookups,matchedOrders]=await Promise.all([lookupPromise,matchedOrdersPromise]);
      const bookings=lookups.bookings||[], merchants=lookups.merchants||[];
      const merchantNames=new Map(merchants.map(m=>[String(m.id),m.name||'']));
      const matchedOrderById=new Map((matchedOrders||[]).map(o=>[String(o.id),o]));
      // Normalize coupon input consistently: ASCII/Arabic digits, optional leading #,
      // spaces and thousands separators. Do not extract arbitrary digit suffixes from
      // shipment IDs, because that could incorrectly mark a different order as booked.
      const normalizedCoupon=value=>{let raw=String(value??'').trim().replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));raw=raw.replace(/^#+/,'').replace(/[\s,٬]/g,'');return /^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):null;};
      const bookingRanges=(bookings||[]).map(b=>({...b,_first:normalizedCoupon(b.first_coupon),_last:normalizedCoupon(b.last_coupon)})).filter(b=>b._first!==null&&b._last!==null&&b._last>=b._first).sort((a,b)=>a._first-b._first);
      const findBooking=coupon=>{if(coupon===null)return null;let low=0,high=bookingRanges.length-1;while(low<=high){const mid=(low+high)>>1,b=bookingRanges[mid];if(coupon<b._first)high=mid-1;else if(coupon>b._last)low=mid+1;else return b;}return null;};
      const enriched=(rows||[]).map(r=>{
        // If linked to an order, compare its merchant coupon number instead of a system serial.
        const linkedOrder=matchedOrderById.get(String(r.matched_order_id||''));
        const bookingCoupon=linkedOrder?.merchant_order_no??r.order_number;
        const booking=findBooking(normalizedCoupon(bookingCoupon));
        return {...r,booking_status:booking?'booked':'not_booked',booking_merchant_id:booking?.merchant_id||null,booking_merchant_name:booking?merchantNames.get(String(booking.merchant_id))||'':null};
      });
      const bookedCount=enriched.filter(r=>r.booking_status==='booked').length;
      const totalCount=enriched.length;
      return json(res,200,{success:true,data:enriched,summary:{booked_count:bookedCount,not_booked_count:totalCount-bookedCount,total_count:totalCount}});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname.startsWith('/api/scan-driver/') && req.method === 'DELETE') {
    const user = await requireRole(req,res,'shipments'); if(!user)return;
    try {
      const companyId=await resolveCompanyId(user), id=decodeURIComponent(pathname.split('/').pop());
      const row=firstRow(await dbSelect('scan_driver_records',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!row)return json(res,404,{success:false,error:'سجل الأوردر غير موجود'});
      await dbDelete('scan_driver_records',{id:`eq.${id}`,company_id:`eq.${companyId}`});
      await audit(user,'delete_scan_driver_order','scan_driver_record',id,{order_number:row.order_number,driver_id:row.driver_id});
      return json(res,200,{success:true});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/scan-driver/transfer' && req.method === 'POST') {
    const user = await requireRole(req,res,'shipments'); if(!user)return;
    try {
      const body=await bodyJson(req), companyId=await resolveCompanyId(user);
      const ids=[...new Set((Array.isArray(body.record_ids)?body.record_ids:[]).map(x=>cleanString(x)).filter(Boolean))];
      const newDriverId=cleanString(body.new_driver_id);
      if(!ids.length||!newDriverId)return json(res,400,{success:false,error:'حدد الأوردرات والمندوب الجديد'});
      const driver=firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${newDriverId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!driver)return json(res,404,{success:false,error:'المندوب الجديد غير موجود'});
      let transferred=0;
      for(const id of ids){
        const row=firstRow(await dbSelect('scan_driver_records',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
        if(!row)continue;
        const oldDriverId=row.driver_id;
        await dbUpdate('scan_driver_records',{id:`eq.${id}`,company_id:`eq.${companyId}`},{driver_id:driver.id},{prefer:'return=minimal'});
        if(row.matched_order_id){
          try{await dbUpdate('orders',{id:`eq.${row.matched_order_id}`,company_id:`eq.${companyId}`},{scan_driver_id:driver.id},{prefer:'return=minimal'});}catch(_){}
        }
        await audit(user,'transfer_scan_driver_order','scan_driver_record',id,{order_number:row.order_number,old_driver_id:oldDriverId,new_driver_id:driver.id,new_driver_name:driver.name});
        transferred++;
      }
      return json(res,200,{success:true,transferred,new_driver:{id:driver.id,name:driver.name}});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/scan-driver' && req.method === 'POST') {
    const user = await requireRole(req,res,'shipments'); if(!user)return;
    try {
      const body=await bodyJson(req), companyId=await resolveCompanyId(user), driverId=cleanString(body.driver_id), scanDate=cleanString(body.scan_date)||egyptTodayISO();
      const nums=[...new Set((Array.isArray(body.order_numbers)?body.order_numbers:[]).map(x=>cleanString(x)).filter(Boolean))];
      if(!driverId||!nums.length)return json(res,400,{success:false,error:'المندوب ورقم الأوردر مطلوبان'});
      const driver=firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${driverId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!driver)return json(res,404,{success:false,error:'المندوب غير موجود'});
      const saved=[];
      for(const orderNumber of nums){
        const existing=firstRow(await dbSelect('scan_driver_records',{select:'id,driver_id',company_id:`eq.${companyId}`,order_number:`eq.${encodeURIComponent(orderNumber)}`,limit:1}).catch(()=>[]));
        if(existing)continue;
        try {
          const row=firstRow(await dbInsert('scan_driver_records',{company_id:companyId,driver_id:driverId,order_number:orderNumber,scan_date:scanDate,scanned_at:new Date().toISOString(),employee_id:user.id==='env-admin'?null:user.id,employee_name:user.name||user.username||'System'}));
          if(row)saved.push(row);
          await audit(user,'scan_driver_order','scan_driver_record',row?.id||null,{driver_id:driverId,driver_name:driver.name,order_number:orderNumber,scan_date:scanDate});
        }catch(e){
          const m=String(e.message||'');
          if(!m.toLowerCase().includes('duplicate')&&!m.toLowerCase().includes('unique'))throw e;
        }
      }
      return json(res,200,{success:true,saved:saved.length,data:saved});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }


async function resolveDriverForCompany(input, companyId) {
  const value = cleanString(input);
  if (!value) return null;
  // Prefer the canonical UUID id.
  let row = firstRow(await dbSelect('drivers',{select:'id,name,driver_no,user_id',id:`eq.${value}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
  if (row) return row;
  // Compatibility: the UI/older clients may send driver_no or user_id instead of UUID.
  row = firstRow(await dbSelect('drivers',{select:'id,name,driver_no,user_id',driver_no:`eq.${encodeURIComponent(value)}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
  if (row) return row;
  row = firstRow(await dbSelect('drivers',{select:'id,name,driver_no,user_id',user_id:`eq.${encodeURIComponent(value)}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
  if (row) return row;
  // Last compatibility path: exact driver name.
  row = firstRow(await dbSelect('drivers',{select:'id,name,driver_no,user_id',name:`eq.${encodeURIComponent(value)}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
  return row || null;
}

  if (pathname === '/api/operations/patch-outscan' && req.method === 'POST') {
    const user = await requireAuth(req, res); if (!user) return;
    const assignmentStartedAt = Date.now();
    const role = { ...(roles[user.role] || roles.employee), ...(user.permissions || {}) };
    if (!role.shipments && !role.drivers && !role.jobs) return json(res,403,{success:false,error:'ليس لديك صلاحية Patch Outscan'});
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const requestedDriver = cleanString(body.driver_id || body.driver_no || body.driver_name);
      const shipmentIds = uniqueArray(Array.isArray(body.shipment_ids) ? body.shipment_ids : []);
      if (!requestedDriver || !shipmentIds.length) return json(res,400,{success:false,error:'المندوب والشحنة مطلوبان'});

      const driver = await resolveDriverForCompany(requestedDriver, companyId);
      if (!driver?.id) return json(res,404,{success:false,error:'Could not find the driver id'});
      // Patch Outscan is only permitted for orders currently in Receive at Hub or In Ops.
      // Validate the complete selection before creating a job or changing any records.
      const normalizeOutscanStatus = value => String(value || '').trim().toLowerCase().replace(/[ _-]+/g,' ').replace(/\s+/g,' ');
      const allowedOutscanStatuses = new Set(['receive at hub','receive at hubs','receive at hup','receive at hups','recive at hub','recive at hubs','recive at hup','recive at hups','in ops']);
      const invalidOutscanOrders = [];
      for (const shipmentId of shipmentIds) {
        const sh = firstRow(await dbSelect('shipments',{select:'id,order_id,status',id:`eq.${shipmentId}`,company_id:`eq.${companyId}`,limit:1}));
        if (!sh) { invalidOutscanOrders.push({id:shipmentId,status:'not found'}); continue; }
        const order = firstRow(await dbSelect('orders',{select:'id,serial_no,status,merchant_order_no,order_code',id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`,limit:1}));
        const effectiveStatus = normalizeOutscanStatus(order?.status || sh.status);
        if (!order || !allowedOutscanStatuses.has(effectiveStatus)) invalidOutscanOrders.push({id:shipmentId,status:order?.status || sh.status || 'unknown'});
      }
      if (invalidOutscanOrders.length) {
        return json(res,400,{success:false,error:'Patch Outscan مسموح فقط للأوردرات بحالة Receive at Hub أو In Ops. أزل الأوردرات الأخرى من التحديد ثم حاول مرة أخرى.',invalid_count:invalidOutscanOrders.length,invalid_shipments:invalidOutscanOrders});
      }
      // Assignment date defaults to today, not the order's creation date.
      // Otherwise an older order assigned now is attached to yesterday's job
      // and disappears from the driver's current Delivery Job view.
      const jobDate = cleanString(body.job_date) || egyptTodayISO();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) return json(res,400,{success:false,error:'تاريخ تحميل المندوب غير صحيح'});

      let job = firstRow(await dbSelect('delivery_jobs',{select:'*',company_id:`eq.${companyId}`,driver_id:`eq.${driver.id}`,job_date:`eq.${jobDate}`,status:`neq.closed`,order:'created_at.desc',limit:1}));
      if (!job) {
        // Retry only on the known company/job_code uniqueness collision. This
        // also handles two users assigning jobs at nearly the same moment.
        let lastInsertError = null;
        for (let attempt = 0; attempt < 6 && !job; attempt++) {
          const code = String(await nextJobCode(user));
          try {
            job = firstRow(await dbInsert('delivery_jobs',{company_id:companyId,driver_id:driver.id,job_code:code,status:'created',job_date:jobDate,expected_count:0,received_count:0}));
          } catch (insertError) {
            lastInsertError = insertError;
            const message = String(insertError?.message || insertError || '');
            if (!/delivery_jobs_company_id_job_code_key|duplicate key value|23505/i.test(message)) throw insertError;
            // Re-read the same driver's active job in case another request
            // created it while this request was generating a job code.
            job = firstRow(await dbSelect('delivery_jobs',{select:'*',company_id:`eq.${companyId}`,driver_id:`eq.${driver.id}`,job_date:`eq.${jobDate}`,status:`neq.closed`,order:'created_at.desc',limit:1}));
          }
        }
        if (!job && lastInsertError) throw new Error(`تعذر إنشاء مهمة للمندوب بعد إعادة محاولة توليد كود فريد: ${lastInsertError.message || lastInsertError}`);
      }
      if (!job?.id) throw new Error('فشل إنشاء مهمة التوصيل');

      // Prefer the database-side atomic batch function. If the migration has not
      // been installed yet, or this deployment has a schema mismatch, use the
      // existing bounded-concurrency implementation as a compatibility fallback.
      let assignedCount = 0;
      let databaseJobCount = null;
      let usedDatabaseBatch = false;
      // Only a failure of the RPC itself may activate the compatibility path.
      // Do not catch audit/verification failures here: doing so after a successful
      // transaction would run the assignment a second time.
      try {
        const rpcResult = await dbRpc('tds_patch_outscan_batch', {
          p_company_id: companyId,
          p_job_id: job.id,
          p_shipment_ids: shipmentIds,
          p_user_id: user.id === 'env-admin' ? null : user.id
        });
        assignedCount = Number(rpcResult?.assigned_count || 0);
        databaseJobCount = Number.isFinite(Number(rpcResult?.job_count)) ? Number(rpcResult.job_count) : null;
        usedDatabaseBatch = true;
      } catch (batchError) {
        console.warn('PATCH OUTSCAN DATABASE BATCH UNAVAILABLE; using compatibility fallback:', batchError.message);
      }

      if (usedDatabaseBatch) {
        // The database function already links shipments, updates shipment/order
        // statuses, writes status history, and refreshes job counts atomically.
        // Avoid N+1 reads and duplicate updates after the successful RPC.
        await Promise.all(shipmentIds.map(async (shipmentId) => {
          try {
            await audit(user,'patch_outscan_assign_driver','shipment',shipmentId,{
              driver_id:driver.id, driver_name:driver.name,
              job_id:job.id, job_code:job.job_code, job_date:jobDate,
              new_status:'Assigned with Driver', database_batch:true
            });
          } catch (auditError) {
            console.warn('PATCH OUTSCAN BATCH AUDIT WARNING:', auditError.message);
          }
        }));
      }

      if (!usedDatabaseBatch) {
      // Process independent shipments with bounded concurrency. The old
      // sequential loop made every database round-trip wait for the previous
      // shipment; a small worker pool improves bulk throughput without
      // overwhelming Supabase or changing per-shipment operation order.
      let assignedCount = 0;
      let nextShipmentIndex = 0;
      const workerCount = Math.min(6, shipmentIds.length);
      const processShipment = async (shipmentId) => {
        const sh = firstRow(await dbSelect('shipments',{select:'id,order_id,status',id:`eq.${shipmentId}`,company_id:`eq.${companyId}`,limit:1}));
        if (!sh) return false;
        const order = firstRow(await dbSelect('orders',{select:'id,serial_no,status',id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`,limit:1}));
        if (!order) return false;

        const oldLinks = await dbSelect('delivery_job_shipments',{select:'id,delivery_job_id',shipment_id:`eq.${shipmentId}`,limit:50});
        const obsoleteLinks = oldLinks.filter(old => String(old.delivery_job_id) !== String(job.id));
        await Promise.all(obsoleteLinks.map(old => dbDelete('delivery_job_shipments',{id:`eq.${old.id}`})));

        const existing = firstRow(await dbSelect('delivery_job_shipments',{select:'id',delivery_job_id:`eq.${job.id}`,shipment_id:`eq.${shipmentId}`,limit:1}));
        if (!existing) {
          const serialNo = await resolveShipmentSerial(user, sh, order);
          await dbInsert('delivery_job_shipments',{delivery_job_id:job.id,shipment_id:shipmentId,serial_no:serialNo,serial_date:jobDate,delivery_job_code:job.job_code},{prefer:'return=minimal'});
        }

        await Promise.all([
          dbUpdate('shipments',{id:`eq.${shipmentId}`,company_id:`eq.${companyId}`},{status:'Assigned with Driver',driver_id:driver.id}),
          dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:'Assigned with Driver'})
        ]);
        try {
          await dbInsert('shipment_status_history',{shipment_id:shipmentId,status:'Assigned with Driver',note:`Driver assignment: ${driver.name||driver.driver_no||driver.id}`,user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});
        } catch (historyError) {
          // Keep legacy compatibility: history table/columns may differ by deployment.
          console.warn('PATCH OUTSCAN HISTORY WARNING:', historyError.message);
        }
        await audit(user,'patch_outscan_assign_driver','shipment',shipmentId,{order_id:order.id,driver_id:driver.id,driver_name:driver.name,job_id:job.id,job_code:job.job_code,job_date:jobDate,new_status:'Assigned with Driver'});
        return true;
      };
      const worker = async () => {
        while (true) {
          const index = nextShipmentIndex++;
          if (index >= shipmentIds.length) return;
          if (await processShipment(shipmentIds[index])) assignedCount++;
        }
      };
      await Promise.all(Array.from({length:workerCount}, () => worker()));

      }

      let count;
      if (usedDatabaseBatch && databaseJobCount !== null) {
        // The SQL transaction already refreshed these counts; do not read up to
        // 10,000 links back over REST or update the same job a second time.
        count = databaseJobCount;
      } else {
        const links = await dbSelect('delivery_job_shipments',{select:'id',delivery_job_id:`eq.${job.id}`,limit:10000});
        count = links.length;
        await dbUpdate('delivery_jobs',{id:`eq.${job.id}`,company_id:`eq.${companyId}`},{expected_count:count,received_count:count});
      }
      job.expected_count=count; job.received_count=count;

      return json(res,200,{success:true,data:{job,driver,assigned_count:assignedCount,status:'Assigned with Driver',delivery_job_id:job.id,delivery_job_code:job.job_code,job_date:job.job_date,duration_ms:Date.now()-assignmentStartedAt,assignment_mode:usedDatabaseBatch?'database-batch':'compatibility-fallback'}});
    } catch(error) {
      console.error('PATCH OUTSCAN ERROR:',error);
      return json(res,500,{success:false,error:error.message});
    }
  }

  if (pathname === '/api/delivery-jobs' && req.method === 'GET') {
    const user = await requireRole(req, res, 'jobs');
    if (!user) return;
    try {
      return json(res, 200, { success: true, data: await getRows('delivery_jobs', user) });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/delivery-jobs' && req.method === 'POST') {
    const user = await requireRole(req, res, 'jobs');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const shipmentIds = uniqueArray(Array.isArray(body.shipment_ids) ? body.shipment_ids : []);
      if (!body.driver_id) return json(res, 400, { success: false, error: 'السائق مطلوب' });
      const generatedJobCode = cleanString(body.job_code) || String(await nextJobCode(user));
      const eligible=[]; const rejected=[];
      // Batch validation reads: avoid three sequential database round trips per selected order.
      const quoteIn = values => `in.(${values.map(value=>`"${String(value).replace(/"/g,'')}"`).join(',')})`;
      const shipmentIdsForQuery = shipmentIds.filter(Boolean);
      const [selectedShipments, selectedLinks] = shipmentIdsForQuery.length ? await Promise.all([
        dbSelectAll('shipments',{select:'id,order_id,shipment_no,tracking_number,status,driver_id',company_id:`eq.${companyId}`,id:quoteIn(shipmentIdsForQuery)}),
        dbSelectAll('delivery_job_shipments',{select:'id,delivery_job_id,shipment_id',shipment_id:quoteIn(shipmentIdsForQuery)}).catch(()=>[])
      ]) : [[],[]];
      const selectedById = new Map(selectedShipments.map(row=>[String(row.id),row]));
      const orderIds = [...new Set(selectedShipments.map(row=>String(row.order_id||'')).filter(Boolean))];
      const selectedOrders = orderIds.length ? await dbSelectAll('orders',{select:'id,status,serial_no',company_id:`eq.${companyId}`,id:quoteIn(orderIds)}) : [];
      const orderById = new Map(selectedOrders.map(row=>[String(row.id),row]));
      const linksByShipment = new Set(selectedLinks.map(row=>String(row.shipment_id||'')));
      for(const shipmentId of shipmentIds){
        const sh=selectedById.get(String(shipmentId));
        if(!sh){rejected.push(shipmentId);continue;}
        const o=orderById.get(String(sh.order_id||''));
        const st=commissionStatusKey(o?.status||sh.status);
        const alreadyAssigned=Boolean(sh.driver_id||st==='assigned with driver'||linksByShipment.has(String(shipmentId)));
        if(alreadyAssigned || !['receive at hub','in ops'].includes(st)) rejected.push(shipmentId); else eligible.push(shipmentId);
      }
      if(rejected.length)return json(res,400,{success:false,error:'Delivery Job يسمح فقط للأوردرات بحالة Receive at Hub أو In Ops',rejected});

      const job = firstRow(await dbInsert('delivery_jobs', {
        company_id: companyId,
        driver_id: body.driver_id,
        job_code: generatedJobCode,
        status: 'created',
        job_date: cleanString(body.job_date) || egyptTodayISO(),
        expected_count: shipmentIds.length,
        received_count: 0
      }));

      if (!job?.id) throw new Error('فشل إنشاء مهمة التوصيل');

      // The link for each shipment must succeed before it is treated as assigned.
      // Process different shipments concurrently and reuse the batched validation reads.
      const assignmentResults = await Promise.allSettled(shipmentIds.map(async shipmentId => {
        const shipmentForLink = selectedById.get(String(shipmentId));
        const orderForLink = orderById.get(String(shipmentForLink?.order_id||''));
        try {
          const serialNo = await resolveShipmentSerial(user, shipmentForLink, orderForLink);
          await dbInsert('delivery_job_shipments', {
            delivery_job_id: job.id,
            shipment_id: shipmentId,
            serial_no: serialNo,
            serial_date: cleanString(body.job_date) || egyptTodayISO(),
            delivery_job_code: job.job_code
          }, { prefer: 'return=minimal' });
        } catch (linkError) {
          // Do not silently mark an order assigned when its job link failed.
          throw new Error(`تعذر ربط الشحنة ${shipmentId} بمهمة التوصيل: ${linkError.message || linkError}`);
        }
        try {
          await dbUpdate('shipments', { id: `eq.${shipmentId}`, company_id: `eq.${companyId}` }, { status: 'Assigned with Driver', driver_id: body.driver_id });
          const h = { shipment_id: shipmentId, status: 'Assigned with Driver', user_id: user.id === 'env-admin' ? null : user.id };
          await dbInsert('shipment_status_history', h, { prefer: 'return=minimal' });
        } catch (_) {}
        // A new assignment makes the order part of the new courier statement again.
        try {
          const orderId = shipmentForLink?.order_id;
          if (orderId) {
            const current = orderForLink;
            const reassignmentPatch = {
              status: 'Assigned with Driver',
              // Driver assignment is stored on shipments/delivery_jobs, never orders.
              statement_removed_at: null,
              statement_removed_by: null,
              statement_removed_from_driver_id: null
            };
            await dbUpdate('orders', { id: `eq.${orderId}`, company_id: `eq.${companyId}` }, reassignmentPatch);
            await audit(user, 'assign_order_to_driver', 'order', orderId, { driver_id: body.driver_id, previous_status: current?.status || null, new_status: reassignmentPatch.status || current?.status || null });
          }
        } catch (clearError) {
          // Older databases may not have the optional statement tracking columns yet.
          console.warn('STATEMENT REASSIGN WARNING:', clearError.message);
        }
      }));
      const failedAssignment = assignmentResults.find(result=>result.status==='rejected');
      if(failedAssignment) throw failedAssignment.reason;

      await audit(user, 'create_delivery_job', 'delivery_job', job.id, { shipment_ids: shipmentIds });
      return json(res, 200, { success: true, data: job });
    } catch (error) {
      console.error('CREATE JOB ERROR:', error);
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/delivery-jobs/board' && req.method === 'GET') {
    const user = await requireRole(req, res, 'jobs');
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const driverId = cleanString(url.searchParams.get('driver_id'));
      const date = cleanString(url.searchParams.get('date')) || egyptTodayISO();
      const fromDate = cleanString(url.searchParams.get('from_date')) || date;
      const toDate = cleanString(url.searchParams.get('to_date')) || date;
      const inSelectedDateRange = value => { const day=String(value||'').slice(0,10); return !!day && day >= fromDate && day <= toDate; };
      const governorateId = cleanString(url.searchParams.get('governorate_id'));
      const areaId = cleanString(url.searchParams.get('area_id'));
      const q = cleanString(url.searchParams.get('q')).toLowerCase();
      const [jobs, shipments, orders, merchants, drivers, govs, areas, users] = await Promise.all([
        dbSelect('delivery_jobs',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:10000}).catch(()=>[]),
        dbSelect('shipments',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:10000}).catch(()=>[]),
        dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:10000}).catch(()=>[]),
        dbSelect('merchants',{select:'id,name,merchant_no,code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
        dbSelect('drivers',{select:'id,name,driver_no',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
        dbSelect('governorates',{select:'id,name_ar,name_en',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
        dbSelect('areas',{select:'id,governorate_id,name_ar,name_en',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]),
        dbSelect('users',{select:'id,name,username,employee_code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[])
      ]);
      const um=new Map((users||[]).map(x=>[String(x.id),x]));
      const jm=new Map(jobs.map(x=>[String(x.id),x])), om=new Map(orders.map(x=>{const u=um.get(String(x.created_by||x.created_by_user_id||''))||{};return [String(x.id),{...x,created_by_name:x.created_by_name||u.name||u.username||u.employee_code||''}]})), mm=new Map(merchants.map(x=>[String(x.id),x])), dm=new Map(drivers.map(x=>[String(x.id),x])), gm=new Map(govs.map(x=>[String(x.id),x])), am=new Map(areas.map(x=>[String(x.id),x]));
      const links=[];
      const latestAnyAssignment=new Map();
      const assignmentCounts=new Map();
      // Fetch all job links in bounded batches instead of awaiting one request per job.
      const boardJobIds=jobs.map(job=>String(job.id||'')).filter(Boolean);
      const boardQuoteIn = values => 'in.(' + values.map(value=>'"' + String(value).replace(/"/g,'') + '"').join(',') + ')';
      const boardLinkQueries=[];
      for(let i=0;i<boardJobIds.length;i+=100){
        boardLinkQueries.push(dbSelectAll('delivery_job_shipments',{select:'*',delivery_job_id:boardQuoteIn(boardJobIds.slice(i,i+100))}));
      }
      const allBoardLinks=(await Promise.all(boardLinkQueries)).flat();
      const linksByJob=new Map();
      for(const link of allBoardLinks){
        const key=String(link.delivery_job_id||'');
        if(!key)continue;
        if(!linksByJob.has(key))linksByJob.set(key,[]);
        linksByJob.get(key).push(link);
      }
      for(const job of jobs){
        const jobDate=String(job.job_date||job.created_at||'').slice(0,10);
        for(const l of linksByJob.get(String(job.id))||[]){
          const sid=String(l.shipment_id||'');
          if(sid) assignmentCounts.set(sid,(assignmentCounts.get(sid)||0)+1);
          if(sid && !latestAnyAssignment.has(sid)) latestAnyAssignment.set(sid,{...l,_job:job});
          if(inSelectedDateRange(jobDate) && (!driverId || String(job.driver_id)===String(driverId))) links.push({...l,_job:job});
        }
      }
      const assignedIds=new Set(links.map(x=>String(x.shipment_id)));
      const decorate=(sh,job=null)=>{
        const o=om.get(String(sh.order_id))||{}; const m=mm.get(String(o.merchant_id))||{};
        const driver=dm.get(String(job?.driver_id||sh.driver_id||''))||null;
        const g=gm.get(String(o.governorate_id||sh.governorate_id||''))||null; const a=am.get(String(o.area_id||sh.area_id||''))||null;
        const status=effectiveOrderStatus(o,sh)||sh.status||o.status||'';
        // Keep Delivery Job Days Out aligned with Operation Dashboard:
        // start from the current assignment date (or scheduled operational date),
        // never from the original order creation date.
        const specialScheduledActions=new Set(['return_by_driver','location_change','future_delivery','schedule_for_tomorrow']);
        const action=String(o.driver_statement_action||'').toLowerCase();
        const exitDate=String(specialScheduledActions.has(action)
          ? (o.driver_scheduled_date||job?.job_date||job?.delivery_date||job?.date||job?.created_at||'')
          : (job?.job_date||job?.delivery_date||job?.date||job?.created_at||o.driver_scheduled_date||'')).slice(0,10);
        const assignedDay=exitDate;
        const assignedMs=assignedDay ? new Date(assignedDay+'T12:00:00').getTime() : NaN;
        const todayMs=new Date(egyptTodayISO()+'T12:00:00').getTime();
        const daysOut=Number.isFinite(assignedMs)&&Number.isFinite(todayMs)
          ? Math.max(0,Math.floor((todayMs-assignedMs)/86400000)) : 0;
        const hay=[sh.tracking_number,o.merchant_order_no,o.order_code,o.customer_name,o.customer_phone,o.customer_phone_2,m.name,m.merchant_no,m.code,g?.name_ar,g?.name_en,a?.name_ar,a?.name_en,status,driver?.name].filter(Boolean).join(' ').toLowerCase();
        const orderDate=egyptDateISO(o.serial_date||o.created_at||sh.created_at||'');
        return {id:sh.id,shipment_id:sh.id,order_id:o.id,tracking_number:sh.tracking_number||o.tracking_number||'',merchant_order_no:o.merchant_order_no||o.order_code||'',order_code:o.order_code||'',reference_number:o.reference_number||o.reference_no||o.reference||'',created_by:o.created_by||null,created_by_name:o.created_by_name||'',merchant:m,customer_name:o.customer_name||'',customer_phone:o.customer_phone||'',customer_phone_2:o.customer_phone_2||'',address:o.address||'',price:cleanNumber(o.value??o.cod??o.order_value),cod:cleanNumber(o.cod??o.value??o.order_value),service_charges:cleanNumber(o.service_charges??o.delivery_fee??0),delivery_fee:cleanNumber(o.delivery_fee??o.service_charges??0),governorate:g,area:a,governorate_id:o.governorate_id||null,area_id:o.area_id||null,status,job_code:job?.job_code||sh.job_code||'',job_id:job?.id||null,driver,created_at:o.created_at||sh.created_at||null,order_date:orderDate,driver_statement_action:action,driver_scheduled_date:String(o.driver_scheduled_date||'').slice(0,10),last_status_at:sh.updated_at||o.updated_at||o.created_at||null,delivery_job_date:exitDate,days_out:daysOut,assignment_count:assignmentCounts.get(String(sh.id))||0,match:!q||hay.includes(q)};
      };
      // The selected date range is the delivery-job/assignment date, not the original order creation date.
      // Older orders legitimately assigned to a route in the selected range must remain visible.
      let assigned=links.map(x=>decorate(shipments.find(s=>String(s.id)===String(x.shipment_id))||{},x._job))
        // A regular order belongs to the selected Delivery Job date when assigned via Patch Outscan,
        // even if the order itself was created on an earlier date. Explicitly rescheduled actions
        // continue to follow their own scheduled date.
        .filter(x=>{
          if(!x.id||!x.match) return false;
          const isSpecial=new Set(['return_by_driver','location_change','future_delivery','schedule_for_tomorrow']).has(String(x.driver_statement_action||'').toLowerCase());
          return isSpecial ? inSelectedDateRange(x.driver_scheduled_date) : inSelectedDateRange(x.delivery_job_date);
        });
      if(governorateId) assigned=assigned.filter(x=>String(x.governorate_id)===String(governorateId));
      if(areaId) assigned=assigned.filter(x=>String(x.area_id)===String(areaId));

      // Special driver actions are date-driven just like Schedule for Tomorrow.
      // Keep them visible in Delivery Jobs on their scheduled date even when their
      // original delivery job was created on an earlier date.
      const specialScheduledActions=new Set(['return_by_driver','location_change','future_delivery','schedule_for_tomorrow']);
      const scheduledSpecial=shipments
        .filter(sh=>!assignedIds.has(String(sh.id)))
        .map(sh=>{
          const o=om.get(String(sh.order_id))||{};
          const action=String(o.driver_statement_action||'').toLowerCase();
          if(!specialScheduledActions.has(action) || !inSelectedDateRange(o.driver_scheduled_date)) return null;
          const a=latestAnyAssignment.get(String(sh.id));
          const job=a?._job||null;
          if(driverId && String(job?.driver_id||sh.driver_id||'')!==String(driverId)) return null;
          return decorate(sh,job);
        })
        .filter(x=>x&&x.id&&x.match);
      if(governorateId) scheduledSpecial.splice(0,scheduledSpecial.length,...scheduledSpecial.filter(x=>String(x.governorate_id)===String(governorateId)));
      if(areaId) scheduledSpecial.splice(0,scheduledSpecial.length,...scheduledSpecial.filter(x=>String(x.area_id)===String(areaId)));
      assigned=[...assigned,...scheduledSpecial.filter(x=>!assigned.some(a=>String(a.id)===String(x.id)))];

      // Recover assigned-with-driver orders that have a driver on the order/shipment
      // but are missing their delivery_job_shipments link. Use the latest assignment/update
      // date so these orders do not silently disappear from the driver's sheet.
      const assignedWithDriver = shipments
        .filter(sh=>!assignedIds.has(String(sh.id)) && !assigned.some(a=>String(a.id)===String(sh.id)))
        .map(sh=>{
          const o=om.get(String(sh.order_id))||{};
          const st=commissionStatusKey(effectiveOrderStatus(o,sh)||sh.status||o.status||'');
          const driverId=sh.driver_id||'';
          if(!driverId || !/assign|driver/.test(st)) return null;
          const assignment=latestAnyAssignment.get(String(sh.id));
          const job=assignment?._job||null;
          const isSpecialAction=new Set(['return_by_driver','location_change','future_delivery','schedule_for_tomorrow']).has(String(o.driver_statement_action||'').toLowerCase());
          // If the link is missing, recover the assignment date from the latest job first;
          // only fall back to order creation date when no assignment job exists.
          const activityDate=isSpecialAction
            ? String(o.driver_scheduled_date||'').slice(0,10)
            : String(job?.job_date||egyptDateISO(o.serial_date||o.created_at||sh.created_at||'')).slice(0,10);
          if(!inSelectedDateRange(activityDate)) return null;
          return decorate(sh,job);
        }).filter(x=>x&&x.id&&x.match);
      if(driverId) assignedWithDriver.splice(0,assignedWithDriver.length,...assignedWithDriver.filter(x=>String(x.driver?.id||'')===String(driverId)));
      if(governorateId) assignedWithDriver.splice(0,assignedWithDriver.length,...assignedWithDriver.filter(x=>String(x.governorate_id)===String(governorateId)));
      if(areaId) assignedWithDriver.splice(0,assignedWithDriver.length,...assignedWithDriver.filter(x=>String(x.area_id)===String(areaId)));
      assigned=[...assigned,...assignedWithDriver.filter(x=>!assigned.some(a=>String(a.id)===String(x.id)))];

      const eligibleStatuses=new Set(['receive at hub','in ops']);
      // Available orders are filtered by their actual order-entry date within the selected range.
      // Older orders are excluded even if someone linked them to a delivery job in this range.
      let available=shipments
        .filter(sh=>!assignedIds.has(String(sh.id)))
        .map(sh=>decorate(sh,null))
        .filter(x=>{
          const orderDate=x.order_date||egyptDateISO(x.created_at);
          return x.id && inSelectedDateRange(orderDate) && eligibleStatuses.has(commissionStatusKey(x.status)) && x.match;
        });
      if(governorateId) available=available.filter(x=>String(x.governorate_id)===String(governorateId));
      if(areaId) available=available.filter(x=>String(x.area_id)===String(areaId));
      return json(res,200,{success:true,date,from_date:fromDate,to_date:toDate,driver:driverId?dm.get(String(driverId))||null:null,governorates:govs,areas,drivers,data:assigned,available,counts:{assigned:assigned.length,available:available.length}});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/delivery-jobs/remove-order' && req.method === 'POST') {
    const user = await requireRole(req,res,'jobs'); if(!user)return;
    try{
      const body=await bodyJson(req), companyId=await resolveCompanyId(user), shipmentId=cleanString(body.shipment_id);
      if(!shipmentId)return json(res,400,{success:false,error:'الشحنة مطلوبة'});
      const sh=firstRow(await dbSelect('shipments',{select:'*',id:`eq.${shipmentId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!sh)return json(res,404,{success:false,error:'الشحنة غير موجودة'});
      const links=await dbSelect('delivery_job_shipments',{select:'*',shipment_id:`eq.${shipmentId}`,limit:50}).catch(()=>[]);
      const link=links[0];
      const order=firstRow(await dbSelect('orders',{select:'*',id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`,limit:1}));
      const isPaid = String(order?.status||'').trim().toLowerCase()==='paid'
        || String(order?.cash_collection_status||order?.paid_status||'').trim().toLowerCase()==='paid'
        || String(order?.commission_paid_status||'').trim().toLowerCase()==='paid'
        || String(sh.status||'').trim().toLowerCase()==='paid';
      if(isPaid) return json(res,400,{success:false,error:'حالة الأوردر Paid، لا يمكن إزالته من كشف المندوب'});
      if(link) await dbDelete('delivery_job_shipments',{id:`eq.${link.id}`});
      await dbUpdate('shipments',{id:`eq.${shipmentId}`,company_id:`eq.${companyId}`},{status:'In Ops',driver_id:null});
      if(order) await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:'In Ops',statement_removed_at:null,statement_removed_by:null,statement_removed_from_driver_id:null});
      try{await dbInsert('shipment_status_history',{shipment_id:shipmentId,status:'In Ops',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});}catch(_){ }
      await audit(user,'remove_order_from_delivery_job','shipment',shipmentId,{order_id:order?.id||null,job_id:link?.delivery_job_id||null,new_status:'In Ops'});
      return json(res,200,{success:true});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/delivery-jobs/transfer-orders' && req.method === 'POST') {
    const user = await requireRole(req,res,'jobs'); if(!user)return;
    try{
      const body=await bodyJson(req), companyId=await resolveCompanyId(user), toDriverId=cleanString(body.to_driver_id), date=cleanString(body.date)||egyptTodayISO();
      const shipmentIds=uniqueArray(Array.isArray(body.shipment_ids)?body.shipment_ids:[]);
      if(!toDriverId||!shipmentIds.length)return json(res,400,{success:false,error:'المندوب الجديد والأوردرات مطلوبان'});
      const toDriver=firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${toDriverId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!toDriver)return json(res,404,{success:false,error:'المندوب الجديد غير موجود'});
      let dest=firstRow(await dbSelect('delivery_jobs',{select:'*',company_id:`eq.${companyId}`,driver_id:`eq.${toDriverId}`,job_date:`eq.${date}`,status:`neq.closed`,order:'created_at.desc',limit:1}).catch(()=>[]));
      if(!dest){const next=await nextJobCode(user);dest=firstRow(await dbInsert('delivery_jobs',{company_id:companyId,driver_id:toDriverId,job_code:String(next),job_date:date,status:'created',expected_count:0,received_count:0}));}
      let moved=0;
      for(const sid of shipmentIds){
        const sh=firstRow(await dbSelect('shipments',{select:'*',id:`eq.${sid}`,company_id:`eq.${companyId}`,limit:1})); if(!sh)continue;
        const links=await dbSelect('delivery_job_shipments',{select:'*',shipment_id:`eq.${sid}`,limit:50}).catch(()=>[]);
        const old=links[0]; if(old) await dbDelete('delivery_job_shipments',{id:`eq.${old.id}`});
        try{
          const movedShipment=firstRow(await dbSelect('shipments',{select:'id,order_id',id:`eq.${sid}`,limit:1}).catch(()=>[]));
          const movedOrder=movedShipment?.order_id?firstRow(await dbSelect('orders',{select:'id,serial_no',id:`eq.${movedShipment.order_id}`,limit:1}).catch(()=>[])):null;
          const serialNo=await resolveShipmentSerial(user,movedShipment,movedOrder);
          await dbInsert('delivery_job_shipments',{delivery_job_id:dest.id,shipment_id:sid,serial_no:serialNo,serial_date:date,delivery_job_code:dest.job_code},{prefer:'return=minimal'});
        }catch(e){if(old)try{await dbInsert('delivery_job_shipments',old,{prefer:'return=minimal'});}catch(_){};throw e;}
        const order=firstRow(await dbSelect('orders',{select:'*',id:`eq.${sh.order_id}`,company_id:`eq.${companyId}`,limit:1}));
        await dbUpdate('shipments',{id:`eq.${sid}`,company_id:`eq.${companyId}`},{driver_id:toDriverId,status:'Assigned with Driver'});
        if(order){const nextStatus=['in ops','receive at hub'].includes(commissionStatusKey(order.status))?'Assigned with Driver':order.status;await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:nextStatus,statement_removed_at:null,statement_removed_by:null,statement_removed_from_driver_id:null});}
        try{await dbInsert('shipment_status_history',{shipment_id:sid,status:'Assigned with Driver',note:`Driver assignment: ${toDriver.name||toDriver.driver_no||toDriverId}`,user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});}catch(_){ }
        await audit(user,'transfer_order_between_drivers','shipment',sid,{from_job_id:old?.delivery_job_id||null,to_job_id:dest.id,to_driver_id:toDriverId,to_driver_name:toDriver.name}); moved++;
      }
      return json(res,200,{success:true,moved,job:dest});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/update-job-code-orders' && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const rows = await listShipments('', '', companyId);
      const q = cleanString(url.searchParams.get('q')).toLowerCase();
      let special = rows.filter(r => ['Return by Driver','Location Change','Future Delivery','Schedule for Tomorrow','To be pickedup'].includes(displayShipmentStatusServer(r)))
        .map(r => ({
          ...r,
          special_status: displayShipmentStatusServer(r),
          special_status_at: r.order?.driver_action_at || r.latest_status?.created_at || r.last_status_at || null,
          driver_name: r.driver?.name || ''
        }))
        .filter(r => String(r.order?.company_id || companyId) === String(companyId));
      // This page is intentionally search-only: do not list all eligible orders by default.
      if (!q) special = [];
      else special = special.filter(r => [
        r.tracking_number, r.shipment_no, r.job_code,
        r.order?.merchant_order_no, r.order?.order_code, r.order?.coupon_number,
        r.order?.coupon_no, r.order?.shipment_no, r.order_id
      ].some(v => String(v ?? '').toLowerCase().includes(q)));
      return json(res, 200, { success:true, data:special });
    } catch (error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/shipments/job-code' && req.method === 'POST') {
    const user = await requireRole(req, res, 'shipments');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const jobCode = cleanString(body.new_job_code || body.job_code);
      if (!jobCode) return json(res,400,{success:false,error:'Job Code مطلوب'});
      let shipment = null;
      if (body.shipment_id) shipment = firstRow(await dbSelect('shipments',{select:'*',id:`eq.${body.shipment_id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!shipment && body.order_id) shipment = firstRow(await dbSelect('shipments',{select:'*',order_id:`eq.${body.order_id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!shipment) return json(res,404,{success:false,error:'الشحنة غير موجودة'});
      const order = firstRow(await dbSelect('orders',{select:'*',id:`eq.${shipment.order_id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!order) return json(res,404,{success:false,error:'الأوردر المرتبط بالشحنة غير موجود'});
      const currentStatus = displayShipmentStatusServer({ ...shipment, order });
      const allowedJobCodeStatuses = new Set(['To be pickedup','Return by Driver','Location Change','Future Delivery','Schedule for Tomorrow']);
      if (!allowedJobCodeStatuses.has(String(currentStatus))) {
        return json(res,409,{success:false,error:`لا يمكن تحديث Job Code من الحالة الحالية: ${currentStatus || 'غير معروفة'}`});
      }
      const duplicate = firstRow(await dbSelect('shipments',{select:'id',company_id:`eq.${companyId}`,job_code:`eq.${encodeURIComponent(jobCode)}`,limit:10}).catch(()=>[]));
      if (duplicate && String(duplicate.id)!==String(shipment.id)) return json(res,409,{success:false,error:'Job Code مستخدم بالفعل'});
      const now = new Date().toISOString();
      // Some deployed Supabase schemas do not define shipments.updated_at.
      // Update only columns present in the existing schema to avoid PostgREST schema-cache errors.
      const shipmentPatch = {job_code:jobCode,status:'In Ops'};
      const selectedOpsDate = isValidISODate(String(body.date||'')) ? String(body.date) : null;
      const orderPatch = {
        status:'In Ops',
        driver_statement_action:null,
        driver_scheduled_date:selectedOpsDate,
        driver_location_emirate_id:null,
        driver_location_area_id:null,
        driver_action_at:null,
        driver_action_by:null,
        driver_return_reason:null,
        statement_removed_at:null,
        statement_removed_by:null,
        statement_removed_from_driver_id:null
      };
      const updatedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},shipmentPatch));
      const updatedOrder = firstRow(await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},orderPatch));
      try {
        await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:`Job Code: ${jobCode}`,user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});
        await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:'In Ops',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});
      } catch (_) {}
      await audit(user,'update_job_code','shipment',shipment.id,{
        order_id:order.id,
        old_job_code:shipment.job_code||null,
        new_job_code:jobCode,
        job_code:jobCode,
        status_from:order.status,
        status_to:'In Ops',
        changed_by:user.id==='env-admin'?'System':(user.name||user.username||user.email||user.id),
        changed_at:now
      });
      return json(res,200,{success:true,data:{shipment:updatedShipment||{...shipment,...shipmentPatch},order:updatedOrder||{...order,...orderPatch}}});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/delivery-job-code' && req.method === 'POST') {
    const user = await requireRole(req, res, 'jobs');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const jobs = await dbSelect('delivery_jobs', {
        select: '*',
        job_code: `eq.${cleanString(body.delivery_job_code)}`,
        limit: 1
      });
      const job = firstRow(jobs);
      if (!job) return json(res, 404, { success: false, error: 'كود المهمة غير موجود' });

      const shipments = await dbSelect('shipments', {
        select: '*',
        shipment_no: `eq.${cleanString(body.shipment_no)}`,
        limit: 1
      });
      const shipment = firstRow(shipments);
      if (!shipment) return json(res, 404, { success: false, error: 'رقم الشحنة غير موجود' });

      const existing = await dbSelect('delivery_job_shipments', {
        select: '*',
        shipment_id: `eq.${shipment.id}`,
        limit: 1
      });

      if (existing.length) return json(res, 200, { success: true, duplicate: true });

      const linkedOrder = shipment.order_id ? firstRow(await dbSelect('orders',{select:'id,serial_no',id:`eq.${shipment.order_id}`,limit:1}).catch(()=>[])) : null;
      const linkSerialNo = cleanNumber(body.serial_no, await resolveShipmentSerial(user, shipment, linkedOrder));
      if (!Number.isFinite(linkSerialNo) || linkSerialNo <= 0) throw new Error('تعذر تحديد Serial Number للشحنة');
      await dbInsert('delivery_job_shipments', {
        delivery_job_id: job.id,
        shipment_id: shipment.id,
        serial_no: linkSerialNo,
        serial_date: job.job_date || egyptTodayISO(),
        delivery_job_code: job.job_code
      }, { prefer: 'return=minimal' });

      await audit(user, 'update_delivery_job_code', 'shipment', shipment.id, { delivery_job_code: job.job_code });
      return json(res, 200, { success: true, duplicate: false });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/return-by-driver' && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      // Keep this page aligned with the company's saved timezone (Egypt or UAE),
      // even when this endpoint is the first request after a server restart.
      // The page's default date and date filters must use the same company calendar.
      let companyTimezone = SYSTEM_TIME_ZONE;
      try {
        const companySettings = firstRow(await dbSelect('companies',{select:'menu_config',id:`eq.${companyId}`,limit:1}));
        companyTimezone = normalizeSystemTimeZone(companySettings?.menu_config?.system_timezone || SYSTEM_TIME_ZONE);
        SYSTEM_TIME_ZONE = companyTimezone;
      } catch (timezoneError) {
        console.warn('RETURN BY DRIVER TIMEZONE WARNING:', timezoneError.message);
      }
      const from = cleanString(url.searchParams.get('from'));
      const to = cleanString(url.searchParams.get('to'));
      const orders = await dbSelect('orders', {
        select:'*', company_id:`eq.${companyId}`,
        order:'driver_action_at.desc', limit:20000
      });
      const shipments = await dbSelect('shipments',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const merchants = await dbSelect('merchants',{select:'id,name',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
      const areas = await dbSelect('areas',{select:'id,governorate_id,name_ar,name_en',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);
      const governorates = await dbSelect('governorates',{select:'id,name_ar,name_en',company_id:`eq.${companyId}`,order:'name_ar.asc',limit:5000}).catch(()=>[]);
      // Use the same authoritative driver eligibility rule as /api/drivers:
      // a driver must be linked to an active user who has the Driver role.
      // Do not populate this filter from every row in drivers, because legacy
      // or stale employee-linked rows can otherwise appear as delivery drivers.
      const [driverRows, roles, userRoles, employeeRows] = await Promise.all([
        dbSelect('drivers',{select:'id,name,driver_no,active,user_id',company_id:`eq.${companyId}`,order:'name.asc',limit:5000}).catch(()=>[]),
        dbSelect('roles',{select:'id,name,company_id',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
        dbSelect('user_roles',{select:'user_id,role_id',limit:10000}).catch(()=>[]),
        dbSelect('users',{select:'id,active,company_id',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[])
      ]);
      const driverRoleIds = new Set((roles||[]).filter(r=>String(r.name||'').trim().toLowerCase()==='driver').map(r=>String(r.id)));
      const driverUserIds = new Set((userRoles||[]).filter(link=>driverRoleIds.has(String(link.role_id))).map(link=>String(link.user_id)));
      const activeEmployeeIds = new Set((employeeRows||[]).filter(employee=>employee.active!==false).map(employee=>String(employee.id)));
      const drivers = (driverRows||[]).filter(driver=>Boolean(driver.user_id) && driverUserIds.has(String(driver.user_id)) && activeEmployeeIds.has(String(driver.user_id)) && driver.active!==false);
      const sm = new Map(shipments.map(x=>[String(x.order_id),x]));
      const mm = new Map(merchants.map(x=>[String(x.id),x]));
      const dm = new Map(drivers.map(x=>[String(x.id),x]));
      const am = new Map(areas.map(x=>[String(x.id),x]));
      const gm = new Map(governorates.map(x=>[String(x.id),x]));
      const rows=[];
      for(const o of orders){
        // This page is only for the two live states that can be moved back to In Ops.
        // Do not let stale driver_statement_action values pull an order into the list
        // after its latest operational status has changed.
        const action=String(o.driver_statement_action||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
        if(!['return by driver','location change'].includes(action)) continue;
        const sh=sm.get(String(o.id));
        if(!sh) continue;
        const liveStatus=String(sh.status||o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
        if(liveStatus!==action) continue;
        // The list's date filters follow the explicitly selected scheduled date,
        // not the later save/action timestamp. Missing dates are not guessed.
        const date=String(o.driver_scheduled_date||'').slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if(from && date<from) continue;
        if(to && date>to) continue;
        const merchant=mm.get(String(o.merchant_id||''));
        const driver=dm.get(String(sh.driver_id||''));
        const area=am.get(String(o.area_id||o.driver_location_area_id||''));
        const governorateId=area?.governorate_id||o.governorate_id||o.emirate_id||null;
        const governorate=gm.get(String(governorateId||''));
        rows.push({
          id:o.id,
          shipment_id:sh.id,
          order_number:o.merchant_order_no||o.order_number||o.order_code||'',
          tracking_number:sh.tracking_number||o.tracking_number||'',
          shipper_name:merchant?.name||'',
          customer_name:o.customer_name||'',
          customer_phone:o.customer_phone||o.phone||'',
          address:o.address||'',
          cod:o.value ?? o.cod ?? o.order_value ?? 0,
          driver_id:driver?.id||sh.driver_id||null,
          driver_name:driver?.name||'',
          driver_no:driver?.driver_no||'',
          job_code:sh.job_code||'',
          existing_job_code:sh.job_code||o.job_code||o.jopcod||o.jop_cod||'',
          jop_cod:o.jop_cod||o.jopcod||sh.jop_cod||sh.jopcod||'',
          area_id:area?.id||o.area_id||o.driver_location_area_id||null,
          area_name:area?.name_ar||area?.name_en||o.area_name||o.area?.name_ar||o.area?.name_en||o.area||'',
          governorate_id:governorateId,
          emirate_id:governorateId,
          governorate_name:governorate?.name_ar||governorate?.name_en||o.governorate_name||o.emirate_name||'',
          emirate_name:governorate?.name_ar||governorate?.name_en||o.emirate_name||o.governorate_name||'',
          return_reason:o.driver_return_reason||o.return_reason||o.driver_statement_reason||o.driver_action_reason||o.notes||'',
          return_type: DRIVER_ACTION_LABELS[action] || (action==='return_by_driver' ? 'Return by Driver' : action),
          returned_at:o.driver_action_at||null,
          date:date,
          scheduled_date:o.driver_scheduled_date||date,
          status:o.status||sh.status||''
        });
      }
      return json(res,200,{success:true,data:rows,filters:{governorates,areas,drivers},system_timezone:companyTimezone,today:egyptTodayISO()});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/driver-returns' && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const date = url.searchParams.get('date') || egyptTodayISO();
      const orders = await dbSelect('orders', { select:'*', company_id:`eq.${companyId}`, order:'driver_action_at.desc', limit:10000 }).catch(()=>[]);
      const rows=[];
      for (const o of orders) {
        const action=String(o.driver_statement_action||'').toLowerCase();
        if (!['return_by_driver','future_delivery'].includes(action) || o.driver_scheduled_date !== date) continue;
        const sh=firstRow(await dbSelect('shipments',{select:'id,tracking_number,shipment_no,driver_id',order_id:`eq.${o.id}`,limit:1}).catch(()=>[]));
        const driver=sh?.driver_id ? firstRow(await dbSelect('drivers',{select:'name,driver_no',id:`eq.${sh.driver_id}`,limit:1}).catch(()=>[])) : null;
        const gov=o.driver_location_emirate_id ? firstRow(await dbSelect('governorates',{select:'name_ar,name_en',id:`eq.${o.driver_location_emirate_id}`,limit:1}).catch(()=>[])) : null;
        const area=o.driver_location_area_id ? firstRow(await dbSelect('areas',{select:'name_ar,name_en',id:`eq.${o.driver_location_area_id}`,limit:1}).catch(()=>[])) : null;
        rows.push({...o,shipment_id:sh?.id||null,tracking_number:sh?.tracking_number||o.tracking_number||'',shipment_no:sh?.shipment_no||'',driver_name:driver?.name||'',driver_no:driver?.driver_no||'',return_type:DRIVER_ACTION_LABELS[action]||action,emirate_name:gov?.name_ar||gov?.name_en||'',area_name:area?.name_ar||area?.name_en||'',action_date:o.driver_action_at||null});
      }
      return json(res,200,{success:true,data:rows});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  async function createReturnOperation(user, driverId, ids=[]) {
    const companyId=await resolveCompanyId(user);
    const day=egyptTodayISO().replace(/-/g,'');
    // Allocate the operation number atomically in Postgres; max()+1 in application
    // code can issue the same RTO number to two simultaneous bulk actions.
    const operationNo=await dbRpc('next_return_operation_number',{p_company_id:companyId,p_day:day}).catch(error=>{
      console.error('RETURN OPERATION COUNTER ERROR:',error?.message||error);
      throw new Error('تعذر توليد رقم عملية المرتجع بأمان. يلزم تطبيق migration الخاصة بأرقام العمليات.');
    });
    if(!/^RTO-\d{8}-\d{4,}$/.test(String(operationNo||''))) throw new Error('رقم عملية المرتجع الناتج غير صالح.');
    const row=firstRow(await dbInsert('return_operations',{company_id:companyId,operation_no:String(operationNo),driver_id:driverId||null,created_by:user.id==='env-admin'?null:user.id,status:'Return to Origin',created_at:new Date().toISOString()},{prefer:'return=representation'}));
    if(!row) throw new Error('تعذر إنشاء رقم عملية المرتجع');
    return row;
  }
  async function getReturnOperation(user, operationId) {
    const companyId=await resolveCompanyId(user);
    const op=firstRow(await dbSelect('return_operations',{select:'*',id:`eq.${operationId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
    if(!op) return null;
    const rows=await getReturnTransactions(user,null,'','');
    return {operation:op,rows:rows.filter(r=>String(r.return_operation_id||'')===String(op.id))};
  }

  if (pathname === '/api/returns/bulk-return-to-origin' && req.method === 'POST') {
    const user = await requireRole(req, res, 'shipments'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const ids = Array.isArray(body.return_ids) ? [...new Set(body.return_ids.map(x=>String(x).trim()).filter(Boolean))] : [];
      const driverId=cleanString(body.driver_id);
      if (!ids.length) return json(res,400,{success:false,error:'يجب تحديد أوردر واحد على الأقل'});
      if (!driverId) return json(res,400,{success:false,error:'يجب اختيار المندوب'});
      const companyId = await resolveCompanyId(user);
      const driver=firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${driverId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
      if(!driver) return json(res,400,{success:false,error:'المندوب غير موجود'});
      const allowed = new Set(['Cancelled','Cancelled by Shipper','Cancelled by Receiver','Replaced','Half Delivered']);
      const targets=[];
      for (const id of ids) {
        const rt=firstRow(await dbSelect('return_transactions',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        if(!rt) continue;
        const sh=firstRow(await dbSelect('shipments',{select:'*',id:`eq.${rt.shipment_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        const o=firstRow(await dbSelect('orders',{select:'*',id:`eq.${rt.order_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        // Return transaction status can be stale; use the live order/shipment status too.
        const candidates=[rt.return_status,rt.original_status,o?.status,sh?.status].map(canonicalReturnStatus);
        const current=candidates.find(st=>allowed.has(st));
        if(o && sh && current) targets.push({rt,sh,o,current});
      }
      if(!targets.length) return json(res,400,{success:false,error:'لا توجد أوردرات قابلة للتحويل إلى Return to Origin'});
      const now=new Date().toISOString();
      // Create one Return to Origin operation per shipper, even when the user selected orders from multiple shippers in one action.
      const groups=new Map();
      for(const target of targets){const shipperId=String(target.o.merchant_id||target.rt.merchant_id||'unknown');if(!groups.has(shipperId))groups.set(shipperId,[]);groups.get(shipperId).push(target);}
      const operations=[];
      for(const [shipperId,group] of groups){
        const op=await createReturnOperation(user,driverId,group.map(x=>x.rt.id));
        for(const {rt,sh,o,current} of group){
          if (String(o.status||'').trim().toLowerCase() !== 'paid') {
            await dbUpdate('orders',{id:`eq.${o.id}`,company_id:`eq.${companyId}`},{status:'Return to Origin',driver_statement_action:null,driver_scheduled_date:null,driver_action_at:now,driver_action_by:user.id==='env-admin'?null:user.id,return_operation_id:op.id,return_operation_no:op.operation_no});
          }
          await dbUpdate('shipments',{id:`eq.${sh.id}`,company_id:`eq.${companyId}`},{status:'Return to Origin',driver_id:driverId});
          await dbUpdate('return_transactions',{id:`eq.${rt.id}`,company_id:`eq.${companyId}`},{return_status:'Return to Origin',driver_id:driverId,return_operation_id:op.id,return_operation_no:op.operation_no,updated_at:now,updated_by:user.id==='env-admin'?null:user.id});
          try{await dbInsert('shipment_status_history',{shipment_id:sh.id,status:'Return to Origin',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});}catch(_){ }
          await audit(user,'bulk_return_to_origin','return_transaction',rt.id,{order_id:o.id,from_status:current,driver_id:driverId,return_operation_id:op.id,return_operation_no:op.operation_no,merchant_id:shipperId});
        }
        operations.push({...op,driver_name:driver.name,driver_no:driver.driver_no,merchant_id:shipperId,merchant_name:group[0].o.merchant_name||''});
      }
      return json(res,200,{success:true,updated_count:targets.length,updated_ids:targets.map(x=>String(x.rt.id)),data:{operations,operation:operations[0]||null}});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/returns/archive/bulk-complete-without-proof' && req.method === 'POST') {
    const user = await requireRole(req, res, 'shipments'); if (!user) return;
    if (!user.permissions?.completed_without_proof) return json(res,403,{success:false,error:'ليست لديك صلاحية Completed Without Proof'});
    try {
      const body = await bodyJson(req);
      const ids = Array.isArray(body.return_ids) ? [...new Set(body.return_ids.map(x=>String(x).trim()).filter(Boolean))].slice(0,500) : [];
      if (!ids.length) return json(res,400,{success:false,error:'حدد سجل مرتجع واحدًا على الأقل'});
      const companyId=await resolveCompanyId(user), now=new Date().toISOString(), updated=[];
      for (const id of ids) {
        const rt=firstRow(await dbSelect('return_transactions',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        if(!rt || rt.return_status==='Return Completed') continue;
        const order=rt.order_id?firstRow(await dbSelect('orders',{select:'*',id:`eq.${rt.order_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])):null;
        const shipment=rt.shipment_id?firstRow(await dbSelect('shipments',{select:'*',id:`eq.${rt.shipment_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])):null;
        const preservePaidOrderStatus = String(order?.status||'').trim().toLowerCase() === 'paid';
        await dbUpdate('return_transactions',{id:`eq.${rt.id}`,company_id:`eq.${companyId}`},{original_status:rt.original_status||rt.return_status,return_status:'Return Completed',completed_at:now,completed_by:user.id==='env-admin'?null:user.id,completed_without_proof:true,updated_at:now,updated_by:user.id==='env-admin'?null:user.id});
        if(order && !preservePaidOrderStatus) await dbUpdate('orders',{id:`eq.${order.id}`,company_id:`eq.${companyId}`},{status:'Return Completed',driver_statement_action:null,driver_scheduled_date:null,driver_action_at:now,driver_action_by:user.id==='env-admin'?null:user.id});
        if(shipment){await dbUpdate('shipments',{id:`eq.${shipment.id}`,company_id:`eq.${companyId}`},{status:'Return Completed'});try{await dbInsert('shipment_status_history',{shipment_id:shipment.id,status:'Return Completed',user_id:user.id==='env-admin'?null:user.id,note:'Completed Without Proof'},{prefer:'return=minimal'});}catch(_){}}
        await audit(user,'return_completed_without_proof','return_transaction',rt.id,{order_id:rt.order_id||null,shipment_id:rt.shipment_id||null,actor_name:user.name||user.username||user.email||'Administrator'});
        updated.push(String(rt.id));
      }
      return json(res,200,{success:true,updated_count:updated.length,updated_ids:updated});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }

  const returnOperationMatch=pathname.match(/^\/api\/returns\/operation\/([^/]+)$/);
  if(returnOperationMatch && req.method==='GET'){
    const user=await requireRole(req,res,'shipments');if(!user)return;
    try{const data=await getReturnOperation(user,returnOperationMatch[1]);if(!data)return json(res,404,{success:false,error:'عملية المرتجع غير موجودة'});return json(res,200,{success:true,data});}catch(error){return json(res,500,{success:false,error:error.message});}
  }

  const returnDetailMatch = pathname.match(/^\/api\/returns\/([^/]+)$/);
  const returnProofMatch = pathname.match(/^\/api\/returns\/([^/]+)\/proof$/);
  if (pathname === '/api/returns' && req.method === 'GET') {
    const user = await requireRole(req, res, 'shipments'); if (!user) return;
    try {
      const companyId=await resolveCompanyId(user);
      const orders=await dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:20000});
      const shipments=await dbSelect('shipments',{select:'*',company_id:`eq.${companyId}`,limit:20000});
      for(const o of orders){const st=canonicalReturnStatus(o.status);if(!RETURN_STATUSES.has(st))continue;const sh=shipments.find(x=>String(x.order_id)===String(o.id));if(sh)await ensureReturnTransaction(user,o,sh,st);}
      const data=await getReturnTransactions(user,false,url.searchParams.get('from')||'',url.searchParams.get('to')||'');
      return json(res,200,{success:true,data});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if (pathname === '/api/returns/archive' && req.method === 'GET') {
    const user=await requireRole(req,res,'shipments');if(!user)return;
    try {
      const companyId=await resolveCompanyId(user);
      const orders=await dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:20000}).catch(()=>[]);
      const shipments=await dbSelect('shipments',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const shipmentByOrder=new Map(shipments.map(x=>[String(x.order_id),x]));

      // Keep Returns Archive permanently linked to Return to Origin.
      // If an order was moved to RTO by the bulk action or another valid
      // status action, make sure its existing return transaction is synced;
      // if the transaction is missing, create it so the archive is never
      // dependent on the Returns page being opened first.
      for(const o of orders){
        if(String(o.status||'').trim().toLowerCase()!=='return to origin') continue;
        const sh=shipmentByOrder.get(String(o.id));
        if(!sh) continue;
        const existing=firstRow(await dbSelect('return_transactions',{select:'*',order_id:`eq.${o.id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
        if(existing){
          if(!String(existing.return_transaction_no||'').trim()){
            const returnTransactionNo=await nextReturnTransactionNumber(companyId);
            await dbUpdate('return_transactions',{id:`eq.${existing.id}`,company_id:`eq.${companyId}`},{return_transaction_no:returnTransactionNo,updated_at:new Date().toISOString()},{prefer:'return=minimal'});
          }
          if(String(existing.return_status||'').trim()!=='Return to Origin') {
            await dbUpdate('return_transactions',{id:`eq.${existing.id}`,company_id:`eq.${companyId}`},{return_status:'Return to Origin',updated_at:new Date().toISOString()},{prefer:'return=minimal'}).catch(()=>{});
          }
        } else {
          const returnTransactionNo=await nextReturnTransactionNumber(companyId);
          await dbInsert('return_transactions',{
            company_id:companyId,order_id:o.id,shipment_id:sh.id,merchant_id:o.merchant_id||null,
            return_transaction_no:returnTransactionNo,
            original_status:o.previous_return_status||o.return_reason_status||'Return to Origin',
            return_status:'Return to Origin',return_date:egyptTodayISO(),
            created_by:user.id==='env-admin'?null:user.id
          },{prefer:'return=representation'}).catch(()=>{});
        }
      }
      return json(res,200,{success:true,data:await getReturnTransactions(user,'archive',url.searchParams.get('from')||'',url.searchParams.get('to')||'')});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(returnDetailMatch && req.method==='GET'){
    const user=await requireRole(req,res,'shipments');if(!user)return;
    try{
      const companyId=await resolveCompanyId(user);
      const row=firstRow(await dbSelect('return_transactions',{select:'*',id:`eq.${returnDetailMatch[1]}`,company_id:`eq.${companyId}`,limit:1}));
      if(!row)return json(res,404,{success:false,error:'عملية المرتجع غير موجودة'});
      const data=(await getReturnTransactions(user,null,'','')).find(x=>String(x.id)===String(row.id))||row;
      // Build the timeline from persisted shipment history and return records only.
      // Do not infer a historical driver from the current driver assignment.
      const history=row.shipment_id?await dbSelect('shipment_status_history',{select:'id,shipment_id,status,note,user_id,created_at',shipment_id:`eq.${row.shipment_id}`,order:'created_at.asc',limit:500}).catch(()=>[]):[];
      const assignmentAudits=row.shipment_id?await dbSelect('audit_logs',{select:'id,action,entity_type,entity_id,details,user_id,created_at',company_id:`eq.${companyId}`,entity_type:'eq.shipment',entity_id:`eq.${row.shipment_id}`,order:'created_at.asc',limit:500}).catch(()=>[]):[];
      const actorIds=[...new Set([...history,...assignmentAudits].map(h=>String(h.user_id||'')).filter(Boolean))];
      const actors=actorIds.length?await dbSelect('users',{select:'id,name,username,employee_code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]):[];
      const actorMap=new Map(actors.map(a=>[String(a.id),a]));
      const timeline=[];
      if(row.created_at)timeline.push({type:'return_created',title:'Return transaction created',status:row.original_status||row.return_status||'',at:row.created_at,actor:(actorMap.get(String(row.created_by||''))||{}).name||'',note:''});
      for(const h of history){const a=actorMap.get(String(h.user_id||''))||{};const assignmentNote=String(h.note||'').match(/Driver assignment:\s*(.+)$/i);timeline.push({type:'shipment_status',title:/assign/i.test(h.status||'')?'Driver assignment / status update':(h.status||'Status update'),status:h.status||'',at:h.created_at||null,actor:a.name||a.username||a.employee_code||'',note:h.note||'',historical_driver:assignmentNote?assignmentNote[1]:null});}
      for(const h of assignmentAudits){const details=h.details&&typeof h.details==='object'?h.details:{};const driverName=details.driver_name||details.to_driver_name||'';if(!driverName&&!/assign|transfer_order_between_drivers/i.test(String(h.action||'')))continue;timeline.push({type:'driver_assignment',title:'Driver assignment recorded',status:'Assigned with Driver',at:h.created_at||null,actor:(actorMap.get(String(h.user_id||''))||{}).name||'',note:driverName?`Driver: ${driverName}`:String(h.action||''),historical_driver:driverName||null});}
      for(const attachment of (data.attachments||[])){if(attachment.uploaded_at)timeline.push({type:'proof',title:'Return proof uploaded',status:'',at:attachment.uploaded_at,actor:'',note:attachment.file_name||''});}
      if(row.completed_at)timeline.push({type:'return_completed',title:'Return completed',status:row.return_status||'Return Completed',at:row.completed_at,actor:(actorMap.get(String(row.completed_by||''))||{}).name||'',note:row.completed_without_proof?'Completed without proof':''});
      if(row.updated_at && row.updated_at!==row.created_at)timeline.push({type:'return_updated',title:'Return record updated',status:row.return_status||'',at:row.updated_at,actor:(actorMap.get(String(row.updated_by||''))||{}).name||'',note:row.note||''});
      timeline.sort((a,b)=>String(a.at||'').localeCompare(String(b.at||'')));
      data.timeline=timeline;
      return json(res,200,{success:true,data});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(returnDetailMatch && req.method==='PATCH'){
    const user=await requireRole(req,res,'shipments');if(!user)return;
    try{const body=await bodyJson(req),companyId=await resolveCompanyId(user);const row=firstRow(await dbUpdate('return_transactions',{id:`eq.${returnDetailMatch[1]}`,company_id:`eq.${companyId}`},{note:cleanString(body.note)||null,updated_at:new Date().toISOString(),updated_by:user.id==='env-admin'?null:user.id}));await audit(user,'edit_return_transaction','return_transaction',returnDetailMatch[1],{note:body.note||null});return json(res,200,{success:true,data:row});}catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(returnDetailMatch && pathname.endsWith('/complete') && req.method==='POST'){
    const user=await requireRole(req,res,'shipments');if(!user)return;
  }
  const returnCompleteMatch=pathname.match(/^\/api\/returns\/([^/]+)\/complete$/);
  if(returnCompleteMatch && req.method==='POST'){
    const user=await requireRole(req,res,'shipments');if(!user)return;
    try{const companyId=await resolveCompanyId(user);const rt=firstRow(await dbSelect('return_transactions',{select:'*',id:`eq.${returnCompleteMatch[1]}`,company_id:`eq.${companyId}`,limit:1}));if(!rt)return json(res,404,{success:false,error:'عملية المرتجع غير موجودة'});const proof=firstRow(await dbSelect('return_transaction_attachments',{select:'id',return_transaction_id:`eq.${rt.id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));if(!proof)return json(res,400,{success:false,error:'يجب رفع إثبات استلام التاجر قبل Return Completed'});await dbUpdate('return_transactions',{id:`eq.${rt.id}`,company_id:`eq.${companyId}`},{original_status:rt.original_status||rt.return_status,return_status:'Return Completed',completed_at:new Date().toISOString(),completed_by:user.id==='env-admin'?null:user.id,completed_without_proof:false});const sh=firstRow(await dbSelect('shipments',{select:'*',id:`eq.${rt.shipment_id}`,company_id:`eq.${companyId}`,limit:1}));if(sh){const o=firstRow(await dbSelect('orders',{select:'*',id:`eq.${rt.order_id}`,company_id:`eq.${companyId}`,limit:1}));if(o&&String(o.status||'').trim().toLowerCase()!=='paid'){await dbUpdate('orders',{id:`eq.${o.id}`,company_id:`eq.${companyId}`},{status:'Return Completed',driver_statement_action:null,driver_scheduled_date:null,driver_action_at:new Date().toISOString(),driver_action_by:user.id==='env-admin'?null:user.id});}await dbUpdate('shipments',{id:`eq.${sh.id}`,company_id:`eq.${companyId}`},{status:'Return Completed'});try{await dbInsert('shipment_status_history',{shipment_id:sh.id,status:'Return Completed',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});}catch(_){} }await audit(user,'return_completed','return_transaction',rt.id,{without_proof:false,proof_id:proof.id});return json(res,200,{success:true});}catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(returnProofMatch && req.method==='POST'){
    const user=await requireRole(req,res,'shipments');if(!user)return;
    try{const body=await bodyJson(req),companyId=await resolveCompanyId(user);let rt=firstRow(await dbSelect('return_transactions',{select:'*',id:`eq.${returnProofMatch[1]}`,company_id:`eq.${companyId}`,limit:1}));if(!rt){const order=firstRow(await dbSelect('orders',{select:'*',id:`eq.${returnProofMatch[1]}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));if(order){const shipment=firstRow(await dbSelect('shipments',{select:'*',order_id:`eq.${order.id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));if(shipment)rt=await ensureReturnTransaction(user,order,shipment,canonicalReturnStatus(order.status));}}if(!rt)return json(res,404,{success:false,error:'لم يتم العثور على سجل المرتجع المرتبط بهذا الإثبات. حدّث الأرشيف وحاول مرة أخرى.'});const proof=body.proof||body;if(!proof.data)return json(res,400,{success:false,error:'ملف الإثبات مطلوب'});const m=String(proof.data).match(/^data:([^;]+);base64,(.+)$/);const contentType=cleanString(proof.content_type||m?.[1]||'application/octet-stream');const raw=Buffer.from(m?m[2]:String(proof.data),'base64');if(raw.length>8*1024*1024)return json(res,400,{success:false,error:'حجم الملف أكبر من 8MB'});const ext=(String(proof.file_name||'proof').toLowerCase().match(/\.(jpg|jpeg|png|webp|pdf)$/)||[])[1]||'bin';const pathKey=`${companyId}/${rt.id}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;await storageUpload('return-proofs',pathKey,raw,contentType);const row=firstRow(await dbInsert('return_transaction_attachments',{company_id:companyId,return_transaction_id:rt.id,file_name:cleanString(proof.file_name)||`proof.${ext}`,content_type:contentType,file_size:raw.length,storage_bucket:'return-proofs',storage_path:pathKey,uploaded_by:user.id==='env-admin'?null:user.id},{prefer:'return=representation'}));if(!row?.id)throw new Error('تم رفع الملف لكن تعذر حفظ سجل إثبات المرتجع في قاعدة البيانات؛ أعد المحاولة بعد التحقق من المرفقات.');const returnUpdated=firstRow(await dbUpdate('return_transactions',{id:`eq.${rt.id}`,company_id:`eq.${companyId}`},{proof_received_at:new Date().toISOString(),proof_received_by:user.id==='env-admin'?null:user.id,return_status:'Return Completed',completed_at:new Date().toISOString(),completed_by:user.id==='env-admin'?null:user.id,completed_without_proof:false}));if(!returnUpdated)throw new Error('تم حفظ الإثبات لكن تعذر تحديث حالة سجل المرتجع. أعد المحاولة أو راجع السجل.');const sh=firstRow(await dbSelect('shipments',{select:'*',id:`eq.${rt.shipment_id}`,company_id:`eq.${companyId}`,limit:1}));if(sh){const linkedOrder=firstRow(await dbSelect('orders',{select:'*',id:`eq.${rt.order_id}`,company_id:`eq.${companyId}`,limit:1}));if(linkedOrder&&String(linkedOrder.status||'').trim().toLowerCase()!=='paid'){const orderUpdated=firstRow(await dbUpdate('orders',{id:`eq.${linkedOrder.id}`,company_id:`eq.${companyId}`},{status:'Return Completed',driver_statement_action:null,driver_scheduled_date:null,driver_action_at:new Date().toISOString(),driver_action_by:user.id==='env-admin'?null:user.id}));if(!orderUpdated)throw new Error('تم حفظ الإثبات لكن تعذر تحديث حالة الأوردر. أعد المحاولة أو راجع الأوردر.');}const shipmentUpdated=firstRow(await dbUpdate('shipments',{id:`eq.${sh.id}`,company_id:`eq.${companyId}`},{status:'Return Completed'}));if(!shipmentUpdated)throw new Error('تم حفظ الإثبات لكن تعذر تحديث حالة الشحنة. أعد المحاولة أو راجع الشحنة.');try{await dbInsert('shipment_status_history',{shipment_id:sh.id,status:'Return Completed',user_id:user.id==='env-admin'?null:user.id},{prefer:'return=minimal'});}catch(_){} }await audit(user,'upload_return_proof','return_transaction',rt.id,{attachment_id:row.id});return json(res,200,{success:true,data:row});}catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(returnProofMatch && req.method==='GET'){
    const user=await requireRole(req,res,'shipments');if(!user)return;
    try{const companyId=await resolveCompanyId(user);const p=firstRow(await dbSelect('return_transaction_attachments',{select:'*',return_transaction_id:`eq.${returnProofMatch[1]}`,company_id:`eq.${companyId}`,order:'uploaded_at.desc',limit:1}));if(!p)return json(res,404,{success:false,error:'الإثبات غير موجود'});const response=await storageDownload(p.storage_bucket,p.storage_path);const raw=Buffer.from(await response.arrayBuffer());res.writeHead(200,{'Content-Type':p.content_type||'application/octet-stream','Content-Length':raw.length,'Content-Disposition':`inline; filename="${String(p.file_name||'proof').replace(/"/g,'')}"`});return res.end(raw);}catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/orders-verification' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const result = await getOrdersVerificationRows(user, {
        q: url.searchParams.get('q') || '',
        driver_id: url.searchParams.get('driver_id') || '',
        verification: url.searchParams.get('verification') || 'all',
        status: url.searchParams.get('status') || 'all',
        statement_date: url.searchParams.get('statement_date') || ''
      });
      return json(res, 200, { success: true, data: result.rows, drivers: result.drivers });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/orders-verification/edit' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      if (!body.id) return json(res, 400, { success:false, error:'الأوردر مطلوب' });
      const existing = firstRow(await dbSelect('orders', { select:'*', id:`eq.${body.id}`, company_id:`eq.${companyId}`, limit:1 }));
      if (!existing) return json(res, 404, { success:false, error:'الأوردر غير موجود' });
      const isPaid = [existing.commission_paid_status, existing.cash_collection_status, existing.payment_status, existing.paid_status]
        .some(value => String(value || '').trim().toLowerCase() === 'paid') || Boolean(existing.commission_paid_at || existing.cash_collected_at);
      const patch = {};
      // A Paid order is immutable except for its delivery fee. Enforce this on
      // the server too, so a stale UI or manual request cannot alter its value/status.
      if (!isPaid && (body.cod !== undefined || body.value !== undefined)) {
        const amount = cleanNumber(body.cod !== undefined ? body.cod : body.value);
        if (amount < 0) return json(res,400,{success:false,error:'قيمة الأوردر لا يمكن أن تكون سالبة'});
        patch.value = amount;
        if (existing.cod !== undefined && existing.cod !== null) patch.cod = amount;
      }
      if (body.delivery_fee !== undefined) {
        const fee = cleanNumber(body.delivery_fee);
        if (fee < 0) return json(res,400,{success:false,error:'رسوم التوصيل لا يمكن أن تكون سالبة'});
        patch.delivery_fee = fee;
        if (existing.service_charges !== undefined && existing.service_charges !== null) patch.service_charges = fee;
      }
      const allowedStatus = new Map([
        ['delivered','Delivered'], ['half delivered','Half Delivered'], ['replaced','Replaced'], ['replace','Replaced'],
        ['cancelled by shipper','Cancelled by Shipper'], ['cancelled by receiver','Cancelled by Receiver']
      ]);
      if (!isPaid && body.status !== undefined) {
        const key = commissionStatusKey(body.status);
        const normalized = allowedStatus.get(key);
        if (!normalized) return json(res,400,{success:false,error:'يمكن اختيار Delivered أو Half Delivered أو Replace أو Cancelled by Shipper أو Cancelled by Receiver فقط'});
        patch.status = normalized;
      }
      if (!Object.keys(patch).length) return json(res,400,{success:false,error:'لا توجد تعديلات للحفظ'});
      const updated = firstRow(await dbUpdate('orders',{id:`eq.${body.id}`,company_id:`eq.${companyId}`},patch));
      if (patch.status) {
        const related = await dbSelect('shipments',{select:'id,status',order_id:`eq.${body.id}`,company_id:`eq.${companyId}`,limit:100}).catch(()=>[]);
        for (const sh of related) await dbUpdate('shipments',{id:`eq.${sh.id}`,company_id:`eq.${companyId}`},{status:patch.status}).catch(()=>{});
      }
      await audit(user,'edit_driver_account_order','order',body.id,{before:{value:existing.value,cod:existing.cod,delivery_fee:existing.delivery_fee,service_charges:existing.service_charges,status:existing.status},after:patch});
      return json(res,200,{success:true,data:updated});
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/orders-verification/cash-settle' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const orderIds = Array.isArray(body.order_ids) ? [...new Set(body.order_ids.filter(Boolean).map(String))] : [];
      const cashAmount = cleanNumber(body.cash_amount);
      const creditAmount = cleanNumber(body.credit_amount);
      const expenseAmount = cleanNumber(body.expense_amount);
      if (!orderIds.length) return json(res,400,{success:false,error:'اختر الأوردرات التي تم تحصيل قيمتها'});
      if (cashAmount < 0 || creditAmount < 0 || expenseAmount < 0) return json(res,400,{success:false,error:'قيمة التحصيل أو المصروف لا يمكن أن تكون سالبة'});
      if (expenseAmount > cashAmount) return json(res,400,{success:false,error:'مصاريف المندوب لا يمكن أن تتجاوز قيمة الكاش'});
      const orders=[];
      for (const id of orderIds) {
        const o=firstRow(await dbSelect('orders',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
        if (!o) continue;
        const state=commissionState(o);
        if (!state.eligible || driverAccountingAmount(o) <= 0) continue;
        const collectionPaid = [o.cash_collection_status, o.payment_status, o.paid_status]
          .some(value => String(value || '').trim().toLowerCase() === 'paid');
        if (collectionPaid) continue;
        orders.push(o);
      }
      if (!orders.length) return json(res,400,{success:false,error:'لا توجد أوردرات قابلة للتحصيل'});
      const expected=Number(orders.reduce((sum,o)=>sum+driverAccountingAmount(o),0).toFixed(2));
      const enteredTotal=Number((cashAmount+creditAmount).toFixed(2));
      if (Math.abs(expected-enteredTotal) > 0.01) return json(res,400,{success:false,error:`إجمالي الكاش + Credit (${enteredTotal.toFixed(2)}) لا يساوي إجمالي الأوردرات المختارة (${expected.toFixed(2)})`,expected_total:expected,cash_amount:cashAmount,credit_amount:creditAmount});
      const now=new Date().toISOString();
      // Resolve the courier from shipments; orders has no driver_id column.
      const selectedOrderIds=orders.map(o=>String(o.id)).filter(Boolean);
      const selectedShipments=selectedOrderIds.length
        ? await dbSelect('shipments',{select:'order_id,driver_id',company_id:`eq.${companyId}`,order_id:`in.(${selectedOrderIds.join(',')})`,limit:20000}).catch(()=>[])
        : [];
      const selectedDriverIds=[...new Set(selectedShipments.map(sh=>String(sh.driver_id||'')).filter(Boolean))];
      let expenseId=null;
      if (expenseAmount > 0 && selectedDriverIds.length !== 1) {
        return json(res,400,{success:false,error:'عند إضافة مصروف للمندوب يجب أن تكون الأوردرات المختارة لمندوب واحد فقط'});
      }
      const paid=[];
      let cashRemaining=cashAmount, creditRemaining=creditAmount;
      for (const o of orders) {
        const orderCollected=driverAccountingAmount(o);
        const orderCash=Math.min(orderCollected,Math.max(0,cashRemaining));
        const orderCredit=Number((orderCollected-orderCash).toFixed(2));
        cashRemaining=Number((cashRemaining-orderCash).toFixed(2));
        creditRemaining=Number((creditRemaining-orderCredit).toFixed(2));
        const method=orderCash>0 && orderCredit>0 ? 'cash+credit' : (orderCash>0 ? 'cash' : 'credit');
        const patch={cash_collection_status:'paid',collection_method:method,cash_collected_amount:orderCash,credit_collected_amount:orderCredit,cash_collected_at:now,cash_collected_by:user.id==='env-admin'?null:user.id};
        const updated=firstRow(await dbUpdate('orders',{id:`eq.${o.id}`,company_id:`eq.${companyId}`},patch));
        paid.push(updated||{...o,...patch});
        await audit(user,'cash_settle_order','order',o.id,{before:{cash_collection_status:o.cash_collection_status||'unpaid'},after:patch,cash_amount:patch.cash_collected_amount});
      }
      if (expenseAmount > 0) {
        const driverId=selectedDriverIds[0];
        const expenseRow={company_id:companyId,driver_id:driverId,expense_type:'cash_collection',category:'expense',amount:expenseAmount,expense_date:now.slice(0,10),details:'مصاريف المندوب المرتبطة بالتحصيل النقدي',notes:`Cash collection expense for ${paid.length} paid order(s)`,employee_id:user.id==='env-admin'?null:user.id,created_at:now,updated_at:now};
        const expense=firstRow(await dbInsert('expenses',expenseRow));
        expenseId=expense?.id||null;
        await audit(user,'create_cash_collection_driver_expense','expense',expenseId,{driver_id:driverId,amount:expenseAmount,order_ids:paid.map(x=>x.id),cash_amount:cashAmount,net_cash:Number((cashAmount-expenseAmount).toFixed(2))});
      }
      return json(res,200,{success:true,data:{paid_orders:paid,paid_order_ids:paid.map(x=>x.id),collection_method:cashAmount>0&&creditAmount>0?'cash+credit':cashAmount>0?'cash':'credit',cash_amount:cashAmount,credit_amount:creditAmount,expense_amount:expenseAmount,net_cash:Number((cashAmount-expenseAmount).toFixed(2)),expense_id:expenseId,count:paid.length}});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/orders-verification/verify' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const driverId = cleanString(body.driver_id);
      const ids = uniqueArray(Array.isArray(body.order_ids) ? body.order_ids : []);
      if (!driverId) return json(res, 400, { success: false, error: 'اختر اسم المندوب قبل اعتماد الأوردرات' });
      if (!ids.length) return json(res, 400, { success: false, error: 'لا توجد أوردرات قابلة للاعتماد' });
      const companyId = await resolveCompanyId(user);
      // Enforce the selected driver server-side as well as in the UI. This uses
      // the same latest Delivery Job assignment that populates the Driver Account page.
      const statementDate = cleanString(body.statement_date || '');
      const assignedRows = await getOrdersVerificationRows(user, { driver_id: driverId, verification: 'all', status: 'all', statement_date: statementDate });
      const assignedOrderIds = new Set((assignedRows.rows || []).map(row => String(row.id)));
      const result = [];
      for (const id of ids) {
        if (!assignedOrderIds.has(String(id))) continue;
        const o = firstRow(await dbSelect('orders', { select: '*', id: `eq.${id}`, company_id: `eq.${companyId}`, limit: 1 }));
        if (!o) continue;
        if (o.statement_removed_at || commissionStatusKey(o.status) === 'in ops' || commissionStatusKey(o.status) === 'in_ops') continue;
        if (!isCommissionEligibleStatus(o.status)) continue;
        // Verification is only valid for orders currently represented in a
        // Delivery Job; do not allow direct verification of unrelated orders.
        const verifyShipment = firstRow(await dbSelect('shipments', { select: 'id,order_id', order_id: `eq.${id}`, company_id: `eq.${companyId}`, limit: 1 }).catch(() => []));
        if (!verifyShipment?.id) continue;
        const verifyLinks = await dbSelect('delivery_job_shipments', { select: 'delivery_job_id', shipment_id: `eq.${verifyShipment.id}`, limit: 50 }).catch(() => []);
        if (!verifyLinks.length) continue;
        if (String(o.commission_verify_status || '').toLowerCase() === 'verified') continue;
        const patch = {
          commission_verify_status: 'verified',
          commission_verified_at: new Date().toISOString(),
          commission_verified_by: user.id === 'env-admin' ? null : user.id
        };
        const updated = firstRow(await dbUpdate('orders', { id: `eq.${id}`, company_id: `eq.${companyId}` }, patch));
        await audit(user, 'verify_order', 'order', id, { before: { commission_verify_status: o.commission_verify_status || 'unverified' }, after: patch, status: o.status, statement_date: statementDate });
        result.push(updated || { ...o, ...patch });
      }
      return json(res, 200, { success: true, data: result, count: result.length, message: 'Orders verified successfully.' });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/orders-verification/unverify' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const id = cleanString(body.id);
      if (!id) return json(res, 400, { success: false, error: 'معرّف الأوردر مطلوب' });
      const companyId = await resolveCompanyId(user);
      const existing = firstRow(await dbSelect('orders', { select: '*', id: `eq.${id}`, company_id: `eq.${companyId}`, limit: 1 }));
      if (!existing) return json(res, 404, { success: false, error: 'الأوردر غير موجود' });
      const paid = String(existing.commission_payment_status || existing.commission_paid_status || existing.cash_collection_status || '').toLowerCase();
      if (['paid','verified_paid','settled','collected'].includes(paid) || existing.commission_paid_at) {
        return json(res, 409, { success: false, error: 'لا يمكن إلغاء الاعتماد بعد تسجيل الدفع أو التسوية' });
      }
      const patch = { commission_verify_status: 'unverified', commission_verified_at: null, commission_verified_by: null };
      const updated = firstRow(await dbUpdate('orders', { id: `eq.${id}`, company_id: `eq.${companyId}` }, patch));
      await audit(user, 'unverify_order', 'order', id, { before: { commission_verify_status: existing.commission_verify_status || 'unverified' }, after: patch });
      return json(res, 200, { success: true, data: updated || { ...existing, ...patch } });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/orders-verification/remove' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const id = cleanString(body.id);
      if (!id) return json(res, 400, { success: false, error: 'معرّف الأوردر مطلوب' });
      const companyId = await resolveCompanyId(user);
      const existing = firstRow(await dbSelect('orders', { select: '*', id: `eq.${id}`, company_id: `eq.${companyId}`, limit: 1 }));
      if (!existing) return json(res, 404, { success: false, error: 'الأوردر غير موجود' });
      const paidFlags = [existing.commission_paid_status, existing.cash_collection_status, existing.payment_status, existing.paid_status]
        .map(value => String(value || '').trim().toLowerCase());
      if (paidFlags.includes('paid') || existing.commission_paid_at || existing.cash_collected_at) {
        return json(res, 409, { success: false, error: 'الأوردر مدفوع بالفعل ولا يمكن إخراجه من كشف المندوب أو حساباته' });
      }

      const shipment = firstRow(await dbSelect('shipments', { select: 'id,driver_id', order_id: `eq.${id}`, limit: 1 }).catch(() => []));
      let currentDriverId = shipment?.driver_id || null;
      try {
        const links = await dbSelect('delivery_job_shipments', { select: 'delivery_job_id', shipment_id: `eq.${shipment?.id}`, limit: 50 });
        const jobIds = links.map(x => x.delivery_job_id).filter(Boolean);
        if (jobIds.length) {
          const jobs = await dbSelect('delivery_jobs', { select: 'id,driver_id,created_at', id: `in.(${jobIds.join(',')})`, order: 'created_at.desc', limit: 50 });
          currentDriverId = jobs[0]?.driver_id || currentDriverId;
        }
      } catch (_) {}
      const patch = {
        status: 'In Ops',
        statement_removed_at: new Date().toISOString(),
        statement_removed_by: user.id === 'env-admin' ? null : user.id,
        statement_removed_from_driver_id: currentDriverId
      };
      const updated = firstRow(await dbUpdate('orders', { id: `eq.${id}`, company_id: `eq.${companyId}` }, patch));
      await audit(user, 'remove_order_from_statement', 'order', id, {
        before_status: existing.status,
        new_status: 'In Ops',
        statement_removed_from_driver_id: patch.statement_removed_from_driver_id,
        financial_records_unchanged: true
      });
      return json(res, 200, { success: true, data: updated || { ...existing, ...patch } });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/accounting/verify-orders' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const driverId = url.searchParams.get('driver_id') || '';
      const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
      const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;

      const orders = await dbSelect('orders', {
        select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000
      });
      const shipments = await dbSelect('shipments', {
        select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000
      }).catch(() => []);
      const drivers = await dbSelect('drivers', {
        select: 'id,name,driver_no,company_id', company_id: `eq.${companyId}`, limit: 5000
      }).catch(() => []);
      const merchants = await dbSelect('merchants', {
        select: 'id,name,code,merchant_no,company_id', company_id: `eq.${companyId}`, limit: 5000
      }).catch(() => []);
      const deliveryJobs = await dbSelect('delivery_jobs', {
        select: 'id,job_code,driver_id,company_id,job_date,date,created_at',
        company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000
      }).catch(() => []);
      const jobLinks = await dbSelect('delivery_job_shipments', {
        select: 'delivery_job_id,shipment_id', limit: 20000
      }).catch(() => []);
      const shipmentMap = new Map(shipments.map(s => [String(s.order_id), s]));
      const driverMap = new Map(drivers.map(d => [String(d.id), d]));
      const merchantMap = new Map(merchants.map(m => [String(m.id), m]));
      const latestAssignments = latestDeliveryJobAssignments(deliveryJobs, jobLinks);

      const rows = [];
      for (const o of orders) {
        const sh = shipmentMap.get(String(o.id));
        const assignment = latestAssignments.get(String(sh?.id || ''));
        const job = assignment?.job || null;
        // Driver statements use the operational day of the latest assignment or
        // the recorded delivery outcome, not the order's original creation date.
        const operationalDay = operationalOrderDay(o, sh, job);
        if (from && (!operationalDay || operationalDay < from)) continue;
        if (to && (!operationalDay || operationalDay > to)) continue;
        const d = driverMap.get(String(job?.driver_id || sh?.driver_id || sh?.current_driver_id || ''));
        const merchant = merchantMap.get(String(o.merchant_id || ''));
        // Driver Account is the financial/verification view of Delivery Job.
        // Never show an eligible order here unless it is actually linked to a
        // Delivery Job.
        if (!job || !sh?.id) continue;
        if (driverId && String(d?.id || sh?.driver_id || '') !== String(driverId)) continue;
        const hay = [o.tracking_number,o.merchant_order_no,o.order_no,o.id,sh?.shipment_no,d?.name,d?.driver_no,o.status].filter(Boolean).join(' ').toLowerCase();
        if (q && !hay.includes(q)) continue;
        const state = commissionState(o);
        rows.push({
          id: o.id,
          shipment_id: sh?.id || null,
          tracking_number: sh?.tracking_number || o.tracking_number || '',
          shipment_no: sh?.shipment_no || '',
          merchant_order_no: o.merchant_order_no || '',
          job_code: job?.job_code || sh?.job_code || sh?.delivery_job_code || '',
          shipper_name: merchant?.name || o.shipper_name || o.merchant_name || '',
          shipper_cod: cleanNumber(o.cod ?? o.value ?? o.order_value),
          driver_amount: driverOrderValue(o),
          driver_accounting_amount: driverAccountingAmount(o),
          status: o.status || '',
          cod: cleanNumber(o.cod ?? o.value ?? o.order_value),
          service_charges: cleanNumber(o.service_charges ?? o.delivery_fee),
          driver_id: d?.id || sh?.driver_id || null,
          driver_name: d?.name || '',
          driver_no: d?.driver_no || '',
          created_at: o.created_at || null,
          eligible: state.eligible,
          verify_status: state.verify_status,
          paid_status: state.paid_status,
          commission_verify_status: o.commission_verify_status || 'unverified',
          commission_verified_at: o.commission_verified_at || null,
          commission_verified_by: o.commission_verified_by || null,
          commission_paid_at: o.commission_paid_at || null,
          commission_payment_method: o.commission_payment_method || null,
          cash_collection_status: o.cash_collection_status || 'unpaid',
          cash_collected_amount: cleanNumber(o.cash_collected_amount),
          cash_collected_at: o.cash_collected_at || null
        });
      }
      return json(res, 200, { success: true, data: rows });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }


  if (pathname === '/api/accounting/receivable' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const from = url.searchParams.get('from') || egyptTodayISO();
      const to = url.searchParams.get('to') || from;
      if (!isValidISODate(from) || !isValidISODate(to) || from > to) return json(res,400,{success:false,error:'فترة التاريخ غير صحيحة'});
      const [drivers,orders,shipments,jobs,links,expenses,driverSettlements] = await Promise.all([
        dbSelect('drivers',{select:'id,name,driver_no,company_id',company_id:`eq.${companyId}`,limit:5000}),
        dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:20000}),
        dbSelect('shipments',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('delivery_jobs',{select:'id,driver_id,job_date,date,created_at,company_id',company_id:`eq.${companyId}`,order:'created_at.desc',limit:20000}).catch(()=>[]),
        dbSelect('delivery_job_shipments',{select:'delivery_job_id,shipment_id',limit:50000}).catch(()=>[]),
        dbSelect('expenses',{select:'*',company_id:`eq.${companyId}`,order:'expense_date.desc',limit:20000}).catch(()=>[]),
        dbSelect('driver_settlements',{select:'driver_id,amount,payment_method,paid_at,created_at,notes,company_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[])
      ]);
      const latestAssignments=latestDeliveryJobAssignments(jobs,links);
      const latestJobByShipment=new Map([...latestAssignments.entries()].map(([shipmentId,assignment])=>[shipmentId,assignment.job]));
      const shipmentByOrder=new Map(shipments.map(sh=>[String(sh.order_id||''),sh]));
      const driverFor=(sh)=>String(latestJobByShipment.get(String(sh?.id||''))?.driver_id||sh?.driver_id||sh?.current_driver_id||'');
      // Operational rows follow the latest Delivery Job assignment; scheduled/retry
      // statuses use their explicit scheduled date. Cash collection keeps its own date.
      const orderDay=(o,sh,job)=>operationalOrderDay(o,sh,job);
      const isPaidOrder=(o)=>[o?.commission_paid_status,o?.cash_collection_status,o?.payment_status,o?.paid_status,o?.commission_payment_status]
        .some(value=>String(value||'').trim().toLowerCase()==='paid');
      const firstPositive=(...values)=>{for(const value of values){const n=cleanNumber(value);if(n>0)return n;}return 0;};
      const cashCollectedFor=(o)=>{
        // Count only confirmed cash collections. Older orders may store the paid
        // flag in payment_status/paid_status rather than cash_collection_status.
        const paid=[o?.cash_collection_status,o?.payment_status,o?.paid_status]
          .some(value=>String(value||'').trim().toLowerCase()==='paid');
        if(!paid)return 0;
        const saved=cleanNumber(o?.cash_collected_amount);
        if(saved>0)return saved;
        const method=String(o?.collection_method||'').trim().toLowerCase();
        if(method.includes('cash'))
          return Math.max(0,Number((driverAccountingAmount(o)-cleanNumber(o?.credit_collected_amount)).toFixed(2)));
        return 0;
      };
      // Both pending approval counts and delivery-fee totals use the same five
      // commission-approved statuses, including cancelled and replaced orders.
      const approvalStatuses=new Set(['delivered','half delivered','cancelled by receiver','cancelled by shipper','replaced']);
      const deliveredStatuses=approvalStatuses;
      const grouped=new Map();
      const getRow=(id)=>{if(!grouped.has(id)){const d=drivers.find(x=>String(x.id)===id);if(d)grouped.set(id,{driver_id:d.id,driver_name:d.name||'',driver_no:d.driver_no||'',cash_collected:0,credit_collected:0,total_expenses:0,delivery_fees:0,pending_orders:0,pending_order_details:[],expense_details:[]});}return grouped.get(id);};
      for(const o of orders){const sh=shipmentByOrder.get(String(o.id));const did=driverFor(sh);if(!did)continue;const row=getRow(did);if(!row)continue;const job=latestJobByShipment.get(String(sh?.id||''));const day=orderDay(o,sh,job);const status=commissionStatusKey(o.status);const collectionStatus=String(o.cash_collection_status||'').trim().toLowerCase();const collectionMethod=String(o.collection_method||'').trim().toLowerCase();
        const paidFlags=[collectionStatus,String(o.payment_status||'').trim().toLowerCase(),String(o.paid_status||'').trim().toLowerCase()];
        if(day<from||day>to)continue;
        if(deliveredStatuses.has(status)){
          // Delivery fees in Cashier > Receivables are counted only after the
          // order is Paid, but attributed to the same delivery statement day
          // used by the Driver Account (not the later payment timestamp).
          if(isPaidOrder(o)) row.delivery_fees+=firstPositive(o.service_charges,o.service_charge,o.delivery_fee,o.delivery_charge,o.shipping_fee);
        }
        // Count all five approval-eligible statuses in the Settlement Status
        // column; this count is not restricted to Delivered/Half Delivered.
        const settled=String(o.commission_paid_status||'').trim().toLowerCase()==='paid';
        if(approvalStatuses.has(status)&&!settled){row.pending_orders++;row.pending_order_details.push({tracking_number:sh?.tracking_number||o.tracking_number||'',order_no:o.merchant_order_no||o.order_no||o.order_code||o.serial_no||'',status:canonicalOrderStatus(o.status),date:day,delivery_fee:cleanNumber(o.service_charges??o.delivery_fee)});}
      }
      // Cash/Credit totals come from the same saved Cash/Credit settlement rows
      // shown under the Driver Account settlement button. Only structured
      // settlement rows are counted; free-text notes from other payments are ignored.
      for(const st of driverSettlements){
        const note=String(st.notes||'');
        if(!/^TDS_DRIVER_SETTLEMENT\|[^|]+\|/.test(note))continue;
        const day=accountingDay(st.paid_at||st.created_at||'');
        if(day<from||day>to)continue;
        const row=getRow(String(st.driver_id||''));
        if(!row)continue;
        if(/\|Cash portion(?:\||$)/i.test(note))row.cash_collected+=cleanNumber(st.amount);
        else if(/\|Credit portion(?:\||$)/i.test(note))row.credit_collected+=cleanNumber(st.amount);
      }
      // Expenses are visible in Cashier > Receivables only after the driver's
      // statement for that delivery day has actually been settled (Cash/Credit
      // settlement exists) and the orders attached to that settlement are Paid.
      // Settlement notes contain the exact order IDs, so a later unrelated payment
      // cannot unlock expenses from an earlier day.
      const orderById=new Map(orders.map(o=>[String(o.id),o]));
      const shipmentById=new Map(shipments.map(sh=>[String(sh.id),sh]));
      const settledStatementKeys=new Set();
      for(const st of driverSettlements){
        const note=String(st.notes||'');
        const match=note.match(/^TDS_DRIVER_SETTLEMENT\|[^|]+\|([^|]*)\|/);
        if(!match)continue;
        const ids=match[1].split(',').filter(Boolean);
        for(const oid of ids){
          const o=orderById.get(String(oid));
          if(!o||String(o.commission_paid_status||'').trim().toLowerCase()!=='paid')continue;
          const sh=shipmentByOrder.get(String(o.id));
          const did=String(st.driver_id||'');
          if(!sh)continue;
          const job=latestJobByShipment.get(String(sh.id||''));
          if(String(job?.driver_id||sh.driver_id||sh.current_driver_id||'')!==did)continue;
          const day=orderDay(o,sh,job);
          if(day)settledStatementKeys.add(`${did}|${day}`);
        }
      }
      for(const e of expenses){const did=String(e.driver_id||'');const row=getRow(did);if(!row)continue;const day=accountingDay(e.expense_date||e.created_at||'');if(day<from||day>to)continue;if(!settledStatementKeys.has(`${did}|${day}`))continue;const amount=cleanNumber(e.amount);row.total_expenses+=amount;row.expense_details.push({date:day,type:e.expense_type||e.category||'',details:e.details||e.notes||'',amount});}
      const data=[...grouped.values()].map(r=>({...r,cash_collected:Number(r.cash_collected.toFixed(2)),total_expenses:Number(r.total_expenses.toFixed(2)),delivery_fees:Number(r.delivery_fees.toFixed(2)),pending_order_details:r.pending_order_details.sort((a,b)=>a.date.localeCompare(b.date)),expense_details:r.expense_details.sort((a,b)=>a.date.localeCompare(b.date))})).filter(r=>r.cash_collected||r.credit_collected||r.total_expenses||r.delivery_fees||r.pending_orders).sort((a,b)=>a.driver_name.localeCompare(b.driver_name));
      return json(res,200,{success:true,from,to,data});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/accounting/driver-expenses-summary' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const expenseFrom = url.searchParams.get('expense_from') || from;
      const expenseTo = url.searchParams.get('expense_to') || to;
      const driverId = url.searchParams.get('driver_id') || '';
      // The Driver Account page sends expense_from/expense_to for its selected
      // statement date. Use that same range for orders and settlements when the
      // general accounting range is not supplied; otherwise the page mixes an
      // all-time order total with one day's expenses and shows an understated balance.
      const statementFrom = from || expenseFrom || '';
      const statementTo = to || expenseTo || '';
      const fromMs = statementFrom ? new Date(`${statementFrom}T00:00:00`).getTime() : null;
      const toMs = statementTo ? new Date(`${statementTo}T23:59:59.999`).getTime() : null;
      const drivers = await dbSelect('drivers', { select: 'id,name,driver_no', company_id: `eq.${companyId}`, limit: 5000 });
      const orders = await dbSelect('orders', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000 });
      const shipments = await dbSelect('shipments', { select: '*', company_id: `eq.${companyId}`, limit: 10000 }).catch(() => []);
      const jobs = await dbSelect('delivery_jobs', { select: 'id,driver_id,job_date,date,created_at,company_id', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000 }).catch(() => []);
      const jobLinks = await dbSelect('delivery_job_shipments', { select: 'delivery_job_id,shipment_id', limit: 30000 }).catch(() => []);
      const jobMap = new Map(jobs.map(j => [String(j.id), j]));
      // Resolve each shipment to its latest delivery-job assignment. The shipment
      // driver field can be blank/stale after transfers, so it is only a fallback.
      const latestJobByShipment = new Map();
      for (const link of jobLinks) {
        const job = jobMap.get(String(link.delivery_job_id || ''));
        const sid = String(link.shipment_id || '');
        if (!job || !sid) continue;
        const previous = latestJobByShipment.get(sid);
        const jobStamp = String(job.job_date || job.delivery_date || job.date || job.created_at || '');
        const previousStamp = String(previous?.job_date || previous?.delivery_date || previous?.date || previous?.created_at || '');
        if (!previous || jobStamp > previousStamp) latestJobByShipment.set(sid, job);
      }
      const expenses = await dbSelect('expenses', { select: '*', company_id: `eq.${companyId}`, order: 'expense_date.desc', limit: 10000 }).catch(() => []);
      const settlements = await dbSelect('driver_settlements', { select: '*', company_id: `eq.${companyId}`, order: 'paid_at.desc', limit: 10000 }).catch(() => []);
      const shipmentByOrder = new Map(shipments.map(s => [String(s.order_id), s]));
      const driverMap = new Map(drivers.map(d => [String(d.id), d]));
      const driverForShipment = (shipment) => {
        const assignedJob = latestJobByShipment.get(String(shipment?.id || ''));
        return String(assignedJob?.driver_id || shipment?.driver_id || shipment?.current_driver_id || '');
      };
      const orderStatementDate = (order, shipment) => {
        const job = latestJobByShipment.get(String(shipment?.id || ''));
        return operationalOrderDay(order, shipment, job);
      };
      const verifiedByDriver = new Map();
      const cashCollectedByDriver = new Map();
      // Cash balance is based only on confirmed customer cash collections.
      // Credit collections and order COD/value are not cash collected.
      for (const o of orders) {
        if (String(o.cash_collection_status || '').trim().toLowerCase() !== 'paid') continue;
        const sh = shipmentByOrder.get(String(o.id));
        const did = driverForShipment(sh);
        if (!did || (driverId && did !== String(driverId))) continue;
        const collectedAt = o.cash_collected_at || orderStatementDate(o, sh) || o.created_at || o.updated_at || '';
        const stamp = new Date(collectedAt).getTime();
        if (fromMs !== null && (!Number.isFinite(stamp) || stamp < fromMs)) continue;
        if (toMs !== null && (!Number.isFinite(stamp) || stamp > toMs)) continue;
        const cashAmount = cleanNumber(o.cash_collected_amount);
        cashCollectedByDriver.set(did, Number(((cashCollectedByDriver.get(did) || 0) + cashAmount).toFixed(2)));
      }
      for (const o of orders) {
        const sh = shipmentByOrder.get(String(o.id));
        const statementDay = orderStatementDate(o, sh);
        if (statementFrom && statementDay && statementDay < statementFrom) continue;
        if (statementTo && statementDay && statementDay > statementTo) continue;
        if ((statementFrom || statementTo) && !statementDay) continue;
        const did = driverForShipment(sh);
        if (!did || (driverId && did !== String(driverId))) continue;
        const state = commissionState(o);
        // Accept current and legacy accounting approval flags so historical Paid/approved orders
        // are not silently omitted from Amount Due when only an older field was populated.
        const approvalFlags = [o.commission_verify_status, o.verify_status, o.verification_status,
          o.accounting_status, o.approval_status, o.commission_paid_status, o.paid_status]
          .map(v => String(v || '').trim().toLowerCase().replace(/[_-]+/g, ' '));
        const approved = state.verify_status === 'verified' || state.paid_status === 'paid' ||
          approvalFlags.some(v => ['verified','approved','paid','تم الاعتماد','معتمد','تم الدفع','مدفوع'].includes(v));
        if (!approved) continue;
        if (o.statement_removed_at || commissionStatusKey(o.status) === 'in ops') continue;
        const driver = driverMap.get(did);
        const row = verifiedByDriver.get(did) || { verified_orders: 0, service_charges: 0, shipper_cod: 0, commission_total: 0 };
        row.verified_orders += 1;
        row.service_charges += cleanNumber(o.service_charges ?? o.delivery_fee);
        row.shipper_cod += driverAccountingAmount(o);
        row.commission_total += cleanNumber(o.delivery_commission ?? o.driver_commission ?? o.commission_amount ?? 0);
        verifiedByDriver.set(did, row);
      }
      const expenseByDriver = new Map();
      for (const e of expenses) {
        const did = String(e.driver_id || '');
        if (!did || (driverId && did !== String(driverId))) continue;
        const expenseDay = String(e.expense_date || e.created_at || '').slice(0, 10);
        if (!expenseDay) continue;
        if (expenseFrom && expenseDay < expenseFrom) continue;
        if (expenseTo && expenseDay > expenseTo) continue;
        const row = expenseByDriver.get(did) || { fuel_expense: 0, other_expenses: 0, total_expenses: 0 };
        const amount = cleanNumber(e.amount);
        const type = String(e.expense_type || '').toLowerCase();
        if (type === 'petrol' || type === 'fuel' || type === 'بنزين') row.fuel_expense += amount;
        else row.other_expenses += amount;
        row.total_expenses += amount;
        expenseByDriver.set(did, row);
      }
      const settlementByDriver = new Map();
      const driverSettlementCards = new Map();
      const settlementOrdersById = new Map(orders.map(o => [String(o.id), o]));
      for (const st of settlements) {
        const did = String(st.driver_id || '');
        if (!did || (driverId && did !== String(driverId))) continue;
        // Commission payouts are recorded in driver_settlements for history, but
        // they must not reduce the driver's COD collection balance a second time.
        const rawNote = String(st.notes || '').trim();
        const settlementNote = rawNote.toLowerCase();
        if (settlementNote.startsWith('driver commission payment')) continue;
        const settlementDay = String(st.paid_at || st.created_at || '').slice(0, 10);
        if (statementFrom && settlementDay && settlementDay < statementFrom) continue;
        if (statementTo && settlementDay && settlementDay > statementTo) continue;
        if ((statementFrom || statementTo) && !settlementDay) continue;
        settlementByDriver.set(did, (settlementByDriver.get(did) || 0) + cleanNumber(st.amount));
        const match = rawNote.match(/^TDS_DRIVER_SETTLEMENT\|([^|]+)\|([^|]*)\|(.+)$/);
        if (match) {
          const groupId = match[1];
          const part = String(match[3] || '').toLowerCase();
          const groupOrderIds = [...new Set(String(match[2] || '').split(',').filter(Boolean))];
          const paidOrderCount = groupOrderIds.filter(id => String(settlementOrdersById.get(String(id))?.commission_paid_status || '').trim().toLowerCase() === 'paid').length;
          const byGroup = driverSettlementCards.get(did) || new Map();
          const card = byGroup.get(groupId) || { group_id: groupId, driver_id: did, paid_at: st.paid_at || st.created_at || '', cash_amount: 0, credit_amount: 0, total: 0, order_count: groupOrderIds.length, paid_order_count: paidOrderCount };
          const amount = cleanNumber(st.amount);
          if (part.includes('cash')) card.cash_amount += amount;
          else if (part.includes('credit')) card.credit_amount += amount;
          else if (String(st.payment_method || '').toLowerCase() === 'cash') card.cash_amount += amount;
          else if (String(st.payment_method || '').toLowerCase() === 'credit') card.credit_amount += amount;
          card.total = Number((card.cash_amount + card.credit_amount).toFixed(2));
          if (!card.paid_at || new Date(st.paid_at || st.created_at || 0).getTime() > new Date(card.paid_at).getTime()) card.paid_at = st.paid_at || st.created_at || '';
          byGroup.set(groupId, card);
          driverSettlementCards.set(did, byGroup);
        }
      }
      const data = drivers.filter(d => !driverId || String(d.id) === String(driverId)).map(d => {
        const v = verifiedByDriver.get(String(d.id)) || { verified_orders: 0, service_charges: 0, shipper_cod: 0, commission_total: 0 };
        const e = expenseByDriver.get(String(d.id)) || { fuel_expense: 0, other_expenses: 0, total_expenses: 0 };
        const cashCollectedTotal = Number((cashCollectedByDriver.get(String(d.id)) || 0).toFixed(2));
        // Requested Driver Account cash formula: actual customer cash collected minus driver expenses.
        // Do not use order COD/value, credit collections, or settlements in this net-cash figure.
        const netCash = Number((cashCollectedTotal - e.total_expenses).toFixed(2));
        const paid = Number((settlementByDriver.get(String(d.id)) || 0).toFixed(2));
        // Keep legacy accounting reports on their existing order-value formula; expose cash balance separately.
        const legacyNet = Math.max(0, Number((v.shipper_cod - e.total_expenses).toFixed(2)));
        const legacyRemaining = Math.max(0, Number((legacyNet - paid).toFixed(2)));
        const cashRemaining = Math.max(0, Number((netCash - paid).toFixed(2)));
        const savedSettlements = [...(driverSettlementCards.get(String(d.id))?.values() || [])].sort((a,b)=>String(b.paid_at).localeCompare(String(a.paid_at)));
        return { driver_id: d.id, driver_name: d.name || '', driver_no: d.driver_no || '', ...v, ...e,
          cash_collected_total: cashCollectedTotal, net_cash: netCash, cash_remaining_amount: cashRemaining,
          net_commission: legacyNet, paid_amount: paid, remaining_amount: legacyRemaining, settlements: savedSettlements };
      });
      // Return the selected driver's summary even when there are no expenses yet.
      // The Cash/Credit settlement UI must not depend on an expense record existing.
      return json(res, 200, { success: true, data });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/driver-commissions' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId=await resolveCompanyId(user), from=url.searchParams.get('from')||'', to=url.searchParams.get('to')||'', driverId=url.searchParams.get('driver_id')||'';
      const drivers=await dbSelect('drivers',{select:'id,name,driver_no,company_id,user_id',company_id:`eq.${companyId}`,limit:5000});
      // Resolve every known identifier to the canonical drivers.id. Older records
      // may store driver_no or the linked auth user id in driver_id.
      const driverAliasMap=new Map();
      for(const d of drivers){
        for(const alias of [d.id,d.driver_no,d.user_id,d.name]){
          const key=String(alias??'').trim().toLowerCase();
          if(key) driverAliasMap.set(key,d);
        }
      }
      const resolveDriver=(value)=>driverAliasMap.get(String(value??'').trim().toLowerCase())||null;
      let selectedDriver = driverId ? resolveDriver(driverId) : null;
      if (driverId && !selectedDriver) return json(res,404,{success:false,error:'المندوب المحدد غير موجود في حساب الشركة. حدّث قائمة المندوبين ثم اختره مرة أخرى.'});
      const canonicalDriverId = selectedDriver ? String(selectedDriver.id) : '';
      const driverMap=new Map(drivers.map(d=>[String(d.id),d]));
      const scans=await dbSelect('scan_driver_records',{select:'*',company_id:`eq.${companyId}`,order:'scan_date.desc,created_at.desc',limit:20000});
      const pickupEmployees=await dbSelect('payroll_employees',{select:'id,name,is_driver,linked_driver_id,pickup_commission,active',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
      const pickupRateByDriver=new Map();
      for(const employee of pickupEmployees||[]){if(!(employee.is_driver===true||String(employee.is_driver).toLowerCase()==='true'))continue;const linked=resolveDriver(employee.linked_driver_id);if(!linked)continue;const key=String(linked.id);if(!pickupRateByDriver.has(key))pickupRateByDriver.set(key,cleanNumber(employee.pickup_commission));}
      const groups=new Map();
      const inRange=(date)=>{const d=String(date||'').slice(0,10);return (!from||d>=from)&&(!to||d<=to);};
      for(const r of scans){const d=resolveDriver(r.driver_id);if(!d)continue;const key=String(d.id);if(canonicalDriverId&&key!==canonicalDriverId)continue;if(!inRange(r.scan_date||r.created_at))continue;if(!groups.has(key))groups.set(key,{driver_id:d.id,driver_name:d.name||'',driver_code:d.driver_no||'',pickup_orders:0,delivery_orders:0,total_orders:0,pickup_commission:0,delivery_commission:0});const g=groups.get(key);g.pickup_orders+=1;const recorded=cleanNumber(r.pickup_commission??r.commission_amount??0);g.pickup_commission+=recorded>0?recorded:cleanNumber(pickupRateByDriver.get(key)||0);}
      // Delivery commission: ONLY Paid + Approved orders. Amount = count × driver's per-order delivery commission.
      const orders=await dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,limit:20000});
      const commissionShipments=await dbSelect('shipments',{select:'id,order_id,driver_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const commissionDriverByOrder=new Map(commissionShipments.map(sh=>[String(sh.order_id),sh.driver_id]));
      for(const o of orders){const d=resolveDriver(commissionDriverByOrder.get(String(o.id)));if(!d)continue;const key=String(d.id);if(canonicalDriverId&&key!==canonicalDriverId)continue;if(!inRange(o.cash_collected_at||o.created_at))continue;if(String(o.commission_verify_status||'').toLowerCase()!=='verified')continue;const status=commissionStatusKey(o.status);if(String(o.cash_collection_status||o.payment_status||o.paid_status||o.commission_paid_status||'').trim().toLowerCase()!=='paid')continue;if(!isCommissionEligibleStatus(o.status))continue;if(!groups.has(key))groups.set(key,{driver_id:d.id,driver_name:d.name||'',driver_code:d.driver_no||'',pickup_orders:0,delivery_orders:0,total_orders:0,pickup_commission:0,delivery_commission:0});const g=groups.get(key);g.delivery_orders+=1;g.delivery_commission+=cleanNumber(o.delivery_commission ?? o.driver_commission ?? o.commission_amount ?? 0);}
      for(const g of groups.values())g.total_orders=g.pickup_orders+g.delivery_orders;
      return json(res,200,{success:true,data:[...groups.values()].sort((a,b)=>a.driver_name.localeCompare(b.driver_name))});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/drivers/commission-orders' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const driverId = url.searchParams.get('driver_id') || '';
      if (!driverId) return json(res, 400, { success:false, error:'السائق مطلوب' });
      const from = url.searchParams.get('from') || '';
      const to = url.searchParams.get('to') || '';
      const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
      const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
      const jobs = await dbSelect('delivery_jobs', { select:'*', company_id:`eq.${companyId}`, driver_id:`eq.${driverId}`, order:'created_at.desc', limit:10000 });
      const links=[];
      for(const job of jobs){ try{ const ls=await dbSelect('delivery_job_shipments',{select:'*',delivery_job_id:`eq.${job.id}`,limit:10000}); for(const l of ls) links.push({...l,_job:job}); }catch(_){} }
      const shipmentIds=[...new Set(links.map(x=>x.shipment_id).filter(Boolean))];
      const shipmentMap=new Map();
      for(const sid of shipmentIds){ try{const sh=firstRow(await dbSelect('shipments',{select:'*',id:`eq.${sid}`,limit:1})); if(sh) shipmentMap.set(String(sid),sh);}catch(_){} }
      const orderIds=[...new Set([...shipmentMap.values()].map(s=>s.order_id).filter(Boolean))];
      const orderMap=new Map();
      for(const oid of orderIds){ try{const o=firstRow(await dbSelect('orders',{select:'*',id:`eq.${oid}`,company_id:`eq.${companyId}`,limit:1})); if(o) orderMap.set(String(oid),o);}catch(_){} }
      const seen=new Set(); const rows=[];
      for(const link of links){ const sid=String(link.shipment_id||''); if(!sid||seen.has(sid))continue; seen.add(sid); const sh=shipmentMap.get(sid); const o=orderMap.get(String(sh?.order_id||'')); if(!o)continue; const stamp=new Date(o.created_at||link.created_at||link._job?.created_at).getTime(); if(fromMs!==null&&stamp<fromMs)continue;if(toMs!==null&&stamp>toMs)continue; const state=commissionState(o); rows.push({...o,shipment_id:sid,shipment_no:sh?.shipment_no||'',tracking_number:sh?.tracking_number||o.tracking_number||'',work_date:egyptDateISO(new Date(stamp)),eligible:state.eligible,verify_status:state.verify_status,paid_status:state.paid_status}); }
      rows.sort((a,b)=>String(b.work_date).localeCompare(String(a.work_date)));
      return json(res,200,{success:true,data:rows});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }


  if (pathname === '/api/driver/order-action' && req.method === 'POST') {
    const user = await requireRole(req, res, 'drivers'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const orderId = cleanString(body.order_id);
      const actionName = cleanString(body.action);
      const mapped = DRIVER_STATUS_MAP[actionName];
      if (!orderId || !mapped) return json(res, 400, { success:false, error:'الأوردر والحالة مطلوبان' });
      const existing = firstRow(await dbSelect('orders',{select:'*',id:`eq.${orderId}`,company_id:`eq.${companyId}`,limit:1}));
      if (!existing) return json(res,404,{success:false,error:'الأوردر غير موجود'});
      const assignment = await getLatestOrderAssignment(companyId, orderId);
      if (paidLockValues(existing, assignment.shipment)) return json(res,400,{success:false,error:'الأوردر Paid ومغلق ولا يمكن تغيير حالته'});
      const currentDriverId = assignment.job?.driver_id || assignment.shipment?.driver_id || null;
      if (!assignment.shipment?.id) return json(res,400,{success:false,error:'لا توجد شحنة مرتبطة بالأوردر لتحديث الحالة بأمان'});
      if (body.driver_id && String(currentDriverId) !== String(body.driver_id)) {
        return json(res,403,{success:false,error:'الأوردر ليس تابعاً للمندوب المحدد'});
      }

      const tomorrow = addEgyptDaysISO(1);
      const scheduledDate =
        cleanString(body.scheduled_date) ||
        (['Return by driver','Return by Driver','Schedule for Tomorrow'].includes(actionName) ? tomorrow : null);
      if (['Future Delivery','Location Change','Schedule for Tomorrow'].includes(actionName) && !scheduledDate) {
        return json(res,400,{success:false,error:'يجب تحديد تاريخ التسليم'});
      }
      if (scheduledDate && ['Future Delivery','Location Change','Return by Driver','Schedule for Tomorrow'].includes(mapped.status)) {
        const dateError = validateScheduledDate(mapped.status, scheduledDate);
        if (dateError) return json(res,400,{success:false,error:dateError});
      }

      let locationEmirateId = body.emirate_id || null;
      let locationAreaId = body.area_id || null;
      const uuidLike = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||''));
      if (mapped.action === 'location_change') {
        if (!locationEmirateId || !locationAreaId) {
          return json(res,400,{success:false,error:'الموقع الجديد مطلوب'});
        }
        if (locationEmirateId && !uuidLike(locationEmirateId)) {
          const g = firstRow(await dbSelect('governorates',{select:'id',company_id:`eq.${companyId}`,or:`name_ar.eq.${encodeURIComponent(locationEmirateId)},name_en.eq.${encodeURIComponent(locationEmirateId)}`,limit:1}).catch(()=>[]));
          locationEmirateId = g?.id || null;
        }
        if (locationAreaId && !uuidLike(locationAreaId)) {
          const ar = firstRow(await dbSelect('areas',{select:'id',company_id:`eq.${companyId}`,or:`name_ar.eq.${encodeURIComponent(locationAreaId)},name_en.eq.${encodeURIComponent(locationAreaId)}`,limit:1}).catch(()=>[]));
          locationAreaId = ar?.id || null;
        }
      }

      const oldGov = existing.governorate_id ? firstRow(await dbSelect('governorates',{select:'id,name_ar,name_en',id:`eq.${existing.governorate_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])) : null;
      const oldArea = existing.area_id ? firstRow(await dbSelect('areas',{select:'id,name_ar,name_en',id:`eq.${existing.area_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])) : null;
      const newGov = locationEmirateId ? firstRow(await dbSelect('governorates',{select:'id,name_ar,name_en',id:`eq.${locationEmirateId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])) : null;
      const newArea = locationAreaId ? firstRow(await dbSelect('areas',{select:'id,name_ar,name_en,governorate_id',id:`eq.${locationAreaId}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[])) : null;
      if (mapped.action === 'location_change') {
        if (!newGov || !newArea) return json(res,400,{success:false,error:'الإمارة أو المنطقة المحددة غير موجودة'});
        if (newArea.governorate_id && String(newArea.governorate_id) !== String(locationEmirateId)) return json(res,400,{success:false,error:'المنطقة لا تتبع الإمارة المحددة'});
      }

      const patch = {
        status: mapped.status,
        driver_statement_action: mapped.action,
        driver_scheduled_date: mapped.action ? scheduledDate : null,
        driver_location_emirate_id: mapped.action === 'location_change' ? locationEmirateId : null,
        driver_location_area_id: mapped.action === 'location_change' ? locationAreaId : null,
        driver_old_location_governorate_id: mapped.action === 'location_change' ? (existing.governorate_id || null) : null,
        driver_old_location_area_id: mapped.action === 'location_change' ? (existing.area_id || null) : null,
        governorate_id: mapped.action === 'location_change' ? locationEmirateId : existing.governorate_id,
        area_id: mapped.action === 'location_change' ? locationAreaId : existing.area_id,
        driver_action_at: new Date().toISOString(),
        driver_action_by: user.id === 'env-admin' ? null : user.id,
        driver_return_reason: mapped.action === 'return_by_driver' ? (cleanString(body.return_reason) || null) : null,
        statement_removed_at: mapped.action ? null : existing.statement_removed_at,
        statement_removed_by: mapped.action ? null : existing.statement_removed_by
      };
      const updated = firstRow(await dbUpdate('orders',{id:`eq.${orderId}`,company_id:`eq.${companyId}`},patch));
      if (!updated) throw new Error('لم يتم حفظ الإجراء في الأوردر.');
      if (assignment.shipment?.id) {
        let updatedShipment = null;
        try { updatedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${assignment.shipment.id}`,company_id:`eq.${companyId}`},{status:mapped.status,updated_at:new Date().toISOString()})); } catch (_) {}
        if (!updatedShipment) updatedShipment = firstRow(await dbUpdate('shipments',{id:`eq.${assignment.shipment.id}`,company_id:`eq.${companyId}`},{status:mapped.status}));
        if (!updatedShipment) {
          try { await dbUpdate('orders',{id:`eq.${orderId}`,company_id:`eq.${companyId}`},{status:existing.status,driver_statement_action:existing.driver_statement_action||null,driver_scheduled_date:existing.driver_scheduled_date||null,driver_location_emirate_id:existing.driver_location_emirate_id||null,driver_location_area_id:existing.driver_location_area_id||null,governorate_id:existing.governorate_id||null,area_id:existing.area_id||null,driver_return_reason:existing.driver_return_reason||null}); } catch (_) {}
          throw new Error('تعذر تحديث الشحنة؛ لم يكتمل الإجراء. أُعيدت بيانات الأوردر السابقة قدر الإمكان.');
        }
        try {
          await dbInsert('shipment_status_history',{
            shipment_id: assignment.shipment.id,
            status: DRIVER_ACTION_LABELS[mapped.action] || mapped.status,
            user_id: user.id === 'env-admin' ? null : user.id
          },{prefer:'return=minimal'});
        } catch (_) {}
        const verifyShipment = firstRow(await dbSelect('shipments',{select:'id,status',id:`eq.${assignment.shipment.id}`,company_id:`eq.${companyId}`,limit:1}));
        if (!verifyShipment || verifyShipment.status !== mapped.status) throw new Error('لم يتم تأكيد حفظ حالة الشحنة. حدّث الصفحة قبل إعادة المحاولة.');
      }
      const verifyOrder = firstRow(await dbSelect('orders',{select:'id,status,driver_statement_action,driver_scheduled_date,driver_location_emirate_id,driver_location_area_id',id:`eq.${orderId}`,company_id:`eq.${companyId}`,limit:1}));
      if (!verifyOrder || verifyOrder.status !== mapped.status || (mapped.action && verifyOrder.driver_scheduled_date !== scheduledDate)) throw new Error('لم يتم تأكيد حفظ الحالة والتاريخ في الأوردر.');
      await audit(user,'driver_order_action','order',orderId,{
        before:{
          status:existing.status,
          driver_statement_action:existing.driver_statement_action,
          driver_scheduled_date:existing.driver_scheduled_date,
          location:{
            governorate_id:existing.governorate_id||null,
            area_id:existing.area_id||null,
            governorate:oldGov ? (oldGov.name_en||oldGov.name_ar||oldGov.id) : null,
            area:oldArea ? (oldArea.name_en||oldArea.name_ar||oldArea.id) : null
          }
        },
        after:{
          ...patch,
          location:{
            governorate_id:locationEmirateId||null,
            area_id:locationAreaId||null,
            governorate:newGov ? (newGov.name_en||newGov.name_ar||newGov.id) : null,
            area:newArea ? (newArea.name_en||newArea.name_ar||newArea.id) : null
          }
        },
        driver_id:currentDriverId,
        action:actionName,
        scheduled_date:scheduledDate
      });
      return json(res,200,{success:true,data:updated || {...existing,...patch}});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/driver/transfer-order' && req.method === 'POST') {
    const user = await requireRole(req, res, 'drivers'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const orderId = cleanString(body.order_id), toDriverId = cleanString(body.to_driver_id);
      if (!orderId || !toDriverId) return json(res,400,{success:false,error:'الأوردر والمندوب الجديد مطلوبان'});
      const existing = firstRow(await dbSelect('orders',{select:'*',id:`eq.${orderId}`,company_id:`eq.${companyId}`,limit:1}));
      const newDriver = firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${toDriverId}`,company_id:`eq.${companyId}`,limit:1}));
      if (!existing || !newDriver) return json(res,404,{success:false,error:'الأوردر أو المندوب غير موجود'});
      const assignment = await getLatestOrderAssignment(companyId,orderId);
      const fromDriverId = assignment.job?.driver_id || assignment.shipment?.driver_id || null;
      if (body.from_driver_id && String(fromDriverId) !== String(body.from_driver_id)) return json(res,403,{success:false,error:'الأوردر ليس تابعاً للمندوب المحدد'});

      if (assignment.job?.id) {
        await dbUpdate('delivery_jobs',{id:`eq.${assignment.job.id}`,company_id:`eq.${companyId}`},{driver_id:toDriverId});
      }
      if (assignment.shipment?.id) {
        try { await dbUpdate('shipments',{id:`eq.${assignment.shipment.id}`,company_id:`eq.${companyId}`},{driver_id:toDriverId}); } catch (_) {}
      }
      // The canonical driver assignment belongs to shipments/delivery_jobs; do not write driver_id to orders.
      const patch = { statement_removed_at:null, statement_removed_by:null, statement_removed_from_driver_id:null };
      const updated = firstRow(await dbUpdate('orders',{id:`eq.${orderId}`,company_id:`eq.${companyId}`},patch));
      await audit(user,'transfer_driver_order','order',orderId,{from_driver_id:fromDriverId,to_driver_id:toDriverId,order_id:orderId});
      return json(res,200,{success:true,data:updated || {...existing,...patch}});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/driver/return-orders' && req.method === 'GET') {
    const user = await requireRole(req,res,'drivers'); if(!user)return;
    try {
      const companyId=await resolveCompanyId(user), driverId=cleanString(url.searchParams.get('driver_id')), date=cleanString(url.searchParams.get('date'))||egyptTodayISO();
      if(!driverId)return json(res,400,{success:false,error:'السائق مطلوب'});
      const statement=await getDriverStatementReturnOrders(companyId,driverId,date);
      return json(res,200,{success:true,data:statement});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/driver-statement/order' && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req); const companyId = await resolveCompanyId(user);
      if (!body.id) return json(res,400,{success:false,error:'الأوردر مطلوب'});
      const existing = firstRow(await dbSelect('orders',{select:'*',id:`eq.${body.id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!existing) return json(res,404,{success:false,error:'الأوردر غير موجود'});
      // Match the Driver Account UI's paid-state calculation, including payment timestamps.
      const isPaid = paidLockValues(existing) || Boolean(existing.commission_paid_at || existing.cash_collected_at);
      // After Paid, the driver-statement pencil may change delivery fee only.
      // Enforce this on the API too, so a modified client cannot change COD/value.
      if (body.delivery_fee !== undefined && cleanNumber(body.delivery_fee) < 0) return json(res,400,{success:false,error:'رسوم الخدمة لا يمكن أن تكون سالبة'});
      let patch;
      if (isPaid) {
        if (body.delivery_fee === undefined) return json(res,400,{success:false,error:'بعد Paid يمكن تعديل رسوم التوصيل فقط'});
        const fee = cleanNumber(body.delivery_fee);
        patch = { delivery_fee: fee, service_charges: fee };
      } else {
        patch = {};
        if (body.cod !== undefined || body.value !== undefined) {
          const amount = cleanNumber(body.cod ?? body.value);
          if (amount < 0) return json(res,400,{success:false,error:'COD لا يمكن أن يكون سالباً'});
          // Keep the canonical order value and COD mirror in sync. Several
          // Driver Account, operations, dashboard and accounting projections
          // prefer orders.cod when it exists; updating value alone leaves those
          // screens and totals showing the old amount.
          patch.value = amount;
          if (existing.cod !== undefined && existing.cod !== null) patch.cod = amount;
        }
        if (body.delivery_fee !== undefined) {
          patch.delivery_fee = cleanNumber(body.delivery_fee);
          if (existing.service_charges !== undefined && existing.service_charges !== null) patch.service_charges = cleanNumber(body.delivery_fee);
        }
        if (!Object.keys(patch).length) return json(res,400,{success:false,error:'لا توجد بيانات للتعديل'});
      }
      let updated;
      try {
        updated = firstRow(await dbUpdate('orders',{id:`eq.${body.id}`,company_id:`eq.${companyId}`},patch));
      } catch (updateError) {
        // Older schemas may not have service_charges. A missing optional column must
        // not block the canonical delivery_fee update. Do not retry unrelated errors.
        const detail = String(updateError?.message || updateError || '');
        if (!isPaid || !/service_charges|column.*does not exist|schema cache/i.test(detail)) throw updateError;
        patch = { delivery_fee: cleanNumber(body.delivery_fee) };
        updated = firstRow(await dbUpdate('orders',{id:`eq.${body.id}`,company_id:`eq.${companyId}`},patch));
      }
      if (!updated) {
        // Some database wrappers can return an empty representation despite a successful write;
        // read the row back so the UI only reports success after the saved fee is confirmed.
        const saved = firstRow(await dbSelect('orders',{select:'id,value,cod,delivery_fee,service_charges,commission_paid_status,commission_paid_at',id:`eq.${body.id}`,company_id:`eq.${companyId}`,limit:1}));
        const feeConfirmed = patch.delivery_fee === undefined || (saved && Number(saved.delivery_fee) === Number(patch.delivery_fee));
        const valueConfirmed = patch.value === undefined || (saved && Number(saved.value) === Number(patch.value));
        const codConfirmed = patch.cod === undefined || (saved && Number(saved.cod) === Number(patch.cod));
        if (!saved || !feeConfirmed || !valueConfirmed || !codConfirmed) return json(res,500,{success:false,error:'لم يتم تأكيد حفظ كل التعديلات. أعد تحميل الصفحة وتحقق من السعر والرسوم.'});
        updated = saved;
      }
      await audit(user,'update_driver_statement_order','order',body.id,{before:{value:existing.value,delivery_fee:existing.delivery_fee,service_charges:existing.service_charges},after:patch,paid_locked:isPaid});
      return json(res,200,{success:true,data:updated});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/driver-commission/verify' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req); const companyId=await resolveCompanyId(user); const orderIds=Array.isArray(body.order_ids)?body.order_ids.filter(Boolean):[];
      if(!orderIds.length)return json(res,400,{success:false,error:'اختر أوردرات للتحقق'});
      const result=[];
      for(const id of orderIds){
        const o=firstRow(await dbSelect('orders',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
        if(!o)continue;
        if(!isCommissionEligibleStatus(o.status))continue;
        const verifyDate = cleanString(body.verify_date) || egyptTodayISO();
        let sameDay = false;
        try {
          const sh = firstRow(await dbSelect('shipments',{select:'id',order_id:`eq.${id}`,limit:1}));
          if (sh?.id) {
            const hs = await dbSelect('shipment_status_history',{select:'status,created_at',shipment_id:`eq.${sh.id}`,order:'created_at.desc',limit:100});
            const hit = hs.find(r => commissionStatusKey(r.status) === commissionStatusKey(o.status));
            sameDay = Boolean(hit?.created_at && String(hit.created_at).slice(0,10) === verifyDate);
          }
        } catch (_) {}
        if(!sameDay)continue;
        const patch={commission_verify_status:'verified',commission_verified_at:new Date().toISOString(),commission_verified_by:user.id==='env-admin'?null:user.id};
        const updated=firstRow(await dbUpdate('orders',{id:`eq.${id}`,company_id:`eq.${companyId}`},patch));
        await audit(user,'verify_driver_commission','order',id,{before:{commission_verify_status:o.commission_verify_status},after:patch,status:o.status});
        result.push(updated||{...o,...patch});
      }
      return json(res,200,{success:true,data:result});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/driver-commission/unverify' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body=await bodyJson(req); const companyId=await resolveCompanyId(user);
      const id=cleanString(body.order_id);
      if(!id)return json(res,400,{success:false,error:'الأوردر مطلوب'});
      const o=firstRow(await dbSelect('orders',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!o)return json(res,404,{success:false,error:'الأوردر غير موجود'});
      if(String(o.commission_paid_status||'').toLowerCase()==='paid')return json(res,400,{success:false,error:'الأوردر تمت تسوية عمولته ولا يمكن إلغاء الاعتماد'});
      const patch={commission_verify_status:'unverified',commission_verified_at:null,commission_verified_by:null};
      const updated=firstRow(await dbUpdate('orders',{id:`eq.${id}`,company_id:`eq.${companyId}`},patch));
      await audit(user,'unverify_driver_commission','order',id,{before:{commission_verify_status:o.commission_verify_status},after:patch});
      return json(res,200,{success:true,data:updated||{...o,...patch}});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/driver-commission/pay' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const requestedDriver = await resolveDriverForCompany(body.driver_id, companyId);
      const method = cleanString(body.payment_method).toLowerCase();
      const orderIds = Array.isArray(body.order_ids) ? [...new Set(body.order_ids.filter(Boolean).map(String))] : [];
      if (!requestedDriver || !orderIds.length) return json(res, 400, { success: false, error: 'المندوب والأوردرات مطلوبان، ويجب اختيار مندوب صحيح من الشركة' });
      if (!['cash', 'credit'].includes(method)) return json(res, 400, { success: false, error: 'طريقة الدفع يجب أن تكون Cash أو Credit' });

      // Validate the entire batch before changing any order, preventing partial
      // payments when a selected order belongs to another driver or is ineligible.
      const ordersToPay = [];
      for (const id of orderIds) {
        const order = firstRow(await dbSelect('orders', { select: '*', id: `eq.${id}`, company_id: `eq.${companyId}`, limit: 1 }));
        if (!order) return json(res, 400, { success: false, error: `الأوردر ${id} غير موجود داخل الشركة` });
        const currentPaid = String(order.commission_paid_status || '').trim().toLowerCase() === 'paid';
        if (currentPaid) return json(res, 400, { success: false, error: `الأوردر ${id} تمت تسوية عمولته بالفعل` });
        if (String(order.commission_verify_status || '').trim().toLowerCase() !== 'verified') return json(res, 400, { success: false, error: `الأوردر ${id} غير معتمد للعمولة` });
        if (!isCommissionEligibleStatus(order.status)) return json(res, 400, { success: false, error: `حالة الأوردر ${id} لا تسمح بتسوية العمولة` });

        const assignment = await getLatestOrderAssignment(companyId, id);
        const assignedDriver = await resolveDriverForCompany(assignment.shipment?.driver_id, companyId);
        if (!assignedDriver || String(assignedDriver.id) !== String(requestedDriver.id)) {
          return json(res, 400, { success: false, error: `الأوردر ${id} غير تابع للمندوب المحدد` });
        }
        ordersToPay.push(order);
      }

      const paymentDate = cleanString(body.payment_date) || egyptTodayISO();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || Number.isNaN(new Date(`${paymentDate}T00:00:00Z`).getTime())) {
        return json(res, 400, { success: false, error: 'تاريخ الدفع غير صحيح' });
      }
      const paid = [];
      let amount = 0;
      for (const order of ordersToPay) {
        const id = String(order.id);
        const perOrderDeliveryCommission = cleanNumber(order.delivery_commission ?? order.driver_commission ?? order.commission_amount ?? 0);
        const patch = {
          commission_paid_status: 'paid',
          commission_paid_at: new Date().toISOString(),
          commission_paid_by: user.id === 'env-admin' ? null : user.id,
          commission_payment_method: method
        };
        const paidGuard = order.commission_paid_status == null
          ? { commission_paid_status: 'is.null' }
          : { commission_paid_status: `eq.${String(order.commission_paid_status)}` };
        const updated = firstRow(await dbUpdate('orders', {
          id: `eq.${id}`, company_id: `eq.${companyId}`, commission_verify_status: 'eq.verified', ...paidGuard
        }, patch));
        // A guarded update that returns no row means another request may have
        // settled the order concurrently. Stop instead of silently double-paying.
        if (!updated) return json(res, 409, { success: false, error: `تعذر اعتماد دفع الأوردر ${id}؛ ربما تمت تسويته في طلب آخر. أعد تحميل الصفحة قبل المحاولة.` });
        amount += perOrderDeliveryCommission;
        paid.push(id);
        await audit(user, 'pay_driver_commission', 'order', id, {
          before: { commission_paid_status: order.commission_paid_status }, after: patch,
          per_order_commission: perOrderDeliveryCommission, payment_method: method
        });
      }

      amount = Number(amount.toFixed(2));
      const payment = firstRow(await dbInsert('driver_commission_payments', {
        company_id: companyId, driver_id: requestedDriver.id, amount, payment_method: method,
        payment_date: paymentDate, employee_id: user.id === 'env-admin' ? null : user.id,
        order_ids: paid, notes: cleanString(body.notes) || null
      }));
      let canonicalSettlement = null;
      try {
        canonicalSettlement = firstRow(await dbInsert('driver_settlements', {
          company_id: companyId, driver_id: requestedDriver.id, amount, payment_method: method === 'credit' ? 'bank' : method,
          paid_at: new Date(`${paymentDate}T12:00:00Z`).toISOString(),
          employee_id: user.id === 'env-admin' ? null : user.id,
          notes: 'Driver commission payment — ' + paid.length + ' orders'
        }));
      } catch (_) { /* driver_commission_payments remains the canonical payment record */ }
      await createSystemNotification(user, {
        title: 'Driver commission settled', message: `${amount.toFixed(2)} — ${paid.length} order(s)`,
        type: 'driver_settlement', entityType: 'driver', entityId: requestedDriver.id
      });
      return json(res, 200, { success: true, data: { payment, canonical_settlement: canonicalSettlement, paid_order_ids: paid, amount } });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/accounting/merchant-accounts' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const selectedDate = cleanString(url.searchParams.get('date')) || egyptTodayISO();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return json(res,400,{success:false,error:'تاريخ الحسابات غير صحيح'});
      const startMs = new Date(`${selectedDate}T00:00:00`).getTime();
      const endMs = new Date(`${selectedDate}T23:59:59.999`).getTime();
      const [merchants, orders] = await Promise.all([
        dbSelect('merchants', { select: 'id,name,merchant_no,code', company_id: `eq.${companyId}`, order: 'name.asc', limit: 5000 }),
        dbSelect('orders', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 20000 })
      ]);
      const map = new Map((merchants||[]).map(m => [String(m.id), {
        name:m.name||'', merchant_no:m.merchant_no||'', code:m.code||'', orders:0, delivered:0, failed:0, returned:0,
        order_value:0, delivery_fees:0, taxes:0, merchant_net:0
      }]));
      for (const o of (orders||[])) {
        // Count customer collections as Paid; a paid driver commission alone does not mean the shipper collection is paid.
        const paid = [o.cash_collection_status,o.payment_status,o.paid_status].some(v => String(v||'').trim().toLowerCase()==='paid');
        if (!paid) continue;
        // Use the actual collection/accounting timestamp, matching the Accounting counters.
        const paidAt = o.cash_collected_at || o.paid_at || o.updated_at || o.created_at;
        const ts = new Date(paidAt || 0).getTime();
        if (!Number.isFinite(ts) || ts < startMs || ts > endMs) continue;
        const key=String(o.merchant_id||''); if(!map.has(key)) continue;
        const r=map.get(key); const value=cleanNumber(o.cod ?? o.value), fee=cleanNumber(o.service_charges ?? o.delivery_fee), tax=cleanNumber(o.tax_amount);
        r.orders++; r.order_value+=value; r.delivery_fees+=fee; r.taxes+=tax;
        // Recalculate from current order fields; merchant_net_value may be stale after COD, tax, or fee edits.
        r.merchant_net+=Number((value-tax-fee).toFixed(2));
      }
      return json(res, 200, { success:true, date:selectedDate, paid_only:true, data:[...map.values()].filter(r=>r.orders>0).map(r=>({...r,order_value:Number(r.order_value.toFixed(2)),delivery_fees:Number(r.delivery_fees.toFixed(2)),taxes:Number(r.taxes.toFixed(2)),merchant_net:Number(r.merchant_net.toFixed(2))})) });
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/accounting/merchant-financial' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const merchantId = url.searchParams.get('merchant_id') || '';
      const statusFilter = String(url.searchParams.get('balance') || 'all').toLowerCase();
      const periodFrom = cleanString(url.searchParams.get('from'));
      const periodTo = cleanString(url.searchParams.get('to'));
      if (periodFrom && periodTo && periodFrom > periodTo) return json(res,400,{success:false,error:'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية'});
      if (url.searchParams.get('generate') === '1') {
        const from = url.searchParams.get('from') || egyptTodayISO();
        const to = url.searchParams.get('to') || from;
        if (from > to) return json(res,400,{success:false,error:'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية'});
        const [merchants, orders] = await Promise.all([
          dbSelect('merchants',{select:'id,name,merchant_no,code',company_id:`eq.${companyId}`,order:'name.asc',limit:5000}),
          dbSelect('orders',{select:'id,merchant_id,merchant_order_no,value,cod,delivery_fee,service_charges,tax_amount,merchant_net_value,status,cash_collection_status,cash_collected_at,collection_method,cash_collected_amount,credit_collected_amount,created_at',company_id:`eq.${companyId}`,order:'created_at.asc',limit:50000})
        ]);
        const startMs=new Date(`${from}T00:00:00`).getTime(), endMs=new Date(`${to}T23:59:59.999`).getTime();
        const mm=new Map((merchants||[]).map(m=>[String(m.id),m]));
        const map=new Map();
        for(const m of merchants||[]) map.set(String(m.id),{merchant_id:m.id,name:m.name||'',merchant_no:m.merchant_no||'',code:m.code||'',orders:0,cod:0,service_charges:0,merchant_net:0});
        for(const o of orders||[]){
          const isPaid=String(o.status||'').trim().toLowerCase()==='paid' || [o.cash_collection_status,o.payment_status,o.paid_status,o.commission_paid_status,o.commission_payment_status].some(v=>String(v||'').trim().toLowerCase()==='paid');
          if(!isPaid) continue;
          const ts=new Date(o.cash_collected_at||o.paid_at||o.commission_paid_at||o.status_changed_at||o.updated_at||o.created_at||0).getTime(); if(!Number.isFinite(ts)||ts<startMs||ts>endMs) continue;
          const key=String(o.merchant_id||''); if(merchantId && key!==String(merchantId)) continue; if(!map.has(key)) continue;
          const r=map.get(key), cod=cleanNumber(o.cod ?? o.value), fee=cleanNumber(o.service_charges ?? o.delivery_fee), tax=cleanNumber(o.tax_amount);
          r.orders++; r.cod+=cod; r.service_charges+=fee; r.merchant_net+=cleanNumber(o.merchant_net_value!=null?o.merchant_net_value:(cod-tax))-fee;
        }
        const rows=[...map.values()].filter(r=>r.orders>0).map(r=>({...r,cod:Number(r.cod.toFixed(2)),service_charges:Number(r.service_charges.toFixed(2)),merchant_net:Number(r.merchant_net.toFixed(2))}));
        return json(res,200,{success:true,generated:{from,to,merchant_id:merchantId||null,received_statuses:['Paid'],rows,total_orders:rows.reduce((n,r)=>n+r.orders,0),total_cod:Number(rows.reduce((n,r)=>n+r.cod,0).toFixed(2)),total_service_charges:Number(rows.reduce((n,r)=>n+r.service_charges,0).toFixed(2)),total_merchant_net:Number(rows.reduce((n,r)=>n+r.merchant_net,0).toFixed(2))}});
      }
      const [merchants, orders, shipments, settlements, adjustments, settlementItems] = await Promise.all([
        dbSelect('merchants', { select: 'id,name,merchant_no,code,phone,tax_enabled,tax_rate', company_id: `eq.${companyId}`, order: 'name.asc', limit: 5000 }),
        dbSelect('orders', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 20000 }),
        dbSelect('shipments', { select: 'id,order_id,tracking_number,shipment_no', company_id: `eq.${companyId}`, limit: 20000 }).catch(() => []),
        dbSelect('merchant_settlements', { select: '*', company_id: `eq.${companyId}`, order: 'paid_at.desc', limit: 10000 }).catch(() => []),
        dbSelect('merchant_adjustments', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 10000 }).catch(() => []),
        dbSelect('shipper_settlement_items', { select: 'order_id', company_id: `eq.${companyId}`, limit: 100000 })
      ]);
      const merchantMap = new Map((merchants||[]).map(m => [String(m.id), m]));
      const shipmentByOrder = new Map((shipments||[]).map(sh => [String(sh.order_id), sh]));
      const startMs = periodFrom ? new Date(`${periodFrom}T00:00:00`).getTime() : null;
      const endMs = periodTo ? new Date(`${periodTo}T23:59:59.999`).getTime() : null;
      // This screen is the generation queue, not a general order ledger: only orders
      // that the generation endpoint itself would accept may appear here. Use the same
      // status/payment/date rules and hide orders already attached to an Invoice Report.
      const alreadyGeneratedOrderIds = new Set((settlementItems||[]).map(x=>String(x.order_id||'')).filter(Boolean));
      const periodOrders = (orders||[]).filter(o => {
        const info=shipperSettlementOrderInfo(o);
        if(!info.eligible || alreadyGeneratedOrderIds.has(String(o.id))) return false;
        if(periodFrom && info.day < periodFrom) return false;
        if(periodTo && info.day > periodTo) return false;
        return true;
      });
      const periodSettlements = (settlements||[]).filter(x => {
        if(startMs===null&&endMs===null)return true;
        const ts=new Date(x.paid_at||x.created_at||0).getTime();
        return Number.isFinite(ts)&&(startMs===null||ts>=startMs)&&(endMs===null||ts<=endMs);
      });
      const periodAdjustments = (adjustments||[]).filter(x => {
        // Ignore legacy auto-credits previously created for receiver-cancelled fees.
        // The customer paid that fee; it must not be added to the merchant balance.
        if(String(x.reference||'').includes(':CANCELLED_BY_RECEIVER_DELIVERY_FEE')) return false;
        if(startMs===null&&endMs===null)return true;
        const ts=new Date(x.adjustment_date||x.created_at||0).getTime();
        return Number.isFinite(ts)&&(startMs===null||ts>=startMs)&&(endMs===null||ts<=endMs);
      });
      const paidMap = new Map();
      for (const s of periodSettlements) paidMap.set(String(s.merchant_id), (paidMap.get(String(s.merchant_id))||0)+cleanNumber(s.amount));
      const adjustmentMap = new Map();
      for (const a of periodAdjustments) adjustmentMap.set(String(a.merchant_id), (adjustmentMap.get(String(a.merchant_id))||0)+cleanNumber(a.signed_amount));
      const rows = new Map();
      for (const m of merchants||[]) rows.set(String(m.id), { merchant_id:m.id, name:m.name||'', merchant_no:m.merchant_no||'', code:m.code||'', phone:m.phone||'', orders:0, cod:0, service_charges:0, taxes:0, merchant_due:0, settled:paidMap.get(String(m.id))||0, adjustments:adjustmentMap.get(String(m.id))||0, balance:0 });
      for (const o of periodOrders) {
        const key=String(o.merchant_id||''); if(!rows.has(key)) continue;
        const r=rows.get(key); const rawCod=cleanNumber(o.cod ?? o.value); const fee=cleanNumber(o.service_charges ?? o.delivery_fee);
        const merchant=merchantMap.get(String(o.merchant_id||''))||{};
        const statusKey=String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
        const cod=statusKey==='cancelled by shipper'?0:rawCod;
        const savedTax=o.tax_amount;
        const tax=statusKey==='cancelled by shipper'?0:(savedTax!==undefined&&savedTax!==null&&Number.isFinite(Number(savedTax))?Math.max(0,cleanNumber(savedTax)):(merchant.tax_enabled===true?Number((fee*Math.max(0,Math.min(100,cleanNumber(merchant.tax_rate)))/100).toFixed(2)):0));
        // Stored order VAT is canonical; legacy orders without saved VAT use merchant settings as fallback.
        const netBeforeFee=Number((cod-tax).toFixed(2));
        r.orders++; r.cod+=cod; r.service_charges+=fee; r.taxes+=tax; r.merchant_due += netBeforeFee - fee;
      }
      let out=[...rows.values()].map(r=>({...r, balance:r.merchant_due-r.settled+r.adjustments}))
        // Only show shippers with paid orders and a positive amount currently owed to them.
        .filter(r=>r.orders>0)
        .map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>typeof v==='number'? [k,Number(v.toFixed(2))]:[k,v])));
      if (merchantId) out=out.filter(r=>String(r.merchant_id)===String(merchantId));
      if(statusFilter==='positive') out=out.filter(r=>r.balance>0);
      if(statusFilter==='negative') out=out.filter(r=>r.balance<0);
      if(statusFilter==='zero') out=out.filter(r=>Math.abs(Number(r.balance||0))<=0.009);
      let detailOrders=[]; let detailSettlements=[]; let detailAdjustments=[];
      if(merchantId){
        detailOrders=periodOrders.filter(o=>String(o.merchant_id)===String(merchantId)).map(o=>{const sh=shipmentByOrder.get(String(o.id));const orderInfo=shipperSettlementOrderInfo(o);const fee=cleanNumber(o.service_charges??o.delivery_fee),merchant=merchantMap.get(String(o.merchant_id||''))||{},statusKey=String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' '),cod=statusKey==='cancelled by shipper'?0:cleanNumber(o.cod??o.value),savedTax=o.tax_amount,tax=statusKey==='cancelled by shipper'?0:(savedTax!==undefined&&savedTax!==null&&Number.isFinite(Number(savedTax))?Math.max(0,cleanNumber(savedTax)):(merchant.tax_enabled===true?Number((fee*Math.max(0,Math.min(100,cleanNumber(merchant.tax_rate)))/100).toFixed(2)):0)),netBeforeFee=Number((cod-tax).toFixed(2));return {id:o.id,tracking_number:sh?.tracking_number||'',shipment_no:sh?.shipment_no||'',merchant_order_no:o.merchant_order_no||'',created_at:o.created_at||'',delivery_date:orderInfo.day||'',status:o.status||'',payment_status:orderInfo.paid?'Paid':(o.cash_collection_status||o.payment_status||o.paid_status||o.commission_paid_status||o.commission_payment_status||''),cod,service_charges:fee,taxes:tax,merchant_due:Number((netBeforeFee-fee).toFixed(2))};});
        detailSettlements=periodSettlements.filter(x=>String(x.merchant_id)===String(merchantId));
        detailAdjustments=periodAdjustments.filter(x=>String(x.merchant_id)===String(merchantId));
      }
      return json(res,200,{success:true,data:out,orders:detailOrders,settlements:detailSettlements,adjustments:detailAdjustments,filters:{balance:statusFilter,merchant_id:merchantId,from:periodFrom,to:periodTo}});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/accounting/merchant-financial/adjustment' && req.method === 'POST') {
    const user=await requireRole(req,res,'accounting'); if(!user)return;
    try{const body=await bodyJson(req);const companyId=await resolveCompanyId(user);const merchantId=body.merchant_id;const type=String(body.type||'').toLowerCase();const amount=cleanNumber(body.amount);
      if(!merchantId||amount<=0)return json(res,400,{success:false,error:'التاجر والمبلغ مطلوبان'});
      if(!['advance','credit','deduction','other'].includes(type))return json(res,400,{success:false,error:'نوع التسوية غير صالح'});
      const proof=body.proof;if(!proof||!cleanString(proof.data_url))return json(res,400,{success:false,error:'إثبات التسوية مطلوب'});
      const m=firstRow(await dbSelect('merchants',{select:'id,name',id:`eq.${merchantId}`,company_id:`eq.${companyId}`,limit:1}));if(!m)return json(res,404,{success:false,error:'التاجر غير موجود'});
      const match=String(proof.data_url).match(/^data:([^;]+);base64,(.+)$/s);if(!match)return json(res,400,{success:false,error:'ملف الإثبات غير صالح'});const contentType=String(proof.content_type||match[1]);const allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(contentType))return json(res,400,{success:false,error:'المسموح: JPG أو PNG أو WEBP أو PDF'});const raw=Buffer.from(match[2],'base64');if(raw.length>7*1024*1024)return json(res,400,{success:false,error:'حجم الإثبات يجب ألا يتجاوز 7MB'});
      const signedAmount=['advance','deduction'].includes(type)?-amount:amount;const ext=(String(proof.file_name||'proof').toLowerCase().match(/\.(jpg|jpeg|png|webp|pdf)$/)||[])[1]||'bin';const path=`${companyId}/${merchantId}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;await storageUpload('adjustment-proofs',path,raw,contentType);
      const row={company_id:companyId,merchant_id:merchantId,type,amount,signed_amount:signedAmount,reason:cleanString(body.reason)||null,reference:cleanString(body.reference)||null,adjustment_date:body.adjustment_date||new Date().toISOString(),employee_id:user.id==='env-admin'?null:user.id};const data=firstRow(await dbInsert('merchant_adjustments',row));const proofRow=firstRow(await dbInsert('adjustment_proofs',{company_id:companyId,merchant_id:merchantId,adjustment_id:data?.id||null,file_name:cleanString(proof.file_name)||`adjustment.${ext}`,content_type:contentType,file_size:raw.length,storage_bucket:'adjustment-proofs',storage_path:path,uploaded_by:user.id==='env-admin'?null:user.id,uploaded_at:new Date().toISOString()}));await audit(user,'create_merchant_adjustment','merchant_adjustment',data?.id||null,{...row,proof_id:proofRow?.id||null});return json(res,200,{success:true,data:{adjustment:data,proof:proofRow}});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/accounting/merchant-financial/settle' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body=await bodyJson(req); const companyId=await resolveCompanyId(user);
      const amount=cleanNumber(body.amount); const method=String(body.payment_method||'').toLowerCase();
      if(!body.merchant_id || amount<=0) return json(res,400,{success:false,error:'التاجر والمبلغ مطلوبان'});
      if(!['cash','bank'].includes(method)) return json(res,400,{success:false,error:'طريقة الدفع يجب أن تكون Cash أو Bank'});
      if(method==='bank' && !cleanString(body.bank_name)) return json(res,400,{success:false,error:'اسم البنك مطلوب'});
      const proof=body.proof;
      if(!proof || !cleanString(proof.data_url)) return json(res,400,{success:false,error:'إثبات الاستلام مطلوب قبل اعتماد التسوية'});
      const m=firstRow(await dbSelect('merchants',{select:'id,name,merchant_no,code',id:`eq.${body.merchant_id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!m) return json(res,404,{success:false,error:'التاجر غير موجود'});
      const allOrders=await dbSelect('orders',{select:'id,merchant_id,cod,value,service_charges,delivery_fee,tax_amount,merchant_net_value',merchant_id:`eq.${body.merchant_id}`,company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const oldSettlements=await dbSelect('merchant_settlements',{select:'amount',merchant_id:`eq.${body.merchant_id}`,company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);
      const oldAdjustments=await dbSelect('merchant_adjustments',{select:'signed_amount',merchant_id:`eq.${body.merchant_id}`,company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);
      const due=(allOrders||[]).reduce((sum,o)=>sum+(cleanNumber(o.merchant_net_value!=null?o.merchant_net_value:(cleanNumber(o.cod??o.value)-cleanNumber(o.tax_amount)))-cleanNumber(o.service_charges??o.delivery_fee)),0);
      const settled=(oldSettlements||[]).reduce((sum,x)=>sum+cleanNumber(x.amount),0);
      const adjustments=(oldAdjustments||[]).reduce((sum,x)=>sum+cleanNumber(x.signed_amount),0);
      const remaining=Number((due-settled+adjustments).toFixed(2));
      if(amount>remaining+0.01) return json(res,400,{success:false,error:`المبلغ أكبر من المتبقي للتاجر. المتبقي ${remaining.toFixed(2)}`});
      const dataUrl=String(proof.data_url); const match=dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if(!match) return json(res,400,{success:false,error:'ملف الإثبات غير صالح'});
      const contentType=String(proof.content_type||match[1]||'application/octet-stream');
      const allowed=['image/jpeg','image/png','image/webp','application/pdf'];
      if(!allowed.includes(contentType)) return json(res,400,{success:false,error:'المسموح: JPG أو PNG أو WEBP أو PDF'});
      const raw=Buffer.from(match[2],'base64');
      if(raw.length>7*1024*1024) return json(res,400,{success:false,error:'حجم إثبات الاستلام يجب ألا يتجاوز 7MB'});
      const ext=(String(proof.file_name||'proof').toLowerCase().match(/\.(jpg|jpeg|png|webp|pdf)$/)||[])[1]||'bin';
      const proofPath=`${companyId}/${body.merchant_id}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
      await storageUpload('settlement-proofs',proofPath,raw,contentType);
      const row={company_id:companyId,merchant_id:body.merchant_id,amount,payment_method:method,bank_name:cleanString(body.bank_name)||null,transfer_reference:cleanString(body.transfer_reference)||null,paid_at:body.paid_at||new Date().toISOString(),employee_id:user.id==='env-admin'?null:user.id,notes:cleanString(body.notes)||null};
      const data=firstRow(await dbInsert('merchant_settlements',row));
      const proofRow=firstRow(await dbInsert('settlement_proofs',{company_id:companyId,merchant_id:body.merchant_id,settlement_id:data?.id||null,file_name:cleanString(proof.file_name)||`settlement.${ext}`,content_type:contentType,file_size:raw.length,storage_bucket:'settlement-proofs',storage_path:proofPath,uploaded_by:user.id==='env-admin'?null:user.id,uploaded_at:new Date().toISOString()}));
      await audit(user,'create_merchant_settlement','merchant_settlement',data?.id||null,{...row,proof_id:proofRow?.id||null,proof_file:proof.file_name||null});
      return json(res,200,{success:true,data:{settlement:data,proof:proofRow,remaining_after:Number((remaining-amount).toFixed(2))}});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }


  if (pathname === '/api/accounting/merchant-delivery-fee' && req.method === 'PATCH') {
    const user=await requireRole(req,res,'accounting'); if(!user)return;
    try {
      const body=await bodyJson(req), companyId=await resolveCompanyId(user);
      const id=cleanString(body.id), fee=Number(body.base_delivery_fee);
      if(!id) return json(res,400,{success:false,error:'معرّف التاجر مطلوب'});
      if(!Number.isFinite(fee)||fee<0) return json(res,400,{success:false,error:'رسوم التوصيل يجب أن تكون صفرًا أو أكثر'});
      const merchant=firstRow(await dbSelect('merchants',{select:'id,name,base_delivery_fee',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!merchant) return json(res,404,{success:false,error:'التاجر غير موجود'});
      const updated=await dbUpdate('merchants',{id:`eq.${id}`,company_id:`eq.${companyId}`},{base_delivery_fee:Number(fee.toFixed(2))});
      if(!updated?.length) return json(res,500,{success:false,error:'لم يتم تأكيد حفظ رسوم التوصيل'});
      await audit(user,'update_merchant_base_delivery_fee','merchant',id,{before:{base_delivery_fee:merchant.base_delivery_fee},after:{base_delivery_fee:Number(fee.toFixed(2))}});
      return json(res,200,{success:true,data:firstRow(updated)});
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/accounting/shipper-settlements/eligible-orders' && req.method === 'GET') {
    const user=await requireRole(req,res,'accounting');if(!user)return;
    try{
      const companyId=await resolveCompanyId(user),merchantId=cleanString(url.searchParams.get('merchant_id'));
      const from=cleanString(url.searchParams.get('from'))||egyptTodayISO(),to=cleanString(url.searchParams.get('to'))||from;
      if(!merchantId)return json(res,400,{success:false,error:'التاجر مطلوب'});
      if(from>to)return json(res,400,{success:false,error:'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية'});
      const merchants=await dbSelect('merchants',{select:'id,name,merchant_no,code,tax_enabled,tax_rate',id:`eq.${merchantId}`,company_id:`eq.${companyId}`,limit:1});
      const merchant=firstRow(merchants);if(!merchant)return json(res,404,{success:false,error:'التاجر غير موجود'});
      const [orders,shipments,items,customers,areas]=await Promise.all([
        dbSelect('orders',{select:'*',merchant_id:`eq.${merchantId}`,company_id:`eq.${companyId}`,order:'created_at.asc',limit:50000}),
        dbSelect('shipments',{select:'id,order_id,tracking_number,shipment_no',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]),
        dbSelect('shipper_settlement_items',{select:'order_id',company_id:`eq.${companyId}`,limit:100000}),
        dbSelect('customers',{select:'*',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]),
        dbSelect('areas',{select:'id,name_ar,name_en,name',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[])
      ]);
      const settled=new Set(items.map(x=>String(x.order_id)).filter(Boolean)),shMap=new Map(shipments.map(x=>[String(x.order_id),x]));
      const customerMap=new Map(customers.map(x=>[String(x.id),x])),areaMap=new Map(areas.map(x=>[String(x.id),x]));
      // This endpoint feeds merchant invoice generation: only allowed statuses in the selected
      // period are returned, and previously invoiced orders are always excluded.
      const data=orders.map(o=>{
        const info=shipperSettlementOrderInfo(o),isSettled=settled.has(String(o.id));
        const receiverCancelled=info.status==='cancelled by receiver';
        if(!info.day||info.day<from||info.day>to)return null;
        // Any order already attached to an Invoice Report voucher must disappear from
        // the generation queue, including legacy receiver-cancelled rows. Never silently
        // ignore a settlement-items lookup failure (the Promise.all above must fail visibly).
        if(isSettled)return null;
        // Receiver-cancelled orders may be included as zero-value invoice references.
        if(!info.eligible)return null;
        const sh=shMap.get(String(o.id))||{},cancelled=info.cancelledByShipper;
        const customer=customerMap.get(String(o.customer_id||''))||{};
        const areaId=o.area_id||customer.area_id||'';
        const areaRow=areaMap.get(String(areaId))||{};
        const area=areaRow.name_en||areaRow.name_ar||areaRow.name||o.area_name||o.region_name||o.region||o.area||customer.area_name||customer.region_name||customer.area||'';
        const rawFee=cleanNumber(o.service_charges??o.delivery_fee);
        const fee=receiverCancelled?0:rawFee;
        // Receiver-cancelled rows are references only; zero all financial fields.
        const cod=(cancelled||receiverCancelled)?0:cleanNumber(o.cod??o.value),savedTax=o.tax_amount,tax=(cancelled||receiverCancelled)?0:(savedTax!==undefined&&savedTax!==null&&Number.isFinite(Number(savedTax))?Math.max(0,cleanNumber(savedTax)):(merchant.tax_enabled===true?Number((fee*Math.max(0,Math.min(100,cleanNumber(merchant.tax_rate)))/100).toFixed(2)):0));
        let ineligibleReason='';
        if(receiverCancelled)ineligibleReason='ملغي من المستلم — يمكن إدراجه كمرجع في الفاتورة، بقيمة صفرية ودون أي تأثير مالي على حساب التاجر.';
        else if(isSettled)ineligibleReason='الأوردر موجود بالفعل في Invoice Report وتم توليده سابقًا.';
        else if(!info.eligibleStatus)ineligibleReason=`حالة الأوردر (${o.status||'بدون حالة'}) ليست من الحالات المسموح بتسويتها.`;
        else if(!info.paid&&!info.cancelledByShipper)ineligibleReason='الأوردر غير مؤكد الدفع؛ يجب أن تكون حالة التحصيل أو الدفع Paid.';
        else if(!info.day)ineligibleReason='لا يوجد تاريخ تسليم/حالة صالح لتحديد فترة التسوية.';
        return {id:o.id,merchant_id:o.merchant_id,merchant_order_no:o.merchant_order_no||o.order_code||'',tracking_number:sh.tracking_number||o.tracking_number||'',shipment_no:sh.shipment_no||'',customer_name:o.customer_name||customer.name||'',customer_phone:o.customer_phone||customer.phone||'',area,area_name:area,area_id:areaId||null,governorate_id:o.governorate_id||customer.governorate_id||null,status:o.status||'',cod,service_charges:fee,delivery_fee:fee,merchant_due:receiverCancelled?0:(cancelled?-fee:Number((cod-tax-fee).toFixed(2))),delivery_date:info.day,created_at:o.created_at||'',eligible:info.eligible,ineligible_reason:ineligibleReason,already_settled:false,payment_status:info.paid?'Paid':(o.cash_collection_status||o.payment_status||o.paid_status||o.commission_paid_status||o.commission_payment_status||''),tax_enabled:merchant.tax_enabled===true,tax_rate:cleanNumber(merchant.tax_rate),tax_amount:tax};
      }).filter(Boolean);
      return json(res,200,{success:true,data});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/accounting/shipper-settlements/generate' && req.method === 'POST') {
    const user=await requireRole(req,res,'accounting'); if(!user)return;
    try{
      const body=await bodyJson(req), companyId=await resolveCompanyId(user);
      const merchantIds=[...new Set((Array.isArray(body.merchant_ids)?body.merchant_ids:[]).map(cleanString).filter(Boolean))];
      const requestedOrderIds=[...new Set((Array.isArray(body.order_ids)?body.order_ids:[]).map(cleanString).filter(Boolean))];
      if(!merchantIds.length) return json(res,400,{success:false,error:'اختر شاحنًا واحدًا على الأقل'});
      const from=cleanString(body.from)||egyptTodayISO(), to=cleanString(body.to)||from;
      if(from>to)return json(res,400,{success:false,error:'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية'});
      const merchants=await dbSelect('merchants',{select:'id,name,merchant_no,code,tax_enabled,tax_rate,base_delivery_fee',company_id:`eq.${companyId}`,limit:5000});
      const merchantMap=new Map(merchants.map(m=>[String(m.id),m]));
      const validIds=merchantIds.filter(id=>merchantMap.has(String(id)));
      if(!validIds.length)return json(res,404,{success:false,error:'الشاحن المحدد غير موجود'});
      // Fetch orders per selected shipper, matching the eligible-orders endpoint.
      // A company-wide 50,000-row query could truncate later orders for a shipper, so
      // the list showed eligible orders while generation incorrectly reported none.
      const orderBatches=await Promise.all(validIds.map(merchantId=>dbSelect('orders',{select:'*',merchant_id:`eq.${merchantId}`,company_id:`eq.${companyId}`,order:'created_at.asc',limit:50000})));
      const orders=orderBatches.flat();
      // These datasets are independent; overlap their network latency instead of
      // waiting for each full-company lookup in sequence.
      const [shipments, previouslySettledItems, customers, areas]=await Promise.all([
        dbSelect('shipments',{select:'id,order_id,tracking_number,shipment_no',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]),
        dbSelect('shipper_settlement_items',{select:'order_id,settlement_id',company_id:`eq.${companyId}`,limit:100000}),
        dbSelect('customers',{select:'*',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]),
        dbSelect('areas',{select:'id,name_ar,name_en,name',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[])
      ]);
      const settledOrderIds=new Set(previouslySettledItems.map(x=>String(x.order_id)).filter(Boolean));
      const shMap=new Map(shipments.map(x=>[String(x.order_id),x]));
      const customerMap=new Map(customers.map(x=>[String(x.id),x]));
      let settlementAreaMap=new Map(areas.map(a=>[String(a.id),a]));
      let settlementAreaMapPromise=Promise.resolve(settlementAreaMap);
      // Reuse selected shippers' order data when enriching generated vouchers.
      // Previously, the endpoint reloaded up to 50,000 company orders for every
      // merchant/date voucher, causing avoidable latency during bulk generation.
      const settlementOrderMap=new Map(orders.map(o=>[String(o.id),o]));
      // One generated merchant invoice covers the entire selected period; its settlement date is the period end.
      const days=[to];
      // Validate individually selected orders before writing anything. If even one selected order
      // is outside the selected shipper/date, already settled, unpaid (except Cancelled by Shipper),
      // or in an unsupported status, reject the entire request instead of silently generating a subset.
      if(requestedOrderIds.length){
        const orderMap=new Map(orders.map(o=>[String(o.id),o]));
        const bad=[];
        for(const oid of requestedOrderIds){
          const o=orderMap.get(String(oid));
          if(!o||!validIds.includes(String(o.merchant_id))||settledOrderIds.has(String(oid))){bad.push(oid);continue;}
          const info=shipperSettlementOrderInfo(o);
          if(!info.eligible||info.day<from||info.day>to)bad.push(oid);
        }
        if(bad.length)return json(res,400,{success:false,error:`لم يتم التوليد: ${bad.length} من الأوردرات المحددة غير مؤهلة أو خارج الفترة أو سبق توليدها.`});
      }
      const requestedOrderSet=new Set(requestedOrderIds.map(String));
      const created=[];
      for(const merchantId of validIds){
        for(const day of days){
          const rows=orders.filter(o=>String(o.merchant_id)===String(merchantId)).filter(o=>{
            // When explicit order IDs were supplied, never include any other order.
            if(requestedOrderIds.length&&!requestedOrderSet.has(String(o.id))) return false;
            // An order already attached to any settlement must never be counted again.
            if(settledOrderIds.has(String(o.id))) return false;
            // Only eligible accounting statuses qualify; receiver-cancelled rows are included
            // as zero-value references, and Cancelled by Shipper remains fee-only.
            const info=shipperSettlementOrderInfo(o);
            return info.eligible && info.day>=from && info.day<=to;
          });
          // Reuse the existing merchant/day voucher and append only newly eligible orders.
          // This keeps Generate idempotent without silently dropping orders added later that day.
          const existing=firstRow(await dbSelect('shipper_settlement_records',{select:'*',company_id:`eq.${companyId}`,merchant_id:`eq.${merchantId}`,settlement_date:`eq.${day}`,limit:1}).catch(()=>[]));
          // Never report a successful voucher when this merchant/day has no eligible rows.
          // Earlier logic returned an existing zero-item record here, which looked successful
          // in Invoice Report with only the merchant name and left the orders eligible again.
          // Equivalent guard: if(!rows.length && (!existing || requestedOrderIds.length)) continue;
          if(!rows.length && (!existing || requestedOrderIds.length)) {
            if(existing && Number(existing.order_count||0)===0) {
              const emptyRecordItems=await dbSelect('shipper_settlement_items',{select:'id,order_id',company_id:`eq.${companyId}`,settlement_id:`eq.${existing.id}`,limit:50000});
              if(!emptyRecordItems.length) await dbDelete('shipper_settlement_records',{id:`eq.${existing.id}`,company_id:`eq.${companyId}`});
            }
            continue;
          }
          if(!rows.length) continue;
          const targetRecord=existing||null;
          let record=targetRecord;
          if(!record){
            // Invoice Report references this exact persisted voucher. Use an atomic
            // company/day sequence so concurrent generation cannot reuse a statement number.
            const transactionNumber=await dbRpc('next_shipper_settlement_number',{p_company_id:companyId,p_day:day.replace(/-/g,'')}).catch(error=>{
              console.error('MERCHANT STATEMENT COUNTER ERROR:',error?.message||error);
              throw new Error('تعذر توليد رقم كشف التاجر بأمان. يلزم تطبيق migration الخاصة بأرقام كشوف التجار.');
            });
            if(!/^TD-\d{8}-\d{4,}$/.test(String(transactionNumber||''))) throw new Error('رقم كشف التاجر الناتج غير صالح.');
            record=firstRow(await dbInsert('shipper_settlement_records',{company_id:companyId,merchant_id:merchantId,settlement_date:day,transaction_number:String(transactionNumber),status:'Unpaid Shipper',order_count:0,collection_amount:0,generated_by:user.id==='env-admin'?null:user.id,generated_at:new Date().toISOString()}));
          }
          if(!record) throw new Error('تعذر إنشاء سجل تسوية الشاحن');
          const items=rows.map(o=>{
            const sh=shMap.get(String(o.id))||{};
            const status=String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
            const cancelledByShipper=status==='cancelled by shipper';
            const cancelledByReceiver=status==='cancelled by receiver';
            const fee=cancelledByReceiver?0:cleanNumber(o.service_charges??o.delivery_fee);
            // VAT is always based on delivery/service fee and merchant settings, never COD.
            // A zero/disabled merchant tax setting means no VAT. Cancelled by Shipper is fee-only.
            const merchant=merchantMap.get(String(merchantId))||{};
            const taxRate=Math.max(0,Math.min(100,cleanNumber(merchant.tax_rate)));
            const cod=(cancelledByShipper||cancelledByReceiver)?0:cleanNumber(o.cod??o.value);
            const savedTax=o.tax_amount;
            const tax=(cancelledByShipper||cancelledByReceiver)?0:(savedTax!==undefined&&savedTax!==null&&Number.isFinite(Number(savedTax))?Math.max(0,cleanNumber(savedTax)):(merchant.tax_enabled===true?Number((fee*taxRate/100).toFixed(2)):0));
            const merchantNet=cancelledByReceiver?0:(cancelledByShipper?-fee:Number((cod-fee-tax).toFixed(2)));
            return {company_id:companyId,settlement_id:record.id,merchant_id:merchantId,order_id:o.id,tracking_number:sh.tracking_number||null,shipment_no:sh.shipment_no||null,merchant_order_no:o.merchant_order_no||null,cod,service_charges:fee,merchant_net:Number(merchantNet.toFixed(2))};
          });
          if(items.length) {
            const insertedItems=await dbInsert('shipper_settlement_items',items);
            if(!Array.isArray(insertedItems) || insertedItems.length!==items.length) {
              throw new Error(`تعذر تأكيد حفظ تفاصيل الأوردرات: المطلوب ${items.length} وتم تأكيد ${Array.isArray(insertedItems)?insertedItems.length:0}. لم يتم اعتبار التوليد ناجحًا.`);
            }
            const addedCollection=Number(items.reduce((sum,x)=>sum+cleanNumber(x.cod),0).toFixed(2));
            const generatedAtNow=new Date().toISOString(); const updatedRecord=firstRow(await dbUpdate('shipper_settlement_records',{id:`eq.${record.id}`,company_id:`eq.${companyId}`},{order_count:Number(record.order_count||0)+items.length,collection_amount:Number((cleanNumber(record.collection_amount)+addedCollection).toFixed(2)),generated_at:generatedAtNow,generated_by:user.id==='env-admin'?null:user.id}));
            if(updatedRecord) Object.assign(record,updatedRecord);
            for(const o of rows) {
              settledOrderIds.add(String(o.id));
              const status=String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
              if(status==='cancelled by shipper') await ensureShipperDeliveryFeeDebit(user,o,shMap.get(String(o.id))||null);
            }
          }
          const allRecordItems=await dbSelect('shipper_settlement_items',{select:'*',company_id:`eq.${companyId}`,settlement_id:`eq.${record.id}`,limit:50000});
          const persistedOrderIds=new Set(allRecordItems.map(x=>String(x.order_id||'')));
          const missingPersistedItems=items.filter(x=>!persistedOrderIds.has(String(x.order_id)));
          if(missingPersistedItems.length) throw new Error(`تم إنشاء سجل التسوية لكن لم يتم تأكيد حفظ ${missingPersistedItems.length} من تفاصيل الأوردرات. لم يتم إعلان النجاح.`);
          // Enrich voucher rows from the canonical order and area records; do not depend on
          // duplicated customer/location fields being present in settlement-item columns.
          const itemOrderIds=[...new Set(allRecordItems.map(x=>String(x.order_id||'')).filter(Boolean))];
          const missingOrderIds=itemOrderIds.filter(id=>!settlementOrderMap.has(id));
          // Existing vouchers normally reference orders already loaded above. If an
          // older/moved order is missing, fetch only those IDs instead of the whole
          // company table; chunk requests to keep URL sizes bounded.
          for(let i=0;i<missingOrderIds.length;i+=100){
            const ids=missingOrderIds.slice(i,i+100);
            const filter=`in.(${ids.map(id=>`"${String(id).replace(/"/g,'\\\"')}"`).join(',')})`;
            const missingRows=await dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,id:filter,limit:100}).catch(()=>[]);
            for(const o of missingRows) settlementOrderMap.set(String(o.id),o);
          }
          const voucherOrderMap=new Map(itemOrderIds.map(id=>[id,settlementOrderMap.get(id)]).filter(([,o])=>!!o));
          if(!settlementAreaMapPromise){
            settlementAreaMapPromise=dbSelect('areas',{select:'*',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]).then(rows=>new Map(rows.map(a=>[String(a.id),a])));
          }
          if(!settlementAreaMap) settlementAreaMap=await settlementAreaMapPromise;
          const voucherAreaMap=settlementAreaMap;
          for(const item of allRecordItems){const o=voucherOrderMap.get(String(item.order_id))||{};const customer=customerMap.get(String(o.customer_id||''))||{};const a=voucherAreaMap.get(String(o.area_id||customer.area_id||o.region_id||o.areaId||''))||{};item.customer_name=o.customer_name||o.receiver_name||o.recipient_name||customer.name||item.customer_name||'';item.customer_phone=o.customer_phone||o.customer_phone_1||o.phone||o.phone1||o.receiver_phone||o.receiver_mobile||item.customer_phone||'';item.customer_phone_2=o.customer_phone_2||o.phone_2||o.phone2||o.alternate_phone||o.receiver_phone_2||item.customer_phone_2||'';item.area=a.name_en||a.name_ar||a.name||o.area_name||o.region_name||o.region||o.area||customer.area_name||customer.region_name||customer.area||item.area||item.region||item.area_name||'';if(item.area&&typeof item.area==='object')item.area=item.area.name_en||item.area.name_ar||item.area.name||'';item.delivery_date=o.delivered_at||o.actual_delivery_date||o.delivery_completed_at||o.delivery_date||o.created_at||item.delivery_date||'';item.status=o.status||item.status||'';item.notes=o.notes||o.remarks||item.notes||'';const merchant=merchantMap.get(String(item.merchant_id||merchantId))||{};const statusKey=String(item.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');const savedOrderTax=o.tax_amount;item.tax_amount=(statusKey==='cancelled by shipper'||statusKey==='cancelled by receiver')?0:(savedOrderTax!==undefined&&savedOrderTax!==null&&Number.isFinite(Number(savedOrderTax))?Math.max(0,cleanNumber(savedOrderTax)):(merchant.tax_enabled===true?Number((cleanNumber(item.service_charges)*Math.max(0,Math.min(100,cleanNumber(merchant.tax_rate)))/100).toFixed(2)):0));item.merchant_net=statusKey==='cancelled by receiver'?0:(statusKey==='cancelled by shipper'?-cleanNumber(item.service_charges):Number((cleanNumber(item.cod)-cleanNumber(item.service_charges)-cleanNumber(item.tax_amount)).toFixed(2)));item.tax_enabled=merchant.tax_enabled===true;item.tax_rate=cleanNumber(merchant.tax_rate);}
          if(items.length) await audit(user,existing?'append_shipper_settlement_items':'generate_shipper_settlement','shipper_settlement',record.id,{merchant_id:merchantId,settlement_date:day,transaction_number:record.transaction_number,added_order_count:items.length,order_count:Number(record.order_count||0),collection_amount:cleanNumber(record.collection_amount)});
          created.push({...record,merchant:merchantMap.get(String(merchantId)),items:allRecordItems,already_exists:!!existing});
          continue;

        }
      }
      return json(res,200,{success:true,data:created});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/accounting/shipper-settlements/remove-item' && req.method === 'POST') {
    const user=await requireRole(req,res,'accounting');if(!user)return;
    try{
      const body=await bodyJson(req),companyId=await resolveCompanyId(user),itemId=cleanString(body.item_id);
      if(!itemId)return json(res,400,{success:false,error:'الأوردر غير محدد'});
      const item=firstRow(await dbSelect('shipper_settlement_items',{select:'*',id:`eq.${itemId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!item)return json(res,404,{success:false,error:'الأوردر غير موجود داخل Invoice Report'});
      const record=firstRow(await dbSelect('shipper_settlement_records',{select:'*',id:`eq.${item.settlement_id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!record)return json(res,404,{success:false,error:'سجل التوليد غير موجود'});
      if(String(record.status||'').trim().toLowerCase()==='paid shipper')return json(res,409,{success:false,error:'لا يمكن إخراج أوردر من تسوية تم اعتماد دفعها للتاجر. غيّر حالة التسوية إلى Unpaid Shipper أولاً إذا كان الإلغاء مقصودًا.'});
      const removed=await dbDelete('shipper_settlement_items',{id:`eq.${itemId}`,company_id:`eq.${companyId}`,settlement_id:`eq.${record.id}`});
      if(!removed?.length)return json(res,500,{success:false,error:'لم يتم تأكيد إخراج الأوردر من التسوية'});
      const remaining=await dbSelect('shipper_settlement_items',{select:'id,cod',company_id:`eq.${companyId}`,settlement_id:`eq.${record.id}`,limit:50000});
      const orderCount=remaining.length,collection=Number(remaining.reduce((sum,x)=>sum+cleanNumber(x.cod),0).toFixed(2));
      const updated=firstRow(await dbUpdate('shipper_settlement_records',{id:`eq.${record.id}`,company_id:`eq.${companyId}`},{order_count:orderCount,collection_amount:collection}));
      if(!updated) return json(res,500,{success:false,error:'تم إخراج الأوردر لكن تعذر تحديث إجمالي سجل التوليد'});
      await audit(user,'remove_order_from_shipper_settlement','shipper_settlement_item',itemId,{settlement_id:record.id,order_id:item.order_id,merchant_id:item.merchant_id,transaction_number:record.transaction_number,previous_collection:record.collection_amount,new_collection:collection,remaining_order_count:orderCount});
      return json(res,200,{success:true,data:{item_id:itemId,settlement_id:record.id,order_id:item.order_id,order_count:orderCount,collection_amount:collection}});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/accounting/shipper-settlements' && req.method === 'GET') {
    const user=await requireRole(req,res,'accounting');if(!user)return;
    try{
      const companyId=await resolveCompanyId(user),from=cleanString(url.searchParams.get('from')),to=cleanString(url.searchParams.get('to')),merchantId=cleanString(url.searchParams.get('merchant_id')),status=cleanString(url.searchParams.get('status')),q=cleanString(url.searchParams.get('q')).toLowerCase();
      const [records,items,merchants,proofs,users,orders,areas]=await Promise.all([
        dbSelect('shipper_settlement_records',{select:'*',company_id:`eq.${companyId}`,order:'settlement_date.desc,created_at.desc',limit:20000}),
        dbSelect('shipper_settlement_items',{select:'*',company_id:`eq.${companyId}`,limit:100000}),
        dbSelect('merchants',{select:'id,name,merchant_no,code,tax_enabled,tax_rate',company_id:`eq.${companyId}`,limit:5000}),
        dbSelect('settlement_proofs',{select:'id,settlement_id,file_name,content_type,uploaded_at,storage_path',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('users',{select:'id,name,username,employee_code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
        dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]),
        dbSelect('areas',{select:'*',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[])
      ]);
      const orderMap=new Map(orders.map(o=>[String(o.id),o])), areaMap=new Map(areas.map(a=>[String(a.id),a]));
      const mm=new Map(merchants.map(m=>[String(m.id),m])), pp=new Map(proofs.map(p=>[String(p.settlement_id),p])), um=new Map(users.map(u=>[String(u.id),u]));
      const customerMap=new Map((await dbSelect('customers',{select:'*',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[])).map(c=>[String(c.id),c]));const itemsBy=new Map(); for(const it of items){const k=String(it.settlement_id);if(!itemsBy.has(k))itemsBy.set(k,[]);const o=orderMap.get(String(it.order_id))||{};const customer=customerMap.get(String(o.customer_id||''))||{};const a=areaMap.get(String(o.area_id||customer.area_id||o.region_id||o.areaId||''))||{};const rawArea=a.name_en||a.name_ar||a.name||o.area_name||o.region_name||o.region||o.area||customer.area_name||customer.region_name||customer.area||it.area||it.region||it.area_name||'';const area=rawArea&&typeof rawArea==='object'?(rawArea.name_en||rawArea.name_ar||rawArea.name||''):rawArea;const orderCreator=um.get(String(o.created_by||o.created_by_user_id||''))||{};const settlementItemStatusKey=String(o.status||it.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');const settlementItemMerchant=mm.get(String(it.merchant_id||''))||{};const settlementItemFee=cleanNumber(it.service_charges??o.service_charges??o.delivery_fee);const settlementItemCod=cleanNumber(it.cod??o.cod??o.value);const settlementSavedTax=o.tax_amount;const settlementItemTax=settlementItemStatusKey==='cancelled by shipper'?0:(settlementSavedTax!==undefined&&settlementSavedTax!==null&&Number.isFinite(Number(settlementSavedTax))?Math.max(0,cleanNumber(settlementSavedTax)):(settlementItemMerchant.tax_enabled===true?Number((settlementItemFee*Math.max(0,Math.min(100,cleanNumber(settlementItemMerchant.tax_rate)))/100).toFixed(2)):0));itemsBy.get(k).push({...it,merchant_net:settlementItemStatusKey==='cancelled by shipper'?-settlementItemFee:Number((settlementItemCod-settlementItemFee-settlementItemTax).toFixed(2)),order_created_at:o.created_at||o.inserted_at||o.created_on||it.order_created_at||'',created_by:o.created_by||null,created_by_name:o.created_by_name||orderCreator.name||orderCreator.username||orderCreator.employee_code||'',customer_name:o.customer_name||o.receiver_name||o.recipient_name||it.customer_name||'',customer_phone:o.customer_phone||o.customer_phone_1||o.phone||o.phone1||o.receiver_phone||o.receiver_mobile||it.customer_phone||'',customer_phone_2:o.customer_phone_2||o.phone_2||o.phone2||o.alternate_phone||o.receiver_phone_2||it.customer_phone_2||'',area,delivery_date:o.delivered_at||o.actual_delivery_date||o.delivery_completed_at||o.delivery_date||o.created_at||it.delivery_date||'',status:o.status||it.status||'',notes:o.notes||o.remarks||it.notes||'',tax_enabled:mm.get(String(it.merchant_id||''))?.tax_enabled===true,tax_rate:cleanNumber(mm.get(String(it.merchant_id||''))?.tax_rate),tax_amount:settlementItemTax});}
      let out=records.map(r=>{const creator=um.get(String(r.generated_by||r.created_by||''))||{};return {...r,generated_by_name:creator.name||creator.username||creator.employee_code||'',merchant:mm.get(String(r.merchant_id))||{},items:itemsBy.get(String(r.id))||[],proof:pp.get(String(r.id))||null};});
      // Invoice Report must contain real generated invoices with linked order items.
      // Legacy empty records from earlier failed generation attempts otherwise show the
      // shipper and transaction number with an order count of zero. Keep them out of the
      // report; the generation queue is based on settlement items, so those orders remain
      // eligible to be generated again and can reuse the existing empty record.
      out=out.filter(r=>Array.isArray(r.items)&&r.items.length>0);
      if(from||to)out=out.filter(r=>{const invoiceDay=String(r.settlement_date||r.generated_at||r.created_at||'').slice(0,10);return (!from||invoiceDay>=from)&&(!to||invoiceDay<=to);});if(merchantId)out=out.filter(r=>String(r.merchant_id)===merchantId);if(status)out=out.filter(r=>String(r.status)===status);
      if(q)out=out.filter(r=>[r.transaction_number,r.merchant?.name,r.merchant?.merchant_no,r.merchant?.code,r.merchant?.external_code,...r.items.flatMap(i=>[i.tracking_number,i.shipment_no,i.merchant_order_no,i.customer_name,i.customer_phone,i.customer_phone_2])].some(v=>String(v||'').toLowerCase().includes(q)));
      const selected=out; return json(res,200,{success:true,data:out,totals:{selected_orders:selected.reduce((n,r)=>n+Number(r.order_count||0),0),selected_collection:Number(selected.reduce((n,r)=>n+cleanNumber(r.collection_amount),0).toFixed(2))}});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/accounting/shipper-settlements/proof' && req.method === 'POST') {
    const user=await requireRole(req,res,'accounting');if(!user)return;
    try{
      const body=await bodyJson(req),companyId=await resolveCompanyId(user),id=cleanString(body.id),proof=body.proof;
      if(!id||!proof||!cleanString(proof.data_url))return json(res,400,{success:false,error:'سجل التسوية وملف الإثبات مطلوبان'});
      const record=firstRow(await dbSelect('shipper_settlement_records',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));if(!record)return json(res,404,{success:false,error:'سجل التسوية غير موجود'});
      const match=String(proof.data_url).match(/^data:([^;]+);base64,(.+)$/s);if(!match)return json(res,400,{success:false,error:'ملف الإثبات غير صالح'});
      const contentType=String(proof.content_type||match[1]||'application/octet-stream'),allowed=['image/jpeg','image/png','image/webp','application/pdf'];if(!allowed.includes(contentType))return json(res,400,{success:false,error:'المسموح: JPG أو PNG أو WEBP أو PDF'});
      const raw=Buffer.from(match[2],'base64');if(raw.length>7*1024*1024)return json(res,400,{success:false,error:'حجم إثبات الدفع يجب ألا يتجاوز 7MB'});
      const ext=(String(proof.file_name||'proof').toLowerCase().match(/\.(jpg|jpeg|png|webp|pdf)$/)||[])[1]||'bin';
      const path=`${companyId}/shipper-settlements/${record.merchant_id}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;await storageUpload('settlement-proofs',path,raw,contentType);
      const old=firstRow(await dbSelect('settlement_proofs',{select:'*',company_id:`eq.${companyId}`,settlement_id:`eq.${id}`,limit:1}).catch(()=>[]));
      let proofRow;
      if(old){proofRow=firstRow(await dbUpdate('settlement_proofs',{id:`eq.${old.id}`,company_id:`eq.${companyId}`},{file_name:cleanString(proof.file_name)||old.file_name,content_type:contentType,file_size:raw.length,storage_bucket:'settlement-proofs',storage_path:path,uploaded_by:user.id==='env-admin'?null:user.id,uploaded_at:new Date().toISOString()}));}
      else {proofRow=firstRow(await dbInsert('settlement_proofs',{company_id:companyId,merchant_id:record.merchant_id,settlement_id:id,file_name:cleanString(proof.file_name)||`settlement.${ext}`,content_type:contentType,file_size:raw.length,storage_bucket:'settlement-proofs',storage_path:path,uploaded_by:user.id==='env-admin'?null:user.id,uploaded_at:new Date().toISOString()}));}
      const updated=firstRow(await dbUpdate('shipper_settlement_records',{id:`eq.${id}`,company_id:`eq.${companyId}`},{status:'Paid Shipper',paid_at:new Date().toISOString()}));
      await audit(user,'upload_shipper_settlement_proof','shipper_settlement',id,{proof_id:proofRow?.id||null,status:'Paid Shipper'});
      return json(res,200,{success:true,data:{record:updated,proof:proofRow}});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/accounting/shipper-settlements/status' && req.method === 'POST') {
    const user=await requireRole(req,res,'accounting');if(!user)return;
    try{const body=await bodyJson(req),companyId=await resolveCompanyId(user),id=cleanString(body.id),status=cleanString(body.status);if(!id||!['Paid Shipper','Unpaid Shipper'].includes(status))return json(res,400,{success:false,error:'بيانات الحالة غير صحيحة'});const old=firstRow(await dbSelect('shipper_settlement_records',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));if(!old)return json(res,404,{success:false,error:'سجل التسوية غير موجود'});const row=firstRow(await dbUpdate('shipper_settlement_records',{id:`eq.${id}`,company_id:`eq.${companyId}`},{status,paid_at:status==='Paid Shipper'?new Date().toISOString():null}));await audit(user,'change_shipper_settlement_status','shipper_settlement',id,{before:old,after:row});return json(res,200,{success:true,data:row});}catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/accounting/adjustment-archive' && req.method === 'GET') {
    const user=await requireRole(req,res,'accounting');if(!user)return;try{const companyId=await resolveCompanyId(user);const [proofs,merchants,adjustments,users]=await Promise.all([dbSelect('adjustment_proofs',{select:'*',company_id:`eq.${companyId}`,order:'uploaded_at.desc',limit:10000}),dbSelect('merchants',{select:'id,name,merchant_no,code',company_id:`eq.${companyId}`,limit:5000}),dbSelect('merchant_adjustments',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:10000}),dbSelect('users',{select:'id,name,username,employee_code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[])]);const mm=new Map((merchants||[]).map(x=>[String(x.id),x])),am=new Map((adjustments||[]).map(x=>[String(x.id),x])),um=new Map((users||[]).map(x=>[String(x.id),x]));const out=(proofs||[]).map(p=>{const a=am.get(String(p.adjustment_id))||{},m=mm.get(String(p.merchant_id))||{},u=um.get(String(a.employee_id))||um.get(String(p.uploaded_by))||{};return {...p,adjustment:a,merchant:m,employee_name:u.name||u.username||u.employee_code||''};});return json(res,200,{success:true,data:out});}catch(error){return json(res,500,{success:false,error:error.message});}
  }
  const adjustmentFileMatch=pathname.match(/^\/api\/accounting\/adjustment-archive\/([^/]+)\/file$/);if(adjustmentFileMatch&&req.method==='GET'){const user=await requireRole(req,res,'accounting');if(!user)return;try{const companyId=await resolveCompanyId(user);const p=firstRow(await dbSelect('adjustment_proofs',{select:'*',id:`eq.${adjustmentFileMatch[1]}`,company_id:`eq.${companyId}`,limit:1}));if(!p)return json(res,404,{success:false,error:'الإثبات غير موجود'});const raw=await storageDownload(p.storage_bucket,p.storage_path);res.statusCode=200;res.setHeader('Content-Type',p.content_type);res.setHeader('Content-Disposition',`inline; filename="${String(p.file_name||'proof').replace(/"/g,'')}"`);return res.end(raw);}catch(error){return json(res,500,{success:false,error:error.message});}}

  if (pathname === '/api/accounting/settlement-archive' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId=await resolveCompanyId(user);
      const [proofs,merchants,settlements,users]=await Promise.all([
        dbSelect('settlement_proofs',{select:'*',company_id:`eq.${companyId}`,order:'uploaded_at.desc',limit:10000}),
        dbSelect('merchants',{select:'id,name,merchant_no,code',company_id:`eq.${companyId}`,limit:5000}),
        dbSelect('merchant_settlements',{select:'id,merchant_id,amount,payment_method,bank_name,transfer_reference,paid_at,employee_id',company_id:`eq.${companyId}`,order:'paid_at.desc',limit:10000}),
        dbSelect('users',{select:'id,name,username,employee_code',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
        dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,limit:50000}).catch(()=>[]),
        dbSelect('areas',{select:'*',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[])
      ]);
      const orderMap=new Map(orders.map(o=>[String(o.id),o])), areaMap=new Map(areas.map(a=>[String(a.id),a]));
      const mm=new Map((merchants||[]).map(x=>[String(x.id),x])); const sm=new Map((settlements||[]).map(x=>[String(x.id),x])); const um=new Map((users||[]).map(x=>[String(x.id),x]));
      const out=(proofs||[]).map(p=>{const st=sm.get(String(p.settlement_id))||{}; const m=mm.get(String(p.merchant_id))||{}; const u=um.get(String(st.employee_id))||um.get(String(p.uploaded_by))||{}; return {...p,settlement:st,merchant:m,employee_name:u.name||u.username||u.employee_code||''};});
      return json(res,200,{success:true,data:out});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  const proofFileMatch=pathname.match(/^\/api\/accounting\/settlement-archive\/([^/]+)\/file$/);
  if(proofFileMatch && req.method==='GET'){
    const user=await requireRole(req,res,'accounting'); if(!user)return;
    try{
      const companyId=await resolveCompanyId(user); const p=firstRow(await dbSelect('settlement_proofs',{select:'*',id:`eq.${proofFileMatch[1]}`,company_id:`eq.${companyId}`,limit:1}));
      if(!p)return json(res,404,{success:false,error:'الإثبات غير موجود'});
      const response=await storageDownload(p.storage_bucket,p.storage_path); const buf=Buffer.from(await response.arrayBuffer());
      res.writeHead(200,{'Content-Type':p.content_type||'application/octet-stream','Content-Length':buf.length,'Content-Disposition':`inline; filename="${String(p.file_name||'proof').replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, max-age=300'}); res.end(buf);
    }catch(error){return json(res,500,{success:false,error:error.message});}
    return;
  }

  if (pathname === '/api/accounting/merchant-financial/update-fee' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body=await bodyJson(req); const companyId=await resolveCompanyId(user); const id=body.order_id;
      const existing=firstRow(await dbSelect('orders',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!existing) return json(res,404,{success:false,error:'الأوردر غير موجود'});
      const settled=firstRow(await dbSelect('shipper_settlement_items',{select:'id,settlement_id',order_id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
      if(settled)return json(res,409,{success:false,error:'لا يمكن تعديل رسوم التوصيل بعد توليد الأوردر. أخرجه من Invoice Report أولاً إذا كان التعديل مقصودًا.'});
      const fee=Number(body.service_charges);
      if(!Number.isFinite(fee)||fee<0)return json(res,400,{success:false,error:'رسوم التوصيل يجب أن تكون رقمًا صحيحًا لا يقل عن صفر'});
      const merchants=await dbSelect('merchants',{select:'id,tax_enabled,tax_rate',id:`eq.${existing.merchant_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]);
      const merchant=firstRow(merchants)||{};
      const taxEnabled=existing.tax_enabled!==undefined&&existing.tax_enabled!==null?existing.tax_enabled===true:merchant.tax_enabled===true;
      const taxRate=Math.max(0,Math.min(100,cleanNumber(existing.tax_rate!==undefined&&existing.tax_rate!==null?existing.tax_rate:merchant.tax_rate)));
      const statusKey=String(existing.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
      const tax=statusKey==='cancelled by shipper'||!taxEnabled?0:Number((Number(fee.toFixed(2))*taxRate/100).toFixed(2));
      const cod=cleanNumber(existing.cod??existing.value);
      const patch={delivery_fee:Number(fee.toFixed(2)),service_charges:Number(fee.toFixed(2)),tax_enabled:taxEnabled,tax_rate:taxRate,tax_amount:tax,merchant_net_value:Number((cod-tax).toFixed(2))};
      const updated=firstRow(await dbUpdate('orders',{id:`eq.${id}`,company_id:`eq.${companyId}`},patch));
      await audit(user,'update_order_service_charges','order',id,{before:{delivery_fee:existing.delivery_fee,service_charges:existing.service_charges},after:patch});
      return json(res,200,{success:true,data:updated||{...existing,...patch}});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }


  if (pathname === '/api/accounting/company-financial' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const url = new URL(req.url, 'http://localhost');
      const from = cleanString(url.searchParams.get('from'));
      const to = cleanString(url.searchParams.get('to'));
      const type = cleanString(url.searchParams.get('type'));
      const dateOk = (v) => { const d=accountingDay(v); return !!d && (!from || d>=from) && (!to || d<=to); };
      const orders = await dbSelect('orders', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 20000 });
      const [accountingShipments, accountingJobs, accountingLinks] = await Promise.all([
        dbSelect('shipments',{select:'id,order_id,delivered_at,created_at,company_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('delivery_jobs',{select:'id,job_code,job_date,date,created_at,company_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('delivery_job_shipments',{select:'delivery_job_id,shipment_id',limit:50000}).catch(()=>[]),
        dbSelect('company_financial_adjustments',{select:'*',company_id:`eq.${companyId}`,order:'transaction_date.desc',limit:20000}).catch(()=>[])
      ]);
      const accountingJobMap=new Map((accountingJobs||[]).map(j=>[String(j.id),j]));
      const accountingLatestJobByShipment=new Map();
      for(const link of accountingLinks||[]){const job=accountingJobMap.get(String(link.delivery_job_id||''));const sid=String(link.shipment_id||'');if(!job||!sid)continue;const prev=accountingLatestJobByShipment.get(sid);const stamp=String(job.job_date||job.delivery_date||job.date||job.created_at||'');const prevStamp=String(prev?.job_date||prev?.delivery_date||prev?.date||prev?.created_at||'');if(!prev||stamp>prevStamp)accountingLatestJobByShipment.set(sid,job);}
      const accountingShipmentByOrder=new Map((accountingShipments||[]).map(sh=>[String(sh.order_id||''),sh]));
      const accountingStatementDay=o=>{const sh=accountingShipmentByOrder.get(String(o.id||''));const job=accountingLatestJobByShipment.get(String(sh?.id||''));return accountingDay(job?.job_date||job?.delivery_date||job?.date||o.actual_delivery_date||o.delivery_date||o.delivered_at||sh?.delivered_at||o.created_at||'');};
      const isFinanciallyPaid=o=>[o.commission_paid_status,o.cash_collection_status,o.paid_status,o.payment_status,o.commission_payment_status].some(v=>String(v||'').trim().toLowerCase()==='paid');
      const drivers = await dbSelect('drivers', { select: 'id,name,driver_no', company_id: `eq.${companyId}`, limit: 5000 }).catch(()=>[]);
      const driverSettlements = await dbSelect('driver_settlements', { select: '*', company_id: `eq.${companyId}`, order:'paid_at.desc', limit:10000 }).catch(()=>[]);
      const driverAccountEntries = await dbSelect('transactions', { select: '*', company_id: `eq.${companyId}`, order:'created_at.desc', limit:20000 }).catch(()=>[]);
      const merchantSettlements = await dbSelect('merchant_settlements', { select: '*', company_id: `eq.${companyId}`, order:'paid_at.desc', limit:10000 }).catch(()=>[]);
      const generatedMerchantRecords = await dbSelect('shipper_settlement_records', { select:'id,settlement_date,merchant_id,status,created_at', company_id:`eq.${companyId}`, limit:20000 }).catch(()=>[]);
      const generatedMerchantItems = await dbSelect('shipper_settlement_items', { select:'order_id,settlement_id,service_charges,cod,merchant_net', company_id:`eq.${companyId}`, limit:100000 }).catch(()=>[]);
      const expensesAll = await dbSelect('expenses', { select:'*', company_id:`eq.${companyId}`, order:'expense_date.desc', limit:20000 }).catch(()=>[]);
      const adjustments = await dbSelect('company_financial_adjustments', { select:'*', company_id:`eq.${companyId}`, order:'transaction_date.desc', limit:10000 }).catch(()=>[]);
      // Company delivery revenue/tax is recognized only after explicit Paid approval.
      // It follows the Driver Account statement date rather than voucher creation or UTC date.
      const generatedRecordById=new Map((generatedMerchantRecords||[]).map(r=>[String(r.id),r]));
      const generatedOrderIds=new Set();
      const generatedDateByOrder=new Map();
      for(const item of generatedMerchantItems||[]){
        const rec=generatedRecordById.get(String(item.settlement_id));
        if(!rec||!dateOk(rec.settlement_date||rec.created_at)) continue;
        generatedOrderIds.add(String(item.order_id));
        generatedDateByOrder.set(String(item.order_id),rec.settlement_date||rec.created_at);
      }
      const orderPaidDate=(o)=>accountingStatementDay(o);
      // Revenue and tax appear only after explicit Paid approval, on the same
      // delivery-statement date used by Driver Account, never merely on voucher creation.
      const filteredOrders=(orders||[]).filter(o=>isFinanciallyPaid(o)&&dateOk(orderPaidDate(o)));
      const filteredDriverSettlements=(driverSettlements||[]).filter(x=>dateOk(x.paid_at||x.created_at)).filter(x=>{const note=String(x.notes||'').toLowerCase();const kind=String(x.type||x.payment_type||x.settlement_type||'').toLowerCase();return note.startsWith('driver commission payment')||kind.includes('commission')||kind.includes('عمولة');});
      const filteredMerchantSettlements=(merchantSettlements||[]).filter(x=>dateOk(x.paid_at||x.created_at));
      const datedExpenses=(expensesAll||[]).filter(x=>dateOk(x.expense_date||x.created_at));
      // A driver-account entry whose saved type is commission belongs to Driver Commissions,
      // not to the general expenses total. Match only structured type/category fields,
      // never free-text notes, to avoid misclassifying ordinary expenses.
      const isCommissionExpense=x=>/commission|عمولة/i.test([x.expense_type,x.category,x.type].map(v=>String(v||'')).join(' '));
      const filteredCommissionEntries=(driverAccountEntries||[]).filter(x=>String(x.account_type||"").trim().toLowerCase()==="driver"&&String(x.transaction_type||"").trim().toLowerCase()==="commission"&&dateOk(x.created_at));
      const filteredExpenses=datedExpenses.filter(x=>!isCommissionExpense(x));
      const filteredAdjustments=(adjustments||[]).filter(x=>dateOk(x.transaction_date||x.created_at));
      const serviceRevenue=filteredOrders.reduce((s,o)=>s+(cleanNumber(o.service_charges)||cleanNumber(o.service_charge)||cleanNumber(o.delivery_fee)||cleanNumber(o.delivery_charge)||cleanNumber(o.shipping_fee)),0);
      const tax=filteredOrders.reduce((s,o)=>['cancelled by shipper','cancelled by receiver'].includes(String(o.status||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' '))?s:s+cleanNumber(o.tax_amount),0);
      const driverPaid=filteredCommissionEntries.reduce((s,x)=>s+Math.abs(cleanNumber(x.amount)),0);
      const merchantPaid=filteredMerchantSettlements.reduce((s,x)=>s+cleanNumber(x.amount),0);
      const driverExpenses=filteredExpenses.reduce((s,x)=>s+cleanNumber(x.amount),0);
      const companyExpenseAdjustments=filteredAdjustments.filter(x=>String(x.type||'').toLowerCase()==='expense');
      const otherAdjustments=filteredAdjustments.filter(x=>String(x.type||'').toLowerCase()!=='expense');
      const companyExpenseAdjustmentTotal=companyExpenseAdjustments.reduce((s,x)=>s+Math.abs(cleanNumber(x.amount ?? x.signed_amount)),0);
      const companyExpensesTotal=driverExpenses+companyExpenseAdjustmentTotal;
      const adjustmentNet=otherAdjustments.reduce((s,x)=>s+cleanNumber(x.signed_amount),0);
      const companyNet=serviceRevenue-driverPaid-driverExpenses-companyExpenseAdjustmentTotal+adjustmentNet;
      const transactions=[];
      for(const o of filteredOrders){const amount=cleanNumber(o.service_charges)||cleanNumber(o.service_charge)||cleanNumber(o.delivery_fee)||cleanNumber(o.delivery_charge)||cleanNumber(o.shipping_fee); if(amount) transactions.push({date:orderPaidDate(o),type:'service_revenue',description:'Service Charges Revenue',amount, direction:'in',reference:o.merchant_order_no||o.order_code||o.tracking_number||`Order ID: ${String(o.id||'').slice(0,8)}`,source_id:o.id});}
      for(const x of filteredCommissionEntries){const amount=Math.abs(cleanNumber(x.amount));if(amount)transactions.push({date:accountingDay(x.created_at),type:'driver_commission',description:x.description||'Driver account commission',amount:-amount,direction:'out',reference:x.shipment_id||x.reference||`Driver account entry ID: ${String(x.id||'').slice(0,8)}`,source_id:x.id});}
      for(const x of filteredExpenses){const amount=cleanNumber(x.amount); if(amount) transactions.push({date:accountingDay(x.expense_date||x.created_at),type:'company_expense',description:(x.details||x.notes||x.expense_type||'Company Expense'),amount:-amount,direction:'out',reference:`Expense ID: ${String(x.id||'').slice(0,8)}`,source_id:x.id});}
      for(const x of filteredAdjustments){const isCompanyExpense=String(x.type||'').toLowerCase()==='expense';const amount=isCompanyExpense?-Math.abs(cleanNumber(x.amount??x.signed_amount)):cleanNumber(x.signed_amount);if(amount)transactions.push({date:accountingDay(x.transaction_date||x.created_at),type:isCompanyExpense?'company_expense':'adjustment',description:isCompanyExpense?(x.description||x.reason||'Company Expense'):[x.type,x.description||x.reason||'Company Adjustment'].filter(Boolean).join(' — '),amount,direction:amount>=0?'in':'out',reference:x.reference||`Company adjustment ID: ${String(x.id||'').slice(0,8)}`,source_id:x.id});}
      transactions.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
      const visibleTransactions=type && type!=='all' ? transactions.filter(x=>x.type===type) : transactions;
      return json(res,200,{success:true,data:{orders_count:filteredOrders.length,cod:filteredOrders.reduce((s,o)=>s+cleanNumber(o.cod ?? o.value),0),service_revenue:serviceRevenue,tax,driver_paid:driverPaid,driver_expenses:companyExpensesTotal,merchant_paid:merchantPaid,adjustment_net:adjustmentNet,company_net:companyNet,drivers_count:(drivers||[]).length},transactions:visibleTransactions,adjustments:filteredAdjustments,driverSettlements:filteredDriverSettlements,driverAccountEntries:filteredCommissionEntries,merchantSettlements:filteredMerchantSettlements});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/accounting/daily-company-report' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const from = cleanString(url.searchParams.get('from')) || new Date().toISOString().slice(0,10);
      const to = cleanString(url.searchParams.get('to')) || from;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return json(res,400,{success:false,error:'نطاق التاريخ غير صالح'});
      const inRange = value => { const day=accountingDay(value); return !!day && day>=from && day<=to; };
      const [rawOrders, merchants, expenses, driverSettlements, reportShipments, reportJobs, reportLinks, companyExpenseAdjustments] = await Promise.all([
        dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:20000}),
        dbSelect('merchants',{select:'id,name,code',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]),
        dbSelect('expenses',{select:'*',company_id:`eq.${companyId}`,order:'expense_date.desc',limit:20000}).catch(()=>[]),
        dbSelect('driver_settlements',{select:'*',company_id:`eq.${companyId}`,order:'paid_at.desc',limit:20000}).catch(()=>[]),
        dbSelect('shipments',{select:'id,order_id,delivered_at,created_at,company_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('delivery_jobs',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('delivery_job_shipments',{select:'delivery_job_id,shipment_id',limit:50000}).catch(()=>[]),
        dbSelect('company_financial_adjustments',{select:'*',company_id:`eq.${companyId}`,order:'transaction_date.desc',limit:20000}).catch(()=>[])
      ]);
      const reportJobMap=new Map((reportJobs||[]).map(j=>[String(j.id),j]));
      const reportLatestJobByShipment=new Map();
      for(const link of reportLinks||[]){const job=reportJobMap.get(String(link.delivery_job_id||''));const sid=String(link.shipment_id||'');if(!job||!sid)continue;const prev=reportLatestJobByShipment.get(sid);const stamp=String(job.job_date||job.delivery_date||job.date||job.created_at||'');const prevStamp=String(prev?.job_date||prev?.delivery_date||prev?.date||prev?.created_at||'');if(!prev||stamp>prevStamp)reportLatestJobByShipment.set(sid,job);}
      const reportShipmentByOrder=new Map((reportShipments||[]).map(sh=>[String(sh.order_id||''),sh]));
      const statementDayForOrder=o=>{const sh=reportShipmentByOrder.get(String(o.id||''));const job=reportLatestJobByShipment.get(String(sh?.id||''));return accountingDay(job?.job_date||job?.delivery_date||job?.date||o.actual_delivery_date||o.delivery_date||o.delivered_at||sh?.delivered_at||o.created_at||'');};
      const orders = await enrichOrderCreatorNames(rawOrders, companyId);
      const merchantMap=new Map((merchants||[]).map(m=>[String(m.id),m]));
      // The daily company report is a cash-received report: an order only enters
      // the financial totals after it is marked Paid in Driver Account. Do not
      // substitute delivery status for this accounting event.
      const firstPositive=(...values)=>{for(const value of values){const n=cleanNumber(value);if(n>0)return n;}return 0;};
      const isDriverAccountPaid=o=>[o.commission_paid_status,o.cash_collection_status,o.paid_status,o.payment_status,o.commission_payment_status]
        .some(v=>String(v||'').trim().toLowerCase()==='paid');
      const statusDate=o=>o.status_changed_at||o.updated_at||o.delivery_date||o.created_at||'';
      // Daily company report follows the same cash/accounting rule as Company Revenue:
      // only orders explicitly marked Paid are included, regardless of delivery status.
      // Attribute the paid order to its statement day when available.
      const reportOrders=(orders||[]).filter(o=>isDriverAccountPaid(o)&&inRange(statementDayForOrder(o)));
      const orderRows=reportOrders.map(o=>{
        const merchant=merchantMap.get(String(o.merchant_id||o.shipper_id||''));
        const reportShipment=reportShipmentByOrder.get(String(o.id||''));
        const reportJob=reportLatestJobByShipment.get(String(reportShipment?.id||''));
        const status=commissionStatusKey(o.status);
        const cancelledByShipper=status==='cancelled by shipper';
        const cancelledByReceiver=status==='cancelled by receiver';
        const cod=(cancelledByShipper||cancelledByReceiver)?0:firstPositive(o.cod,o.value,o.order_value,o.price);
        // Both cancellation types contribute the delivery fee to company revenue;
        // the customer-paid receiver cancellation must not reduce shipper due.
        const fee=firstPositive(o.service_charges,o.service_charge,o.delivery_fee,o.delivery_charge,o.shipping_fee);
        const tax=(cancelledByShipper||cancelledByReceiver)?0:firstPositive(o.tax_amount,o.tax,o.vat_amount);
        const shipperDue=(cancelledByShipper||cancelledByReceiver)?0:Math.max(0,cod-tax-fee);
        const reportDate=cancelledByShipper?accountingDay(statusDate(o)):statementDayForOrder(o);
        return {id:o.id,tracking_number:o.tracking_number||reportShipment?.tracking_number||'',job_code:reportJob?.job_code||reportJob?.job_cod||reportJob?.job_code_no||reportJob?.code||reportJob?.job_number||o.job_code||o.job_cod||'',order_no:o.merchant_order_no||o.order_no||o.order_number||o.order_code||'',shipper_name:merchant?.name||o.shipper_name||o.merchant_name||'',created_by:o.created_by||null,created_by_name:o.created_by_name||'',cod,service_charges:fee,tax,shipper_due_estimate:Number(shipperDue.toFixed(2)),paid_date:accountingDay(reportDate),original_status:o.original_status||o.status||'',status:o.status||''};
      });
      // The Cashier > Company Expenses screen stores company-level entries in
      // company_financial_adjustments, not in the driver expenses table. Include those
      // rows in this report too, using their transaction date and only type=expense.
      const driverAndGeneralExpenseRows=(expenses||[]).filter(e=>inRange(e.expense_date||e.created_at)).map(e=>({...e,amount:cleanNumber(e.amount),report_source:'expenses'}));
      const companyExpenseRows=(companyExpenseAdjustments||[])
        .filter(e=>String(e.type||'').trim().toLowerCase()==='expense'&&inRange(e.transaction_date||e.created_at))
        .map(e=>({...e,expense_date:e.transaction_date||e.created_at,expense_type:e.type||'expense',details:e.description||e.reason||e.details||'',notes:e.reference||e.notes||'',amount:cleanNumber(e.amount),report_source:'company_financial_adjustments'}));
      const expenseRows=[...driverAndGeneralExpenseRows,...companyExpenseRows];
      const isMaintenanceOrOps=e=>{const kind=String(e.expense_type||'').toLowerCase().replace(/[_-]+/g,' ');const cat=String(e.category||'').toLowerCase().replace(/[_-]+/g,' ');const text=`${kind} ${cat} ${e.details||''} ${e.notes||''}`.toLowerCase();return /mainten|صيان|fuel|petrol|بنزين|loading|تحميل|parking|موقف|operat|تشغيل|repair|إصلاح/.test(text);};
      const maintenanceExpenses=expenseRows.filter(isMaintenanceOrOps);
      const otherExpenseRows=expenseRows.filter(e=>!isMaintenanceOrOps(e));
      const payoutRows=(driverSettlements||[]).filter(x=>inRange(x.paid_at||x.created_at)).filter(x=>{const note=String(x.notes||'').toLowerCase();const type=String(x.type||x.payment_type||x.settlement_type||'').toLowerCase();return note.startsWith('driver commission payment')||type.includes('commission')||type.includes('عمولة');});
      const driverMap=new Map();
      for(const x of payoutRows){const id=String(x.driver_id||'');if(!id)continue;driverMap.set(id,driverMap.get(id)||'');}
      if(driverMap.size){const driverRows=await dbSelect('drivers',{select:'id,name,driver_no',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);for(const d of driverRows)if(driverMap.has(String(d.id)))driverMap.set(String(d.id),d.name||d.driver_no||'');}
      const payouts=payoutRows.map(x=>({...x,driver_name:driverMap.get(String(x.driver_id||''))||'',amount:cleanNumber(x.amount)}));
      const fees=orderRows.reduce((n,o)=>n+o.service_charges,0);
      const shipperDue=orderRows.reduce((n,o)=>n+o.shipper_due_estimate,0);
      const maintenanceTotal=maintenanceExpenses.reduce((n,e)=>n+e.amount,0);
      const otherTotal=otherExpenseRows.reduce((n,e)=>n+e.amount,0);
      const totalExpenses=maintenanceTotal+otherTotal;
      const driverPaid=payouts.reduce((n,x)=>n+x.amount,0);
      return json(res,200,{success:true,data:{from,to,paid_count:orderRows.length,delivered_count:orderRows.length,shipper_due_estimate:Number(shipperDue.toFixed(2)),delivery_fees_gross:Number(fees.toFixed(2)),driver_payouts_total:Number(driverPaid.toFixed(2)),net_delivery_revenue:Number((fees-driverPaid).toFixed(2)),maintenance_operating_costs:Number(maintenanceTotal.toFixed(2)),other_expenses:Number(otherTotal.toFixed(2)),total_expenses:Number(totalExpenses.toFixed(2)),net_result:Number((fees-driverPaid-totalExpenses).toFixed(2)),orders:orderRows,maintenance_expenses:maintenanceExpenses,other_expense_rows:otherExpenseRows,driver_payouts:payouts}});
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/accounting/company-financial/adjustment' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const body=await bodyJson(req), companyId=await resolveCompanyId(user), amount=cleanNumber(body.amount);
      if(amount<=0) return json(res,400,{success:false,error:'المبلغ يجب أن يكون أكبر من صفر'});
      const kind=cleanString(body.type)||'other'; const signed=['expense','deduction'].includes(kind)?-Math.abs(amount):Math.abs(amount);
      const row={company_id:companyId,type:kind,amount:Math.abs(amount),signed_amount:signed,description:cleanString(body.description),reason:cleanString(body.reason),reference:cleanString(body.reference),transaction_date:body.transaction_date||new Date().toISOString()};
      const data=firstRow(await dbInsert('company_financial_adjustments',row)); await audit(user,'create_company_financial_adjustment','company_financial_adjustment',data?.id||null,row);
      return json(res,200,{success:true,data});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/accounting/company-financial/adjustment' && req.method === 'DELETE') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try { const body=await bodyJson(req), companyId=await resolveCompanyId(user), id=cleanString(body.id); if(!id)return json(res,400,{success:false,error:'Adjustment ID مطلوب'}); const old=firstRow(await dbSelect('company_financial_adjustments',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1})); if(!old)return json(res,404,{success:false,error:'التسوية غير موجودة'}); await audit(user,'delete_company_financial_adjustment','company_financial_adjustment',id,old); await supabaseRequest('company_financial_adjustments',{method:'DELETE',query:{id:`eq.${id}`,company_id:`eq.${companyId}`},returning:false}); return json(res,200,{success:true}); }catch(error){return json(res,500,{success:false,error:error.message});}
  }


  if (pathname === '/api/settings/menu-config' && req.method === 'GET') {
    const user = await requireAuth(req, res); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const row = firstRow(await dbSelect('companies',{select:'menu_config',id:`eq.${companyId}`,limit:1}));
      return json(res,200,{success:true,data:row?.menu_config||null});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/menu-config' && req.method === 'PATCH') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body = await bodyJson(req);
      if (!body.config || typeof body.config !== 'object' || !Array.isArray(body.config.items)) return json(res,400,{success:false,error:'إعدادات القائمة غير صالحة'});
      const companyId = await resolveCompanyId(user);
      const current = firstRow(await dbSelect('companies',{select:'menu_config',id:`eq.${companyId}`,limit:1}));
      const config = {version:1,items:body.config.items,pageOverrides:body.config.pageOverrides||{},system_timezone:normalizeSystemTimeZone(current?.menu_config?.system_timezone || SYSTEM_TIME_ZONE)};
      await dbUpdate('companies',{id:`eq.${companyId}`},{menu_config:config});
      await audit(user,'update_menu_config','company',companyId,{items:config.items.length});
      return json(res,200,{success:true,data:config});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/menu-config' && req.method === 'DELETE') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      await dbUpdate('companies',{id:`eq.${companyId}`},{menu_config:{system_timezone:SYSTEM_TIME_ZONE}});
      await audit(user,'reset_menu_config','company',companyId,{});
      return json(res,200,{success:true,data:null});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/system-timezone' && req.method === 'GET') {
    const user = await requireAuth(req, res); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const row = firstRow(await dbSelect('companies',{select:'menu_config',id:`eq.${companyId}`,limit:1}));
      const timezone = normalizeSystemTimeZone(row?.menu_config?.system_timezone || SYSTEM_TIME_ZONE);
      SYSTEM_TIME_ZONE = timezone;
      return json(res,200,{success:true,data:{timezone,options:[{value:'Africa/Cairo',label:'Egypt — Cairo'},{value:'Asia/Dubai',label:'UAE — Dubai'}]}});
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/system-timezone' && req.method === 'PATCH') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body = await bodyJson(req);
      const timezone = String(body.timezone || '').trim();
      if (!SUPPORTED_SYSTEM_TIME_ZONES.has(timezone)) return json(res,400,{success:false,error:'اختيار المنطقة الزمنية غير صالح'});
      const companyId = await resolveCompanyId(user);
      let persisted = true;
      try {
        const row = firstRow(await dbSelect('companies',{select:'menu_config',id:`eq.${companyId}`,limit:1}));
        const current = row?.menu_config && typeof row.menu_config === 'object' ? row.menu_config : {};
        const config = {...current,system_timezone:timezone};
        await dbUpdate('companies',{id:`eq.${companyId}`},{menu_config:config});
      } catch (dbError) {
        // Older production schemas may not have companies.menu_config yet.
        // Apply the timezone for this running process instead of failing the Settings action.
        const message = String(dbError?.message || dbError);
        if (!/menu_config|column .* does not exist|schema cache|PGRST204/i.test(message)) throw dbError;
        persisted = false;
      }
      SYSTEM_TIME_ZONE = timezone;
      try { await audit(user,'change_system_timezone','company',companyId,{timezone,persisted}); } catch (_) {}
      return json(res,200,{success:true,data:{timezone,persisted},message:persisted?'تم حفظ المنطقة الزمنية للنظام':'تم تطبيق المنطقة الزمنية مؤقتًا؛ يلزم إضافة عمود companies.menu_config لحفظها بعد إعادة تشغيل الخادم'});
    } catch(error) { return json(res,500,{success:false,error:error.message}); }
  }

  // Publicly expose only the company display name and logo needed by the login screen.
  // No company IDs, user data, settings, or other private fields are returned.
  if (pathname === '/api/public/branding' && req.method === 'GET') {
    try {
      const companyId = await getFirstCompanyId();
      const branding = await getCompanyBranding(companyId);
      return json(res, 200, { success: true, data: { name: branding.name, logo_url: branding.logo_url } });
    } catch (error) {
      return json(res, 200, { success: true, data: { name: settings.appName, logo_url: '/trend-logo.jpeg' } });
    }
  }

  if (pathname === '/api/settings/branding' && req.method === 'GET') {
    const user = await requireAuth(req, res); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      return json(res, 200, { success: true, data: await getCompanyBranding(companyId) });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/settings/branding-diagnostic' && req.method === 'GET') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const rows = await dbSelect('companies', {
        select: 'id,display_name,name,logo_url',
        id: `eq.${companyId}`,
        limit: 1
      });
      const row = firstRow(rows);
      const keyMode = !SUPABASE_KEY ? 'missing' : SUPABASE_LEGACY_SERVICE_ROLE_KEY ? 'service_role_jwt' : SUPABASE_KEY.startsWith('sb_secret_') ? 'secret_api_key' : 'publishable_or_anon_key';
      return json(res, 200, {
        success: true,
        build: 'DRIVER-DAILY-CASH-CREDIT-SPLIT-20261017-34',
        company_id: companyId,
        supabase_key_mode: keyMode,
        record_found: !!row,
        company: row ? { id: row.id, display_name: row.display_name || null, name: row.name || null, logo_url: row.logo_url || null } : null,
        note: 'Read-only diagnostic. It does not change company data or bypass database policies.'
      });
    } catch (error) {
      return json(res, 500, { success: false, build: 'DRIVER-DAILY-CASH-CREDIT-SPLIT-20261017-34', error: error.message });
    }
  }

  if (pathname === '/api/settings/company-name' && req.method === 'PATCH') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body = await bodyJson(req);
      if (!await verifyAdminCredential(user, body.admin_password)) return json(res,401,{success:false,error:'كلمة مرور/PIN المدير غير صحيحة'});
      const name = cleanString(body.name);
      if (!name) return json(res, 400, { success:false, error:'اسم الشركة مطلوب' });
      const companyId = await resolveCompanyId(user);
      // Keep both company-name fields synchronized: older code paths/schema consumers may read `name`, while the branding UI prefers `display_name`.
      const updated = firstRow(await dbUpdate('companies', { id:`eq.${companyId}` }, { display_name:name, name }));
      if (!updated) throw new Error('لم يتم حفظ اسم الشركة في قاعدة البيانات. لم يتم العثور على سجل الشركة المطلوب تحديثه؛ تحقق من company_id وسياسات RLS.');
      // Verify against a fresh direct row read, and do not hide database read errors behind the UI fallback.
      const verifyRows = await dbSelect('companies', { select:'id,display_name,name', id:`eq.${companyId}`, limit:1 });
      const verifyRow = firstRow(verifyRows);
      if (!verifyRow) throw new Error('تم إرسال التحديث لكن تعذرت إعادة قراءة سجل الشركة بعد الحفظ. تحقق من سياسات القراءة RLS وcompany_id.');
      const persistedName = cleanString(verifyRow.display_name || verifyRow.name);
      if (persistedName !== name) throw new Error(`تم إرسال التحديث لكن الاسم المخزن مختلف. القيمة المطلوبة: ${name}؛ القيمة المقروءة: ${persistedName || '(فارغ)'}. راجع سياسات الكتابة أو مشغلات قاعدة البيانات.`);
      const persisted = await getCompanyBranding(companyId);
      await audit(user,'change_company_name','company',companyId,{name});
      return json(res,200,{success:true,data:persisted,message:'تم حفظ اسم الشركة والتحقق منه'});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/company-logo' && req.method === 'POST') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body = await bodyJson(req);
      if (!await verifyAdminCredential(user, body.admin_password)) return json(res,401,{success:false,error:'كلمة مرور/PIN المدير غير صحيحة'});
      const raw = String(body.data || '');
      const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) return json(res,400,{success:false,error:'ملف اللوجو غير صالح'});
      const contentType = match[1].toLowerCase();
      if (!['image/png','image/jpeg','image/webp'].includes(contentType)) return json(res,400,{success:false,error:'اللوجو يجب أن يكون PNG أو JPG أو WEBP'});
      const buffer = Buffer.from(match[2],'base64');
      if (buffer.length > 2*1024*1024) return json(res,400,{success:false,error:'حجم اللوجو يجب ألا يتجاوز 2MB'});
      const companyId = await resolveCompanyId(user);
      const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const objectPath = `${companyId}/logo-${Date.now()}.${ext}`;
      await storageUpload('company-branding',objectPath,buffer,contentType);
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/company-branding/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
      let updatedRows;
      try {
        updatedRows = await dbUpdate('companies',{id:`eq.${companyId}`},{logo_url:publicUrl});
      } catch (dbError) {
        throw new Error(`تم رفع ملف اللوجو إلى التخزين، لكن قاعدة البيانات رفضت حفظ الرابط: ${dbError.message}. تحقق من مفتاح Supabase المستخدم على الخادم وسياسات UPDATE وRLS لجدول companies.`);
      }
      const updated = firstRow(updatedRows);
      if (!updated) {
        throw new Error('تم رفع ملف اللوجو، لكن تحديث سجل companies لم يُرجع أي صف. غالبًا company_id لا يطابق سجلًا قابلًا للتعديل أو أن صلاحيات UPDATE/RLS تمنع التعديل. لم يتم تأكيد حفظ الرابط.');
      }
      // Read the exact database column directly; the UI fallback in getCompanyBranding must not mask verification errors.
      let verifyRows;
      try {
        verifyRows = await dbSelect('companies',{select:'id,logo_url',id:`eq.${companyId}`,limit:1});
      } catch (readError) {
        throw new Error(`تم رفع اللوجو وإرسال تحديث الرابط، لكن تعذرت قراءة companies.logo_url للتحقق: ${readError.message}. راجع صلاحيات SELECT/RLS.`);
      }
      const verifyRow = firstRow(verifyRows);
      if (!verifyRow) throw new Error('تم رفع اللوجو، لكن لم يُعثر على سجل الشركة عند التحقق. راجع company_id وسياسات SELECT/RLS.');
      if (cleanString(verifyRow.logo_url) !== publicUrl) {
        throw new Error(`تم رفع اللوجو لكن الرابط المخزن مختلف عن الرابط الجديد. المتوقع: ${publicUrl}؛ المقروء: ${cleanString(verifyRow.logo_url) || '(فارغ)'}. راجع سياسات UPDATE/RLS أو أي trigger يعدل logo_url.`);
      }
      const persisted = await getCompanyBranding(companyId);
      await audit(user,'change_company_logo','company',companyId,{storage_path:objectPath});
      return json(res,200,{success:true,data:persisted,message:'تم حفظ اللوجو والتحقق من رابط قاعدة البيانات'});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/verify-admin' && req.method === 'POST') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body = await bodyJson(req);
      if (!await verifyAdminCredential(user, String(body.admin_password || ''))) return json(res,401,{success:false,error:'كلمة مرور/PIN المدير غير صحيحة'});
      return json(res,200,{success:true});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/change-password' && req.method === 'POST') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body = await bodyJson(req);
      const current = String(body.current_password || '');
      const next = String(body.new_password || '');
      const confirm = String(body.confirm_password || '');
      if (!current || !next || !confirm) return json(res,400,{success:false,error:'كلمة المرور الحالية والجديدة والتأكيد مطلوبة'});
      if (next.length < 6) return json(res,400,{success:false,error:'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'});
      if (next !== confirm) return json(res,400,{success:false,error:'كلمة المرور الجديدة والتأكيد غير متطابقين'});
      if (!await verifyAdminCredential(user,current)) return json(res,401,{success:false,error:'كلمة المرور الحالية غير صحيحة'});
      const companyId = await resolveCompanyId(user);
      const passwordHash = hashPassword(next);
      if (user.id === 'env-admin') {
        await dbUpdate('companies',{id:`eq.${companyId}`},{admin_password_hash:passwordHash});
      } else {
        await dbUpdate('users',{id:`eq.${user.id}`,company_id:`eq.${companyId}`},{password_hash:passwordHash});
      }
      // Invalidate all existing sessions for this admin/user immediately.
      for (const [sessionToken, session] of sessions.entries()) {
        if (String(session.user?.id) === String(user.id)) sessions.delete(sessionToken);
      }
      await audit(user,'change_admin_password','user',user.id,{});
      return json(res,200,{success:true});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/delete-order' && req.method === 'POST') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body=await bodyJson(req); const companyId=await resolveCompanyId(user);
      const q=cleanString(body.query);
      if(body.confirm && !(await verifyAdminCredential(user, body.admin_password))) return json(res,401,{success:false,error:'كلمة مرور/PIN المدير غير صحيحة'});
      if(!q && !Array.isArray(body.order_ids)) return json(res,400,{success:false,error:'Tracking Number أو Order No. مطلوب'});
      const orders=await dbSelect('orders',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit:20000});
      const shipments=await dbSelect('shipments',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]);
      const merchants=await dbSelect('merchants',{select:'id,name,merchant_no,code',company_id:`eq.${companyId}`,limit:10000}).catch(()=>[]);
      const merchantMap=new Map((merchants||[]).map(m=>[String(m.id),m]));
      const norm=v=>String(v??'').trim().toLowerCase(); const n=norm(q);
      const matches=q ? (orders||[]).filter(o=>norm(o.order_no)===n || norm(o.merchant_order_no)===n || shipments.some(sh=>String(sh.order_id)===String(o.id)&&norm(sh.tracking_number)===n)) : [];
      const enriched=matches.map(o=>{const sh=(shipments||[]).find(x=>String(x.order_id)===String(o.id));const m=merchantMap.get(String(o.merchant_id||''))||{};return {id:o.id,order_no:o.order_no||o.merchant_order_no||'',merchant_order_no:o.merchant_order_no||'',tracking_number:sh?.tracking_number||o.tracking_number||'',customer_name:o.customer_name||'',customer_phone:o.customer_phone||'',status:o.status||'',merchant_id:o.merchant_id||null,merchant_name:m.name||'',merchant_no:m.merchant_no||m.code||'',created_at:o.created_at||''};});
      if(!body.confirm) {
        if(matches.length===0) return json(res,404,{success:false,error:'لم يتم العثور على أوردر مطابق'});
        return json(res,200,{success:true,requires_selection:enriched.length>1,results:enriched});
      }

      const requestedIds=[...new Set((Array.isArray(body.order_ids)?body.order_ids:[body.order_id]).map(x=>cleanString(x)).filter(Boolean))];
      if(!requestedIds.length) return json(res,400,{success:false,error:'يجب اختيار أوردر واحد على الأقل قبل الحذف'});
      const targets=requestedIds.map(id=>(orders||[]).find(o=>String(o.id)===String(id))).filter(Boolean).filter(o=>String(o.company_id)===String(companyId));
      if(targets.length!==requestedIds.length) return json(res,400,{success:false,error:'يوجد أوردر محدد غير صالح أو غير تابع للشركة'});

      const deletedIds=[];
      for(const target of targets){
        const id=String(target.id); const targetShipments=(shipments||[]).filter(x=>String(x.order_id)===id); const sh=targetShipments[0]||null;
        // Keep a complete snapshot before removing the order from active tables.
        // Active searches will no longer see it, while the Settings archive can restore it.
        const related={};
        const shipmentIds=targetShipments.map(x=>String(x.id));
        const returnRows=await dbSelect('return_transactions',{select:'*',order_id:`eq.${id}`,company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]);
        const relatedSpecs=[
          ['delivery_job_orders',{order_id:`eq.${id}`,company_id:`eq.${companyId}`}],
          ['return_orders',{order_id:`eq.${id}`,company_id:`eq.${companyId}`}],
          ['order_history',{order_id:`eq.${id}`,company_id:`eq.${companyId}`}],
          ['return_transactions',{order_id:`eq.${id}`,company_id:`eq.${companyId}`}]
        ];
        for(const sid of shipmentIds){relatedSpecs.push(['delivery_job_shipments',{shipment_id:`eq.${sid}`}],['shipment_status_history',{shipment_id:`eq.${sid}`}]);}
        for(const rt of returnRows||[]) relatedSpecs.push(['return_transaction_attachments',{return_transaction_id:`eq.${rt.id}`,company_id:`eq.${companyId}`}]);
        for(const [table,filters] of relatedSpecs){try{const rows=await dbSelect(table,{select:'*',...filters,limit:5000});if(rows?.length)related[table]=[...(related[table]||[]),...rows];}catch(_){}}
        const archivePayload={company_id:companyId,original_order_id:id,order_no:target.order_no||target.merchant_order_no||'',tracking_number:sh?.tracking_number||target.tracking_number||'',merchant_name:merchantMap.get(String(target.merchant_id||''))?.name||'',customer_name:target.customer_name||'',customer_phone:target.customer_phone||'',status:target.status||'',order_data:target,shipments_data:targetShipments,related_data:related,deleted_by:user.id==='env-admin'?null:user.id,deleted_at:new Date().toISOString()};
        let archive;
        try{archive=firstRow(await dbInsert('deleted_orders',archivePayload));}catch(e){return json(res,500,{success:false,error:'تعذر حفظ نسخة الأوردر في الأرشيف. لم يتم حذفه. شغّل ملف deleted-orders-migration.sql في Supabase ثم أعد المحاولة. '+e.message,deleted_ids:deletedIds});}
        try{
          await audit(user,'archive_order','order',id,{archive_id:archive?.id,order:target,shipment:sh||null,query:q});
          for(const table of ['delivery_job_orders','return_orders','order_history']) { try { await supabaseRequest(table,{method:'DELETE',query:{order_id:`eq.${id}`,company_id:`eq.${companyId}`},returning:false}); } catch(_){} }
          for(const rt of returnRows||[]) { try { await supabaseRequest('return_transaction_attachments',{method:'DELETE',query:{return_transaction_id:`eq.${rt.id}`,company_id:`eq.${companyId}`},returning:false}); } catch(_) {} }
          try { await supabaseRequest('return_transactions',{method:'DELETE',query:{order_id:`eq.${id}`,company_id:`eq.${companyId}`},returning:false}); } catch(_) {}
          for(const sid of shipmentIds){ for(const table of ['delivery_job_shipments','shipment_status_history']) { try { await supabaseRequest(table,{method:'DELETE',query:{shipment_id:`eq.${sid}`},returning:false}); } catch(_){} } }
          await supabaseRequest('shipments',{method:'DELETE',query:{order_id:`eq.${id}`,company_id:`eq.${companyId}`},returning:false});
          await supabaseRequest('orders',{method:'DELETE',query:{id:`eq.${id}`,company_id:`eq.${companyId}`},returning:false});
          deletedIds.push(id);
        }catch(e){if(archive?.id)try{await dbDelete('deleted_orders',{id:`eq.${archive.id}`,company_id:`eq.${companyId}`});}catch(_){}return json(res,500,{success:false,error:'تعذر نقل الأوردر للأرشيف: '+e.message,deleted_ids:deletedIds});}
      }
      return json(res,200,{success:true,archived_ids:deletedIds,deleted_ids:deletedIds,deleted_count:deletedIds.length});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/settings/deleted-orders' && req.method === 'GET') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const companyId=await resolveCompanyId(user); const q=cleanString(url.searchParams.get('q')).toLowerCase();
      const rows=await dbSelect('deleted_orders',{select:'id,company_id,original_order_id,order_no,tracking_number,merchant_name,customer_name,customer_phone,status,deleted_at',company_id:`eq.${companyId}`,order:'deleted_at.desc',limit:10000});
      const filtered=(rows||[]).filter(r=>!q||[r.order_no,r.tracking_number,r.merchant_name,r.customer_name,r.customer_phone,r.status].some(v=>String(v||'').toLowerCase().includes(q)));
      return json(res,200,{success:true,data:filtered.map(r=>({...r,order_data:undefined,shipments_data:undefined,related_data:undefined})),count:filtered.length});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/settings/deleted-orders/restore' && req.method === 'POST') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body=await bodyJson(req); const companyId=await resolveCompanyId(user);
      if(!await verifyAdminCredential(user,body.admin_password)) return json(res,401,{success:false,error:'كلمة مرور/PIN المدير غير صحيحة'});
      const archive=firstRow(await dbSelect('deleted_orders',{select:'*',id:`eq.${cleanString(body.archive_id)}`,company_id:`eq.${companyId}`,limit:1}));
      if(!archive)return json(res,404,{success:false,error:'الأوردر غير موجود في الأرشيف'});
      const existing=firstRow(await dbSelect('orders',{select:'id',id:`eq.${archive.original_order_id}`,company_id:`eq.${companyId}`,limit:1}).catch(()=>[]));
      if(existing)return json(res,409,{success:false,error:'الأوردر موجود بالفعل في النظام؛ لم يتم استرجاعه'});
      const inserted=[];
      try{
        await dbInsert('orders',archive.order_data); inserted.push('orders');
        for(const row of (archive.shipments_data||[])){await dbInsert('shipments',row);}
        inserted.push('shipments');
        const related=archive.related_data||{};
        const orderTables=['return_transactions','delivery_job_orders','return_orders','order_history','delivery_job_shipments','shipment_status_history','return_transaction_attachments'];
        for(const table of orderTables){for(const row of (related[table]||[])){await dbInsert(table,row,{prefer:'return=minimal'});}}
      }catch(restoreError){
        // Best-effort rollback avoids leaving a partially restored order in active search.
        for(const sid of (archive.shipments_data||[]).map(x=>x.id).filter(Boolean)){try{await dbDelete('shipments',{id:`eq.${sid}`,company_id:`eq.${companyId}`});}catch(_){}}
        try{await dbDelete('orders',{id:`eq.${archive.original_order_id}`,company_id:`eq.${companyId}`});}catch(_){}
        return json(res,500,{success:false,error:'تعذر استرجاع الأوردر بالكامل: '+restoreError.message+' — النسخة ما زالت محفوظة في الأرشيف.'});
      }
      await dbDelete('deleted_orders',{id:`eq.${archive.id}`,company_id:`eq.${companyId}`});
      await audit(user,'restore_deleted_order','order',archive.original_order_id,{archive_id:archive.id,order_no:archive.order_no});
      return json(res,200,{success:true,restored_order_id:archive.original_order_id});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/settings/deleted-orders/permanent' && req.method === 'POST') {
    const user = await requireAdmin(req, res); if (!user) return;
    try {
      const body=await bodyJson(req); const companyId=await resolveCompanyId(user);
      if(!await verifyAdminCredential(user,body.admin_password)) return json(res,401,{success:false,error:'كلمة مرور/PIN المدير غير صحيحة'});
      const archive=firstRow(await dbSelect('deleted_orders',{select:'id,original_order_id,order_no',id:`eq.${cleanString(body.archive_id)}`,company_id:`eq.${companyId}`,limit:1}));
      if(!archive)return json(res,404,{success:false,error:'الأوردر غير موجود في الأرشيف'});
      await dbDelete('deleted_orders',{id:`eq.${archive.id}`,company_id:`eq.${companyId}`});
      await audit(user,'permanently_delete_archived_order','order',archive.original_order_id,{archive_id:archive.id,order_no:archive.order_no});
      return json(res,200,{success:true});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/accounting/summary' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      // The Orders counter is for orders ENTERED on the selected local day.
      // Financial totals are intentionally separate: they only include orders
      // whose cash collection/accounting status has been closed as Paid.
      const requestedDate = String(url.searchParams.get('date') || egyptTodayISO());
      const tzOffset = Number(url.searchParams.get('tz'));
      const safeOffset = Number.isFinite(tzOffset) && Math.abs(tzOffset) <= 840 ? Math.trunc(tzOffset) : 0;
      const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : egyptTodayISO();
      const sign = safeOffset <= 0 ? '+' : '-';
      const absOffset = Math.abs(safeOffset);
      const hh = String(Math.floor(absOffset / 60)).padStart(2,'0');
      const mm = String(absOffset % 60).padStart(2,'0');
      const offsetText = `${sign}${hh}:${mm}`;
      const start = new Date(`${dateMatch}T00:00:00${offsetText}`);
      const end = new Date(start.getTime() + 86400000);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      // Load the relevant accounting fields for all company orders, then filter by
      // local-day timestamps. Older records can be paid today through a legacy
      // payment field and may not have cash_collected_at populated.
      const allRelevantOrders = await dbSelect('orders', { select: '*', company_id: `eq.${companyId}`, order: 'created_at.desc', limit: 20000 });
      const [counterShipments, counterJobs, counterJobLinks] = await Promise.all([
        dbSelect('shipments',{select:'id,order_id,delivered_at,created_at,company_id',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('delivery_jobs',{select:'*',company_id:`eq.${companyId}`,limit:20000}).catch(()=>[]),
        dbSelect('delivery_job_shipments',{select:'delivery_job_id,shipment_id',limit:50000}).catch(()=>[])
      ]);
      const counterJobById=new Map((counterJobs||[]).map(j=>[String(j.id),j]));
      const counterLatestJobByShipment=new Map();
      for(const link of counterJobLinks||[]){
        const job=counterJobById.get(String(link.delivery_job_id||'')), sid=String(link.shipment_id||'');
        if(!job||!sid)continue;
        const previous=counterLatestJobByShipment.get(sid);
        const stamp=String(job.job_date||job.delivery_date||job.date||job.created_at||'');
        const previousStamp=String(previous?.job_date||previous?.delivery_date||previous?.date||previous?.created_at||'');
        if(!previous||stamp>previousStamp)counterLatestJobByShipment.set(sid,job);
      }
      const counterShipmentByOrder=new Map((counterShipments||[]).map(sh=>[String(sh.order_id||''),sh]));
      // Match the Daily Company Report and Driver Account: financial counters follow
      // the statement/Delivery Job day, not order creation or an unrelated updated_at.
      const counterStatementDay=o=>{
        const sh=counterShipmentByOrder.get(String(o.id||''));
        const job=counterLatestJobByShipment.get(String(sh?.id||''));
        return accountingDay(job?.job_date||job?.delivery_date||job?.date||o.actual_delivery_date||o.delivery_date||o.delivered_at||sh?.delivered_at||o.created_at||'');
      };
      const isDriverAccountPaid = o => [o.commission_paid_status,o.cash_collection_status,o.paid_status,o.payment_status,o.commission_payment_status]
        .some(value => String(value || '').trim().toLowerCase() === 'paid');
      const dayOrders = allRelevantOrders.filter(o => {
        const ts = new Date(o.created_at || 0).getTime();
        return Number.isFinite(ts) && ts >= start.getTime() && ts < end.getTime();
      });
      const paidOrders = allRelevantOrders.filter(o => isDriverAccountPaid(o) && counterStatementDay(o) === dateMatch);
      const totalOrders = dayOrders.length;
      const firstPositive = (...values) => {
        for (const value of values) { const amount=cleanNumber(value); if (amount>0) return amount; }
        return 0;
      };
      const orderStatusKey = o => commissionStatusKey(o.status);
      const isCancelledPaidOrder = o => ['cancelled by shipper','cancelled by receiver'].includes(orderStatusKey(o));
      const orderValue = paidOrders.reduce((s, x) => s + (isCancelledPaidOrder(x) ? 0 : firstPositive(x.cod,x.value,x.order_value,x.price)), 0);
      const deliveryFees = paidOrders.reduce((s, x) => s + firstPositive(x.service_charges,x.service_charge,x.delivery_fee,x.delivery_charge,x.shipping_fee), 0);
      const taxes = paidOrders.reduce((s, x) => s + (isCancelledPaidOrder(x) ? 0 : firstPositive(x.tax_amount,x.tax,x.vat_amount)), 0);
      const merchantNet = paidOrders.reduce((s, x) => s + (isCancelledPaidOrder(x) ? 0 : Math.max(0, (isCancelledPaidOrder(x)?0:firstPositive(x.cod,x.value,x.order_value,x.price))-firstPositive(x.tax_amount,x.tax,x.vat_amount)-firstPositive(x.service_charges,x.service_charge,x.delivery_fee,x.delivery_charge,x.shipping_fee))), 0);
      const cashOrders = paidOrders.filter(x => cleanNumber(x.cash_collected_amount) > 0 || String(x.collection_method || '').toLowerCase().includes('cash')).length;
      const creditOrders = paidOrders.filter(x => cleanNumber(x.credit_collected_amount) > 0 || String(x.collection_method || '').toLowerCase().includes('credit')).length;
      return json(res, 200, { success: true, data: {
        totalOrders, orderValue, deliveryFees, taxes, merchantNet, companyDue: deliveryFees + taxes,
        paidOrders: paidOrders.length, cashOrders, creditOrders,
        accountingDate: dateMatch
      } });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/transactions' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting');
    if (!user) return;
    try {
      return json(res, 200, { success: true, data: await getRows('transactions', user) });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  // Accounting-specific driver expense management used by Driver Account.
  // Kept separate from the legacy /api/expenses permission so Accounting users
  // can manage driver expenses directly from the Driver Account page.
  if (pathname === '/api/accounting/driver-expenses' && req.method === 'GET') {
    const user = await requireRole(req, res, 'accounting');
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const driverId = cleanString(url.searchParams.get('driver_id'));
      const from = cleanString(url.searchParams.get('from'));
      const to = cleanString(url.searchParams.get('to'));
      const query = { select: '*', company_id: `eq.${companyId}`, order: 'expense_date.desc,created_at.desc', limit: 10000 };
      if (driverId) query.driver_id = `eq.${driverId}`;
      if (from) query.expense_date = `gte.${from}`;
      if (to) query.expense_date = query.expense_date ? `${query.expense_date}&expense_date=lte.${to}` : `lte.${to}`;
      let data = await dbSelect('expenses', { select: '*', company_id: `eq.${companyId}`, ...(driverId ? {driver_id:`eq.${driverId}`} : {}), order:'expense_date.desc,created_at.desc', limit:10000 });
      if (from || to) data = data.filter(x => {
        const day = String(x.expense_date || x.created_at || '').slice(0,10);
        return Boolean(day) && (!from || day >= from) && (!to || day <= to);
      });
      // Expense records store driver_id; enrich them with the real driver name/code
      // so the UI never falls back to displaying a UUID as the driver's name.
      const driverRows = await dbSelect('drivers', { select:'id,name,driver_no', company_id:`eq.${companyId}`, limit:5000 }).catch(() => []);
      const driverById = new Map((driverRows || []).map(d => [String(d.id), d]));
      const driverIds = [...new Set(data.map(e => String(e.driver_id || '')).filter(Boolean))];
      const settlementRows = driverIds.length ? await dbSelect('driver_settlements', { select:'driver_id,paid_at,created_at,notes', company_id:`eq.${companyId}`, limit:20000 }).catch(() => []) : [];
      // A settlement row alone must not permanently lock an expense. The lock
      // follows the current Paid state of the orders linked to that settlement,
      // so reverting an order to Unpaid restores the expense controls.
      const paidOrderRows = driverIds.length ? await dbSelect('orders', { select:'id,driver_id,commission_paid_status,commission_paid_at', company_id:`eq.${companyId}`, limit:50000 }).catch(() => []) : [];
      const paidOrderById = new Map((paidOrderRows || []).map(o => [String(o.id), o]));
      const settlementStillPaid = st => {
        const note = String(st.notes || '');
        if (!note.startsWith('TDS_DRIVER_SETTLEMENT|')) return false;
        const ids = (note.split('|')[2] || '').split(',').map(id => id.trim()).filter(Boolean);
        // Any order reverted to Unpaid releases the expense controls.
        return ids.length > 0 && ids.every(id => {
          const order = paidOrderById.get(id);
          return order && (String(order.commission_paid_status || '').trim() ? String(order.commission_paid_status || '').trim().toLowerCase() === 'paid' : Boolean(order.commission_paid_at));
        });
      };
      const isExpenseLocked = expense => {
        const day = String(expense.expense_date || expense.created_at || '').slice(0,10);
        if (!day) return false;
        return settlementRows.some(st => String(st.driver_id || '') === String(expense.driver_id || '') && String(st.paid_at || st.created_at || '').slice(0,10) === day && settlementStillPaid(st));
      };
      data = data.map(expense => {
        const driver = driverById.get(String(expense.driver_id || ''));
        const locked = isExpenseLocked(expense);
        return { ...expense, driver_name: driver?.name || expense.driver_name || '', driver_no: driver?.driver_no || expense.driver_no || '', can_edit: !locked, edit_locked_reason: locked ? 'تمت تسوية كشف المندوب المرتبط بالأوردرات المدفوعة' : '' };
      });
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/accounting/driver-expenses' && req.method === 'POST') {
    const user = await requireRole(req, res, 'accounting');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const driverId = cleanString(body.driver_id);
      const amount = cleanNumber(body.amount);
      if (!driverId) return json(res, 400, { success:false, error:'المندوب مطلوب' });
      if (amount <= 0) return json(res, 400, { success:false, error:'مبلغ المصروف يجب أن يكون أكبر من صفر' });
      const driver = firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${driverId}`,company_id:`eq.${companyId}`,limit:1}));
      if (!driver) return json(res,404,{success:false,error:'المندوب غير موجود'});
      const category = String(body.category||'expense').toLowerCase()==='shortage' ? 'shortage' : 'expense';
      const row = {
        company_id: companyId,
        driver_id: driverId,
        expense_type: cleanString(body.expense_type) || 'other',
        category,
        amount,
        expense_date: cleanString(body.expense_date) || egyptTodayISO(),
        details: cleanString(body.details) || null,
        notes: cleanString(body.notes) || null,
        employee_id: user.id === 'env-admin' ? null : user.id
      };
      const data = firstRow(await dbInsert('expenses', row));
      await audit(user,'create_driver_account_expense','expense',data?.id||null,{...row,driver_name:driver.name,driver_no:driver.driver_no});
      return json(res,200,{success:true,data});
    } catch(error) {
      return json(res,500,{success:false,error:error.message});
    }
  }

  if (pathname === '/api/accounting/driver-expenses' && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const user = await requireRole(req, res, 'accounting');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const id = cleanString(body.id);
      if (!id) return json(res,400,{success:false,error:'معرّف المصروف مطلوب'});
      const before = firstRow(await dbSelect('expenses',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if (!before) return json(res,404,{success:false,error:'المصروف غير موجود'});
      {
        const day = String(before.expense_date || before.created_at || '').slice(0,10);
        const [settlements, linkedOrders] = await Promise.all([
          dbSelect('driver_settlements',{select:'driver_id,paid_at,created_at,notes',company_id:`eq.${companyId}`,driver_id:`eq.${before.driver_id}`,limit:10000}).catch(()=>[]),
          dbSelect('orders',{select:'id,commission_paid_status,commission_paid_at',company_id:`eq.${companyId}`,driver_id:`eq.${before.driver_id}`,limit:50000}).catch(()=>[])
        ]);
        const paidOrderById = new Map((linkedOrders || []).map(o => [String(o.id), o]));
        const settlementStillPaid = st => {
          const note = String(st.notes || '');
          if (!note.startsWith('TDS_DRIVER_SETTLEMENT|')) return false;
          const ids = (note.split('|')[2] || '').split(',').map(v => v.trim()).filter(Boolean);
          // Reverting any order to Unpaid restores the expense controls.
          return ids.length > 0 && ids.every(orderId => {
            const order = paidOrderById.get(orderId);
            return order && (String(order.commission_paid_status || '').trim() ? String(order.commission_paid_status || '').trim().toLowerCase() === 'paid' : Boolean(order.commission_paid_at));
          });
        };
        const locked = Boolean(day) && settlements.some(st => String(st.paid_at||st.created_at||'').slice(0,10) === day && settlementStillPaid(st));
        if (locked) return json(res,409,{success:false,error:'لا يمكن تعديل أو حذف المصروف أثناء وجود أوردرات مدفوعة في تسوية المندوب'});
      }
      if (req.method === 'DELETE') {
        await supabaseRequest('expenses',{method:'DELETE',query:{id:`eq.${id}`,company_id:`eq.${companyId}`},prefer:'return=minimal'});
        await audit(user,'delete_driver_account_expense','expense',id,{before});
        return json(res,200,{success:true});
      }
      // PATCH is intentionally partial: expense edits may change category/details only.
      // Keep the stored amount and all other fields unchanged when they are not supplied.
      const driverId = cleanString(body.driver_id) || before.driver_id;
      const driver = firstRow(await dbSelect('drivers',{select:'id,name,driver_no',id:`eq.${driverId}`,company_id:`eq.${companyId}`,limit:1}));
      if (!driver) return json(res,404,{success:false,error:'المندوب غير موجود'});
      const patch={
        driver_id: driverId,
        expense_type: Object.prototype.hasOwnProperty.call(body,'expense_type') ? (cleanString(body.expense_type)||'other') : (before.expense_type||'other'),
        category: String(body.category ?? before.category ?? 'expense').toLowerCase()==='shortage'?'shortage':'expense',
        amount: Object.prototype.hasOwnProperty.call(body,'amount') ? cleanNumber(body.amount) : cleanNumber(before.amount),
        expense_date: Object.prototype.hasOwnProperty.call(body,'expense_date') ? (cleanString(body.expense_date)||before.expense_date) : before.expense_date,
        details: Object.prototype.hasOwnProperty.call(body,'details') ? (cleanString(body.details)||null) : (before.details||null),
        notes: Object.prototype.hasOwnProperty.call(body,'notes') ? (cleanString(body.notes)||null) : (before.notes||null)
      };
      if (patch.amount <= 0) return json(res,400,{success:false,error:'مبلغ المصروف يجب أن يكون أكبر من صفر'});
      const data=firstRow(await dbUpdate('expenses',{id:`eq.${id}`,company_id:`eq.${companyId}`},patch));
      await audit(user,'update_driver_account_expense','expense',id,{before,after:patch,driver_name:driver.name,driver_no:driver.driver_no});
      return json(res,200,{success:true,data});
    } catch(error) {
      return json(res,500,{success:false,error:error.message});
    }
  }

  if (pathname === '/api/expenses' && req.method === 'GET') {
    const user = await requireRole(req, res, 'expenses');
    if (!user) return;
    try {
      return json(res, 200, { success: true, data: await getRows('expenses', user) });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/expenses' && req.method === 'POST') {
    const user = await requireRole(req, res, 'expenses');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const row = {
        company_id: companyId,
        driver_id: body.driver_id || null,
        expense_type: cleanString(body.expense_type) || 'other',
        category: cleanString(body.category).toLowerCase() === 'shortage' ? 'shortage' : 'expense',
        amount: cleanNumber(body.amount),
        expense_date: body.expense_date || egyptTodayISO(),
        notes: cleanString(body.notes) || null,
        details: cleanString(body.details) || null,
        employee_id: user.id === 'env-admin' ? null : user.id
      };
      const data = firstRow(await dbInsert('expenses', row));
      await audit(user, 'create_expense', 'expense', data?.id || null, row);
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/expenses' && (req.method === 'PATCH' || req.method === 'DELETE')) {
    const user = await requireRole(req, res, 'expenses'); if (!user) return;
    try {
      const body = await bodyJson(req); const companyId = await resolveCompanyId(user); const id = body.id;
      if (!id) return json(res,400,{success:false,error:'معرّف المصروف مطلوب'});
      const before = firstRow(await dbSelect('expenses',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!before)return json(res,404,{success:false,error:'المصروف غير موجود'});
      if(req.method==='DELETE'){
        await supabaseRequest('expenses',{method:'DELETE',query:{id:`eq.${id}`,company_id:`eq.${companyId}`},prefer:'return=minimal'});
        await audit(user,'delete_expense','expense',id,{before});
        return json(res,200,{success:true});
      }
      const patch={expense_type:cleanString(body.expense_type)||before.expense_type,category:cleanString(body.category).toLowerCase()==='shortage'?'shortage':'expense',amount:cleanNumber(body.amount),expense_date:body.expense_date||before.expense_date,details:cleanString(body.details)||null,notes:cleanString(body.notes)||null};
      const data=firstRow(await dbUpdate('expenses',{id:`eq.${id}`,company_id:`eq.${companyId}`},patch));
      await audit(user,'update_expense','expense',id,{before,after:patch});
      return json(res,200,{success:true,data});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/audit' && req.method === 'GET') {
    const user = await requireRole(req, res, 'audit');
    if (!user) return;
    try {
      return json(res, 200, { success: true, data: await getRows('audit_logs', user) });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/users' && req.method === 'GET') {
    const user = await requireRole(req, res, 'users');
    if (!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const rows = await dbSelect('users', {
        select: 'id,company_id,name,username,email,language,active,employee_code,created_at',
        company_id: `eq.${companyId}`,
        order: 'created_at.desc',
        limit: 500
      });
      const [roles, userRoles] = await Promise.all([
        dbSelect('roles',{select:'id,name',company_id:`eq.${companyId}`,limit:5000}).catch(()=>[]),
        dbSelect('user_roles',{select:'user_id,role_id',limit:10000}).catch(()=>[])
      ]);
      const roleMap = new Map((roles||[]).map(r=>[String(r.id),String(r.name||'')]));
      const userRoleMap = new Map((userRoles||[]).map(ur=>[String(ur.user_id),roleMap.get(String(ur.role_id))||'']));
      const data=[];
      for(const row of rows||[]) {
        const code=await ensureEmployeeCode(row,companyId);
        const role=userRoleMap.get(String(row.id))||'employee';
        const effectivePermissions=await getUserPermissions(row.id,role);
        data.push({...row,employee_code:code,role,effective_permissions:effectivePermissions});
      }
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/users' && req.method === 'POST') {
    const user = await requireRole(req, res, 'users');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      if (['admin','مدير النظام','system admin','administrator'].includes(String(body.role||'').trim().toLowerCase())) return json(res,403,{success:false,error:'مدير النظام مخصص لمالك النظام فقط ولا يمكن تعيينه لأي موظف'});
      const companyId = await resolveCompanyId(user);
      const employeeCode = await nextEmployeeCode(companyId);
      const row = {
        company_id: companyId,
        name: cleanString(body.name),
        username: cleanString(body.username).toLowerCase(),
        email: cleanString(body.email).toLowerCase() || `${cleanString(body.username).toLowerCase()}@username.trend.invalid`,
        password_hash: hashPassword(String(body.password || '')),
        language: body.language || 'ar',
        active: body.active !== false,
        employee_code: employeeCode
      };
      if (!row.name || !row.username || !body.password) return json(res, 400, { success: false, error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
      const duplicateUsername = firstRow(await dbSelect('users',{select:'id',company_id:`eq.${companyId}`,username:`ilike.${row.username}`,limit:1}).catch(()=>[]));
      if (duplicateUsername) return json(res, 409, { success: false, error: 'اسم المستخدم مستخدم بالفعل، اختر اسمًا آخر' });
      const data = firstRow(await dbInsert('users', row));
      if (data?.id) {
        const roleName = cleanString(body.role) || 'employee';
        const role = await ensureRoleRecord(companyId, roleName);
        if (!role?.id) return json(res, 400, { success: false, error: 'الدور المحدد غير موجود' });
        if (!isSystemAdminUser(user) && await roleHasRestrictedIntelligencePermission(role.id)) { await dbDelete('users',{id:`eq.${data.id}`,company_id:`eq.${companyId}`}).catch(()=>{}); return json(res,403,{success:false,error:'هذه المجموعة تحتوي على صلاحيات ذكاء التوصيل التي لا يمنحها إلا مدير النظام'}); }
        // Role assignment is security-critical: do not hide a failed delete,
        // otherwise stale user_roles rows can keep the previous group's permissions.
        await dbDelete('user_roles', { user_id: `eq.${data.id}` });
        await dbInsert('user_roles', { user_id: data.id, role_id: role.id }, { prefer: 'return=minimal' });
        const savedRoleLinks = await dbSelect('user_roles', { select: 'role_id', user_id: `eq.${data.id}`, limit: 10 });
        if (savedRoleLinks.length !== 1 || String(savedRoleLinks[0]?.role_id) !== String(role.id)) {
          throw new Error('تعذر التحقق من حفظ مجموعة صلاحيات الموظف؛ لم يتم تأكيد الربط الصحيح');
        }
      }
      if (String(body.role||'').trim().toLowerCase()==='driver' && data?.id) {
        await syncDriverUsers(companyId);
      }
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }



  const userEditMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userEditMatch && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'users'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user), id = userEditMatch[1];
      const existing = firstRow(await dbSelect('users',{select:'*',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!existing) return json(res,404,{success:false,error:'الموظف غير موجود'});
      const body=await bodyJson(req);
      const patch={};
      for(const key of ['name','username','email','language','active']) if(body[key]!==undefined) patch[key]=key==='username'||key==='email'?cleanString(body[key]).toLowerCase():body[key];
      if(body.password!==undefined && String(body.password||'').length) patch.password_hash=hashPassword(String(body.password));
      if(!patch.name && body.name!==undefined) return json(res,400,{success:false,error:'اسم الموظف مطلوب'});
      if(patch.username!==undefined && !patch.username) return json(res,400,{success:false,error:'اسم المستخدم مطلوب'});
      if(patch.email!==undefined && !patch.email) patch.email=`${String(patch.username||existing.username||id).toLowerCase()}@username.trend.invalid`;
      // employee_code is intentionally never accepted from the client.
      let data=existing;
      if(Object.keys(patch).length) data=firstRow(await dbUpdate('users',{id:`eq.${id}`,company_id:`eq.${companyId}`},patch));
      if (body.active === false) {
        for (const [sessionToken, session] of sessions.entries()) {
          if (String(session.user?.id) === String(id)) sessions.delete(sessionToken);
        }
      }
      if(body.role!==undefined){
        const roleName=cleanString(body.role);
        if (['admin','مدير النظام','system admin','administrator'].includes(roleName.toLowerCase())) return json(res,403,{success:false,error:'مدير النظام مخصص لمالك النظام فقط ولا يمكن تعيينه لأي موظف'});
        const role=await ensureRoleRecord(companyId, roleName);
        if(!role) return json(res,400,{success:false,error:'الدور المحدد غير موجود'});
        if(!isSystemAdminUser(user) && await roleHasRestrictedIntelligencePermission(role.id)) return json(res,403,{success:false,error:'هذه المجموعة تحتوي على صلاحيات ذكاء التوصيل التي لا يمنحها إلا مدير النظام'});
        // Replace and verify the assignment. Never ignore deletion errors: a
        // stale role link can keep the employee's old menu after changing groups.
        await dbDelete('user_roles',{user_id:`eq.${id}`});
        await dbInsert('user_roles',{user_id:id,role_id:role.id},{prefer:'return=minimal'});
        const savedRoleLinks = await dbSelect('user_roles',{select:'role_id',user_id:`eq.${id}`,limit:10});
        if(savedRoleLinks.length!==1 || String(savedRoleLinks[0]?.role_id)!==String(role.id)) {
          throw new Error('تعذر التحقق من حفظ مجموعة صلاحيات الموظف؛ لم يتم تأكيد الربط الصحيح');
        }
        if(roleName.toLowerCase()==='driver') await syncDriverUsers(companyId);
        // If this employee is currently logged in on this Node process,
        // refresh the in-memory session immediately so the new permissions
        // take effect without waiting for a manual logout/login.
        sessionActiveCache.delete(String(id));
        const freshPermissions = await getUserPermissions(id, roleName);
        for (const session of sessions.values()) {
          if (String(session.user?.id) === String(id)) {
            session.user.role = roleName;
            session.user.permissions = freshPermissions;
          }
        }
      }
      await audit(user,'update_employee','user',id,{before:{name:existing.name,username:existing.username,email:existing.email,language:existing.language,active:existing.active},after:{...patch,role:body.role}});
      return json(res,200,{success:true,data:{...data,employee_code:existing.employee_code||await ensureEmployeeCode(existing,companyId),role:body.role||'employee'}});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (userEditMatch && req.method === 'DELETE') {
    const user = await requireRole(req, res, 'users'); if (!user) return;
    try {
      const companyId=await resolveCompanyId(user), id=userEditMatch[1];
      const existing=firstRow(await dbSelect('users',{select:'id,name,username,employee_code',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));
      if(!existing)return json(res,404,{success:false,error:'الموظف غير موجود'});
      if(String(id)===String(user.id))return json(res,400,{success:false,error:'لا يمكن حذف المستخدم الحالي'});
      await dbDelete('user_roles',{user_id:`eq.${id}`}).catch(()=>{});
      await dbDelete('users',{id:`eq.${id}`,company_id:`eq.${companyId}`});
      await audit(user,'delete_employee','user',id,existing);
      return json(res,200,{success:true});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/roles' && req.method === 'GET') {
    const user = await requireRole(req,res,'users'); if(!user) return;
    try {
      const companyId = await resolveCompanyId(user);
      const rows = await dbSelect('roles',{select:'id,name',company_id:`eq.${companyId}`,order:'name.asc',limit:1000});
      const links = await dbSelect('role_permissions',{select:'role_id,permission_id',limit:10000}).catch(()=>[]);
      const permissions = await dbSelect('permissions',{select:'id,code',limit:500}).catch(()=>[]);
      const codeById = new Map(permissions.map(p=>[String(p.id),String(p.code)]));
      const codesByRole = new Map();
      for(const link of links){const code=codeById.get(String(link.permission_id));if(!code)continue;const key=String(link.role_id);if(!codesByRole.has(key))codesByRole.set(key,[]);codesByRole.get(key).push(code);}
      const mappedRoles=rows.map(role=>({...role,permission_codes:[...new Set(codesByRole.get(String(role.id))||[])]}));
      const visibleRoles=isSystemAdminUser(user)?mappedRoles:mappedRoles.filter(role=>!role.permission_codes.some(isRestrictedIntelligencePermission)).map(role=>({...role,permission_codes:role.permission_codes.filter(code=>!isRestrictedIntelligencePermission(code))}));
      return json(res,200,{success:true,data:visibleRoles});
    } catch(error){ return json(res,500,{success:false,error:error.message}); }
  }

  if (pathname === '/api/permissions' && req.method === 'GET') {
    const user = await requireRole(req, res, 'users'); if (!user) return;
    try {
      let rows = await dbSelect('permissions', { select: 'id,code,name_ar,name_en', order: 'code.asc', limit: 500 });
      // Admin Tools is intentionally not an assignable permission-group choice.
      rows = rows.filter(p => String(p.code || '').toLowerCase() !== 'admin_tools');
      if (!rows.some(p => String(p.code) === 'completed_without_proof')) {
        try {
          const created = firstRow(await dbInsert('permissions', { code: 'completed_without_proof', name_ar: 'إكمال المرتجع بدون إثبات', name_en: 'Completed Without Proof' }));
          if (created?.id) rows.push(created);
        } catch (seedError) {
          rows = await dbSelect('permissions', { select: 'id,code,name_ar,name_en', order: 'code.asc', limit: 500 });
          if (!rows.some(p => String(p.code) === 'completed_without_proof')) throw seedError;
        }
      }
      if (!rows.some(p => String(p.code) === 'backup_restore')) {
        try {
          const created = firstRow(await dbInsert('permissions', { code: 'backup_restore', name_ar: 'النسخ الاحتياطي والاستعادة', name_en: 'Backup & Restore' }));
          if (created?.id) rows.push(created);
        } catch (seedError) {
          rows = await dbSelect('permissions', { select: 'id,code,name_ar,name_en', order: 'code.asc', limit: 500 });
          if (!rows.some(p => String(p.code) === 'backup_restore')) throw seedError;
        }
      }
      // Keep every real sidebar page available in the permission editor even
      // when the database was created before newer pages were added. Catalog
      // entries do not grant access by themselves; groups must select them.
      const menuPermissions = [
        ['operations_dashboard','لوحة عمليات الشحن','Operations Dashboard'],['order','إدخال أوردر','New Order'],['edit_order','تعديل الأوردر','Edit Order'],['booking','حجز كوبونات','Booking'],['search','بحث','Search'],['jobs','مهام التوصيل','Delivery Job'],['scan_driver','Scan Driver','Scan Driver'],['order_import','استيراد أوردر Excel','Order Excel Import'],['jobcode','تحديث كود مهمة التوصيل','Update Delivery Job Code'],['returns','مرتجعات التاجر','Shipper Returns'],['return_archive','أرشيف المرتجعات','Returns Archive'],['wanted_customers','قائمة المطلوبين','Wanted Customers'],['driver_returns','الراجع مع السائق','Driver Returns'],['merchants','التجار','Shippers'],['chat','شات الموظفين','Employee Chat'],['accounting','الحسابات','Accounting'],['employee_wages','أجور الموظفين','Employee Wages'],['orders_verification','حسابات المندوب','Driver Account'],['driver_expenses','المصاريف','Expenses'],['adjustment','التسويات المالية','Adjustment'],['merchant_financial','الكشوف المالية للتجار','Shipper Financial Statements'],['company_financial','الأرباح والخسائر','Profit & Loss'],['company_expenses','مصاريف الشركة','Company Expenses'],['daily_company_report','التقرير اليومي للشركة','Daily Company Report'],['receivable','المستحقات','Receivable'],['settlement_archive','تقرير الفواتير','Invoice Report'],['settings','الإعدادات','Settings'],['backup_restore','النسخ الاحتياطي والاستعادة','Backup & Restore'],['live_map','خريطة المندوبين','Drivers Map'],['areas','الإمارات والمناطق','Governorates & Areas'],['audit','سجل العمليات','Audit Log'],['employees','الموظفون والصلاحيات','Employees & Permissions'],['order_monitor','مراقب الأوردرات','Order Monitor'],['order_distributor','موزّع الأوردرات','Order Distributor'],['accounts_monitor','مراقب الحسابات','Accounts Monitor'],['system_delivery_ai','المساعد الذكي','System Delivery AI']
      ];
      const presentCodes = new Set(rows.map(p => String(p.code || '').toLowerCase()));
      for (const [code, name_ar, name_en] of menuPermissions) {
        if (presentCodes.has(code)) continue;
        try {
          const created = firstRow(await dbInsert('permissions', { code, name_ar, name_en }));
          if (created?.id) { rows.push(created); presentCodes.add(code); }
        } catch (seedError) {
          const refreshed = await dbSelect('permissions', { select: 'id,code,name_ar,name_en', code: `eq.${encodeURIComponent(code)}`, limit: 1 }).catch(() => []);
          const existing = firstRow(refreshed);
          if (existing?.id) { rows.push(existing); presentCodes.add(code); }
          else throw seedError;
        }
      }
      const visibleRows = isSystemAdminUser(user) ? rows : rows.filter(permission => !isRestrictedIntelligencePermission(permission.code));
      return json(res, 200, { success: true, data: visibleRows });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  if (pathname === '/api/roles' && req.method === 'POST') {
    const user = await requireRole(req, res, 'users'); if (!user) return;
    try {
      const body = await bodyJson(req);
      const companyId = await resolveCompanyId(user);
      const name = cleanString(body.name);
      const codes = uniqueArray(Array.isArray(body.permissions) ? body.permissions : []);
      if (!isSystemAdminUser(user) && codes.some(isRestrictedIntelligencePermission)) return json(res,403,{success:false,error:'صلاحيات ذكاء التوصيل والمساعد الذكي لا يمنحها إلا مدير النظام'});
      if (!name) return json(res, 400, { success: false, error: 'اسم مجموعة الصلاحيات مطلوب' });
      if (['admin','مدير النظام','system admin','administrator'].includes(name.toLowerCase())) return json(res, 403, { success: false, error: 'دور مدير النظام مخصص لمالك النظام ولا يمكن إنشاؤه كصلاحية موظف' });
      const existing = await dbSelect('roles', { select: 'id', company_id: `eq.${companyId}`, name: `eq.${encodeURIComponent(name)}`, limit: 1 });
      if (existing.length) return json(res, 409, { success: false, error: 'مجموعة الصلاحيات موجودة بالفعل' });
      const role = firstRow(await dbInsert('roles', { company_id: companyId, name }));
      if (!role?.id) throw new Error('فشل إنشاء مجموعة الصلاحيات');
      if (codes.length) {
        const permissions = await dbSelect('permissions', { select: 'id,code', limit: 500 });
        const byCode = new Map(permissions.map(x => [String(x.code), x.id]));
        const unknownCodes = codes.filter(code => !byCode.has(String(code)));
        if (unknownCodes.length) {
          await dbDelete('roles', { id: `eq.${role.id}`, company_id: `eq.${companyId}` }).catch(() => {});
          return json(res, 400, { success: false, error: `صلاحيات غير معروفة: ${unknownCodes.join('، ')}` });
        }
        try {
          for (const code of codes) {
            await dbInsert('role_permissions', { role_id: role.id, permission_id: byCode.get(String(code)) }, { prefer: 'return=minimal' });
          }
        } catch (permissionError) {
          await dbDelete('role_permissions', { role_id: `eq.${role.id}` }).catch(() => {});
          await dbDelete('roles', { id: `eq.${role.id}`, company_id: `eq.${companyId}` }).catch(() => {});
          throw new Error(`تعذر حفظ صلاحيات المجموعة: ${permissionError.message}`);
        }
      }
      const savedLinks = await dbSelect('role_permissions', { select: 'permission_id', role_id: `eq.${role.id}`, limit: 500 }).catch(() => []);
      if (savedLinks.length !== codes.length) {
        await dbDelete('role_permissions', { role_id: `eq.${role.id}` }).catch(() => {});
        await dbDelete('roles', { id: `eq.${role.id}`, company_id: `eq.${companyId}` }).catch(() => {});
        throw new Error('لم يتم حفظ جميع صلاحيات المجموعة؛ لم يتم اعتماد المجموعة');
      }
      return json(res, 200, { success: true, data: role });
    } catch (error) { return json(res, 500, { success: false, error: error.message }); }
  }

  const roleEditMatch = pathname.match(/^\/api\/roles\/([^/]+)$/);
  if (roleEditMatch && req.method === 'PATCH') {
    const user = await requireRole(req, res, 'users'); if (!user) return;
    try {
      const companyId = await resolveCompanyId(user), roleId = roleEditMatch[1], body = await bodyJson(req);
      if (!isSystemAdminUser(user) && Array.isArray(body.permissions) && uniqueArray(body.permissions).some(isRestrictedIntelligencePermission)) return json(res,403,{success:false,error:'صلاحيات ذكاء التوصيل والمساعد الذكي لا يمنحها أو يعدّلها إلا مدير النظام'});
      const existing = firstRow(await dbSelect('roles',{select:'id,name,company_id',id:`eq.${roleId}`,company_id:`eq.${companyId}`,limit:1}));
      if(!existing) return json(res,404,{success:false,error:'مجموعة الصلاحيات غير موجودة'});
      if (['admin','مدير النظام','system admin','administrator'].includes(String(existing.name||'').trim().toLowerCase())) return json(res,403,{success:false,error:'لا يمكن تعديل دور مدير النظام؛ فهو مخصص لمالك النظام فقط'});
      const name = cleanString(body.name || existing.name);
      if(!name) return json(res,400,{success:false,error:'اسم مجموعة الصلاحيات مطلوب'});
      if (['admin','مدير النظام','system admin','administrator'].includes(name.toLowerCase())) return json(res,403,{success:false,error:'دور مدير النظام مخصص لمالك النظام ولا يمكن تعيينه للموظفين'});
      const duplicate = firstRow(await dbSelect('roles',{select:'id',company_id:`eq.${companyId}`,name:`eq.${encodeURIComponent(name)}`,limit:1}).catch(()=>[]));
      if(duplicate && String(duplicate.id)!==String(roleId)) return json(res,409,{success:false,error:'يوجد مجموعة أخرى بنفس الاسم'});
      await dbUpdate('roles',{id:`eq.${roleId}`,company_id:`eq.${companyId}`},{name});
      if(Array.isArray(body.permissions)){
        const allPermissions = await dbSelect('permissions',{select:'id,code',limit:500});
        const requestedCodes = uniqueArray(body.permissions).filter(code=>String(code).toLowerCase()!=='admin_tools');
        if (!isSystemAdminUser(user) && requestedCodes.some(isRestrictedIntelligencePermission)) return json(res,403,{success:false,error:'صلاحيات ذكاء التوصيل والمساعد الذكي لا يمنحها أو يعدّلها إلا مدير النظام'});
        const byCode = new Map(allPermissions.map(p=>[String(p.code),p.id]));
        let wantedCodes = requestedCodes;
        if (!isSystemAdminUser(user)) {
          const previousLinksForRestricted = await dbSelect('role_permissions',{select:'permission_id',role_id:`eq.${roleId}`,limit:500});
          const previousPermissionIds = new Set(previousLinksForRestricted.map(link=>String(link.permission_id)));
          const protectedCodes = allPermissions.filter(permission=>previousPermissionIds.has(String(permission.id))&&isRestrictedIntelligencePermission(permission.code)).map(permission=>String(permission.code));
          wantedCodes = [...new Set([...requestedCodes.filter(code=>!isRestrictedIntelligencePermission(code)),...protectedCodes])];
        }
        const unknownCodes = wantedCodes.filter(code=>!byCode.has(String(code)));
        if(unknownCodes.length) return json(res,400,{success:false,error:`صلاحيات غير معروفة؛ لم يتم تغيير المجموعة: ${unknownCodes.join('، ')}`});
        const wantedIds = wantedCodes.map(code=>byCode.get(String(code)));
        const previousLinks = await dbSelect('role_permissions',{select:'permission_id',role_id:`eq.${roleId}`,limit:500});
        const previousIds = previousLinks.map(link=>link.permission_id);
        try {
          await dbDelete('role_permissions',{role_id:`eq.${roleId}`});
          for(const permissionId of wantedIds) await dbInsert('role_permissions',{role_id:roleId,permission_id:permissionId},{prefer:'return=minimal'});
          const savedLinks = await dbSelect('role_permissions',{select:'permission_id',role_id:`eq.${roleId}`,limit:500});
          const savedIds = savedLinks.map(link=>String(link.permission_id)).sort();
          const expectedIds = wantedIds.map(String).sort();
          if(savedIds.length!==expectedIds.length || savedIds.some((id,index)=>id!==expectedIds[index])) throw new Error('تعذر التحقق من حفظ جميع الصلاحيات');
        } catch(saveError) {
          // Best-effort rollback: never leave the group empty after a failed save.
          await dbDelete('role_permissions',{role_id:`eq.${roleId}`}).catch(()=>{});
          for(const permissionId of previousIds) await dbInsert('role_permissions',{role_id:roleId,permission_id:permissionId},{prefer:'return=minimal'}).catch(()=>{});
          throw new Error(`فشل حفظ الصلاحيات، وتمت محاولة استعادة الإعداد السابق: ${saveError.message}`);
        }
        // Refresh active sessions for every employee assigned to this role.
        const userLinks = await dbSelect('user_roles',{select:'user_id',role_id:`eq.${roleId}`,limit:5000}).catch(()=>[]);
        for(const link of userLinks){
          sessionActiveCache.delete(String(link.user_id));
          const fresh = await getUserPermissions(link.user_id,name);
          for(const session of sessions.values()) if(String(session.user?.id)===String(link.user_id)){session.user.role=name;session.user.permissions=fresh;}
        }
      }
      await audit(user,'update_permission_group','role',roleId,{before:{name:existing.name},after:{name,permissions:Array.isArray(body.permissions)?uniqueArray(body.permissions):undefined}});
      return json(res,200,{success:true,data:{id:roleId,name}});
    } catch(error){return json(res,500,{success:false,error:error.message});}
  }

  // Employee Chat - WhatsApp-style conversations, groups, members and messages.
  async function chatUsers(companyId) {
    return await dbSelect('users', { select: 'id,name,username,email,employee_code', company_id: `eq.${companyId}`, active: 'eq.true', order: 'name.asc', limit: 500 });
  }
  async function chatMember(companyId, conversationId, userId) {
    const rows=await dbSelect('chat_conversation_members',{select:'id,conversation_id,user_id,is_admin,last_read_at,left_at',company_id:`eq.${companyId}`,conversation_id:`eq.${conversationId}`,user_id:`eq.${String(userId)}`,left_at:'is.null',limit:1});
    return firstRow(rows);
  }
  async function chatConversation(companyId, conversationId) {
    return firstRow(await dbSelect('chat_conversations',{select:'*',company_id:`eq.${companyId}`,id:`eq.${conversationId}`,limit:1}));
  }
  async function chatEnsureMember(companyId, conversationId, userId) {
    const member=await chatMember(companyId,conversationId,userId);
    if(!member) throw new Error('أنت لست عضوًا في هذه المحادثة');
    return member;
  }
  async function chatConversationPayload(companyId,userId) {
    const members=await dbSelect('chat_conversation_members',{select:'conversation_id,user_id,is_admin,last_read_at,joined_at',company_id:`eq.${companyId}`,user_id:`eq.${String(userId)}`,left_at:'is.null',limit:1000});
    if(!members.length)return [];
    const ids=members.map(x=>x.conversation_id).filter(Boolean);
    const convs=await dbSelect('chat_conversations',{select:'id,company_id,type,name,created_by,created_at,updated_at',company_id:`eq.${companyId}`,id:`in.(${ids.join(',')})`,order:'updated_at.desc',limit:500});
    const users=await chatUsers(companyId);const userMap=new Map(users.map(u=>[String(u.id),u]));const out=[];
    for(const c of convs){
      const cm=members.find(m=>String(m.conversation_id)===String(c.id));
      const allMembers=await dbSelect('chat_conversation_members',{select:'user_id,is_admin',company_id:`eq.${companyId}`,conversation_id:`eq.${c.id}`,left_at:'is.null',limit:500});
      const names=allMembers.map(m=>{const u=userMap.get(String(m.user_id));if(!u)return String(m.user_id)==='env-admin'?'Administrator':'Employee';const label=u.name||u.username||u.email||'Employee';return u.employee_code?`${label} — ${u.employee_code}`:label;}).filter(Boolean);
      const last=firstRow(await dbSelect('chat_messages',{select:'id,message,sender_id,created_at,deleted_at',company_id:`eq.${companyId}`,conversation_id:`eq.${c.id}`,order:'created_at.desc',limit:1}));
      const unreadFilters={select:'id',company_id:`eq.${companyId}`,conversation_id:`eq.${c.id}`,deleted_at:'is.null',limit:1000};
      if(cm?.last_read_at) unreadFilters.created_at=`gt.${cm.last_read_at}`;
      // PostgREST OR filters must be parenthesized; otherwise they may be parsed as a missing orsender_id column.
      if(String(userId)==='env-admin') unreadFilters.sender_id='not.is.null';
      else unreadFilters.or=`(sender_id.neq.${String(userId)},sender_id.is.null)`;
      const unreadRows=await dbSelect('chat_messages',unreadFilters);
      out.push({...c,member_is_admin:Boolean(cm?.is_admin),member_count:allMembers.length,member_names:names,unread_count:unreadRows.length,last_message:last?.deleted_at?'رسالة محذوفة':String(last?.message||'').startsWith('__ATTACHMENT__')?'مرفق':(last?.message||''),last_message_at:last?.created_at||c.updated_at});
    }
    return out;
  }

  if(pathname==='/api/chat/users'&&req.method==='GET'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{return json(res,200,{success:true,data:await chatUsers(await resolveCompanyId(user))});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(pathname==='/api/chat/conversations'&&req.method==='GET'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user);return json(res,200,{success:true,data:await chatConversationPayload(companyId,user.id)});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(pathname==='/api/chat/unread'&&req.method==='GET'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user);const conversations=await chatConversationPayload(companyId,user.id);const total=conversations.reduce((n,c)=>n+Number(c.unread_count||0),0);const latest=conversations.find(c=>Number(c.unread_count||0)>0)?.last_message_at||null;return json(res,200,{success:true,data:{unread_count:total,latest_at:latest}});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  const chatConvMatch=pathname.match(/^\/api\/chat\/conversations\/([^/]+)$/);
  if(chatConvMatch&&req.method==='GET'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(chatConvMatch[1]);await chatEnsureMember(companyId,id,user.id);const conv=await chatConversation(companyId,id);if(!conv)return json(res,404,{success:false,error:'المحادثة غير موجودة'});const users=await chatUsers(companyId),um=new Map(users.map(x=>[String(x.id),x]));const members=await dbSelect('chat_conversation_members',{select:'id,user_id,is_admin,joined_at,last_read_at',company_id:`eq.${companyId}`,conversation_id:`eq.${id}`,left_at:'is.null',limit:500});const enriched=members.map(m=>({...m,user:um.get(String(m.user_id))||{id:m.user_id,name:m.user_id==='env-admin'?'Administrator':'Employee'}}));return json(res,200,{success:true,data:{conversation:conv,members:enriched}});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  const chatMessagesMatch=pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/messages$/);
  if(chatMessagesMatch&&req.method==='GET'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(chatMessagesMatch[1]);await chatEnsureMember(companyId,id,user.id);const rows=await dbSelect('chat_messages',{select:'*',company_id:`eq.${companyId}`,conversation_id:`eq.${id}`,order:'created_at.asc',limit:1000});const users=await chatUsers(companyId),names=new Map(users.map(x=>[String(x.id),x.name||x.username||x.email||'Employee']));return json(res,200,{success:true,data:rows.map(x=>({...x,sender_name:x.sender_id?names.get(String(x.sender_id))||'Employee':'Administrator'}))});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(pathname==='/api/chat/conversations'&&req.method==='POST'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const body=await bodyJson(req),companyId=await resolveCompanyId(user),type=body.type==='group'?'group':'direct',memberIds=uniqueArray([user.id,...(Array.isArray(body.member_ids)?body.member_ids:[])].map(String));if(type==='direct'&&memberIds.length!==2)return json(res,400,{success:false,error:'المحادثة الفردية تحتاج موظفًا واحدًا'});if(type==='group'&&memberIds.length<3)return json(res,400,{success:false,error:'المجموعة تحتاج موظفين بالإضافة إلى منشئ المجموعة'});const users=await chatUsers(companyId),allowed=new Set(users.map(x=>String(x.id)));for(const id of memberIds)if(id!=='env-admin'&&!allowed.has(id))return json(res,400,{success:false,error:'يوجد موظف غير صالح في القائمة'});
      if(type==='direct'){const target=memberIds.find(x=>x!==String(user.id));const existing=await dbSelect('chat_conversation_members',{select:'conversation_id',company_id:`eq.${companyId}`,user_id:`eq.${String(user.id)}`,left_at:'is.null',limit:500});for(const e of existing){const conv=await chatConversation(companyId,e.conversation_id);if(conv?.type!=='direct')continue;const ms=await dbSelect('chat_conversation_members',{select:'user_id',company_id:`eq.${companyId}`,conversation_id:`eq.${e.conversation_id}`,left_at:'is.null',limit:10});if(ms.length===2&&ms.some(m=>String(m.user_id)===String(target)))return json(res,200,{success:true,data:conv,existing:true});}}
      const conv=firstRow(await dbInsert('chat_conversations',{company_id:companyId,type,name:type==='group'?cleanString(body.name)||'New Group':null,created_by:String(user.id)}));for(const id of memberIds)await dbInsert('chat_conversation_members',{conversation_id:conv.id,company_id:companyId,user_id:id,is_admin:type==='group'&&String(id)===String(user.id)},{prefer:'return=minimal'});return json(res,200,{success:true,data:conv});
    }catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(chatMessagesMatch&&req.method==='POST'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(chatMessagesMatch[1]);await chatEnsureMember(companyId,id,user.id);const body=await bodyJson(req),message=cleanString(body.message||body.text);if(!message)return json(res,400,{success:false,error:'الرسالة فارغة'});const data=firstRow(await dbInsert('chat_messages',{company_id:companyId,conversation_id:id,sender_id:user.id==='env-admin'?null:String(user.id),message}));return json(res,200,{success:true,data});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  const chatMembersMatch=pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/members$/);
  if(chatMembersMatch&&req.method==='POST'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(chatMembersMatch[1]),conv=await chatConversation(companyId,id);if(!conv)return json(res,404,{success:false,error:'المحادثة غير موجودة'});const member=await chatEnsureMember(companyId,id,user.id);if(conv.type!=='group')return json(res,400,{success:false,error:'إضافة أعضاء متاحة للمجموعات فقط'});if(!member.is_admin&&user.id!=='env-admin')return json(res,403,{success:false,error:'فقط مدير المجموعة يمكنه إضافة أعضاء'});const body=await bodyJson(req),ids=uniqueArray(Array.isArray(body.user_ids)?body.user_ids:[body.user_id]),users=await chatUsers(companyId),allowed=new Set(users.map(x=>String(x.id)));for(const uid of ids)if(uid!=='env-admin'&&allowed.has(uid))await dbInsert('chat_conversation_members',{conversation_id:id,company_id:companyId,user_id:uid,is_admin:false},{prefer:'return=minimal'}).catch(()=>{});return json(res,200,{success:true});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(chatMembersMatch&&req.method==='DELETE'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(chatMembersMatch[1]),conv=await chatConversation(companyId,id);if(!conv)return json(res,404,{success:false,error:'المحادثة غير موجودة'});const member=await chatEnsureMember(companyId,id,user.id);if(conv.type!=='group')return json(res,400,{success:false,error:'إزالة الأعضاء متاحة للمجموعات فقط'});if(!member.is_admin&&user.id!=='env-admin')return json(res,403,{success:false,error:'فقط مدير المجموعة يمكنه إزالة أعضاء'});const body=await bodyJson(req),uid=String(body.user_id||'');if(!uid)return json(res,400,{success:false,error:'الموظف مطلوب'});await dbUpdate('chat_conversation_members',{company_id:`eq.${companyId}`,conversation_id:`eq.${id}`,user_id:`eq.${uid}`,left_at:'is.null'},{left_at:new Date().toISOString()});return json(res,200,{success:true});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  const chatReadMatch=pathname.match(/^\/api\/chat\/conversations\/([^/]+)\/read$/);
  if(chatReadMatch&&req.method==='POST'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(chatReadMatch[1]),member=await chatEnsureMember(companyId,id,user.id);await dbUpdate('chat_conversation_members',{id:`eq.${member.id}`},{last_read_at:new Date().toISOString()});return json(res,200,{success:true});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  const chatDeleteMatch=pathname.match(/^\/api\/chat\/messages\/([^/]+)$/);
  if(chatDeleteMatch&&req.method==='DELETE'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(chatDeleteMatch[1]),message=firstRow(await dbSelect('chat_messages',{select:'id,sender_id,conversation_id',company_id:`eq.${companyId}`,id:`eq.${id}`,limit:1}));if(!message)return json(res,404,{success:false,error:'الرسالة غير موجودة'});const member=await chatEnsureMember(companyId,message.conversation_id,user.id);if(String(message.sender_id)!==String(user.id)&&!member.is_admin&&user.id!=='env-admin')return json(res,403,{success:false,error:'لا يمكنك حذف هذه الرسالة'});await dbUpdate('chat_messages',{id:`eq.${id}`,company_id:`eq.${companyId}`},{deleted_at:new Date().toISOString(),deleted_by:String(user.id),message:''});return json(res,200,{success:true});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  // Backward-compatible legacy chat endpoint.
  if(pathname==='/api/chat'&&req.method==='GET'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),rows=await dbSelect('chat_messages',{select:'*',company_id:`eq.${companyId}`,order:'created_at.asc',limit:300}),users=await chatUsers(companyId),names=new Map(users.map(x=>[String(x.id),x.name||x.username||'']));return json(res,200,{success:true,data:rows.map(x=>({...x,sender_name:x.sender_id?names.get(String(x.sender_id))||'موظف':'Admin'}))});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }
  if(pathname==='/api/chat'&&req.method==='POST'){
    const user=await requireRole(req,res,'chat');if(!user)return;
    try{const companyId=await resolveCompanyId(user),general=firstRow(await dbSelect('chat_conversations',{select:'id',company_id:`eq.${companyId}`,type:'eq.group',name:'eq.Employee Chat',limit:1}));if(!general)throw new Error('شات الموظفين غير مهيأ. شغّل migration الخاصة بالشات أولاً.');const body=await bodyJson(req),message=cleanString(body.message||body.text);if(!message)return json(res,400,{success:false,error:'الرسالة فارغة'});await chatEnsureMember(companyId,general.id,user.id);const data=firstRow(await dbInsert('chat_messages',{company_id:companyId,conversation_id:general.id,sender_id:user.id==='env-admin'?null:String(user.id),message}));return json(res,200,{success:true,data});}
    catch(error){return json(res,500,{success:false,error:error.message});}
  }

  if (pathname === '/api/notifications' && req.method === 'GET') {
    const user = await requireAuth(req,res); if(!user)return;
    try {
      const companyId=await resolveCompanyId(user), limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||30)));
      const rows=await dbSelect('notifications',{select:'*',company_id:`eq.${companyId}`,order:'created_at.desc',limit});
      const data=rows.filter(x=>!x.user_id || String(x.user_id)===String(user.id)).map(x=>({...x,unread:!x.read_at}));
      return json(res,200,{success:true,data,unread_count:data.filter(x=>x.unread).length});
    }catch(e){return json(res,500,{success:false,error:e.message});}
  }
  const notificationReadMatch=pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if(notificationReadMatch && req.method==='POST'){
    const user=await requireAuth(req,res);if(!user)return;
    try{const companyId=await resolveCompanyId(user),id=decodeURIComponent(notificationReadMatch[1]);const row=firstRow(await dbSelect('notifications',{select:'id,user_id',id:`eq.${id}`,company_id:`eq.${companyId}`,limit:1}));if(!row)return json(res,404,{success:false,error:'الإشعار غير موجود'});if(row.user_id&&String(row.user_id)!==String(user.id)&&user.role!=='admin')return json(res,403,{success:false,error:'ليس لديك صلاحية'});await dbUpdate('notifications',{id:`eq.${id}`,company_id:`eq.${companyId}`},{read_at:new Date().toISOString()});return json(res,200,{success:true});}catch(e){return json(res,500,{success:false,error:e.message});}
  }
  if (pathname === '/api/notifications/read-all' && req.method === 'POST') {
    const user=await requireAuth(req,res);if(!user)return;
    try{const companyId=await resolveCompanyId(user);const rows=await dbSelect('notifications',{select:'id,user_id',company_id:`eq.${companyId}`,read_at:'is.null',limit:5000});for(const n of rows){if(!n.user_id||String(n.user_id)===String(user.id)||user.role==='admin')await dbUpdate('notifications',{id:`eq.${n.id}`,company_id:`eq.${companyId}`},{read_at:new Date().toISOString()}).catch(()=>{});}return json(res,200,{success:true});}catch(e){return json(res,500,{success:false,error:e.message});}
  }

  if (pathname === '/api/driver/location' && req.method === 'POST') {
    const user = await requireRole(req, res, 'drivers');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      const row = {
        driver_id: body.driver_id || user.id,
        latitude: cleanNumber(body.latitude),
        longitude: cleanNumber(body.longitude),
        accuracy: body.accuracy == null ? null : cleanNumber(body.accuracy),
        recorded_at: body.recorded_at || new Date().toISOString()
      };
      const data = firstRow(await dbInsert('driver_locations', row));
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  if (pathname === '/api/whatsapp/location-request' && req.method === 'POST') {
    const user = await requireRole(req, res, 'drivers');
    if (!user) return;
    try {
      const body = await bodyJson(req);
      // WhatsApp integration is intentionally optional. We store the request so a
      // configured integration can process it later without blocking the app.
      let data = null;
      try {
        data = firstRow(await dbInsert('notifications', {
          company_id: user.company_id || null,
          user_id: body.driver_id || null,
          title: 'Location Request',
          message: cleanString(body.message) || 'Please send your current location.',
          type: 'location_request'
        }));
      } catch (_) {}
      return json(res, 200, { success: true, data });
    } catch (error) {
      return json(res, 500, { success: false, error: error.message });
    }
  }

  return json(res, 404, { success: false, error: 'API route not found', method: req.method, path: pathname });
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  })[ext] || 'application/octet-stream';
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // Production has exactly one frontend source: ./public next to server.js.
  // Never fall back to parent/app directories; doing so can resurrect an old build.
  const publicDir = path.join(__dirname, '..', 'public');
  const filePath = path.normalize(path.join(publicDir, pathname));

  if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
    return html(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  }

  fs.stat(filePath, (error, stat) => {
    if (!error && stat.isFile()) {
      fs.readFile(filePath, (readError, data) => {
        if (readError) return html(res, 500, 'Server error', 'text/plain; charset=utf-8');
        const versionedAsset = /\\.(?:js|css)$/i.test(filePath) &&
          Boolean(url.searchParams.get('v') || url.searchParams.get('build'));
        res.writeHead(200, versionedAsset ? {
          'Content-Type': contentType(filePath),
          // index.html remains non-cacheable; versioned assets use a new URL
          // whenever the build changes, so browsers can reuse them safely.
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Vary': 'Accept-Encoding'
        } : {
          'Content-Type': contentType(filePath),
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(data);
      });
      return;
    }

    // If the requested page is missing, serve the main SPA page.
    const indexPath = path.join(publicDir, 'index.html');
    fs.readFile(indexPath, (indexError, data) => {
      if (indexError) return html(res, 404, 'Not Found', 'text/plain; charset=utf-8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(data);
    });
  });
}

async function runScheduledBackupIfDue(){
  try{
    const schedules=await dbSelect('backup_schedules',{select:'*',enabled:'eq.true',limit:1000});
    for(const cfg of (schedules||[])){
      if(!cfg.email||!cfg.company_id)continue;
      const now=new Date(),hour=Number(cfg.hour??2),day=Number(cfg.day??1);
      // If the app was sleeping/restarting at the exact scheduled hour, run later
      // in the same scheduled period instead of missing the backup for a whole week/month.
      if(cfg.frequency==='weekly'&&(now.getDay()<day||(now.getDay()===day&&now.getHours()<hour)))continue;
      if(cfg.frequency==='monthly'&&(now.getDate()<day||(now.getDate()===day&&now.getHours()<hour)))continue;
      if(!['weekly','monthly'].includes(cfg.frequency))continue;
      const key=cfg.frequency==='weekly'?`${now.getFullYear()}-W${Math.ceil((((now-new Date(now.getFullYear(),0,1))/86400000)+new Date(now.getFullYear(),0,1).getDay()+1)/7)}`:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      if(cfg.last_run_key===key)continue;
      const updateStatus=async patch=>{try{await dbUpdate('backup_schedules',{company_id:`eq.${cfg.company_id}`},{...patch,updated_at:new Date().toISOString()});}catch(e){console.error('Could not update backup status:',e.message);}};
      await updateStatus({last_attempt_at:now.toISOString(),last_error:''});
      if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS||!process.env.SMTP_FROM){await updateStatus({last_error:'SMTP settings are missing; automatic email backup was not sent.'});continue;}
      try{
        const tables={},errors=[],warnings=[];const names=['companies','users','merchants','drivers','governorates','areas','orders','shipments','delivery_jobs','delivery_job_shipments','delivery_job_orders','order_history','return_orders','return_transactions','return_transaction_attachments','return_operations','deleted_orders','scan_driver_records','merchant_settlements','shipper_settlement_records','shipper_settlement_items','driver_settlements','driver_commissions','driver_commission_payments','expenses','driver_expenses','shipment_status_history','audit_logs','company_financial_transactions','company_financial_adjustments','merchant_adjustments','adjustment_proofs','settlement_proofs','shipper_rates','shipper_rate_history','driver_locations','notifications','chat_conversations','chat_conversation_members','chat_messages','payroll_employees','payroll_periods','payroll_items','payroll_adjustments','payroll_receipts'];
        for(const table of names){try{const all=[];let offset=0;while(true){const q={select:'*',limit:1000,offset};if(table==='companies')q.id=`eq.${cfg.company_id}`;else q.company_id=`eq.${cfg.company_id}`;const page=await dbSelect(table,q);all.push(...page.map(row=>{const x={...row};if(table==='users')for(const k of Object.keys(x))if(/password|token|secret|refresh|session|credential/i.test(k))delete x[k];for(const k of Object.keys(x))if(/consumer_secret|access_token|refresh_token|api_secret|private_key/i.test(k))delete x[k];return x;}));if(page.length<1000)break;offset+=page.length;if(offset>500000)throw new Error('row limit exceeded');}tables[table]=all;}catch(e){const m=String(e.message||e),missing=/does not exist|Could not find the table|schema cache|PGRST205|relation .* not found/i.test(m);if(missing&&!['users','drivers','merchants','orders','shipments'].includes(table)){tables[table]=[];warnings.push({table,warning:m.slice(0,180)});}else errors.push({table,error:m.slice(0,220)});}}
        if(errors.length)throw new Error('Core table export failed: '+JSON.stringify(errors));
        const backup={success:true,format:'trend-delivery-backup-v2',created_at:now.toISOString(),company_id:cfg.company_id,tables,backup_warnings:warnings};const payload=Buffer.from(JSON.stringify(backup,null,2),'utf8');if(payload.length>20*1024*1024)throw new Error('Backup exceeds 20MB email limit');
        const nodemailer=require('nodemailer'),port=Number(process.env.SMTP_PORT||587),transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:String(process.env.SMTP_SECURE||'').toLowerCase()==='true'||port===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
        await transporter.sendMail({from:process.env.SMTP_FROM,to:cfg.email,subject:`Trend Delivery Scheduled Backup ${egyptDateISO(now)}`,text:`Automated ${cfg.frequency} backup created ${now.toISOString()}.`,attachments:[{filename:`trend-delivery-backup-${egyptDateISO(now)}.json`,content:payload,contentType:'application/json'}]});
        await updateStatus({last_run_key:key,last_run_at:now.toISOString(),last_attempt_at:now.toISOString(),last_error:''});console.log('Scheduled backup sent:',key,'company:',cfg.company_id,'bytes:',payload.length);
      }catch(e){console.error('Scheduled backup failed:',e.message);await updateStatus({last_attempt_at:now.toISOString(),last_error:String(e.message||e).slice(0,500)});try{await dbInsert('audit_logs',{company_id:cfg.company_id,user_id:null,action:'system_error',entity_type:'security',entity_id:null,details:{source:'scheduled_backup',message:String(e.message||e).slice(0,300),event_at:new Date().toISOString()}},{prefer:'return=minimal'});}catch(_){}}
    }
  }catch(e){console.error('Scheduled backup check failed:',e.message);try{const companyId=await getFirstCompanyId();if(companyId)await dbInsert('audit_logs',{company_id:companyId,user_id:null,action:'system_error',entity_type:'security',entity_id:null,details:{source:'scheduled_backup_check',message:String(e.message||e).slice(0,300),event_at:new Date().toISOString()}},{prefer:'return=minimal'});}catch(_){}}
}
setInterval(runScheduledBackupIfDue,60*60*1000).unref();
setTimeout(runScheduledBackupIfDue,15000).unref();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': APP_ORIGIN || '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS'
      });
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }

    return serveStatic(req, res, url);
  } catch (error) {
    console.error('UNHANDLED REQUEST ERROR:', error);
    if (!res.headersSent) {
      return json(res, 500, { success: false, error: error.message || 'Internal server error' });
    }
    res.end();
  }
});

process.on('uncaughtException', error => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', error => {
  console.error('UNHANDLED REJECTION:', error);
});

server.on('error', error => {
  console.error('SERVER ERROR:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  console.log(`🚚 Trend Delivery running on port ${PORT}`);
  console.log('👥 Users/Roles: enabled');
  console.log('📦 Orders: enabled');
  console.log('💬 Internal Chat: enabled');
  console.log('📍 Driver Location: enabled');
  console.log(`🟢 Supabase: ${SUPABASE_URL && SUPABASE_KEY ? 'configured' : 'NOT configured'}`);
  console.log('☁️ R2: optional/not configured');
});
