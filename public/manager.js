// =====================================================================
// TLWconnect — MANAGER PORTAL JAVASCRIPT
// =====================================================================

let socket = null;
let authToken = sessionStorage.getItem('tlw_manager_token') || null;
let currentPosts = [];
let bannedUsersList = [];
let auditLogsList = [];
let reportsList = [];
let usersList = [];

let activeTab = 'posts';
let selectedChannel = 'all';
let searchQuery = '';
let filterReportStatus = 'pending';

let pendingDeletePostId = null;
let pendingDeletePostAuthor = null;
let inspectPostId = null;

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const dashboardApp = document.getElementById('dashboard-app');
const loginForm = document.getElementById('manager-login-form');
const passcodeInput = document.getElementById('passcode-input');
const loginErrorMsg = document.getElementById('login-error-msg');
const btnLogout = document.getElementById('btn-logout');

// Metrics
const metricTotalPosts = document.getElementById('metric-total-posts');
const metricPendingReportsCount = document.getElementById('metric-pending-reports-count');
const metricReportsTabBadge = document.getElementById('metric-reports-tab-badge');
const metricRequestsCount = document.getElementById('metric-requests-count');
const metricVentCount = document.getElementById('metric-vent-count');
const metricBannedCount = document.getElementById('metric-banned-count');
const dashOnlineStatus = document.getElementById('dash-online-status');

// Tabs
const navTabs = document.querySelectorAll('.nav-tab');
const tabPostsView = document.getElementById('tab-posts-view');
const tabAnnouncementsView = document.getElementById('tab-announcements-view');
const tabReportsView = document.getElementById('tab-reports-view');
const tabBannedView = document.getElementById('tab-banned-view');
const tabAuditView = document.getElementById('tab-audit-view');
const tabStudentsView = document.getElementById('tab-students-view');
const studentsTbody = document.getElementById('students-tbody');
const studentsEmptyMessage = document.getElementById('students-empty-message');
const studentsViewCount = document.getElementById('students-view-count');
const metricStudentsTabBadge = document.getElementById('metric-students-tab-badge');

// Announcements elements
const managerAnnouncementForm = document.getElementById('manager-announcement-form');
const announceTitleInput = document.getElementById('announce-title-input');
const announceAuthorInput = document.getElementById('announce-author-input');
const announceContentInput = document.getElementById('announce-content-input');
const announceTagsInput = document.getElementById('announce-tags-input');
const announcementsTbody = document.getElementById('announcements-tbody');
const announcementsEmptyMessage = document.getElementById('announcements-empty-message');
const announcementsCount = document.getElementById('announcements-count');

// Table Controls
const filterChannelSelect = document.getElementById('filter-channel-select');
const filterSearchInput = document.getElementById('filter-search-input');
const btnRefreshPosts = document.getElementById('btn-refresh-posts');
const filterReportStatusSelect = document.getElementById('filter-report-status');
const btnRefreshReports = document.getElementById('btn-refresh-reports');

// Tables
const moderationPostsTbody = document.getElementById('moderation-posts-tbody');
const postsEmptyMessage = document.getElementById('posts-empty-message');
const reportsTbody = document.getElementById('reports-tbody');
const reportsEmptyMessage = document.getElementById('reports-empty-message');
const bannedUsersTbody = document.getElementById('banned-users-tbody');
const bannedEmptyMessage = document.getElementById('banned-empty-message');
const auditLogsTbody = document.getElementById('audit-logs-tbody');

// Delete Modal
const deleteModal = document.getElementById('delete-modal');
const deletePreviewContent = document.getElementById('delete-preview-content');
const deleteReasonSelect = document.getElementById('delete-reason-select');
const checkBanAuthorToo = document.getElementById('check-ban-author-too');
const btnConfirmDelete = document.getElementById('btn-confirm-delete');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');

// Comments Modal
const commentsModal = document.getElementById('comments-modal');
const commentsModalPostTitle = document.getElementById('comments-modal-post-title');
const modalCommentsList = document.getElementById('modal-comments-list');
const btnDoneComments = document.getElementById('btn-done-comments');
const btnCloseCommentsModal = document.getElementById('btn-close-comments-modal');

const managerToast = document.getElementById('manager-toast');

const CHANNEL_LABELS = {
  announcements: { name: 'ห้องประกาศ', icon: '📢', color: '#38bdf8' },
  vent: { name: 'ห้องระบาย', icon: '🌧️', color: '#a855f7' },
  suggestions: { name: 'ห้องข้อเสนอแนะ', icon: '💡', color: '#3b82f6' },
  requests: { name: 'ห้องส่งคำร้อง', icon: '📋', color: '#f59e0b' },
  guidance: { name: 'ห้องแนะแนว', icon: '🧭', color: '#10b981' }
};

// ================= INIT =================
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  if (authToken) {
    showDashboard();
  } else {
    showLogin();
  }
});

function showLogin() {
  loginOverlay.classList.remove('hidden');
  dashboardApp.classList.add('hidden');
  passcodeInput.value = '';
  loginErrorMsg.classList.add('hidden');
  passcodeInput.focus();
}

