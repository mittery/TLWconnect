import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import os from 'os';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Strict Environment Variables Check for Production
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || (IS_PROD ? null : 'tlw2026');
const TEACHER_PIN = process.env.TEACHER_PIN || (IS_PROD ? null : 'tlw-teacher-2026');
const MOD_PIN = process.env.MOD_PIN || (IS_PROD ? null : 'tlw-mod-2026');
const HASH_SALT = process.env.HASH_SALT || (IS_PROD ? null : 'tlw_connect_secret_salt_2026');

if (IS_PROD) {
  const missingSecrets = [];
  if (!ADMIN_PASSCODE) missingSecrets.push('ADMIN_PASSCODE');
  if (!TEACHER_PIN) missingSecrets.push('TEACHER_PIN');
  if (!MOD_PIN) missingSecrets.push('MOD_PIN');
  if (!HASH_SALT) missingSecrets.push('HASH_SALT');

  if (missingSecrets.length > 0) {
    console.error(`[CRITICAL SECURITY ERROR] Missing mandatory environment variables in production: ${missingSecrets.join(', ')}`);
    console.error('[CRITICAL] Server startup aborted to prevent using insecure defaults. Please set these variables in Render Dashboard.');
    process.exit(1);
  }
}

// Strict CORS configuration for Express & Socket.IO
// Handle CLIENT_ORIGIN with trailing slash sanitization
const clientOriginEnv = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.trim().replace(/\/+$/, '') : null;

const allowedOrigins = [
  'https://tlwconnect.onrender.com'
];

if (clientOriginEnv && !allowedOrigins.includes(clientOriginEnv)) {
  allowedOrigins.push(clientOriginEnv);
}

// In local development, add localhost origins
if (!IS_PROD) {
  allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
}

function isOriginAllowed(origin) {
  // Allow requests without Origin (e.g., same-origin requests, mobile native webviews, curl, Render health checks)
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (allowedOrigins.includes(cleanOrigin)) return true;

  // Development-only origins: local network IPs and trycloudflare tunnel (strictly disabled in production)
  if (!IS_PROD) {
    if (cleanOrigin.endsWith('.trycloudflare.com') ||
        cleanOrigin.startsWith('http://192.168.') ||
        cleanOrigin.startsWith('http://10.') ||
        cleanOrigin.startsWith('http://localhost:') ||
        cleanOrigin.startsWith('http://127.0.0.1:')) {
      return true;
    }
  }

  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS policy: This origin is not allowed access.'));
  },
  credentials: true
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Socket.IO CORS policy: Access denied.'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Secure Active Token Store (No hardcoded fallback!)
// activeTokens: token -> { createdAt, ip, role }
const activeTokens = new Map();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function isValidAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const session = activeTokens.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > TOKEN_TTL_MS) {
    activeTokens.delete(token);
    return false;
  }
  return true;
}

// Verified Roles Store: token -> { role, ip, verifiedAt }
const verifiedRoles = new Map();
const ROLE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isValidRoleToken(token, expectedRole) {
  if (!token || typeof token !== 'string') return false;
  const entry = verifiedRoles.get(token);
  if (!entry) return false;
  if (Date.now() - entry.verifiedAt > ROLE_TOKEN_TTL_MS) {
    verifiedRoles.delete(token);
    return false;
  }
  return entry.role === expectedRole;
}

// PDPA Compliance: Salted SHA-256 for National Citizen ID
function hashIdCard(idCard) {
  if (!idCard) return '';
  return crypto.createHmac('sha256', HASH_SALT).update(idCard.toString().trim()).digest('hex');
}

// ================= SECURITY & RATE LIMITING =================
// In-memory sliding window rate limiter
const rateLimits = new Map();
function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let entry = rateLimits.get(key);
  if (!entry || now - entry.resetTime > windowMs) {
    entry = { count: 1, resetTime: now };
    rateLimits.set(key, entry);
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count++;
  return true;
}

// In-memory login attempt lockout (brute-force protection)
const loginAttempts = new Map(); // ip -> { failedCount, lockedUntil }

// Input Sanitization (strip control characters and escape HTML to prevent XSS)
function sanitizeInput(str, maxLen = 1000) {
  if (typeof str !== 'string') return '';
  let cleaned = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  cleaned = cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  return cleaned.trim().slice(0, maxLen);
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return '192.168.1.48';
}

