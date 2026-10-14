import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || 'tlw2026';
const TEACHER_PIN = process.env.TEACHER_PIN || 'tlw-teacher-2026';
const MOD_PIN = process.env.MOD_PIN || 'tlw-mod-2026';
const ADMIN_TOKEN_FALLBACK = 'tlw_manager_auth_token_secret_key';
const activeTokens = new Set([ADMIN_TOKEN_FALLBACK]);

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

function isBanned(authorName) {
  if (!authorName) return false;
  return bannedUsers.some(u => u.name === authorName);
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
  if (token && activeTokens.has(token)) {
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

  if (role === 'teacher') {
    if (pin === TEACHER_PIN) {
      addAuditLog('ROLE_VERIFIED', `Teacher role verified from IP ${clientIp}`);
      return res.json({ success: true, role: 'teacher', badge: '👨‍🏫 ครู ท.ล.ว.', verified: true });
    }
    return res.status(403).json({ success: false, error: 'รหัสยืนยันคุณครูไม่ถูกต้อง' });
  } else if (role === 'moderator') {
    if (pin === MOD_PIN) {
      addAuditLog('ROLE_VERIFIED', `Moderator role verified from IP ${clientIp}`);
      return res.json({ success: true, role: 'moderator', badge: '🛡️ ผู้ตรวจการ', verified: true });
    }
    return res.status(403).json({ success: false, error: 'รหัสยืนยันผู้ตรวจการไม่ถูกต้อง' });
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

app.get('/api/network-info', (req, res) => {
  const localIp = getLocalIp();
  res.json({
    localIp,
    port: PORT,
    localUrl: `http://${localIp}:${PORT}`,
    tunnelUrl: 'https://closely-assure-sit-lines.trycloudflare.com',
    tunnelPassword: ''
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
    activeTokens.add(sessionToken);

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

app.get('/api/manager/overview', requireAdmin, (req, res) => {
  res.json({
    totalPosts: posts.length,
    activeSocketsCount,
    bannedCount: bannedUsers.length,
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
    auditLogs: auditLogs.slice(0, 30)
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

app.post('/api/manager/ban-user', requireAdmin, (req, res) => {
  const { authorName, reason } = req.body;
  if (!authorName) return res.status(400).json({ error: 'Missing authorName' });

  if (!isBanned(authorName)) {
    bannedUsers.push({
      name: authorName,
      reason: reason || 'ละเมิดกฎการใช้งาน',
      bannedAt: Date.now()
    });
    saveBanned();
    addAuditLog('BAN_USER', `Banned user ${authorName}. Reason: ${reason || 'ละเมิดกฎ'}`);

    io.emit('author_banned', { authorName, reason: reason || 'ละเมิดกฎการใช้งาน' });
  }

  res.json({ success: true, bannedUsers });
});

app.post('/api/manager/unban-user', requireAdmin, (req, res) => {
  const { authorName } = req.body;
  bannedUsers = bannedUsers.filter(u => u.name !== authorName);
  saveBanned();

  addAuditLog('UNBAN_USER', `Unbanned user ${authorName}`);
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
    const authorRole = data.author?.role || 'student';

    if (isBanned(authorName)) {
      socket.emit('action_blocked', { message: 'ตัวตนของคุณถูกระงับสิทธิ์เนื่องจากละเมิดกฎการใช้งาน' });
      return;
    }

    // STRICT PERMISSION: Announcements channel can ONLY be posted by Manager
    if (data.channel === 'announcements') {
      const token = data.adminToken;
      const isAdmin = token && activeTokens.has(token);
      if (!isAdmin) {
        socket.emit('action_blocked', { message: '📢 ห้องประกาศอนุญาตให้เฉพาะผู้ดูแล (Manager) โพสต์ผ่านหน้าจัดการ (Manager Portal) เท่านั้น' });
        return;
      }
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
        badge: sanitizeInput(data.author?.badge || '👤', 10),
        color: sanitizeInput(data.author?.color || '#a855f7', 20),
        role: authorRole,
        official: authorRole === 'teacher' || authorRole === 'admin'
      },
      title: cleanTitle,
      content: cleanContent,
      tags: cleanTags,
      timestamp: Date.now(),
      upvotes: 1,
      downvotes: 0,
      reactions: { '🔥': 0, '💀': 0, '💡': 0, '🤫': 0, '❤️': 0 },
      comments: []
    };

    posts.unshift(newPost);
    savePosts();

    // Broadcast to everyone
    io.emit('new_post', newPost);
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
  socket.on('add_comment', ({ postId, author, content }) => {
    // Rate limit: 1 comment per 3s
    if (!checkRateLimit(`comment_${socket.id}`, 1, 3000)) {
      socket.emit('action_blocked', { message: 'โปรดรอสักครู่ก่อนแสดงความคิดเห็นถัดไป' });
      return;
    }

    const authorName = sanitizeInput(author?.name || 'Anon', 50);
    const authorRole = author?.role || 'student';

    if (isBanned(authorName)) {
      socket.emit('action_blocked', { message: 'ตัวตนของคุณถูกระงับสิทธิ์เนื่องจากละเมิดกฎการใช้งาน' });
      return;
    }

    const post = posts.find(p => p.id === postId);
    if (!post || !content) return;

    const cleanContent = sanitizeInput(content, 1000);
    if (!cleanContent) return;

    if (!post.comments) post.comments = [];

    const newComment = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      author: {
        name: authorName,
        badge: sanitizeInput(author?.badge || '💬', 10),
        color: sanitizeInput(author?.color || '#06b6d4', 20),
        role: authorRole,
        official: authorRole === 'teacher' || authorRole === 'admin'
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
  socket.on('send_shout', ({ author, text }) => {
    // Rate limit: 1 shout per 2s
    if (!checkRateLimit(`shout_${socket.id}`, 1, 2000)) {
      socket.emit('action_blocked', { message: 'พิมพ์คุยสดเร็วเกินไป โปรดรอ 2 วินาที' });
      return;
    }

    const authorName = sanitizeInput(author?.name || 'Anon', 50);
    if (isBanned(authorName)) {
      socket.emit('action_blocked', { message: 'ตัวตนของคุณถูกระงับสิทธิ์เนื่องจากละเมิดกฎการใช้งาน' });
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