function showDashboard() {
  loginOverlay.classList.add('hidden');
  dashboardApp.classList.remove('hidden');
  initSocket();
  fetchOverviewData();
}

// ================= SOCKET.IO =================
function initSocket() {
  if (socket) return;
  socket = io();

  socket.on('connect', () => {
    dashOnlineStatus.textContent = 'ระบบ Real-time เชื่อมต่อแล้ว';
  });

  socket.on('online_count', (count) => {
    dashOnlineStatus.textContent = `ออนไลน์ ${count} คน (Real-time)`;
  });

  socket.on('new_post', (post) => {
    currentPosts.unshift(post);
    updateMetrics();
    renderPostsTable();
    showToast(`มีกระทู้ใหม่: "${post.title.slice(0, 30)}..."`);
  });

  socket.on('post_deleted', ({ postId, reason }) => {
    currentPosts = currentPosts.filter(p => p.id !== postId);
    updateMetrics();
    renderPostsTable();
  });

  socket.on('comment_deleted', ({ postId, commentId }) => {
    const p = currentPosts.find(post => post.id === postId);
    if (p && p.comments) {
      p.comments = p.comments.filter(c => c.id !== commentId);
      renderPostsTable();
      if (inspectPostId === postId) {
        renderModalComments(p);
      }
    }
  });

  socket.on('new_comment', ({ postId, comment }) => {
    const p = currentPosts.find(post => post.id === postId);
    if (p) {
      if (!p.comments) p.comments = [];
      p.comments.push(comment);
      renderPostsTable();
      if (inspectPostId === postId) {
        renderModalComments(p);
      }
    }
  });

  // Report Events
  socket.on('new_report_received', (report) => {
    reportsList.unshift(report);
    updateMetrics();
    renderReportsTable();
    renderPostsTable();
    showToast(`🚨 มีรายงานใหม่: "${report.postTitle ? report.postTitle.slice(0, 25) : 'กระทู้'}..."`);
  });

  socket.on('report_resolved', ({ reportId, action }) => {
    const rep = reportsList.find(r => r.id === reportId);
    if (rep) {
      rep.status = 'resolved';
      rep.resolvedAction = action;
      rep.resolvedAt = Date.now();
    }
    updateMetrics();
    renderReportsTable();
    renderPostsTable();
  });
}

// ================= API CALLS =================
async function fetchOverviewData() {
  try {
    const res = await fetch('/api/manager/overview', {
      headers: { Authorization: authToken }
    });
    if (!res.ok) {
      sessionStorage.removeItem('tlw_manager_token');
      authToken = null;
      showLogin();
      return;
    }
    const data = await res.json();
    currentPosts = data.posts || [];
    bannedUsersList = data.bannedUsers || [];
    auditLogsList = data.auditLogs || [];
    reportsList = data.reports || [];
    usersList = data.users || [];
    registeredStudentsCount = data.registeredStudentsCount || usersList.length;

    updateMetrics();
    renderPostsTable();
    renderAnnouncementsTable();
    renderReportsTable();
    renderBannedTable();
    renderAuditLogsTable();
    renderStudentsTable();
  } catch (err) {
    console.error('Error fetching overview:', err);
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล');
  }
}

let registeredStudentsCount = 0;

// ================= RENDERING =================
function updateMetrics() {
  metricTotalPosts.textContent = currentPosts.length;
  const pendingCount = reportsList.filter(r => r.status === 'pending').length;
  if (metricPendingReportsCount) metricPendingReportsCount.textContent = pendingCount;
  if (metricReportsTabBadge) metricReportsTabBadge.textContent = pendingCount;
  metricRequestsCount.textContent = currentPosts.filter(p => p.channel === 'requests').length;
  metricVentCount.textContent = currentPosts.filter(p => p.channel === 'vent').length;
  metricBannedCount.textContent = bannedUsersList.length;
  const metricStudentsCount = document.getElementById('metric-students-count');
  if (metricStudentsCount) metricStudentsCount.textContent = registeredStudentsCount;
  if (metricStudentsTabBadge) metricStudentsTabBadge.textContent = registeredStudentsCount;
  if (studentsViewCount) studentsViewCount.textContent = registeredStudentsCount;
}