const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const SHOUTS_FILE = path.join(DATA_DIR, 'shouts.json');
const BANNED_FILE = path.join(DATA_DIR, 'banned.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_logs.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed data if file doesn't exist
const initialSeedPosts = [
  {
    id: 'post_seed_1',
    channel: 'vent',
    author: {
      name: 'SilentEcho #492',
      badge: '🌧️',
      color: '#a855f7'
    },
    title: 'ช่วงนี้รู้สึกหมดไฟง่ายมาก พยายามพักผ่อนแล้วแต่ยังเหนื่อยอยู่...',
    content: 'งานช่วงนี้ถาโถมมาก รู้สึกอยากนอนเฉยๆ สักอาทิตย์โดยไม่ต้องคิดอะไร ใครมีวิธีดึงตัวเองกลับมาจากอาการ Burnout แนะนำได้นะครับ แค่อยากมาระบายให้สบายใจขึ้น 🥺',
    tags: ['ระบาย', 'หมดไฟ', 'Burnout'],
    timestamp: Date.now() - 1000 * 60 * 35,
    upvotes: 42,
    downvotes: 1,
    reactions: { '🔥': 8, '💀': 12, '🤫': 15, '❤️': 28 },
    comments: [
      {
        id: 'c1',
        author: { name: 'MindfulWalker #104', badge: '🌱', color: '#10b981' },
        content: 'พักผ่อนเต็มที่ก่อนเลยครับ อย่าฝืน ร่างกายและจิตใจสำคัญที่สุด ส่งกำลังใจให้นะครับ!',
        timestamp: Date.now() - 1000 * 60 * 20
      }
    ]
  },
  {
    id: 'post_seed_2',
    channel: 'suggestions',
    author: {
      name: 'CreativeThinker #991',
      badge: '💡',
      color: '#3b82f6'
    },
    title: 'เสนอแนะ: อยากให้มีพื้นที่เงียบสงบ (Silent Focus Zone) สำหรับทำงานที่ต้องใช้สมาธิสูง',
    content: 'ปัจจุบันพื้นที่ส่วนกลางมีเสียงสนทนาค่อนข้างเยอะ หากแบ่งโซนหนึ่งเป็น Silent Zone ห้ามใช้เสียง จะช่วยให้คนที่ต้องคิดงานหรืออ่านหนังสือมีสมาธิมากขึ้นครับ',
    tags: ['ข้อเสนอแนะ', 'พื้นที่ส่วนกลาง', 'โฟกัส'],
    timestamp: Date.now() - 1000 * 60 * 95,
    upvotes: 56,
    downvotes: 0,
    reactions: { '🔥': 22, '💡': 48, '❤️': 19 },
    comments: [
      {
        id: 'c2',
        author: { name: 'FocusMaker #319', badge: '🎧', color: '#06b6d4' },
        content: 'เห็นด้วยมากๆ ครับ บางวันต้องเขียนโค้ดและวิเคราะห์ข้อมูล อยากได้ความเงียบจริงๆ',
        timestamp: Date.now() - 1000 * 60 * 45
      }
    ]
  },
  {
    id: 'post_seed_3',
    channel: 'requests',
    author: {
      name: 'CareWatcher #704',
      badge: '📋',
      color: '#f59e0b'
    },
    title: 'คำร้อง: ขอพิจารณาปรับปรุงแอร์และไฟบริเวณมุมห้องประชุมชั้น 2',
    content: 'แอร์ในห้องประชุมมุมชั้น 2 ช่วงบ่ายมีน้ำหยดเล็กน้อยและแอร์ไม่ค่อยเย็น รบกวนทีมดูแลสถานที่ช่วยตรวจเช็กและซ่อมบำรุงด้วยครับ ขอบคุณครับ',
    tags: ['คำร้อง', 'สถานที่', 'ซ่อมบำรุง'],
    timestamp: Date.now() - 1000 * 60 * 180,
    upvotes: 34,
    downvotes: 0,
    reactions: { '💡': 18, '❤️': 14 },
    comments: []
  },
  {
    id: 'post_seed_4',
    channel: 'guidance',
    author: {
      name: 'CompassGuide #203',
      badge: '🧭',
      color: '#10b981'
    },
    title: 'แนะแนว: เทคนิคการเริ่มต้นศึกษาด้าน Data & AI สำหรับมือใหม่',
    content: 'สำหรับใครที่กำลังสนใจเปลี่ยนสายงานหรือศึกษา AI แนะนำให้เริ่มจากพื้นฐาน Python + การจัดการข้อมูล ก่อนที่จะกระโดดไปโมเดลที่ซับซ้อน จะทำให้เข้าใจการทำงานจริงได้ลึกซึ้งกว่าครับ ใครมีคำถามเกี่ยวกับการเรียนรู้ ถามใต้โพสต์นี้ได้เลย!',
    tags: ['แนะแนว', 'AI', 'Upskill', 'การเรียนรู้'],
    timestamp: Date.now() - 1000 * 60 * 240,
    upvotes: 79,
    downvotes: 1,
    reactions: { '🔥': 35, '💡': 52, '❤️': 38 },
    comments: []
  }
];

let posts = [];
let shouts = [];
let bannedUsers = [];
let auditLogs = [];
let reports = [];
let users = [];

// Load persisted data
try {
  if (fs.existsSync(POSTS_FILE)) {
    posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
  } else {
    posts = initialSeedPosts;
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
  }
} catch (e) {
  posts = initialSeedPosts;
}

try {
  if (fs.existsSync(SHOUTS_FILE)) {
    shouts = JSON.parse(fs.readFileSync(SHOUTS_FILE, 'utf-8'));
  } else {
    shouts = [
      { id: 's1', author: 'Vortex #11', text: 'ยินดีต้อนรับสู่ TLWconnect 🤝 พื้นที่สื่อสารนิรนามแบบเรียลไทม์', time: Date.now() - 60000 },
      { id: 's2', author: 'EchoGuide #88', text: 'สวัสดีทุกคน! วันนี้เป็นอย่างไรบ้างครับ 👋', time: Date.now() - 20000 }
    ];
    fs.writeFileSync(SHOUTS_FILE, JSON.stringify(shouts, null, 2));
  }
} catch (e) {
  shouts = [];
}

try {
  if (fs.existsSync(BANNED_FILE)) {
    bannedUsers = JSON.parse(fs.readFileSync(BANNED_FILE, 'utf-8'));
  } else {
    bannedUsers = [];
    fs.writeFileSync(BANNED_FILE, JSON.stringify(bannedUsers, null, 2));
  }
} catch (e) {
  bannedUsers = [];
}

try {
  if (fs.existsSync(AUDIT_FILE)) {
    auditLogs = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8'));
  } else {
    auditLogs = [];
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLogs, null, 2));
  }
} catch (e) {
  auditLogs = [];
}

try {
  if (fs.existsSync(REPORTS_FILE)) {
    reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  } else {
    reports = [];
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
  }
} catch (e) {
  reports = [];
}