function renderPostsTable() {
  let filtered = [...currentPosts];

  if (selectedChannel !== 'all') {
    filtered = filtered.filter(p => p.channel === selectedChannel);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.author.name.toLowerCase().includes(q) ||
      (p.authorStudent && (
        p.authorStudent.fullName.toLowerCase().includes(q) ||
        p.authorStudent.studentId.toLowerCase().includes(q)
      )) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  moderationPostsTbody.innerHTML = '';

  if (filtered.length === 0) {
    postsEmptyMessage.classList.remove('hidden');
    return;
  }
  postsEmptyMessage.classList.add('hidden');

  filtered.forEach(post => {
    const ch = CHANNEL_LABELS[post.channel] || { name: post.channel, icon: '💬', color: '#8b5cf6' };
    const score = (post.upvotes || 0) - (post.downvotes || 0);
    const commentsCount = post.comments ? post.comments.length : 0;
    const isAuthorBanned = bannedUsersList.some(u => u.name === post.author.name);
    const postPendingReports = reportsList.filter(r => r.postId === post.id && r.status === 'pending');
    const reportBadgeHtml = postPendingReports.length > 0
      ? `<button class="badge-reported" data-goto-report="${post.id}" title="กระทู้นี้ถูกรายงาน ${postPendingReports.length} ครั้ง (คลิกเพื่อเปิดแท็บรายงาน)">🚨 มีรายงาน (${postPendingReports.length})</button>`
      : '';

    const tr = document.createElement('tr');
    tr.id = `row-post-${post.id}`;
    tr.innerHTML = `
      <td>
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.55rem; border-radius: 9999px; background: ${ch.color}20; color: #fff; border: 1px solid ${ch.color}40;">
          ${ch.icon} ${ch.name}
        </span>
      </td>
      <td>
        <div class="author-cell">
          <div class="author-badge-sm" style="background: ${post.author.color || '#a855f7'}25; border: 1px solid ${post.author.color || '#a855f7'}50;">
            ${post.author.badge || '👤'}
          </div>
          <div>
            <div class="author-name-sm">${escapeHtml(post.author.name)}</div>
            ${post.author.role === 'teacher' ? '<span style="color: #60a5fa; font-size: 0.65rem; font-weight: 700;">[ครู ท.ล.ว.] </span>' : ''}
            ${post.author.role === 'moderator' ? '<span style="color: #f59e0b; font-size: 0.65rem; font-weight: 700;">[สภานักเรียน] </span>' : ''}
            ${isAuthorBanned ? '<span style="color: #ef4444; font-size: 0.65rem; font-weight: 700;">[BANNED]</span>' : ''}
          </div>
        </div>
      </td>
      <td>
        ${post.authorStudent ? `
          <div class="student-identity-cell" style="display: flex; flex-direction: column; gap: 3px;">
            <div style="font-size: 0.82rem; font-weight: 600; color: #f8fafc; display: flex; align-items: center; gap: 4px;">
              <span>👤</span><span>${escapeHtml(post.authorStudent.fullName)}</span>
            </div>
            <div style="font-size: 0.73rem; color: #fbbf24; font-family: var(--font-mono); font-weight: 500;">
              🎓 รหัส ${escapeHtml(post.authorStudent.studentId)}
            </div>
          </div>
        ` : `
          <span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">
            ${post.author?.role === 'admin' ? '🛡️ ผู้ดูแลระบบ' : (post.author?.role === 'teacher' ? '👨‍🏫 คุณครู' : '(ไม่ได้ผูกบัญชีนักเรียน)')}
          </span>
        `}
      </td>
      <td>
        <div class="post-cell-content">
          <span class="post-cell-title">${escapeHtml(post.title)} ${reportBadgeHtml}</span>
          <span class="post-cell-body">${escapeHtml(post.content)}</span>
          ${post.tags && post.tags.length ? `
            <div class="post-cell-tags">
              ${post.tags.map(t => `<span class="cell-tag">#${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </td>
      <td style="text-align: center; font-weight: 700; font-family: var(--font-mono); color: ${score >= 0 ? '#10b981' : '#ef4444'};">
        ${score}
      </td>
      <td style="text-align: center;">
        <button class="action-btn btn-comments-view" data-post-id="${post.id}" title="ดูคอมเมนต์">
          💬 ${commentsCount}
        </button>
      </td>
      <td style="font-size: 0.75rem; color: var(--text-muted);">
        ${formatRelativeTime(post.timestamp)}
      </td>
      <td>
        <div class="table-actions">
          ${post.channel === 'requests' ? `
            <button class="action-btn btn-status" data-post-id="${post.id}" style="border-color: rgba(234, 179, 8, 0.4); color: #facc15;" title="อัปเดตสถานะคำร้อง">
              📋 ${post.status === 'in_progress' ? 'กำลังทำ' : (post.status === 'resolved' ? 'เสร็จสิ้น' : 'รอตรวจ')}
            </button>
          ` : ''}
          <button class="action-btn btn-delete" data-post-id="${post.id}" data-author-name="${escapeHtml(post.author.name)}" data-post-title="${escapeHtml(post.title)}" title="ลบกระทู้">
            🗑️ ลบ
          </button>
          ${!isAuthorBanned ? `
            <button class="action-btn btn-ban" data-author-name="${escapeHtml(post.author.name)}" title="แบนผู้โพสต์">
              🚫 แบน
            </button>
          ` : ''}
        </div>
      </td>
    `;

    moderationPostsTbody.appendChild(tr);
  });

  // Attach button events
  moderationPostsTbody.querySelectorAll('.btn-status').forEach(btn => {
    btn.addEventListener('click', () => {
      openRequestModal(btn.dataset.postId);
    });
  });

  moderationPostsTbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(btn.dataset.postId, btn.dataset.postTitle, btn.dataset.authorName);
    });
  });

  moderationPostsTbody.querySelectorAll('.btn-ban').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmBanAuthor(btn.dataset.authorName);
    });
  });

  moderationPostsTbody.querySelectorAll('.btn-comments-view').forEach(btn => {
    btn.addEventListener('click', () => {
      openCommentsModal(btn.dataset.postId);
    });
  });

  moderationPostsTbody.querySelectorAll('.badge-reported').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'reports'));
      activeTab = 'reports';
      tabPostsView.classList.add('hidden');
      if (tabAnnouncementsView) tabAnnouncementsView.classList.add('hidden');
      tabReportsView.classList.remove('hidden');
      tabBannedView.classList.add('hidden');
      tabAuditView.classList.add('hidden');
      if (tabStudentsView) tabStudentsView.classList.add('hidden');
      if (filterReportStatusSelect) {
        filterReportStatusSelect.value = 'pending';
        filterReportStatus = 'pending';
      }
      renderReportsTable();
    });
  });
}