try {
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } else {
    users = [];
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }
} catch (e) {
  users = [];
}

function savePosts() {
  try {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
  } catch (err) {
    console.error('Failed to save posts:', err);
  }
}

function saveReports() {
  try {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2));
  } catch (err) {
    console.error('Failed to save reports:', err);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Failed to save users:', err);
  }
}

function saveShouts() {
  try {
    if (shouts.length > 50) shouts = shouts.slice(-50);
    fs.writeFileSync(SHOUTS_FILE, JSON.stringify(shouts, null, 2));
  } catch (err) {
    console.error('Failed to save shouts:', err);
  }
}

function saveBanned() {
  try {
    fs.writeFileSync(BANNED_FILE, JSON.stringify(bannedUsers, null, 2));
  } catch (err) {
    console.error('Failed to save banned users:', err);
  }
}

function addAuditLog(action, detail) {
  try {
    const log = {
      id: 'log_' + Date.now(),
      action,
      detail,
      timestamp: Date.now()
    };
    auditLogs.unshift(log);
    if (auditLogs.length > 100) auditLogs = auditLogs.slice(0, 100);
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(auditLogs, null, 2));
  } catch (err) {
    console.error('Failed to save audit log:', err);
  }
}

function isBanned(authorName, studentId = null, userId = null) {
  return bannedUsers.some(u => {
    if (authorName && u.name && u.name.toLowerCase() === authorName.toLowerCase()) return true;
    if (studentId && u.studentId && u.studentId === studentId) return true;
    if (userId && u.userId && u.userId === userId) return true;
    return false;
  });
}