function renderReportsTable() {
  let filtered = [...reportsList];

  if (filterReportStatus === 'pending') {
    filtered = filtered.filter(r => r.status === 'pending');
  } else if (filterReportStatus === 'resolved') {
    filtered = filtered.filter(r => r.status === 'resolved');
  }

  reportsTbody.innerHTML = '';

  if (filtered.length === 0) {
    reportsEmptyMessage.classList.remove('hidden');
    return;
  }
  reportsEmptyMessage.classList.add('hidden');

  filtered.forEach(rep => {
    const ch = CHANNEL_LABELS[rep.postChannel] || { name: rep.postChannel || 'ทั่วไป', icon: '💬', color: '#8b5cf6' };
    const isPending = rep.status === 'pending';
    const isAuthorBanned = bannedUsersList.some(u => u.name === rep.postAuthor);

    const statusBadge = isPending
      ? `<span class="status-badge-pending">⏳ รอดำเนินการ</span>`
      : `<span class="status-badge-resolved">✅ ดำเนินการแล้ว (${rep.resolvedAction || 'resolved'})</span>`;

    const tr = document.createElement('tr');
    tr.id = `row-report-${rep.id}`;
    tr.innerHTML = `
      <td>${statusBadge}</td>
      <td>
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.55rem; border-radius: 9999px; background: ${ch.color}20; color: #fff; border: 1px solid ${ch.color}40;">
          ${ch.icon} ${ch.name}
        </span>
      </td>
      <td>
        <div class="post-cell-content">
          <span class="post-cell-title" style="color: #fff; font-weight: 700;">${escapeHtml(rep.postTitle)}</span>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
            โดย: <strong style="color: #fbbf24;">${escapeHtml(rep.postAuthor)}</strong>
            ${isAuthorBanned ? '<span style="color: #ef4444; font-size: 0.65rem; font-weight: 700; margin-left: 4px;">[BANNED]</span>' : ''}
          </div>
          ${rep.postContent ? `
            <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px; max-height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
              ${escapeHtml(rep.postContent)}
            </div>
          ` : ''}
        </div>
      </td>
      <td>
        <div>
          <div class="report-reason-title">⚠️ ${escapeHtml(rep.reason)}</div>
          ${rep.details ? `<div class="report-detail-notes">💬 "${escapeHtml(rep.details)}"</div>` : ''}
        </div>
      </td>
      <td>
        <div style="font-size: 0.78rem; font-weight: 600; color: #e2e8f0;">${escapeHtml(rep.reporterName || 'Anon')}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted);">${formatRelativeTime(rep.timestamp)}</div>
      </td>
      <td>
        <div class="table-actions" style="justify-content: center;">
          ${isPending ? `
            <button class="action-btn btn-delete btn-rep-delete" data-post-id="${rep.postId}" data-post-title="${escapeHtml(rep.postTitle)}" data-author-name="${escapeHtml(rep.postAuthor)}" title="ลบกระทู้นี้ทันที">
              🗑️ ลบกระทู้
            </button>
            ${!isAuthorBanned ? `
              <button class="action-btn btn-ban btn-rep-ban" data-author-name="${escapeHtml(rep.postAuthor)}" title="แบนผู้โพสต์">
                🚫 แบน
              </button>
            ` : ''}
            <button class="action-btn btn-dismiss btn-rep-dismiss" data-report-id="${rep.id}" title="ไม่พบการละเมิด / ปิดรายงานนี้">
              ✔️ ปิดรายงาน
            </button>
          ` : `
            <span style="font-size: 0.78rem; color: var(--text-muted);">
              ${rep.resolvedAt ? formatRelativeTime(rep.resolvedAt) : 'เรียบร้อย'}
            </span>
          `}
        </div>
      </td>
    `;

    reportsTbody.appendChild(tr);
  });

  // Attach button events in reports table
  reportsTbody.querySelectorAll('.btn-rep-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      openDeleteModal(btn.dataset.postId, btn.dataset.postTitle, btn.dataset.authorName);
    });
  });

  reportsTbody.querySelectorAll('.btn-rep-ban').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmBanAuthor(btn.dataset.authorName);
    });
  });

  reportsTbody.querySelectorAll('.btn-rep-dismiss').forEach(btn => {
    btn.addEventListener('click', () => {
      resolveReport(btn.dataset.reportId, 'dismissed');
    });
  });
}