// Security HTTP headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Middleware
app.use(express.json({ limit: '500kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth helper middleware
function requireAdmin(req, res, next) {
  let token = req.headers['authorization'] || req.body?.token || req.query?.token;
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }
  if (token && isValidAdminToken(token)) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired Admin Token' });
  }
}

// Role verification endpoint (Students, Teachers, Moderators)
app.post('/api/auth/verify-role', (req, res) => {
  const { role, pin } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  if (!checkRateLimit(`role_verify_${clientIp}`, 10, 60000)) {
    return res.status(429).json({ success: false, error: 'พยายามตรวจสอบสิทธิ์บ่อยเกินไป กรุณารอ 1 นาที' });
  }

  const trimmedPin = (pin || '').trim();

  if (role === 'teacher') {
    if (trimmedPin === TEACHER_PIN) {
      const roleToken = 'role_' + crypto.randomBytes(24).toString('hex');
      verifiedRoles.set(roleToken, { role: 'teacher', ip: clientIp, verifiedAt: Date.now() });
      addAuditLog('ROLE_VERIFIED', `Teacher role verified from IP ${clientIp}`);
      return res.json({ success: true, role: 'teacher', badge: 'คุณครู ท.ล.ว. 👨‍🏫', verified: true, roleToken });
    }
    return res.status(403).json({ success: false, error: 'รหัสผ่านยืนยันตัวตนคุณครูไม่ถูกต้อง' });
  } else if (role === 'moderator') {
    if (trimmedPin === MOD_PIN) {
      const roleToken = 'role_' + crypto.randomBytes(24).toString('hex');
      verifiedRoles.set(roleToken, { role: 'moderator', ip: clientIp, verifiedAt: Date.now() });
      addAuditLog('ROLE_VERIFIED', `Moderator role verified from IP ${clientIp}`);
      return res.json({ success: true, role: 'moderator', badge: 'สภานักเรียน 🛡️', verified: true, roleToken });
    }
    return res.status(403).json({ success: false, error: 'รหัสยืนยันสภานักเรียนไม่ถูกต้อง' });
  } else if (role === 'student') {
    return res.json({ success: true, role: 'student', badge: '🎓 นักเรียน', verified: true });
  }

  res.status(400).json({ success: false, error: 'บทบาทไม่ถูกต้อง' });
});

// Public API endpoints
app.get('/api/posts', (req, res) => {
  const { channel, sort, search } = req.query;
  let filtered = [...posts];

  if (channel && channel !== 'all') {
    filtered = filtered.filter(p => p.channel === channel);
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p => 
      p.title.toLowerCase().includes(q) || 
      p.content.toLowerCase().includes(q) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  if (sort === 'hot') {
    filtered.sort((a, b) => (b.upvotes * 2 + (b.comments?.length || 0) * 3) - (a.upvotes * 2 + (a.comments?.length || 0) * 3));
  } else if (sort === 'top') {
    filtered.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  } else {
    filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  res.json(filtered);
});

app.get('/api/shouts', (req, res) => {
  res.json(shouts.slice(-30));
});

// Restricted: Only authenticated Admin can view network diagnostics
app.get('/api/network-info', requireAdmin, (req, res) => {
  const localIp = getLocalIp();
  res.json({
    localIp: IS_PROD ? 'restricted' : localIp,
    port: PORT,
    localUrl: IS_PROD ? 'https://tlwconnect.onrender.com' : `http://${localIp}:${PORT}`
  });
});

// ================= STUDENT ACCOUNT & AUTHENTICATION =================
// 1. Register New Student Account (PDPA Protected - Never Stores Plaintext National ID)
app.post('/api/auth/register', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  // Rate limit: Max 5 registrations per 15 minutes per IP
  if (!checkRateLimit(`reg_${clientIp}`, 5, 15 * 60 * 1000)) {
    return res.status(429).json({ success: false, error: 'คุณลงทะเบียนบัญชีบ่อยเกินไป กรุณารอ 15 นาที' });
  }

  const { fullName, idCard, studentId } = req.body;

  const cleanFullName = sanitizeInput((fullName || '').trim(), 80);
  const cleanIdCard = (idCard || '').toString().replace(/\D/g, '');
  const cleanStudentId = (studentId || '').toString().replace(/\D/g, '');

  if (!cleanFullName || cleanFullName.length < 2) {
    return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อจริง-นามสกุลให้ถูกต้อง (อย่างน้อย 2 ตัวอักษร)' });
  }
  if (cleanIdCard.length !== 13) {
    return res.status(400).json({ success: false, error: 'เลขบัตรประจำตัวประชาชนต้องมี 13 หลักพอดี' });
  }
  if (cleanStudentId.length !== 5) {
    return res.status(400).json({ success: false, error: 'รหัสนักเรียนต้องมี 5 หลักพอดี' });
  }

  const idCardHash = hashIdCard(cleanIdCard);
  const idCardMasked = cleanIdCard.slice(0, 3) + 'xxxxxxx' + cleanIdCard.slice(10);

  // Check duplicate
  const existingUser = users.find(u => (u.idCardHash ? u.idCardHash === idCardHash : u.idCard === cleanIdCard) || u.studentId === cleanStudentId);
  if (existingUser) {
    return res.status(409).json({
      success: false,
      error: 'เลขบัตรประจำตัวประชาชน หรือ รหัสนักเรียนนี้ได้ลงทะเบียนไว้แล้ว โปรดเลือกเข้าสู่ระบบ'
    });
  }

  const userToken = 'stu_' + crypto.randomBytes(24).toString('hex');
  const newUser = {
    id: 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    fullName: cleanFullName,
    idCardHash: idCardHash,
    idCardMasked: idCardMasked,
    studentId: cleanStudentId,
    token: userToken,
    createdAt: Date.now(),
    lastLogin: Date.now()
  };

  users.push(newUser);
  saveUsers();

  addAuditLog('USER_REGISTER', `นักเรียนลงทะเบียนใหม่ (รหัส: ${cleanStudentId})`);

  res.json({
    success: true,
    message: 'สร้างบัญชีนักเรียนสำเร็จ!',
    user: {
      id: newUser.id,
      fullName: newUser.fullName,
      studentId: newUser.studentId,
      idCardMasked: newUser.idCardMasked,
      token: newUser.token
    }
  });
});

// 2. Student Login
app.post('/api/auth/login', (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  // Rate limit: Max 10 login attempts per minute per IP
  if (!checkRateLimit(`student_login_${clientIp}`, 10, 60 * 1000)) {
    return res.status(429).json({ success: false, error: 'เข้าสู่ระบบบ่อยเกินไป กรุณารอ 1 นาที' });
  }

  const { studentId, idCard, fullName } = req.body;

  const cleanStudentId = (studentId || '').toString().replace(/\D/g, '');
  const cleanIdCard = (idCard || '').toString().replace(/\D/g, '');

  if (!cleanStudentId || cleanStudentId.length !== 5) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสนักเรียน 5 หลัก' });
  }
  if (!cleanIdCard || cleanIdCard.length !== 13) {
    return res.status(400).json({ success: false, error: 'กรุณาระบุเลขบัตรประจำตัวประชาชน 13 หลัก' });
  }

  const idCardHash = hashIdCard(cleanIdCard);
  const user = users.find(u => u.studentId === cleanStudentId && (u.idCardHash ? u.idCardHash === idCardHash : u.idCard === cleanIdCard));
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'รหัสนักเรียน หรือ เลขบัตรประจำตัวประชาชนไม่ถูกต้อง หรือยังไม่ได้สร้างบัญชี'
    });
  }

  // Seamless migration: wipe plaintext idCard if present
  if (!user.idCardHash) user.idCardHash = idCardHash;
  if (!user.idCardMasked) user.idCardMasked = cleanIdCard.slice(0, 3) + 'xxxxxxx' + cleanIdCard.slice(10);
  delete user.idCard;

  user.lastLogin = Date.now();
  if (!user.token) {
    user.token = 'stu_' + crypto.randomBytes(24).toString('hex');
  }
  saveUsers();

  addAuditLog('USER_LOGIN', `นักเรียนเข้าสู่ระบบ (รหัส: ${user.studentId})`);

  res.json({
    success: true,
    message: 'เข้าสู่ระบบสำเร็จ!',
    user: {
      id: user.id,
      fullName: user.fullName,
      studentId: user.studentId,
      idCardMasked: user.idCardMasked,
      token: user.token
    }
  });
});