async function resolveReport(reportId, action) {
  try {
    const res = await fetch('/api/manager/resolve-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken
      },
      body: JSON.stringify({ reportId, action })
    });
    const data = await res.json();
    if (data.success) {
      showToast('ปิดรายงานเรียบร้อยแล้ว');
      const rep = reportsList.find(r => r.id === reportId);
      if (rep) {
        rep.status = 'resolved';
        rep.resolvedAction = action;
        rep.resolvedAt = Date.now();
      }
      updateMetrics();
      renderReportsTable();
      renderPostsTable();
    } else {
      showToast('ไม่สามารถดำเนินการได้: ' + (data.error || ''));
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

function renderBannedTable() {
  bannedUsersTbody.innerHTML = '';
  if (bannedUsersList.length === 0) {
    bannedEmptyMessage.classList.remove('hidden');
    return;
  }
  bannedEmptyMessage.classList.add('hidden');

  bannedUsersList.forEach(user => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600; color: #f87171;">🚫 ${escapeHtml(user.name)}</td>
      <td style="color: #cbd5e1;">${escapeHtml(user.reason || 'ละเมิดกฎ')}</td>
      <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(user.bannedAt).toLocaleString('th-TH')}</td>
      <td style="text-align: center;">
        <button class="action-btn btn-unban" data-author-name="${escapeHtml(user.name)}">
          🔄 ปลดแบน
        </button>
      </td>
    `;
    bannedUsersTbody.appendChild(tr);
  });

  bannedUsersTbody.querySelectorAll('.btn-unban').forEach(btn => {
    btn.addEventListener('click', () => {
      unbanAuthor(btn.dataset.authorName);
    });
  });
}

function renderAuditLogsTable() {
  auditLogsTbody.innerHTML = '';
  auditLogsList.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-size: 0.78rem; font-weight: 700; color: #fbbf24;">${log.action}</td>
      <td style="font-size: 0.85rem; color: #e2e8f0;">${escapeHtml(log.detail)}</td>
      <td style="font-size: 0.78rem; color: var(--text-muted);">${new Date(log.timestamp).toLocaleString('th-TH')}</td>
    `;
    auditLogsTbody.appendChild(tr);
  });
}

function renderStudentsTable() {
  if (!studentsTbody) return;
  studentsTbody.innerHTML = '';

  if (!usersList || usersList.length === 0) {
    if (studentsEmptyMessage) studentsEmptyMessage.classList.remove('hidden');
    return;
  }
  if (studentsEmptyMessage) studentsEmptyMessage.classList.add('hidden');

  usersList.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 700; color: #fbbf24; font-size: 0.88rem;">
        🎓 ${escapeHtml(u.studentId)}
      </td>
      <td style="font-weight: 600; color: #f8fafc;">
        👤 ${escapeHtml(u.fullName)}
      </td>
      <td style="font-size: 0.75rem; color: var(--text-muted);">
        ${u.createdAt ? new Date(u.createdAt).toLocaleString('th-TH') : '-'}
      </td>
      <td style="font-size: 0.75rem; color: var(--text-muted);">
        ${u.lastLogin ? formatRelativeTime(u.lastLogin) : '-'}
      </td>
    `;
    studentsTbody.appendChild(tr);
  });
}

// ================= ACTIONS =================
function openDeleteModal(postId, postTitle, authorName) {
  pendingDeletePostId = postId;
  pendingDeletePostAuthor = authorName;
  deletePreviewContent.innerHTML = `
    <strong>หัวข้อ:</strong> ${postTitle}<br>
    <strong>ผู้โพสต์:</strong> ${authorName}
  `;
  checkBanAuthorToo.checked = false;
  deleteModal.classList.remove('hidden');
}

async function executeDeletePost() {
  if (!pendingDeletePostId) return;

  const reason = deleteReasonSelect.value;
  const shouldBan = checkBanAuthorToo.checked;

  try {
    const res = await fetch('/api/manager/delete-post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken
      },
      body: JSON.stringify({ postId: pendingDeletePostId, reason })
    });

    if (res.ok) {
      showToast('ลบกระทู้เรียบร้อยแล้ว');
      if (shouldBan && pendingDeletePostAuthor) {
        await executeBanAuthor(pendingDeletePostAuthor, `แบนอัตโนมัติจากการลบกระทู้ (${reason})`);
      }
      deleteModal.classList.add('hidden');
      fetchOverviewData();
    } else {
      showToast('ไม่สามารถลบกระทู้ได้');
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการลบกระทู้');
  }
}

async function confirmBanAuthor(authorName) {
  if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการแบนผู้ใช้ "${authorName}"? ผู้ใช้นี้จะไม่สามารถโพสต์หรือส่งข้อความได้อีก`)) {
    return;
  }
  await executeBanAuthor(authorName, 'แบนโดยตรงผ่านหน้าจัดการผู้ดูแล');
}

async function executeBanAuthor(authorName, reason) {
  try {
    const res = await fetch('/api/manager/ban-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken
      },
      body: JSON.stringify({ authorName, reason })
    });
    if (res.ok) {
      showToast(`แบนผู้ใช้ ${authorName} เรียบร้อยแล้ว`);
      fetchOverviewData();
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการแบน');
  }
}

async function unbanAuthor(authorName) {
  if (!confirm(`ปลดแบนผู้ใช้ "${authorName}" หรือไม่?`)) return;

  try {
    const res = await fetch('/api/manager/unban-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken
      },
      body: JSON.stringify({ authorName })
    });
    if (res.ok) {
      showToast(`ปลดแบน ${authorName} เรียบร้อยแล้ว`);
      fetchOverviewData();
    }
  } catch (err) {
    showToast('เกิดข้อผิดพลาดในการปลดแบน');
  }
}

// Comments inspection
function openCommentsModal(postId) {
  inspectPostId = postId;
  const post = currentPosts.find(p => p.id === postId);
  if (!post) return;

  commentsModalPostTitle.textContent = `กระทู้: "${post.title}"`;
  renderModalComments(post);
  commentsModal.classList.remove('hidden');
}

function renderModalComments(post) {
  modalCommentsList.innerHTML = '';
  if (!post.comments || post.comments.length === 0) {
    modalCommentsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">ไม่มีความคิดเห็นในกระทู้นี้</div>';
    return;
  }

  post.comments.forEach(c => {
    const div = document.createElement('div');
    div.className = 'comment-manage-item';
    div.innerHTML = `
      <div class="comment-manage-info">
        <div class="comment-manage-author">${c.author.badge || '💬'} ${escapeHtml(c.author.name)} <span style="font-weight: 400; color: var(--text-muted); font-size: 0.72rem;">${formatRelativeTime(c.timestamp)}</span></div>
        <div class="comment-manage-text">${escapeHtml(c.content)}</div>
      </div>
      <button class="action-btn btn-delete btn-del-comment" data-comment-id="${c.id}" title="ลบคอมเมนต์">
        🗑️ ลบ
      </button>
    `;
    modalCommentsList.appendChild(div);
  });

  modalCommentsList.querySelectorAll('.btn-del-comment').forEach(btn => {
    btn.addEventListener('click', async () => {
      const commentId = btn.dataset.commentId;
      if (!confirm('ยืนยันลบความคิดเห็นนี้หรือไม่?')) return;
      try {
        const res = await fetch('/api/manager/delete-comment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authToken
          },
          body: JSON.stringify({ postId: post.id, commentId, reason: 'ละเมิดกฎโดยผู้ดูแล' })
        });
        if (res.ok) {
          showToast('ลบคอมเมนต์เรียบร้อยแล้ว');
          post.comments = post.comments.filter(c => c.id !== commentId);
          renderModalComments(post);
          renderPostsTable();
        }
      } catch (err) {
        showToast('ไม่สามารถลบคอมเมนต์ได้');
      }
    });
  });
}