// 3. Verify Session (Auto-Login check)
app.post('/api/auth/verify-session', (req, res) => {
  const { token, studentId } = req.body;
  if (!token || !studentId) {
    return res.status(400).json({ success: false, error: 'ข้อมูลเซสชันไม่ครบถ้วน' });
  }

  const user = users.find(u => u.token === token && u.studentId === studentId);
  if (!user) {
    return res.status(401).json({ success: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  user.lastLogin = Date.now();
  saveUsers();

  res.json({
    success: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      studentId: user.studentId,
      idCardMasked: user.idCardMasked || '142xxxxxxx000',
      token: user.token
    }
  });
});


// MANAGER API ENDPOINTS WITH BRUTE FORCE DEFENSE
app.post('/api/manager/login', (req, res) => {
  const { passcode } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  // Check if IP is currently locked out
  const attempt = loginAttempts.get(clientIp) || { failedCount: 0, lockedUntil: 0 };
  if (attempt.lockedUntil > now) {
    const waitMinutes = Math.ceil((attempt.lockedUntil - now) / 60000);
    return res.status(429).json({
      success: false,
      error: `คุณใส่รหัสผิดเกินจำนวนที่กำหนด ระบบระงับชั่วคราว โปรดลองใหม่ในอีก ${waitMinutes} นาที`
    });
  }

  if (passcode === ADMIN_PASSCODE) {
    // Reset lockout on success
    loginAttempts.delete(clientIp);

    // Generate cryptographically random session token
    const sessionToken = 'tlw_' + crypto.randomBytes(32).toString('hex');
    activeTokens.set(sessionToken, { createdAt: Date.now(), ip: clientIp, role: 'manager' });

    addAuditLog('LOGIN', `Manager logged in successfully from ${clientIp}`);
    res.json({ success: true, token: sessionToken });
  } else {
    attempt.failedCount = (attempt.failedCount || 0) + 1;
    if (attempt.failedCount >= 5) {
      attempt.lockedUntil = now + 15 * 60 * 1000; // Lock for 15 minutes
      loginAttempts.set(clientIp, attempt);
      addAuditLog('SECURITY_LOCKOUT', `IP ${clientIp} locked out after 5 failed login attempts`);
      return res.status(429).json({
        success: false,
        error: 'ใส่รหัสผ่านผิด 5 ครั้ง ระบบระงับการเข้าสู่ระบบ 15 นาที เพื่อความปลอดภัย'
      });
    } else {
      loginAttempts.set(clientIp, attempt);
      const remaining = 5 - attempt.failedCount;
      res.status(403).json({
        success: false,
        error: `รหัสผ่านไม่ถูกต้อง (เหลือโอกาสอีก ${remaining} ครั้งก่อนถูกระงับ)`
      });
    }
  }
});

// Manager Logout & Token Revocation
app.post('/api/manager/logout', requireAdmin, (req, res) => {
  let token = req.headers['authorization'] || req.body?.token || req.query?.token;
  if (token && token.startsWith('Bearer ')) {
    token = token.slice(7);
  }
  if (token && activeTokens.has(token)) {
    activeTokens.delete(token);
    addAuditLog('LOGOUT', `Manager token revoked on logout from IP ${req.ip || 'unknown'}`);
  }
  res.json({ success: true, message: 'Logged out and token revoked' });
});

app.get('/api/manager/overview', requireAdmin, (req, res) => {
  res.json({
    totalPosts: posts.length,
    activeSocketsCount,
    bannedCount: bannedUsers.length,
    registeredStudentsCount: users.length,
    pendingReportsCount: reports.filter(r => r.status === 'pending').length,
    channelsCount: {
      all: posts.length,
      announcements: posts.filter(p => p.channel === 'announcements').length,
      vent: posts.filter(p => p.channel === 'vent').length,
      suggestions: posts.filter(p => p.channel === 'suggestions').length,
      requests: posts.filter(p => p.channel === 'requests').length,
      guidance: posts.filter(p => p.channel === 'guidance').length
    },
    posts,
    bannedUsers,
    reports,
    users: users.map(u => ({
      id: u.id,
      fullName: u.fullName,
      studentId: u.studentId,
      idCardMasked: u.idCardMasked || (u.idCard ? u.idCard.slice(0, 3) + 'xxxxxxx' + u.idCard.slice(10) : '142xxxxxxx000'),
      createdAt: u.createdAt,
      lastLogin: u.lastLogin
    })),
    auditLogs: auditLogs.slice(0, 50)
  });
});

app.post('/api/manager/create-announcement', requireAdmin, (req, res) => {
  const { title, authorName, content, tags } = req.body;
  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({ error: 'กรุณากรอกหัวข้อและเนื้อหาประกาศให้ครบถ้วน' });
  }

  const cleanTitle = sanitizeInput(title, 150);
  const cleanContent = sanitizeInput(content, 3000);
  const cleanAuthor = sanitizeInput(authorName || 'ฝ่ายบริหาร โรงเรียนท่าลี่วิทยา', 60);

  let cleanTags = ['ประกาศโรงเรียน'];
  if (Array.isArray(tags)) {
    cleanTags = tags.map(t => sanitizeInput(t, 30)).filter(Boolean);
  } else if (typeof tags === 'string' && tags.trim()) {
    cleanTags = tags.split(',').map(t => sanitizeInput(t.trim(), 30)).filter(Boolean);
  }
  if (!cleanTags.includes('ประกาศโรงเรียน')) {
    cleanTags.unshift('ประกาศโรงเรียน');
  }

  const announcementPost = {
    id: 'post_ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    channel: 'announcements',
    author: {
      name: cleanAuthor,
      badge: '📢',
      color: '#38bdf8',
      role: 'admin',
      official: true
    },
    title: cleanTitle,
    content: cleanContent,
    tags: cleanTags.slice(0, 5),
    timestamp: Date.now(),
    upvotes: 1,
    downvotes: 0,
    reactions: { '🔥': 0, '💀': 0, '💡': 0, '🤫': 0, '❤️': 0 },
    comments: []
  };

  posts.unshift(announcementPost);
  savePosts();

  addAuditLog('CREATE_ANNOUNCEMENT', `Created announcement "${cleanTitle.slice(0, 35)}" by ${cleanAuthor}`);

  // Broadcast to all connected clients immediately
  io.emit('new_post', announcementPost);

  res.json({ success: true, post: announcementPost });
});

app.post('/api/manager/delete-post', requireAdmin, (req, res) => {
  const { postId, reason } = req.body;
  const idx = posts.findIndex(p => p.id === postId);
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });

  const deletedPost = posts[idx];
  posts.splice(idx, 1);
  savePosts();

  // Auto-resolve associated reports
  reports.forEach(r => {
    if (r.postId === postId && r.status === 'pending') {
      r.status = 'resolved';
      r.resolvedAction = 'post_deleted';
      r.resolvedAt = Date.now();
    }
  });
  saveReports();

  addAuditLog('DELETE_POST', `Deleted post "${deletedPost.title.slice(0, 30)}" by ${deletedPost.author.name}. Reason: ${reason || 'ละเมิดกฎ'}`);

  // Broadcast to all clients
  io.emit('post_deleted', { postId, reason: reason || 'ละเมิดกฎระเบียบ' });

  res.json({ success: true, postId });
});