// ================= EVENT LISTENERS =================
function setupEventListeners() {
  // Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passcode = passcodeInput.value.trim();
    if (!passcode) return;

    try {
      const res = await fetch('/api/manager/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      });
      const data = await res.json();
      if (data.success && data.token) {
        authToken = data.token;
        sessionStorage.setItem('tlw_manager_token', authToken);
        showDashboard();
      } else {
        loginErrorMsg.classList.remove('hidden');
        loginErrorMsg.textContent = data.error || 'รหัสผ่านไม่ถูกต้อง';
      }
    } catch (err) {
      loginErrorMsg.classList.remove('hidden');
      loginErrorMsg.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    }
  });

  // Logout & Server-Side Token Revocation
  btnLogout.addEventListener('click', async () => {
    try {
      if (authToken) {
        await fetch('/api/manager/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          }
        });
      }
    } catch (e) {
      // Continue client cleanup even if network request fails
    }
    sessionStorage.removeItem('tlw_manager_token');
    authToken = null;
    showLogin();
    showToast('ออกจากระบบและเพิกถอนสิทธิ์เรียบร้อยแล้ว');
  });

  // Tabs
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;

      tabPostsView.classList.toggle('hidden', activeTab !== 'posts');
      if (tabAnnouncementsView) tabAnnouncementsView.classList.toggle('hidden', activeTab !== 'announcements');
      tabReportsView.classList.toggle('hidden', activeTab !== 'reports');
      tabBannedView.classList.toggle('hidden', activeTab !== 'banned');
      tabAuditView.classList.toggle('hidden', activeTab !== 'audit');
      if (tabStudentsView) tabStudentsView.classList.toggle('hidden', activeTab !== 'students');

      if (activeTab === 'announcements') {
        renderAnnouncementsTable();
      }
      if (activeTab === 'students') {
        renderStudentsTable();
      }
    });
  });

  // Reports Filter & Refresh
  if (filterReportStatusSelect) {
    filterReportStatusSelect.addEventListener('change', (e) => {
      filterReportStatus = e.target.value;
      renderReportsTable();
    });
  }

  if (btnRefreshReports) {
    btnRefreshReports.addEventListener('click', () => {
      fetchOverviewData();
      showToast('รีเฟรชข้อมูลรายงานสำเร็จ');
    });
  }

  // Channel Filter
  filterChannelSelect.addEventListener('change', (e) => {
    selectedChannel = e.target.value;
    renderPostsTable();
  });

  // Search filter
  filterSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderPostsTable();
  });

  // Refresh Button
  btnRefreshPosts.addEventListener('click', () => {
    fetchOverviewData();
    showToast('รีเฟรชข้อมูลสำเร็จ');
  });

  // Delete Modal Events
  btnConfirmDelete.addEventListener('click', executeDeletePost);
  btnCancelDelete.addEventListener('click', () => deleteModal.classList.add('hidden'));
  btnCloseDeleteModal.addEventListener('click', () => deleteModal.classList.add('hidden'));

  // Announcement Form Submit
  if (managerAnnouncementForm) {
    managerAnnouncementForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = announceTitleInput.value.trim();
      const authorName = announceAuthorInput.value.trim();
      const content = announceContentInput.value.trim();
      const tags = announceTagsInput.value.trim();

      if (!title || !content) {
        showToast('กรุณากรอกหัวข้อและเนื้อหาประกาศ');
        return;
      }

      try {
        const res = await fetch('/api/manager/create-announcement', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authToken
          },
          body: JSON.stringify({ title, authorName, content, tags })
        });

        const data = await res.json();
        if (data.success && data.post) {
          showToast('📢 เผยแพร่ประกาศทางการของโรงเรียนสำเร็จ!');
          announceTitleInput.value = '';
          announceContentInput.value = '';
          currentPosts.unshift(data.post);
          updateMetrics();
          renderAnnouncementsTable();
          renderPostsTable();
        } else {
          showToast(data.error || 'ไม่สามารถเผยแพร่ประกาศได้');
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      }
    });
  }

  // Comments Modal Events
  btnDoneComments.addEventListener('click', () => commentsModal.classList.add('hidden'));
  btnCloseCommentsModal.addEventListener('click', () => commentsModal.classList.add('hidden'));

  // Mobile Connect QR Modal
  const mobileConnectModal = document.getElementById('mobile-connect-modal');
  const btnOpenMobileConnect = document.getElementById('btn-open-mobile-connect');
  const btnCloseMobileModal = document.getElementById('btn-close-mobile-modal');
  const btnCloseMobileModalFooter = document.getElementById('btn-close-mobile-modal-footer');

  if (btnOpenMobileConnect && mobileConnectModal) {
    btnOpenMobileConnect.addEventListener('click', () => {
      mobileConnectModal.classList.remove('hidden');
    });
  }
  if (btnCloseMobileModal && mobileConnectModal) {
    btnCloseMobileModal.addEventListener('click', () => {
      mobileConnectModal.classList.add('hidden');
    });
  }
  if (btnCloseMobileModalFooter && mobileConnectModal) {
    btnCloseMobileModalFooter.addEventListener('click', () => {
      mobileConnectModal.classList.add('hidden');
    });
  }
  if (mobileConnectModal) {
    mobileConnectModal.addEventListener('click', (e) => {
      if (e.target === mobileConnectModal) mobileConnectModal.classList.add('hidden');
    });
  }
}

// ================= HELPERS =================
// ================= ANNOUNCEMENTS RENDERING =================
function renderAnnouncementsTable() {
  const announcements = currentPosts.filter(p => p.channel === 'announcements');
  if (announcementsCount) announcementsCount.textContent = announcements.length;
  if (!announcementsTbody) return;

  announcementsTbody.innerHTML = '';
  if (announcements.length === 0) {
    if (announcementsEmptyMessage) announcementsEmptyMessage.classList.remove('hidden');
    return;
  }
  if (announcementsEmptyMessage) announcementsEmptyMessage.classList.add('hidden');

  announcements.forEach(post => {
    const tr = document.createElement('tr');
    tr.id = `row-ann-${post.id}`;
    const score = (post.upvotes || 0) - (post.downvotes || 0);
    const commentsCount = post.comments ? post.comments.length : 0;

    tr.innerHTML = `
      <td>
        <div style="font-weight: 700; color: #38bdf8; font-size: 0.84rem;">
          📢 ${escapeHtml(post.author.name)}
        </div>
        <span style="font-size: 0.65rem; background: rgba(56,189,248,0.18); color: #7dd3fc; padding: 1px 6px; border-radius: 9999px; font-weight: 600;">ประกาศทางการ</span>
      </td>
      <td>
        <div style="font-weight: 700; color: #fff; font-size: 0.88rem; margin-bottom: 2px;">
          ${escapeHtml(post.title)}
        </div>
        <div style="font-size: 0.78rem; color: #cbd5e1; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          ${escapeHtml(post.content)}
        </div>
        ${post.tags && post.tags.length ? `
          <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
            ${post.tags.map(t => `<span style="font-size: 0.68rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;">#${escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
      </td>
      <td style="text-align: center; font-size: 0.8rem; font-family: var(--font-mono);">
        <span style="color: #10b981;">▲ ${score}</span> / 💬 ${commentsCount}
      </td>
      <td style="font-size: 0.75rem; color: var(--text-muted);">
        ${formatRelativeTime(post.timestamp)}
      </td>
      <td style="text-align: center;">
        <button class="action-btn btn-delete btn-delete-ann" data-post-id="${post.id}" title="ลบประกาศนี้">
          🗑️ ลบ
        </button>
      </td>
    `;
    announcementsTbody.appendChild(tr);
  });

  announcementsTbody.querySelectorAll('.btn-delete-ann').forEach(btn => {
    btn.addEventListener('click', () => {
      const postId = btn.dataset.postId;
      const targetPost = currentPosts.find(p => p.id === postId);
      if (targetPost) {
        promptDeletePost(targetPost);
      }
    });
  });
}

function showToast(message) {
  managerToast.textContent = message;
  managerToast.classList.remove('hidden');
  setTimeout(() => {
    managerToast.classList.add('hidden');
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 45) return 'เมื่อสักครู่';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชม. ที่แล้ว`;
  return `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
}

// ================= REQUEST STATUS MODAL & EXPORT CSV =================
const updateRequestModal = document.getElementById('update-request-modal');
const requestModalPostId = document.getElementById('request-modal-post-id');
const requestModalPostTitle = document.getElementById('request-modal-post-title');
const requestModalStatusSelect = document.getElementById('request-modal-status-select');
const requestModalResponseInput = document.getElementById('request-modal-response-input');
const btnCloseRequestModal = document.getElementById('btn-close-request-modal');
const btnCancelRequestModal = document.getElementById('btn-cancel-request-modal');
const btnSaveRequestModal = document.getElementById('btn-save-request-modal');
const btnExportPosts = document.getElementById('btn-export-posts');

function openRequestModal(postId) {
  const post = currentPosts.find(p => p.id === postId);
  if (!post) return;

  requestModalPostId.value = post.id;
  requestModalPostTitle.textContent = `"${post.title}" (ผู้โพสต์: ${post.author.name})`;
  requestModalStatusSelect.value = post.status || 'pending';
  requestModalResponseInput.value = post.officialResponse || '';
  if (updateRequestModal) updateRequestModal.classList.remove('hidden');
}

function closeRequestModal() {
  if (updateRequestModal) updateRequestModal.classList.add('hidden');
}

if (btnCloseRequestModal) btnCloseRequestModal.addEventListener('click', closeRequestModal);
if (btnCancelRequestModal) btnCancelRequestModal.addEventListener('click', closeRequestModal);

if (btnSaveRequestModal) {
  btnSaveRequestModal.addEventListener('click', async () => {
    const postId = requestModalPostId.value;
    const status = requestModalStatusSelect.value;
    const officialResponse = requestModalResponseInput.value.trim();

    try {
      const res = await fetch('/api/manager/update-request-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({ postId, status, officialResponse })
      });
      const data = await res.json();
      if (data.success) {
        const post = currentPosts.find(p => p.id === postId);
        if (post) {
          post.status = status;
          post.officialResponse = officialResponse;
        }
        renderPostsTable();
        closeRequestModal();
        showToast('✅ อัปเดตสถานะและตอบกลับคำร้องสำเร็จแล้ว');
      } else {
        showToast('เกิดข้อผิดพลาด: ' + (data.error || 'ไม่สามารถอัปเดตได้'));
      }
    } catch (err) {
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  });
}

// Export CSV Functionality
if (btnExportPosts) {
  btnExportPosts.addEventListener('click', async () => {
    try {
      showToast('⏳ กำลังรวบรวมข้อมูลรายงาน...');
      const res = await fetch('/api/manager/export-data?type=posts', {
        headers: {
          'Authorization': 'Bearer ' + authToken
        }
      });
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        const headers = ['ID', 'ห้อง', 'ผู้โพสต์', 'บทบาท', 'หัวข้อ', 'เนื้อหา', 'แท็ก', 'สถานะ', 'คำชี้แจงจากโรงเรียน', 'Upvotes', 'Downvotes', 'คอมเมนต์', 'วันที่สร้าง'];
        const csvRows = [headers.join(',')];

        result.data.forEach(item => {
          const escapeCsv = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;
          csvRows.push([
            escapeCsv(item.id),
            escapeCsv(item.channel),
            escapeCsv(item.authorName),
            escapeCsv(item.authorRole),
            escapeCsv(item.title),
            escapeCsv(item.content),
            escapeCsv(item.tags),
            escapeCsv(item.status),
            escapeCsv(item.officialResponse),
            item.upvotes,
            item.downvotes,
            item.commentsCount,
            escapeCsv(item.createdAt)
          ].join(','));
        });

        const csvContent = '\uFEFF' + csvRows.join('\r\n'); // BOM for Thai Excel
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tlwconnect_report_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('📥 ดาวน์โหลดรายงานสรุป CSV เรียบร้อยแล้ว');
      } else {
        showToast('ไม่สามารถดาวน์โหลดข้อมูลได้: ' + (result.error || ''));
      }
    } catch (e) {
      showToast('เกิดข้อผิดพลาดในการส่งออกรายงาน');
    }
  });
}