app.post('/api/manager/resolve-report', requireAdmin, (req, res) => {
  const { reportId, action } = req.body;
  const rep = reports.find(r => r.id === reportId);
  if (!rep) return res.status(404).json({ error: 'Report not found' });

  rep.status = 'resolved';
  rep.resolvedAction = action || 'dismissed';
  rep.resolvedAt = Date.now();
  saveReports();

  addAuditLog('RESOLVE_REPORT', `Report ${reportId} resolved with action: ${action || 'dismissed'}`);
  io.emit('report_resolved', { reportId, action });

  res.json({ success: true, report: rep });
});

app.post('/api/manager/delete-comment', requireAdmin, (req, res) => {
  const { postId, commentId, reason } = req.body;
  const post = posts.find(p => p.id === postId);
  if (!post || !post.comments) return res.status(404).json({ error: 'Comment not found' });

  const cIdx = post.comments.findIndex(c => c.id === commentId);
  if (cIdx === -1) return res.status(404).json({ error: 'Comment not found' });

  const deletedC = post.comments[cIdx];
  post.comments.splice(cIdx, 1);
  savePosts();

  addAuditLog('DELETE_COMMENT', `Deleted comment by ${deletedC.author.name} on post ${postId}. Reason: ${reason || 'ละเมิดกฎ'}`);

  io.emit('comment_deleted', { postId, commentId, reason: reason || 'ละเมิดกฎระเบียบ' });

  res.json({ success: true, commentId });
});

// Update Request Status (Roadmap Feature for 'requests' channel)
app.post('/api/manager/update-request-status', requireAdmin, (req, res) => {
  const { postId, status, officialResponse } = req.body;
  const post = posts.find(p => p.id === postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const validStatuses = ['pending', 'in_progress', 'resolved'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  if (status) post.status = status;
  if (typeof officialResponse === 'string') {
    post.officialResponse = sanitizeInput(officialResponse, 1500);
  }
  post.statusUpdatedAt = Date.now();
  savePosts();

  addAuditLog('UPDATE_REQUEST_STATUS', `Updated post ${postId} status to ${post.status}`);

  io.emit('post_status_updated', {
    postId: post.id,
    status: post.status,
    officialResponse: post.officialResponse,
    statusUpdatedAt: post.statusUpdatedAt
  });

  res.json({ success: true, post });
});

// Export Data Endpoint (Roadmap Feature for Manager Portal)
app.get('/api/manager/export-data', requireAdmin, (req, res) => {
  const exportType = req.query.type || 'posts';

  if (exportType === 'posts') {
    const exportData = posts.map(p => ({
      id: p.id,
      channel: p.channel,
      authorName: p.author?.name || 'Anon',
      authorRole: p.author?.role || 'student',
      title: p.title,
      content: p.content,
      tags: (p.tags || []).join('; '),
      status: p.status || 'N/A',
      officialResponse: p.officialResponse || '',
      upvotes: p.upvotes || 0,
      downvotes: p.downvotes || 0,
      commentsCount: (p.comments || []).length,
      createdAt: new Date(p.timestamp).toISOString()
    }));
    return res.json({ success: true, type: 'posts', data: exportData });
  }

  if (exportType === 'reports') {
    const exportReports = reports.map(r => ({
      id: r.id,
      postId: r.postId,
      postTitle: r.postTitle,
      postAuthor: r.postAuthor,
      reason: r.reason,
      status: r.status,
      resolvedAction: r.resolvedAction || 'none',
      createdAt: new Date(r.timestamp).toISOString()
    }));
    return res.json({ success: true, type: 'reports', data: exportReports });
  }

  res.status(400).json({ error: 'Invalid export type' });
});

app.post('/api/manager/ban-user', requireAdmin, (req, res) => {
  const { authorName, studentId, userId, reason } = req.body;
  if (!authorName && !studentId && !userId) return res.status(400).json({ error: 'Missing target user' });

  // Resolve studentId from post author if not directly provided
  let resolvedStudentId = studentId || null;
  let resolvedUserId = userId || null;
  if (!resolvedStudentId) {
    const matchingPost = posts.find(p => p.author && p.author.name === authorName && p.authorInternal?.studentId);
    if (matchingPost) {
      resolvedStudentId = matchingPost.authorInternal.studentId;
      resolvedUserId = matchingPost.authorInternal.userId;
    }
  }

  if (!isBanned(authorName, resolvedStudentId, resolvedUserId)) {
    bannedUsers.push({
      name: authorName || 'Unknown',
      studentId: resolvedStudentId,
      userId: resolvedUserId,
      reason: reason || 'ละเมิดกฎการใช้งาน',
      bannedAt: Date.now()
    });
    saveBanned();
    addAuditLog('BAN_USER', `Banned user ${authorName || ''} (Student ID: ${resolvedStudentId || 'N/A'}). Reason: ${reason || 'ละเมิดกฎ'}`);

    io.emit('author_banned', { authorName, studentId: resolvedStudentId, reason: reason || 'ละเมิดกฎการใช้งาน' });
  }

  res.json({ success: true, bannedUsers });
});

app.post('/api/manager/unban-user', requireAdmin, (req, res) => {
  const { authorName, studentId } = req.body;
  bannedUsers = bannedUsers.filter(u => {
    if (authorName && u.name === authorName) return false;
    if (studentId && u.studentId === studentId) return false;
    return true;
  });
  saveBanned();

  addAuditLog('UNBAN_USER', `Unbanned user ${authorName || studentId}`);
  res.json({ success: true, bannedUsers });
});

// Socket.io Real-time connection handling
let activeSocketsCount = 0;

io.on('connection', (socket) => {
  activeSocketsCount++;
  io.emit('online_count', activeSocketsCount);

  // Send initial data to client
  socket.emit('init_data', {
    posts,
    shouts: shouts.slice(-30),
    onlineCount: activeSocketsCount
  });

  // Client creates a new post
  socket.on('create_post', (data) => {
    if (!data.title || !data.content || !data.channel) return;

    const socketIp = socket.handshake.address || 'unknown';
    // Rate limit: 1 post per 10s per socket
    if (!checkRateLimit(`post_${socket.id}`, 1, 10000)) {
      socket.emit('action_blocked', { message: 'กรุณารอสักครู่ (10 วินาที) ก่อนโพสต์กระทู้ถัดไป เพื่อป้องกันข้อความซ้ำซ้อน' });
      return;
    }

    const authorName = sanitizeInput(data.author?.name || 'Anon', 50);

    // Resolve student user if token is provided
    const studentToken = data.studentToken || data.author?.studentToken;
    const student = studentToken ? users.find(u => u.token === studentToken) : null;

    if (isBanned(authorName, student?.studentId, student?.id)) {
      socket.emit('action_blocked', { message: 'ตัวตนหรือบัญชีของคุณถูกระงับสิทธิ์เนื่องจากละเมิดกฎการใช้งาน' });
      return;
    }

    // STRICT PERMISSION: Announcements channel can ONLY be posted by Manager
    if (data.channel === 'announcements') {
      const token = data.adminToken;
      const isAdmin = token && isValidAdminToken(token);
      if (!isAdmin) {
        socket.emit('action_blocked', { message: '📢 ห้องประกาศอนุญาตให้เฉพาะผู้ดูแล (Manager) โพสต์ผ่านหน้าจัดการ (Manager Portal) เท่านั้น' });
        return;
      }
    }

    // Cryptographic role verification to prevent spoofing
    let verifiedRole = 'student';
    let isOfficial = false;
    let verifiedBadge = sanitizeInput(data.author?.badge || '👤', 10);

    if (data.author?.role === 'teacher' && isValidRoleToken(data.author?.roleToken, 'teacher')) {
      verifiedRole = 'teacher';
      isOfficial = true;
      verifiedBadge = '👨‍🏫';
    } else if (data.author?.role === 'moderator' && isValidRoleToken(data.author?.roleToken, 'moderator')) {
      verifiedRole = 'moderator';
      isOfficial = true;
      verifiedBadge = '🛡️';
    } else if (data.author?.role === 'admin' && isValidAdminToken(data.adminToken)) {
      verifiedRole = 'admin';
      isOfficial = true;
      verifiedBadge = '👑';
    }

    const cleanTitle = sanitizeInput(data.title, 150);
    const cleanContent = sanitizeInput(data.content, 3000);
    if (!cleanTitle || !cleanContent) return;

    const cleanTags = Array.isArray(data.tags)
      ? data.tags.slice(0, 5).map(t => sanitizeInput(t, 30)).filter(Boolean)
      : [];

    const newPost = {
      id: 'post_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      channel: data.channel,
      author: {
        name: authorName,
        badge: verifiedBadge,
        color: sanitizeInput(data.author?.color || '#a855f7', 20),
        role: verifiedRole,
        official: isOfficial
      },
      authorInternal: {
        studentId: student ? student.studentId : null,
        userId: student ? student.id : null
      },
      title: cleanTitle,
      content: cleanContent,
      tags: cleanTags,
      timestamp: Date.now(),
      upvotes: 1,
      downvotes: 0,
      reactions: { '🔥': 0, '💀': 0, '💡': 0, '🤫': 0, '❤️': 0 },
      comments: [],
      status: data.channel === 'requests' ? 'pending' : undefined,
      officialResponse: data.channel === 'requests' ? '' : undefined
    };

    posts.unshift(newPost);
    savePosts();

    // Broadcast to everyone (anonymized, no studentId/userId in public socket payload)
    const broadcastPost = { ...newPost };
    delete broadcastPost.authorInternal;
    io.emit('new_post', broadcastPost);
  });

  // Client votes on a post
  socket.on('vote_post', ({ postId, type }) => {
    // Rate limit: 10 votes per 5 seconds
    if (!checkRateLimit(`vote_${socket.id}`, 10, 5000)) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    if (type === 'up') {
      post.upvotes = (post.upvotes || 0) + 1;
    } else if (type === 'down') {
      post.downvotes = (post.downvotes || 0) + 1;
    }
    savePosts();

    io.emit('post_voted', {
      postId,
      upvotes: post.upvotes,
      downvotes: post.downvotes
    });
  });

  // Client reacts with emoji
  socket.on('react_post', ({ postId, emoji, userSessionId }) => {
    // Rate limit: 10 reactions per 5 seconds
    if (!checkRateLimit(`react_${socket.id}`, 10, 5000)) return;

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const safeEmoji = sanitizeInput(emoji, 10);
    if (!post.reactions) post.reactions = {};
    post.reactions[safeEmoji] = (post.reactions[safeEmoji] || 0) + 1;
    savePosts();

    io.emit('post_reacted', {
      postId,
      emoji: safeEmoji,
      reactions: post.reactions,
      userSessionId
    });
  });

  // Client adds a comment
  socket.on('add_comment', ({ postId, author, content, studentToken }) => {
    // Rate limit: 1 comment per 3s
    if (!checkRateLimit(`comment_${socket.id}`, 1, 3000)) {
      socket.emit('action_blocked', { message: 'โปรดรอสักครู่ก่อนแสดงความคิดเห็นถัดไป' });
      return;
    }

    const authorName = sanitizeInput(author?.name || 'Anon', 50);
    const student = studentToken ? users.find(u => u.token === studentToken) : null;

    if (isBanned(authorName, student?.studentId, student?.id)) {
      socket.emit('action_blocked', { message: 'ตัวตนหรือบัญชีของคุณถูกระงับสิทธิ์เนื่องจากละเมิดกฎการใช้งาน' });
      return;
    }

    const post = posts.find(p => p.id === postId);
    if (!post || !content) return;

    const cleanContent = sanitizeInput(content, 1000);
    if (!cleanContent) return;

    // Cryptographic role verification for comments
    let verifiedRole = 'student';
    let isOfficial = false;
    let verifiedBadge = sanitizeInput(author?.badge || '💬', 10);

    if (author?.role === 'teacher' && isValidRoleToken(author?.roleToken, 'teacher')) {
      verifiedRole = 'teacher';
      isOfficial = true;
      verifiedBadge = '👨‍🏫';
    } else if (author?.role === 'moderator' && isValidRoleToken(author?.roleToken, 'moderator')) {
      verifiedRole = 'moderator';
      isOfficial = true;
      verifiedBadge = '🛡️';
    }

    if (!post.comments) post.comments = [];

    const newComment = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      author: {
        name: authorName,
        badge: verifiedBadge,
        color: sanitizeInput(author?.color || '#06b6d4', 20),
        role: verifiedRole,
        official: isOfficial
      },
      content: cleanContent,
      timestamp: Date.now()
    };

    post.comments.push(newComment);
    savePosts();

    io.emit('new_comment', {
      postId,
      comment: newComment,
      totalComments: post.comments.length
    });
  });

  // Live typing indicator
  socket.on('typing', ({ postId, authorName, isTyping }) => {
    socket.broadcast.emit('user_typing', { 
      postId, 
      authorName: sanitizeInput(authorName || 'Anon', 50), 
      isTyping: !!isTyping 
    });
  });

  // Live shoutbox message
  socket.on('send_shout', ({ author, text, studentToken }) => {
    // Rate limit: 1 shout per 2s
    if (!checkRateLimit(`shout_${socket.id}`, 1, 2000)) {
      socket.emit('action_blocked', { message: 'พิมพ์คุยสดเร็วเกินไป โปรดรอ 2 วินาที' });
      return;
    }

    const authorName = sanitizeInput(author?.name || 'Anon', 50);
    const student = studentToken ? users.find(u => u.token === studentToken) : null;

    if (isBanned(authorName, student?.studentId, student?.id)) {
      socket.emit('action_blocked', { message: 'ตัวตนหรือบัญชีของคุณถูกระงับสิทธิ์เนื่องจากละเมิดกฎการใช้งาน' });
      return;
    }

    const cleanText = sanitizeInput(text, 140);
    if (!cleanText) return;

    const shout = {
      id: 's_' + Date.now(),
      author: authorName,
      badge: sanitizeInput(author?.badge || '💬', 10),
      color: sanitizeInput(author?.color || '#a855f7', 20),
      text: cleanText,
      time: Date.now()
    };

    shouts.push(shout);
    saveShouts();

    io.emit('new_shout', shout);
  });

  // Client reports a post for manager moderation
  socket.on('report_post', ({ postId, reason, details, reporterName }) => {
    // Rate limit: 3 reports per 30s
    if (!checkRateLimit(`report_${socket.id}`, 3, 30000)) {
      socket.emit('action_blocked', { message: 'ส่งรายงานบ่อยเกินไป โปรดรอสักครู่' });
      return;
    }

    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const newReport = {
      id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      postId: post.id,
      postTitle: sanitizeInput(post.title, 150),
      postAuthor: post.author?.name || 'Anon',
      postChannel: post.channel,
      postContent: sanitizeInput(post.content, 500),
      reason: sanitizeInput(reason || 'ละเมิดกฎระเบียบ', 100),
      details: sanitizeInput(details || '', 500),
      reporterName: sanitizeInput(reporterName || 'Anon', 50),
      timestamp: Date.now(),
      status: 'pending'
    };

    reports.unshift(newReport);
    saveReports();

    addAuditLog('REPORT_POST', `Post "${post.title.slice(0, 30)}" reported by ${reporterName || 'Anon'}. Reason: ${reason}`);

    // Broadcast report event to managers
    io.emit('new_report_received', newReport);

    // Confirm back to sender
    socket.emit('report_submitted_success', { reportId: newReport.id, postId: post.id });
  });

  socket.on('disconnect', () => {
    activeSocketsCount = Math.max(0, activeSocketsCount - 1);
    io.emit('online_count', activeSocketsCount);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`🚀 TLWconnect server running at:`);
  console.log(`   - Local PC:       http://localhost:${PORT}`);
  console.log(`   - Phone (Wi-Fi):  http://${localIp}:${PORT}`);
  console.log(`   - Direct Online:  https://closely-assure-sit-lines.trycloudflare.com (Direct, No Password, 4G/5G)`);
  console.log(`🛡️ Manager Portal:  http://${localIp}:${PORT}/manager.html`);
});
