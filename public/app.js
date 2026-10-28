// =====================================================================
// TLWconnect — CLIENT LOGIC & REAL-TIME EVENT HANDLING
// =====================================================================

// --- Anonymous Names & Archetypes (School Community) ---
const ADJECTIVES = ['Thali', 'Scholar', 'Campus', 'Silent', 'Cosmic', 'Bright', 'Brave', 'Kind', 'Clever', 'Junior', 'Senior', 'Neon', 'Shadow', 'Solar', 'Noble'];
const NOUNS = ['Student', 'Fox', 'Owl', 'Panda', 'Drifter', 'Mentor', 'Hawk', 'Star', 'Wolf', 'Echo', 'Writer', 'Dreamer', 'Seeker', 'Phoenix', 'Guardian'];
const EMOJIS = ['🎓', '🎒', '📚', '🦉', '⚡', '🌟', '🦊', '🎨', '🤖', '💎', '🌱', '🔮'];
const COLORS = ['#2563eb', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

function generateRandomPersona() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];

  return {
    name: `${adj}${noun} #${num}`,
    badge: emoji,
    color: color
  };
}

// User state
let currentPersona = null;
try {
  const saved = localStorage.getItem('ghostwire_persona');
  if (saved) {
    currentPersona = JSON.parse(saved);
  }
} catch (e) {}

if (!currentPersona) {
  currentPersona = generateRandomPersona();
  localStorage.setItem('ghostwire_persona', JSON.stringify(currentPersona));
}

// App State
let socket = null;
let allPosts = [];
let allShouts = [];
let currentChannel = 'all';
let currentSort = 'latest';
let searchQuery = '';
let composedTags = [];
let typingTimeout = null;

// User votes stored in localStorage to prevent repeat voting on client
let userVotes = {};
try {
  userVotes = JSON.parse(localStorage.getItem('ghostwire_votes') || '{}');
} catch (e) {
  userVotes = {};
}

// DOM Elements
const postsContainer = document.getElementById('posts-container');
const emptyFeedState = document.getElementById('empty-feed-state');

// Load More Posts System (Roadmap Phase 2)
const POSTS_PER_PAGE = 6;
let visiblePostsCount = POSTS_PER_PAGE;
let isLoadingMore = false;
const loadMoreContainer = document.getElementById('load-more-container');
const btnLoadMore = document.getElementById('btn-load-more');
const loadMoreText = document.getElementById('load-more-text');
const loadMoreBadge = document.getElementById('load-more-badge');
const loadMoreFinished = document.getElementById('load-more-finished');
const loadMoreFinishedText = document.getElementById('load-more-finished-text');

const headerOnlineCount = document.getElementById('header-online-count');
const headerUserName = document.getElementById('header-user-name');
const headerUserBadge = document.getElementById('header-user-badge');
const headerAvatarWrap = document.getElementById('header-avatar-wrap');
const activeChannelIcon = document.getElementById('active-channel-icon');
const activeChannelTitle = document.getElementById('active-channel-title');
const shoutboxList = document.getElementById('shoutbox-list');
const shoutboxForm = document.getElementById('shoutbox-form');
const shoutboxInput = document.getElementById('shoutbox-input');

// Sound Toggle
const btnSoundToggle = document.getElementById('btn-sound-toggle');
const soundIcon = document.getElementById('sound-icon');

// Modals
const composeModal = document.getElementById('compose-modal');
const btnOpenCompose = document.getElementById('btn-open-compose-modal');
const quickComposeTrigger = document.getElementById('quick-compose-trigger');
const btnCloseCompose = document.getElementById('btn-close-compose');
const btnCancelCompose = document.getElementById('btn-cancel-compose');
const composeForm = document.getElementById('compose-form');
const composeTitleInput = document.getElementById('compose-title-input');
const composeContentInput = document.getElementById('compose-content-input');
const composeTagsInput = document.getElementById('compose-tags-input');
const composedTagsList = document.getElementById('composed-tags-list');
const composeChannelSelect = document.getElementById('compose-channel-select');
const composeBadgePreview = document.getElementById('compose-badge-preview');
const composeNamePreview = document.getElementById('compose-name-preview');
const btnRerollInModal = document.getElementById('btn-reroll-in-modal');
const titleCharCount = document.getElementById('title-char-count');
const contentCharCount = document.getElementById('content-char-count');

// Persona Modal
const personaModal = document.getElementById('persona-modal');
const btnPersonaProfile = document.getElementById('btn-persona-profile');
const btnClosePersona = document.getElementById('btn-close-persona');
const btnSavePersona = document.getElementById('btn-save-persona');
const btnRerollPersonaName = document.getElementById('btn-reroll-persona-name');
const customAvatarPreview = document.getElementById('custom-avatar-preview');
const customNamePreview = document.getElementById('custom-name-preview');

// Search
const globalSearchInput = document.getElementById('global-search-input');
const btnClearSearch = document.getElementById('btn-clear-search');

// Toast
const toastContainer = document.getElementById('toast-container');

// Rules Modal
const rulesModal = document.getElementById('rules-modal');
const btnAcceptRules = document.getElementById('btn-accept-rules');
const btnCloseRules = document.getElementById('btn-close-rules');
const btnOpenRules = document.getElementById('btn-open-rules');

// Report Modal
const reportModal = document.getElementById('report-modal');
const reportForm = document.getElementById('report-form');
const reportPostPreview = document.getElementById('report-post-preview');
const reportReasonSelect = document.getElementById('report-reason-select');
const reportDetailsInput = document.getElementById('report-details-input');
const btnCloseReportModal = document.getElementById('btn-close-report-modal');
const btnCancelReport = document.getElementById('btn-cancel-report');
let currentReportingPost = null;

// Channel Names Mapping (5 ห้องหลัก + กระทู้ของฉัน + ทั้งหมด)
function getChannelSvg(key) {
  if (window.TLWIcons) {
    const iconMap = {
      all: window.TLWIcons.globe,
      my_posts: window.TLWIcons.myPosts,
      announcements: window.TLWIcons.megaphone,
      vent: window.TLWIcons.cloud,
      suggestions: window.TLWIcons.lightbulb,
      requests: window.TLWIcons.clipboard,
      guidance: window.TLWIcons.compass
    };
    if (iconMap[key]) {
      return iconMap[key];
    }
  }
  const fallback = {
    all: '🌐', my_posts: '📝', announcements: '📢', vent: '🌧️', suggestions: '💡', requests: '📋', guidance: '🧭'
  };
  return fallback[key] || '💬';
}

const CHANNEL_DATA = {
  get all() { return { name: 'กระทู้ทั้งหมด', icon: getChannelSvg('all') }; },
  get my_posts() { return { name: 'กระทู้ของฉัน', icon: getChannelSvg('my_posts') }; },
  get announcements() { return { name: 'ห้องประกาศ', icon: getChannelSvg('announcements') }; },
  get vent() { return { name: 'ห้องระบาย', icon: getChannelSvg('vent') }; },
  get suggestions() { return { name: 'ห้องข้อเสนอแนะ', icon: getChannelSvg('suggestions') }; },
  get requests() { return { name: 'ห้องส่งคำร้อง', icon: getChannelSvg('requests') }; },
  get guidance() { return { name: 'ห้องแนะแนว', icon: getChannelSvg('guidance') }; }
};

// My Posts ownership tracking
let myPostKeys = {};
try {
  const savedKeys = localStorage.getItem('tlw_my_post_keys');
  if (savedKeys) myPostKeys = JSON.parse(savedKeys);
} catch (e) {}
let myPostIds = new Set();

// ================= STUDENT ACCOUNT & AUTH GATEWAY =================
let currentStudentUser = null;

const STORAGE_KEYS = {
  SESSION: 'tlw_student_session',
  FLAGS: 'tlw_remember_flags',
  FULLNAME: 'tlw_remember_fullname',
  IDCARD: 'tlw_remember_idcard',
  STUDENTID: 'tlw_remember_studentid'
};

function initStudentAuth() {
  const authGateway = document.getElementById('auth-gateway');
  if (!authGateway) return;

  const tabBtnLogin = document.getElementById('tab-btn-login');
  const tabBtnRegister = document.getElementById('tab-btn-register');
  const authLoginForm = document.getElementById('auth-login-form');
  const authRegisterForm = document.getElementById('auth-register-form');

  const loginStudentId = document.getElementById('login-student-id');
  const loginIdCard = document.getElementById('login-id-card');
  const loginFullName = document.getElementById('login-fullname');
  const loginChkRememberStudentId = document.getElementById('login-chk-remember-student-id');
  const loginChkRememberIdCard = document.getElementById('login-chk-remember-id-card');
  const loginChkRememberFullName = document.getElementById('login-chk-remember-fullname');
  const loginChkAutoLogin = document.getElementById('login-chk-auto-login');
  const loginErrorBadge = document.getElementById('login-error-badge');
  const btnToggleLoginId = document.getElementById('btn-toggle-login-id');

  const regFullName = document.getElementById('reg-fullname');
  const regIdCard = document.getElementById('reg-id-card');
  const regStudentId = document.getElementById('reg-student-id');
  const regChkRememberFullName = document.getElementById('reg-chk-remember-fullname');
  const regChkRememberIdCard = document.getElementById('reg-chk-remember-id-card');
  const regChkRememberStudentId = document.getElementById('reg-chk-remember-student-id');
  const regChkAutoLogin = document.getElementById('reg-chk-auto-login');
  const regErrorBadge = document.getElementById('reg-error-badge');

  const linkGotoRegister = document.getElementById('link-goto-register');
  const linkGotoLogin = document.getElementById('link-goto-login');

  const studentAccountBadge = document.getElementById('student-account-badge');
  const studentDisplayName = document.getElementById('student-display-name');
  const studentDisplayId = document.getElementById('student-display-id');
  const btnStudentLogout = document.getElementById('btn-student-logout');

  // Enforce digits only on numeric inputs
  [loginStudentId, regStudentId].forEach(el => {
    if (!el) return;
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').slice(0, 5);
    });
  });

  [loginIdCard, regIdCard].forEach(el => {
    if (!el) return;
    el.addEventListener('input', () => {
      el.value = el.value.replace(/\D/g, '').slice(0, 13);
    });
  });

  // Toggle ID card mask on login form
  if (btnToggleLoginId && loginIdCard) {
    btnToggleLoginId.addEventListener('click', () => {
      if (loginIdCard.type === 'password') {
        loginIdCard.type = 'text';
        btnToggleLoginId.textContent = '🔒';
      } else {
        loginIdCard.type = 'password';
        btnToggleLoginId.textContent = '👁️';
      }
    });
  }

  // Switch Tabs
  const switchTab = (tab) => {
    if (tab === 'login') {
      tabBtnLogin.classList.add('active');
      tabBtnRegister.classList.remove('active');
      authLoginForm.classList.remove('hidden');
      authRegisterForm.classList.add('hidden');
      if (loginErrorBadge) loginErrorBadge.classList.add('hidden');
      if (loginStudentId) loginStudentId.focus();
    } else {
      tabBtnRegister.classList.add('active');
      tabBtnLogin.classList.remove('active');
      authRegisterForm.classList.remove('hidden');
      authLoginForm.classList.add('hidden');
      if (regErrorBadge) regErrorBadge.classList.add('hidden');
      if (regFullName) regFullName.focus();
    }
    if (window.soundEngine) window.soundEngine.playClick();
  };

  if (tabBtnLogin) tabBtnLogin.addEventListener('click', () => switchTab('login'));
  if (tabBtnRegister) tabBtnRegister.addEventListener('click', () => switchTab('register'));
  if (linkGotoRegister) linkGotoRegister.addEventListener('click', (e) => { e.preventDefault(); switchTab('register'); });
  if (linkGotoLogin) linkGotoLogin.addEventListener('click', (e) => { e.preventDefault(); switchTab('login'); });

  // Load and apply remembered fields
  const applyRemembered = () => {
    // PDPA Protection: Immediately purge any previously stored full citizen ID
    try {
      localStorage.removeItem(STORAGE_KEYS.IDCARD);
    } catch (e) {}

    let flags = { rememberStudentId: true, rememberIdCard: false, rememberFullName: true, autoLogin: true };
    try {
      const storedFlags = localStorage.getItem(STORAGE_KEYS.FLAGS);
      if (storedFlags) flags = Object.assign(flags, JSON.parse(storedFlags));
    } catch (e) {}
    // Enforce rememberIdCard false by default for student privacy
    flags.rememberIdCard = false;

    // Set checkboxes
    if (loginChkRememberStudentId) loginChkRememberStudentId.checked = flags.rememberStudentId;
    if (loginChkRememberIdCard) loginChkRememberIdCard.checked = false;
    if (loginChkRememberFullName) loginChkRememberFullName.checked = flags.rememberFullName;
    if (loginChkAutoLogin) loginChkAutoLogin.checked = flags.autoLogin;

    if (regChkRememberStudentId) regChkRememberStudentId.checked = flags.rememberStudentId;
    if (regChkRememberIdCard) regChkRememberIdCard.checked = false;
    if (regChkRememberFullName) regChkRememberFullName.checked = flags.rememberFullName;
    if (regChkAutoLogin) regChkAutoLogin.checked = flags.autoLogin;

    // Fill inputs if remembered (NEVER prefill ID card)
    const remStudentId = localStorage.getItem(STORAGE_KEYS.STUDENTID) || '';
    const remFullName = localStorage.getItem(STORAGE_KEYS.FULLNAME) || '';

    if (flags.rememberStudentId && remStudentId) {
      if (loginStudentId) loginStudentId.value = remStudentId;
      if (regStudentId) regStudentId.value = remStudentId;
    }
    if (flags.rememberFullName && remFullName) {
      if (loginFullName) loginFullName.value = remFullName;
      if (regFullName) regFullName.value = remFullName;
    }

    return flags;
  };

  const saveRemembered = (studentId, idCard, fullName, flags) => {
    try {
      // Never persist rememberIdCard as true
      const safeFlags = { ...flags, rememberIdCard: false };
      localStorage.setItem(STORAGE_KEYS.FLAGS, JSON.stringify(safeFlags));
      if (flags.rememberStudentId && studentId) localStorage.setItem(STORAGE_KEYS.STUDENTID, studentId);
      else localStorage.removeItem(STORAGE_KEYS.STUDENTID);

      // CRITICAL PDPA SAFETY: NEVER store full citizen ID in browser localStorage
      localStorage.removeItem(STORAGE_KEYS.IDCARD);

      if (flags.rememberFullName && fullName) localStorage.setItem(STORAGE_KEYS.FULLNAME, fullName);
      else localStorage.removeItem(STORAGE_KEYS.FULLNAME);
    } catch (e) {}
  };

  const setAuthenticatedUI = (user, isAutoLogin = false) => {
    currentStudentUser = user;
    authGateway.classList.add('hidden');

    if (studentDisplayName) studentDisplayName.textContent = user.fullName;
    if (studentDisplayId) studentDisplayId.textContent = `รหัส ${user.studentId}`;
    if (studentAccountBadge) studentAccountBadge.classList.remove('hidden');

    if (window.soundEngine && !isAutoLogin) window.soundEngine.playPublish();
    showToast(`ยินดีต้อนรับชาว ท.ล.ว. คุณ ${user.fullName} 👋`, 'success');
  };

  // 1. Submit Login
  authLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginErrorBadge) loginErrorBadge.classList.add('hidden');

    const studentId = loginStudentId.value.trim();
    const idCard = loginIdCard.value.trim();
    const fullName = loginFullName ? loginFullName.value.trim() : '';

    if (studentId.length !== 5) {
      showError(loginErrorBadge, 'กรุณาระบุรหัสนักเรียนให้ครบ 5 หลัก');
      return;
    }
    if (idCard.length !== 13) {
      showError(loginErrorBadge, 'กรุณาระบุเลขประจำตัวประชาชนให้ครบ 13 หลัก');
      return;
    }

    const flags = {
      rememberStudentId: loginChkRememberStudentId ? loginChkRememberStudentId.checked : true,
      rememberIdCard: loginChkRememberIdCard ? loginChkRememberIdCard.checked : true,
      rememberFullName: loginChkRememberFullName ? loginChkRememberFullName.checked : true,
      autoLogin: loginChkAutoLogin ? loginChkAutoLogin.checked : true
    };

    const submitBtn = document.getElementById('btn-submit-login');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ กำลังเข้าสู่ระบบ...';
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, idCard, fullName })
      });
      const data = await res.json();

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀 เข้าสู่ระบบ TLW Connect</span>';
      }

      if (data.success && data.user) {
        saveRemembered(studentId, idCard, data.user.fullName || fullName, flags);

        if (flags.autoLogin) {
          localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({
            token: data.user.token,
            studentId: data.user.studentId,
            fullName: data.user.fullName,
            idCardMasked: data.user.idCardMasked
          }));
        } else {
          localStorage.removeItem(STORAGE_KEYS.SESSION);
        }

        setAuthenticatedUI(data.user, false);
      } else {
        showError(loginErrorBadge, data.error || 'รหัสนักเรียน หรือ เลขบัตร ปชช. ไม่ถูกต้อง');
      }
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>🚀 เข้าสู่ระบบ TLW Connect</span>';
      }
      showError(loginErrorBadge, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ โปรดลองอีกครั้ง');
    }
  });

  // 2. Submit Register
  authRegisterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (regErrorBadge) regErrorBadge.classList.add('hidden');

    const fullName = regFullName.value.trim();
    const idCard = regIdCard.value.trim();
    const studentId = regStudentId.value.trim();

    if (!fullName || fullName.length < 2) {
      showError(regErrorBadge, 'กรุณาระบุชื่อจริงและนามสกุล (อย่างน้อย 2 ตัวอักษร)');
      return;
    }
    if (idCard.length !== 13) {
      showError(regErrorBadge, 'เลขประจำตัวประชาชนต้องมี 13 หลักพอดี');
      return;
    }
    if (studentId.length !== 5) {
      showError(regErrorBadge, 'รหัสนักเรียนต้องมี 5 หลักพอดี');
      return;
    }

    const flags = {
      rememberFullName: regChkRememberFullName ? regChkRememberFullName.checked : true,
      rememberIdCard: regChkRememberIdCard ? regChkRememberIdCard.checked : true,
      rememberStudentId: regChkRememberStudentId ? regChkRememberStudentId.checked : true,
      autoLogin: regChkAutoLogin ? regChkAutoLogin.checked : true
    };

    const submitBtn = document.getElementById('btn-submit-register');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ กำลังสร้างบัญชี...';
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, idCard, studentId })
      });
      const data = await res.json();

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>✨ สร้างบัญชีและเข้าสู่ระบบ</span>';
      }

      if (data.success && data.user) {
        saveRemembered(studentId, idCard, fullName, flags);

        if (flags.autoLogin) {
          localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify({
            token: data.user.token,
            studentId: data.user.studentId,
            fullName: data.user.fullName,
            idCardMasked: data.user.idCardMasked
          }));
        }

        setAuthenticatedUI(data.user, false);
      } else {
        showError(regErrorBadge, data.error || 'การสร้างบัญชีไม่สำเร็จ');
      }
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>✨ สร้างบัญชีและเข้าสู่ระบบ</span>';
      }
      showError(regErrorBadge, 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ โปรดลองอีกครั้ง');
    }
  });

  // 3. Logout Handler
  if (btnStudentLogout) {
    btnStudentLogout.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      currentStudentUser = null;
      authGateway.classList.remove('hidden');
      switchTab('login');
      applyRemembered();
      showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
      if (window.soundEngine) window.soundEngine.playClick();
    });
  }

  // 4. Check Auto-Login on launch
  const initialFlags = applyRemembered();
  const sessionStr = localStorage.getItem(STORAGE_KEYS.SESSION);

  if (sessionStr && initialFlags.autoLogin) {
    try {
      const session = JSON.parse(sessionStr);
      if (session.token && session.studentId) {
        fetch('/api/auth/verify-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: session.token, studentId: session.studentId })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.user) {
              setAuthenticatedUI(data.user, true);
            } else {
              localStorage.removeItem(STORAGE_KEYS.SESSION);
              authGateway.classList.remove('hidden');
            }
          })
          .catch(() => {
            setAuthenticatedUI(session, true);
          });
        return;
      }
    } catch (e) {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
  }

  // Not auto-logged in: keep gateway visible
  authGateway.classList.remove('hidden');
}

function showError(badgeEl, message) {
  if (!badgeEl) return;
  badgeEl.textContent = `⚠️ ${message}`;
  badgeEl.classList.remove('hidden');
}

// ================= INITIALIZATION =================
function initApp() {
  initStudentAuth();
  updatePersonaDisplay();
  updateSoundIcon();
  setupSocket();
  setupEventListeners();
  initAmbientParticles();

  // ── Rules Modal on first visit ──
  if (rulesModal && !localStorage.getItem('tlw_accepted_rules')) {
    rulesModal.classList.remove('hidden');
  }

  // ── Notification system ──
  if (window.tlwNotify) {
    window.tlwNotify.setupBellButton();       // Desktop header bell
    window.tlwNotify.setupMobileBell();       // Mobile bottom nav bell
    window.tlwNotify.maybePromptPermission(10000); // prompt after 10s
  }
}

function updateSoundIcon() {
  if (!soundIcon) return;
  if (window.soundEngine.isMuted) {
    soundIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  } else {
    soundIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  }
}

// Mobile DOM Elements
const mobileBottomNav = document.getElementById('mobile-bottom-nav');
const btnBottomNavFeed = document.getElementById('btn-bottom-nav-feed');
const btnBottomNavShoutbox = document.getElementById('btn-bottom-nav-shoutbox');
const btnBottomNavCompose = document.getElementById('btn-bottom-nav-compose');
const btnBottomNavRules = document.getElementById('btn-bottom-nav-rules');
const btnBottomNavPersona = document.getElementById('btn-bottom-nav-persona');
const bottomNavPersonaBadge = document.getElementById('bottom-nav-persona-badge');
const bottomShoutboxDot = document.getElementById('bottom-shoutbox-dot');

const mobileShoutboxDrawer = document.getElementById('mobile-shoutbox-drawer');
const mobileShoutboxList = document.getElementById('mobile-shoutbox-list');
const mobileShoutboxForm = document.getElementById('mobile-shoutbox-form');
const mobileShoutboxInput = document.getElementById('mobile-shoutbox-input');
const btnCloseMobileShoutbox = document.getElementById('btn-close-mobile-shoutbox');
const mobileChannelsBar = document.getElementById('mobile-channels-bar');

function updatePersonaDisplay() {
  headerUserName.textContent = currentPersona.name;
  headerUserBadge.textContent = currentPersona.badge;
  headerAvatarWrap.style.background = `${currentPersona.color}25`;

  if (bottomNavPersonaBadge) {
    bottomNavPersonaBadge.textContent = currentPersona.badge;
  }

  const quickAvatar = document.getElementById('quick-compose-avatar');
  if (quickAvatar) {
    quickAvatar.textContent = currentPersona.badge;
    quickAvatar.style.background = `${currentPersona.color}30`;
  }

  composeBadgePreview.textContent = currentPersona.badge;
  composeNamePreview.textContent = currentPersona.name;
  const composeAuthorTag = document.getElementById('compose-author-tag');
  if (composeAuthorTag) {
    composeAuthorTag.style.borderLeft = `3px solid ${currentPersona.color}`;
  }

  customAvatarPreview.textContent = currentPersona.badge;
  customAvatarPreview.style.borderColor = currentPersona.color;
  customAvatarPreview.style.background = `${currentPersona.color}25`;
  customNamePreview.textContent = currentPersona.name;
}

// ================= SOCKET.IO CONNECTION =================
function setupSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('⚡ Connected to TLWconnect Real-time network');
    socket.emit('get_my_post_ids', {
      studentToken: currentStudentUser?.token || null,
      localKeys: myPostKeys
    });
  });

  socket.on('online_count', (count) => {
    headerOnlineCount.textContent = `${count} Anon Online`;
  });

  socket.on('init_data', (data) => {
    allPosts = data.posts || [];
    allShouts = data.shouts || [];
    headerOnlineCount.textContent = `${data.onlineCount || 1} Anon Online`;
    renderShoutbox();
    updateChannelCounts();
    renderFeed();

    socket.emit('get_my_post_ids', {
      studentToken: currentStudentUser?.token || null,
      localKeys: myPostKeys
    });
  });

  socket.on('new_post', (post) => {
    // Add to allPosts
    allPosts.unshift(post);
    updateChannelCounts();

    // Notification system: banner + push if announcement
    if (window.tlwNotify) {
      window.tlwNotify.onNewPost(post);
    }

    // Play subtle arrival sound (only for non-announcements; banner has its own feel)
    if (post.channel !== 'announcements') {
      window.soundEngine.playNotify();
    } else {
      window.soundEngine.playPublish();
    }

    // Toast for non-announcement posts only (announcement has banner)
    if (post.channel !== 'announcements') {
      showToast(`มีกระทู้ใหม่: "${post.title.slice(0, 35)}..."`, 'info');
    }

    // If matches current filter, render with pulse
    if (currentChannel === 'all' || currentChannel === post.channel) {
      visiblePostsCount++;
      renderFeed(post.id);
    }
  });

  socket.on('post_voted', ({ postId, upvotes, downvotes }) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
      post.upvotes = upvotes;
      post.downvotes = downvotes;
      // Update karma text in DOM
      const karmaEl = document.querySelector(`[data-karma-id="${postId}"]`);
      if (karmaEl) {
        karmaEl.textContent = upvotes - downvotes;
      }
    }
  });

  socket.on('post_reacted', ({ postId, emoji, reactions }) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
      post.reactions = reactions;
      const chipCount = document.querySelector(`[data-react-id="${postId}"][data-react-emoji="${emoji}"] .reaction-count`);
      if (chipCount) {
        chipCount.textContent = reactions[emoji] || 0;
      }
    }
  });

  socket.on('new_comment', ({ postId, comment, totalComments }) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
      if (!post.comments) post.comments = [];
      post.comments.push(comment);

      // Update comment count button
      const commentCountEl = document.querySelector(`[data-comment-btn-id="${postId}"] .comment-count-num`);
      if (commentCountEl) {
        commentCountEl.textContent = totalComments;
      }

      // If comments section is open, append
      const listEl = document.querySelector(`[data-comments-list-id="${postId}"]`);
      if (listEl) {
        const item = createCommentElement(comment);
        listEl.appendChild(item);
        listEl.scrollTop = listEl.scrollHeight;
      }
    }
  });

  socket.on('user_typing', ({ postId, authorName, isTyping }) => {
    const indicatorEl = document.querySelector(`[data-typing-id="${postId}"]`);
    if (indicatorEl) {
      if (isTyping) {
        indicatorEl.textContent = `${authorName} กำลังพิมพ์ตอบกลับ...`;
        indicatorEl.classList.remove('hidden');
      } else {
        indicatorEl.classList.add('hidden');
      }
    }
  });

  socket.on('new_shout', (shout) => {
    allShouts.push(shout);
    if (allShouts.length > 50) allShouts.shift();
    appendShout(shout);
    window.soundEngine.playClick();
  });

  // Moderation: Real-time post deletion
  socket.on('post_deleted', ({ postId, reason }) => {
    allPosts = allPosts.filter(p => p.id !== postId);
    updateChannelCounts();
    const card = document.getElementById(`card-${postId}`);
    if (card) {
      card.style.transition = 'all 0.45s ease';
      card.style.transform = 'scale(0.92) translateY(-12px)';
      card.style.opacity = '0';
      setTimeout(() => {
        card.remove();
        if (postsContainer.children.length === 0) {
          emptyFeedState.classList.remove('hidden');
        }
      }, 450);
    }
    showToast(`กระทู้ถูกลบโดยผู้ดูแล (${reason || 'ละเมิดกฎ'})`, 'info');
  });

  // Moderation: Real-time comment deletion
  socket.on('comment_deleted', ({ postId, commentId, reason }) => {
    const post = allPosts.find(p => p.id === postId);
    if (post && post.comments) {
      post.comments = post.comments.filter(c => c.id !== commentId);
      const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
      if (commentEl) {
        commentEl.style.transition = 'all 0.3s ease';
        commentEl.style.opacity = '0';
        setTimeout(() => commentEl.remove(), 300);
      }
      const countEl = document.querySelector(`[data-comment-btn-id="${postId}"] .comment-count-num`);
      if (countEl) countEl.textContent = post.comments.length;
    }
  });

  // Moderation: User banned warning
  socket.on('author_banned', ({ authorName, reason }) => {
    if (currentPersona && currentPersona.name === authorName) {
      showToast(`⚠️ ตัวตนของคุณถูกระงับสิทธิ์: ${reason || 'ละเมิดกฎ'}`, 'info');
    }
  });

  socket.on('action_blocked', ({ message }) => {
    showToast(`🚫 ${message || 'ไม่สามารถทำรายการได้เนื่องจากถูกระงับสิทธิ์'}`, 'info');
  });

  // Receive verified post IDs owned by this user
  socket.on('my_post_ids_response', ({ postIds }) => {
    myPostIds = new Set(postIds || []);
    updateChannelCounts();
    if (currentChannel === 'my_posts') renderFeed();
  });

  // Receive authorKey when creating a post
  socket.on('post_created_ack', ({ postId, authorKey }) => {
    myPostKeys[postId] = authorKey;
    myPostIds.add(postId);
    try {
      localStorage.setItem('tlw_my_post_keys', JSON.stringify(myPostKeys));
    } catch (e) {}
    updateChannelCounts();
    renderFeed();
  });

  // Post edited event broadcast
  socket.on('post_edited', ({ postId, title, content, channel, tags, editedAt }) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
      post.title = title;
      post.content = content;
      if (channel) post.channel = channel;
      if (tags) post.tags = tags;
      post.editedAt = editedAt;
      renderFeed();
      showToast('มีการแก้ไขกระทู้เรียบร้อยแล้ว', 'info');
    }
  });

  socket.on('edit_post_success', () => {
    showToast('💾 บันทึกการแก้ไขกระทู้ของคุณสำเร็จ!', 'success');
  });

  // Real-time request status update
  socket.on('post_status_updated', ({ postId, status, officialResponse, statusUpdatedAt }) => {
    const post = allPosts.find(p => p.id === postId);
    if (post) {
      post.status = status;
      post.officialResponse = officialResponse;
      post.statusUpdatedAt = statusUpdatedAt;
      renderFeed();
      showToast('📌 มีการอัปเดตสถานะข้อเสนอแนะ/คำร้องเรียบร้อยแล้ว', 'info');
    }
  });
}


// ================= FEED RENDERING (5-6 Items per Batch) =================
function getFilteredPosts() {
  let filtered = [...allPosts];

  // Channel filter
  if (currentChannel === 'my_posts') {
    filtered = filtered.filter(p => myPostIds.has(p.id) || !!myPostKeys[p.id]);
  } else if (currentChannel !== 'all') {
    filtered = filtered.filter(p => p.channel === currentChannel);
  }

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // Sorting
  if (currentSort === 'hot') {
    filtered.sort((a, b) => (b.upvotes * 2 + (b.comments?.length || 0) * 3) - (a.upvotes * 2 + (a.comments?.length || 0) * 3));
  } else if (currentSort === 'top') {
    filtered.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
  } else {
    // latest
    filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  return filtered;
}

function renderFeed(newArrivalId = null) {
  const filtered = getFilteredPosts();

  postsContainer.innerHTML = '';

  if (filtered.length === 0) {
    emptyFeedState.classList.remove('hidden');
    if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
    return;
  }

  emptyFeedState.classList.add('hidden');

  // Render first batch up to visiblePostsCount
  const displayed = filtered.slice(0, visiblePostsCount);
  displayed.forEach(post => {
    const card = createPostCard(post, post.id === newArrivalId);
    postsContainer.appendChild(card);
  });

  updateLoadMoreUI(filtered.length);
}

function updateLoadMoreUI(totalCount) {
  if (!loadMoreContainer) return;

  if (totalCount === 0) {
    loadMoreContainer.classList.add('hidden');
    return;
  }

  loadMoreContainer.classList.remove('hidden');

  if (visiblePostsCount < totalCount) {
    const remaining = totalCount - visiblePostsCount;
    const nextBatch = Math.min(remaining, POSTS_PER_PAGE);
    if (btnLoadMore) {
      btnLoadMore.classList.remove('hidden');
      btnLoadMore.disabled = false;
      if (loadMoreText) loadMoreText.textContent = 'อ่านเพิ่มเติม';
      if (loadMoreBadge) loadMoreBadge.textContent = `${nextBatch}`;
    }
    if (loadMoreFinished) loadMoreFinished.classList.add('hidden');
  } else {
    if (btnLoadMore) btnLoadMore.classList.add('hidden');
    if (loadMoreFinished) {
      loadMoreFinished.classList.remove('hidden');
      if (loadMoreFinishedText) {
        loadMoreFinishedText.textContent = `คุณอ่านครบทุกโพสต์แล้ว (${totalCount} รายการ)`;
      }
    }
  }
}

function loadMorePosts() {
  if (isLoadingMore) return;
  const filtered = getFilteredPosts();
  const total = filtered.length;

  if (visiblePostsCount >= total) {
    updateLoadMoreUI(total);
    return;
  }

  isLoadingMore = true;
  if (btnLoadMore) {
    btnLoadMore.disabled = true;
    if (loadMoreText) loadMoreText.textContent = 'กำลังโหลด...';
  }

  // Smooth micro-delay for debounce and natural feedback
  setTimeout(() => {
    const startIdx = visiblePostsCount;
    const endIdx = startIdx + POSTS_PER_PAGE;
    const nextChunk = filtered.slice(startIdx, endIdx);

    nextChunk.forEach(post => {
      // Deduplicate check
      if (!document.getElementById(`card-${post.id}`)) {
        const card = createPostCard(post, false);
        card.classList.add('anim-fade-in');
        postsContainer.appendChild(card);
      }
    });

    visiblePostsCount = endIdx;
    isLoadingMore = false;
    updateLoadMoreUI(total);
    if (window.soundEngine) window.soundEngine.playClick();
  }, 160);
}

function createPostCard(post, isNew = false) {
  const card = document.createElement('article');
  card.className = `post-card ${isNew ? 'new-pulse' : ''}`;
  card.id = `card-${post.id}`;

  const channelInfo = CHANNEL_DATA[post.channel] || { name: post.channel, icon: '💬' };
  const score = (post.upvotes || 0) - (post.downvotes || 0);
  const timeText = formatRelativeTime(post.timestamp);
  const userVote = userVotes[post.id] || null;

  // Tags HTML
  let tagsHtml = '';
  if (post.tags && post.tags.length > 0) {
    tagsHtml = `<div class="post-tags-row">
      ${post.tags.map(tag => `<span class="post-tag" data-filter-tag="${tag}">#${tag}</span>`).join('')}
    </div>`;
  }

  // Role Badge HTML
  let roleBadgeHtml = '';
  if (post.author?.role === 'teacher') {
    roleBadgeHtml = '<span class="role-pill-badge teacher-pill" style="font-size: 0.68rem; background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.5); color: #93c5fd; padding: 2px 7px; border-radius: 9999px; font-weight: 600;">👨‍🏫 คุณครู ท.ล.ว.</span>';
  } else if (post.author?.role === 'moderator') {
    roleBadgeHtml = '<span class="role-pill-badge mod-pill" style="font-size: 0.68rem; background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.5); color: #fde047; padding: 2px 7px; border-radius: 9999px; font-weight: 600;">🛡️ สภานักเรียน</span>';
  } else if (post.author?.role === 'admin') {
    roleBadgeHtml = '<span class="role-pill-badge admin-pill" style="font-size: 0.68rem; background: rgba(236,72,153,0.2); border: 1px solid rgba(236,72,153,0.5); color: #f472b6; padding: 2px 7px; border-radius: 9999px; font-weight: 600;">👑 แอดมิน</span>';
  }

  const isAnnouncement = post.channel === 'announcements';
  const announcementTagHtml = isAnnouncement ? '<div style="font-size: 0.72rem; color: #fbbf24; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;"><span>📌</span> ประกาศทางการจากโรงเรียนท่าลี่วิทยา</div>' : '';

  // Reactions HTML
  const emojiList = ['🔥', '💀', '💡', '🤫', '❤️'];
  let reactionsHtml = '';
  emojiList.forEach(em => {
    const count = (post.reactions && post.reactions[em]) ? post.reactions[em] : 0;
    reactionsHtml += `
      <button class="reaction-chip" data-react-id="${post.id}" data-react-emoji="${em}" title="กดเพื่อส่งปฏิกิริยา ${em}">
        <span>${em}</span>
        <span class="reaction-count">${count}</span>
      </button>
    `;
  });

  const commentsCount = post.comments ? post.comments.length : 0;

  // Request Status HTML (For 'requests' channel)
  let requestStatusHtml = '';
  if (post.channel === 'requests') {
    const curStatus = post.status || 'pending';
    let badgeText = '⏳ รอตรวจสอบ';
    let badgeClass = 'status-pending';
    if (curStatus === 'in_progress') {
      badgeText = '⚙️ กำลังดำเนินการ';
      badgeClass = 'status-inprogress';
    } else if (curStatus === 'resolved') {
      badgeText = '✅ เสร็จสิ้น / ชี้แจงแล้ว';
      badgeClass = 'status-resolved';
    }

    let responseBox = '';
    if (post.officialResponse) {
      responseBox = `
        <div class="official-response-box">
          <div class="official-response-header">📢 ชี้แจงจากทางโรงเรียน:</div>
          <div class="official-response-body">${escapeHtml(post.officialResponse)}</div>
        </div>
      `;
    }

    requestStatusHtml = `
      <div class="request-status-row">
        <span class="request-status-badge ${badgeClass}">${badgeText}</span>
      </div>
      ${responseBox}
    `;
  }

  const isMyPost = myPostIds.has(post.id) || !!myPostKeys[post.id];
  const myPostActionsHtml = isMyPost ? `
    <div class="post-owner-actions">
      <button type="button" class="btn-owner-action btn-owner-edit" data-edit-id="${post.id}" title="แก้ไขกระทู้ของคุณ">
        <span class="tlw-icon" style="display:inline-flex;align-items:center;margin-right:3px">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </span>
        แก้ไข
      </button>
      <button type="button" class="btn-owner-action btn-owner-delete" data-delete-id="${post.id}" title="ลบกระทู้ของคุณ">
        <span class="tlw-icon" style="display:inline-flex;align-items:center;margin-right:3px">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </span>
        ลบ
      </button>
    </div>
  ` : '';
  const editedIndicatorHtml = post.editedAt ? `<span class="post-edited-pill" title="แก้ไขแล้ว">(แก้ไขแล้ว)</span>` : '';

  card.innerHTML = `
    <div class="post-header">
      <div class="post-author-info">
        <div class="author-badge" style="background: ${post.author.color || '#8b5cf6'}25; border: 1px solid ${post.author.color || '#8b5cf6'}50">
          ${post.author.badge || '👤'}
        </div>
        <div class="author-meta">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="author-name-text">${escapeHtml(post.author.name)}</span>
            ${roleBadgeHtml}
          </div>
          <span class="post-timestamp">${timeText} ${editedIndicatorHtml}</span>
        </div>
      </div>
      <div class="post-header-right">
        <span class="post-channel-pill"><span class="post-channel-icon tlw-icon" style="display:inline-flex;align-items:center;margin-right:4px;width:13px;height:13px">${channelInfo.icon}</span> ${channelInfo.name}</span>
        ${myPostActionsHtml}
      </div>
    </div>

    ${announcementTagHtml}
    <h3 class="post-title">${escapeHtml(post.title)}</h3>
    <p class="post-body">${escapeHtml(post.content)}</p>
    ${requestStatusHtml}

    ${tagsHtml}

    <div class="post-footer">
      <div class="post-karma-wrap">
        <button class="vote-btn ${userVote === 'up' ? 'active-up' : ''}" data-action="upvote" data-id="${post.id}" title="เห็นด้วย / Upvote">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
        <span class="karma-count" data-karma-id="${post.id}">${score}</span>
        <button class="vote-btn ${userVote === 'down' ? 'active-down' : ''}" data-action="downvote" data-id="${post.id}" title="ไม่เห็นด้วย / Downvote">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </div>

      <div class="post-reactions-bar">
        ${reactionsHtml}
      </div>

      <button class="comments-toggle-btn" data-comment-btn-id="${post.id}">
        <span class="tlw-icon" style="display:inline-flex;align-items:center;margin-right:5px">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </span>
        <span>ความคิดเห็น (<span class="comment-count-num">${commentsCount}</span>)</span>
      </button>

      <button class="post-report-btn" data-report-id="${post.id}" title="รายงานกระทู้นี้ให้ผู้ดูแลตรวจสอบ">
        <span class="tlw-icon" style="display:inline-flex;align-items:center;margin-right:5px">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </span>
        <span>รายงาน</span>
      </button>
    </div>

    <!-- COMMENTS COLLAPSIBLE THREAD -->
    <div class="post-comments-container hidden" id="comments-section-${post.id}">
      <div class="comments-list" data-comments-list-id="${post.id}">
        ${(post.comments || []).map(c => createCommentElementHtml(c)).join('')}
      </div>
      <div class="typing-indicator-bar hidden" data-typing-id="${post.id}"></div>
      <form class="comment-input-form" data-comment-form-id="${post.id}">
        <input type="text" class="comment-input-field" placeholder="แสดงความคิดเห็นแบบนิรนาม..." maxlength="500" required>
        <button type="submit" class="btn btn-sm btn-primary">ส่ง</button>
      </form>
    </div>
  `;

  // Attach interactive listeners for this card
  attachCardEvents(card, post);

  return card;
}

function attachCardEvents(card, post) {
  // Upvote / Downvote
  const upBtn = card.querySelector('[data-action="upvote"]');
  const downBtn = card.querySelector('[data-action="downvote"]');
  const karmaEl = card.querySelector(`[data-karma-id="${post.id}"]`);

  upBtn.addEventListener('click', () => {
    if (userVotes[post.id] === 'up') return;
    userVotes[post.id] = 'up';
    localStorage.setItem('ghostwire_votes', JSON.stringify(userVotes));
    upBtn.classList.add('active-up');
    downBtn.classList.remove('active-down');

    window.soundEngine.playUpvote();
    socket.emit('vote_post', { postId: post.id, type: 'up' });
  });

  downBtn.addEventListener('click', () => {
    if (userVotes[post.id] === 'down') return;
    userVotes[post.id] = 'down';
    localStorage.setItem('ghostwire_votes', JSON.stringify(userVotes));
    downBtn.classList.add('active-down');
    upBtn.classList.remove('active-up');

    window.soundEngine.playClick();
    socket.emit('vote_post', { postId: post.id, type: 'down' });
  });

  // Reaction Chips
  card.querySelectorAll('.reaction-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const emoji = chip.dataset.reactEmoji;
      window.soundEngine.playReaction();
      spawnFloatingReaction(e.clientX, e.clientY, emoji);

      socket.emit('react_post', {
        postId: post.id,
        emoji,
        userSessionId: currentPersona.name
      });
    });
  });

  // Tag click to search
  card.querySelectorAll('.post-tag').forEach(tagEl => {
    tagEl.addEventListener('click', () => {
      const tag = tagEl.dataset.filterTag;
      globalSearchInput.value = tag;
      searchQuery = tag;
      btnClearSearch.classList.remove('hidden');
      renderFeed();
    });
  });

  // Toggle comments
  const toggleBtn = card.querySelector(`[data-comment-btn-id="${post.id}"]`);
  const commentsSec = card.querySelector(`#comments-section-${post.id}`);
  toggleBtn.addEventListener('click', () => {
    commentsSec.classList.toggle('hidden');
    window.soundEngine.playClick();
  });

  // Comment input form & typing indicator
  const commentForm = card.querySelector(`[data-comment-form-id="${post.id}"]`);
  const commentInput = commentForm.querySelector('.comment-input-field');

  commentInput.addEventListener('input', () => {
    socket.emit('typing', {
      postId: post.id,
      authorName: currentPersona.name,
      isTyping: true
    });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing', {
        postId: post.id,
        authorName: currentPersona.name,
        isTyping: false
      });
    }, 1500);
  });

  commentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = commentInput.value.trim();
    if (!content) return;

    socket.emit('add_comment', {
      postId: post.id,
      author: currentPersona,
      content,
      studentToken: currentStudentUser?.token || null
    });

    commentInput.value = '';
    socket.emit('typing', {
      postId: post.id,
      authorName: currentPersona.name,
      isTyping: false
    });

    window.soundEngine.playClick();
  });

  // Report button trigger
  const reportBtn = card.querySelector(`[data-report-id="${post.id}"]`);
  if (reportBtn) {
    reportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openReportModal(post);
    });
  }
}

function openReportModal(post) {
  currentReportingPost = post;
  const channelInfo = CHANNEL_DATA[post.channel] || { name: post.channel, icon: '💬' };
  if (reportPostPreview) {
    reportPostPreview.innerHTML = `
      <div style="font-size: 0.75rem; font-weight: 700; color: #f87171; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; display:flex; align-items:center; gap:5px">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>กำลังรายงานกระทู้:</span>
      </div>
      <div style="font-weight: 700; color: #fff; font-size: 0.95rem; margin-bottom: 4px;">${escapeHtml(post.title)}</div>
      <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
        <span>ผู้โพสต์: <strong style="color: #e2e8f0;">${escapeHtml(post.author.name)}</strong></span>
        <span>•</span>
        <span style="display:inline-flex;align-items:center;gap:4px">${channelInfo.icon} ${channelInfo.name}</span>
      </div>
      <div style="font-size: 0.8rem; color: #94a3b8; line-height: 1.4; max-height: 52px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
        ${escapeHtml(post.content)}
      </div>
    `;
  }
  if (reportReasonSelect) reportReasonSelect.selectedIndex = 0;
  if (reportDetailsInput) reportDetailsInput.value = '';
  if (reportModal) reportModal.classList.remove('hidden');
  if (window.soundEngine) window.soundEngine.playClick();
}

function closeReportModal() {
  if (reportModal) reportModal.classList.add('hidden');
  currentReportingPost = null;
}

function createCommentElementHtml(c) {
  const time = formatRelativeTime(c.timestamp);
  return `
    <div class="comment-item" data-comment-id="${c.id}">
      <div class="comment-header">
        <span style="font-size: 0.9rem;">${c.author.badge || '💬'}</span>
        <span class="comment-author-name">${escapeHtml(c.author.name)}</span>
        <span class="comment-time">${time}</span>
      </div>
      <p class="comment-body">${escapeHtml(c.content)}</p>
    </div>
  `;
}

function createCommentElement(c) {
  const div = document.createElement('div');
  div.className = 'comment-item';
  div.setAttribute('data-comment-id', c.id);

  let commentRoleBadge = '';
  if (c.author?.role === 'teacher') {
    commentRoleBadge = ' <span class="role-pill-badge teacher-pill" style="font-size: 0.65rem; background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.5); color: #93c5fd; padding: 1px 6px; border-radius: 9999px; font-weight: 600;">👨‍🏫 ครู ท.ล.ว.</span>';
  } else if (c.author?.role === 'moderator') {
    commentRoleBadge = ' <span class="role-pill-badge mod-pill" style="font-size: 0.65rem; background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.5); color: #fde047; padding: 1px 6px; border-radius: 9999px; font-weight: 600;">🛡️ สภานักเรียน</span>';
  }

  div.innerHTML = `
    <div class="comment-header">
      <span style="font-size: 0.9rem;">${c.author.badge || '💬'}</span>
      <span class="comment-author-name">${escapeHtml(c.author.name)}${commentRoleBadge}</span>
      <span class="comment-time">${formatRelativeTime(c.timestamp)}</span>
    </div>
    <p class="comment-body">${escapeHtml(c.content)}</p>
  `;
  return div;
}

// ================= SHOUTBOX =================
function renderShoutbox() {
  if (shoutboxList) shoutboxList.innerHTML = '';
  if (mobileShoutboxList) mobileShoutboxList.innerHTML = '';
  allShouts.forEach(s => appendShout(s, false));
  if (shoutboxList) shoutboxList.scrollTop = shoutboxList.scrollHeight;
  if (mobileShoutboxList) mobileShoutboxList.scrollTop = mobileShoutboxList.scrollHeight;
}

function appendShout(shout, autoScroll = true) {
  const createItem = () => {
    const item = document.createElement('div');
    item.className = 'shout-item';
    item.style.borderLeftColor = shout.color || '#a855f7';
    item.innerHTML = `
      <div class="shout-meta">
        <span class="shout-author">${shout.badge || '👤'} ${escapeHtml(shout.author)}</span>
        <span class="shout-time">${formatTimeShort(shout.time)}</span>
      </div>
      <div class="shout-text">${escapeHtml(shout.text)}</div>
    `;
    return item;
  };

  if (shoutboxList) {
    shoutboxList.appendChild(createItem());
    if (autoScroll) shoutboxList.scrollTop = shoutboxList.scrollHeight;
  }

  if (mobileShoutboxList) {
    mobileShoutboxList.appendChild(createItem());
    if (autoScroll) mobileShoutboxList.scrollTop = mobileShoutboxList.scrollHeight;
  }
}

// ================= FLOATING REACTION PARTICLES =================
function spawnFloatingReaction(clientX, clientY, emoji) {
  const particle = document.createElement('div');
  particle.className = 'floating-reaction-particle';
  particle.textContent = emoji;
  particle.style.left = `${clientX - 12}px`;
  particle.style.top = `${clientY - 20}px`;

  document.body.appendChild(particle);

  setTimeout(() => {
    particle.remove();
  }, 1200);
}

// ================= CHANNEL STATS =================
function updateChannelCounts() {
  const counts = { all: allPosts.length };
  allPosts.forEach(p => {
    counts[p.channel] = (counts[p.channel] || 0) + 1;
  });

  const setBadge = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count || '0';
  };

  setBadge('badge-count-all', counts.all || 0);
  setBadge('badge-count-announcements', counts['announcements'] || 0);
  setBadge('badge-count-vent', counts['vent'] || 0);
  setBadge('badge-count-suggestions', counts['suggestions'] || 0);
  setBadge('badge-count-requests', counts['requests'] || 0);
  setBadge('badge-count-guidance', counts['guidance'] || 0);

  const myPostsCount = allPosts.filter(p => myPostIds.has(p.id) || !!myPostKeys[p.id]).length;
  setBadge('badge-count-my-posts', myPostsCount);
}

// ================= EVENT LISTENERS =================
function setupEventListeners() {
  // Sound Mute Toggle
  btnSoundToggle.addEventListener('click', () => {
    const muted = window.soundEngine.toggleMute();
    updateSoundIcon();
    showToast(muted ? 'ปิดเสียงเรียบร้อย' : 'เปิดเสียงเรียบร้อย', 'info');
  });

  // Channel Navigation clicks
  document.querySelectorAll('.channel-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.channel-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChannel = btn.dataset.channel;

      const info = CHANNEL_DATA[currentChannel] || { name: 'กระทู้ทั้งหมด', icon: getChannelSvg('all') };
      activeChannelIcon.innerHTML = info.icon;
      activeChannelTitle.textContent = info.name;

      visiblePostsCount = POSTS_PER_PAGE;
      window.soundEngine.playClick();
      renderFeed();
    });
  });

  // Expose switchChannel globally (used by notify banner "View" button)
  window.switchChannel = (channel) => {
    const btn = document.querySelector(`.channel-item[data-channel="${channel}"]`);
    if (btn) {
      btn.click();
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Sort Tabs
  document.querySelectorAll('.sort-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSort = tab.dataset.sort;

      visiblePostsCount = POSTS_PER_PAGE;
      window.soundEngine.playClick();
      renderFeed();
    });
  });

  // Search input
  globalSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (searchQuery.trim()) {
      btnClearSearch.classList.remove('hidden');
    } else {
      btnClearSearch.classList.add('hidden');
    }
    visiblePostsCount = POSTS_PER_PAGE;
    renderFeed();
  });

  btnClearSearch.addEventListener('click', () => {
    globalSearchInput.value = '';
    searchQuery = '';
    btnClearSearch.classList.add('hidden');
    visiblePostsCount = POSTS_PER_PAGE;
    renderFeed();
  });

  // Load More Posts button listener
  if (btnLoadMore) {
    btnLoadMore.addEventListener('click', () => {
      loadMorePosts();
    });
  }

  // Notice highlight strip action button
  const btnStripOpenPopular = document.getElementById('btn-strip-open-popular');
  if (btnStripOpenPopular) {
    btnStripOpenPopular.addEventListener('click', () => {
      document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
      const hotTab = document.querySelector('.sort-tab[data-sort="hot"]');
      if (hotTab) hotTab.classList.add('active');
      currentSort = 'hot';
      visiblePostsCount = POSTS_PER_PAGE;
      if (window.soundEngine) window.soundEngine.playClick();
      renderFeed();
    });
  }

  // Trending tag pills
  document.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const tag = pill.dataset.tag;
      globalSearchInput.value = tag;
      searchQuery = tag;
      btnClearSearch.classList.remove('hidden');
      visiblePostsCount = POSTS_PER_PAGE;
      window.soundEngine.playClick();
      renderFeed();
    });
  });

  // Shoutbox Submit
  shoutboxForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = shoutboxInput.value.trim();
    if (!text) return;

    socket.emit('send_shout', {
      author: currentPersona,
      text,
      studentToken: currentStudentUser?.token || null
    });

    shoutboxInput.value = '';
    window.soundEngine.playClick();
  });

  // Compose Modal triggers
  const openCompose = () => {
    if (composeModal) composeModal.classList.remove('hidden');
    if (composeTitleInput) composeTitleInput.focus();
    if (window.soundEngine) window.soundEngine.playClick();
  };
  if (btnOpenCompose) btnOpenCompose.addEventListener('click', openCompose);
  if (quickComposeTrigger) quickComposeTrigger.addEventListener('click', openCompose);
  document.getElementById('btn-empty-compose')?.addEventListener('click', openCompose);

  const closeCompose = () => {
    if (composeModal) composeModal.classList.add('hidden');
  };
  if (btnCloseCompose) btnCloseCompose.addEventListener('click', closeCompose);
  if (btnCancelCompose) btnCancelCompose.addEventListener('click', closeCompose);

  // Modal Reroll
  btnRerollInModal.addEventListener('click', () => {
    currentPersona = generateRandomPersona();
    localStorage.setItem('ghostwire_persona', JSON.stringify(currentPersona));
    updatePersonaDisplay();
    window.soundEngine.playClick();
  });

  // Title / Content Char Counters
  composeTitleInput.addEventListener('input', () => {
    titleCharCount.textContent = composeTitleInput.value.length;
  });
  composeContentInput.addEventListener('input', () => {
    contentCharCount.textContent = composeContentInput.value.length;
  });

  // Tag Pill Input
  composeTagsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = composeTagsInput.value.trim().replace(/^#/, '');
      if (val && !composedTags.includes(val) && composedTags.length < 5) {
        composedTags.push(val);
        renderComposedTags();
        composeTagsInput.value = '';
      }
    }
  });

  // Submit Post
  composeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = composeTitleInput.value.trim();
    const content = composeContentInput.value.trim();
    const channel = composeChannelSelect.value;

    if (!title || !content) return;

    if (channel === 'announcements' && currentPersona.role !== 'teacher' && currentPersona.role !== 'admin') {
      showToast('📢 ห้องประกาศอนุญาตให้เฉพาะคุณครูและผู้ดูแลระบบโพสต์เท่านั้น (ยืนยันบทบาทในหน้าตัวตนของคุณ)', 'warning');
      return;
    }

    socket.emit('create_post', {
      title,
      content,
      channel,
      tags: composedTags,
      author: currentPersona,
      studentToken: currentStudentUser?.token || null
    });

    // Reset Form
    composeTitleInput.value = '';
    composeContentInput.value = '';
    composedTags = [];
    renderComposedTags();
    titleCharCount.textContent = '0';
    contentCharCount.textContent = '0';
    closeCompose();

    window.soundEngine.playPublish();
    showToast('โพสต์ของคุณถูกส่งเรียบร้อยแล้ว!', 'success');
  });

  // ================= EDIT POST MODAL LOGIC =================
  const editModal = document.getElementById('edit-modal');
  const editForm = document.getElementById('edit-form');
  const editPostIdInput = document.getElementById('edit-post-id');
  const editChannelSelect = document.getElementById('edit-channel-select');
  const editTitleInput = document.getElementById('edit-title-input');
  const editContentInput = document.getElementById('edit-content-input');
  const editTagInput = document.getElementById('edit-tag-input');
  const editTagsContainer = document.getElementById('edit-tags-container');
  const editTitleCharCount = document.getElementById('edit-title-char-count');
  const editContentCharCount = document.getElementById('edit-content-char-count');
  const btnCloseEdit = document.getElementById('btn-close-edit');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  let editedTags = [];

  const renderEditedTags = () => {
    if (!editTagsContainer) return;
    editTagsContainer.querySelectorAll('.tag-chip').forEach(el => el.remove());
    editedTags.forEach((t, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `#${escapeHtml(t)} <button type="button" data-idx="${i}">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        editedTags.splice(i, 1);
        renderEditedTags();
      });
      editTagsContainer.insertBefore(chip, editTagInput);
    });
  };

  if (editTagInput) {
    editTagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = editTagInput.value.trim().replace(/^#/, '');
        if (val && !editedTags.includes(val) && editedTags.length < 5) {
          editedTags.push(val);
          renderEditedTags();
          editTagInput.value = '';
        }
      }
    });
  }

  if (editTitleInput && editTitleCharCount) {
    editTitleInput.addEventListener('input', () => {
      editTitleCharCount.textContent = editTitleInput.value.length;
    });
  }

  if (editContentInput && editContentCharCount) {
    editContentInput.addEventListener('input', () => {
      editContentCharCount.textContent = editContentInput.value.length;
    });
  }

  const closeEditModal = () => {
    if (editModal) editModal.classList.add('hidden');
  };

  if (btnCloseEdit) btnCloseEdit.addEventListener('click', closeEditModal);
  if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeEditModal);

  window.openEditPostModal = (post) => {
    if (!editModal || !post) return;
    editPostIdInput.value = post.id;
    editChannelSelect.value = post.channel || 'vent';
    editTitleInput.value = post.title || '';
    editContentInput.value = post.content || '';
    editedTags = Array.isArray(post.tags) ? [...post.tags] : [];
    renderEditedTags();
    if (editTitleCharCount) editTitleCharCount.textContent = editTitleInput.value.length;
    if (editContentCharCount) editContentCharCount.textContent = editContentInput.value.length;
    editModal.classList.remove('hidden');
    editTitleInput.focus();
    if (window.soundEngine) window.soundEngine.playClick();
  };

  if (editForm) {
    editForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const postId = editPostIdInput.value;
      const title = editTitleInput.value.trim();
      const content = editContentInput.value.trim();
      const channel = editChannelSelect.value;

      if (!postId || !title || !content) return;

      socket.emit('edit_post', {
        postId,
        title,
        content,
        channel,
        tags: editedTags,
        studentToken: currentStudentUser?.token || null,
        authorKey: myPostKeys[postId] || null
      });

      closeEditModal();
      if (window.soundEngine) window.soundEngine.playPublish();
    });
  }

  // Event delegation for post edit and delete buttons
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-owner-edit');
    if (editBtn) {
      const postId = editBtn.getAttribute('data-edit-id');
      const post = allPosts.find(p => p.id === postId);
      if (post && window.openEditPostModal) {
        window.openEditPostModal(post);
      }
      return;
    }

    const deleteBtn = e.target.closest('.btn-owner-delete');
    if (deleteBtn) {
      const postId = deleteBtn.getAttribute('data-delete-id');
      if (!postId) return;
      if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบกระทู้นี้? เมื่อลบแล้วจะไม่สามารถกู้คืนได้')) {
        socket.emit('delete_my_post', {
          postId,
          studentToken: currentStudentUser?.token || null,
          authorKey: myPostKeys[postId] || null
        });
        delete myPostKeys[postId];
        myPostIds.delete(postId);
        try {
          localStorage.setItem('tlw_my_post_keys', JSON.stringify(myPostKeys));
        } catch (err) {}
        updateChannelCounts();
        if (window.soundEngine) window.soundEngine.playClick();
      }
      return;
    }
  });

  // Persona Modal triggers
  btnPersonaProfile.addEventListener('click', () => {
    personaModal.classList.remove('hidden');
    window.soundEngine.playClick();
  });

  btnClosePersona.addEventListener('click', () => {
    personaModal.classList.add('hidden');
  });

    btnSavePersona.addEventListener('click', () => {
    personaModal.classList.add('hidden');
    localStorage.setItem('ghostwire_persona', JSON.stringify(currentPersona));
    updatePersonaDisplay();
    showToast(`อัปเดตตัวตนเป็น ${currentPersona.name}`, 'success');
    window.soundEngine.playClick();
  });

  // Role Selector in Persona Modal
  let selectedPendingRole = currentPersona.role || 'student';
  const roleButtons = document.querySelectorAll('.btn-role-tab');
  const rolePinContainer = document.getElementById('role-pin-container');
  const rolePinInput = document.getElementById('role-pin-input');
  const rolePinLabel = document.getElementById('role-pin-label');
  const btnVerifyRolePin = document.getElementById('btn-verify-role-pin');
  const roleVerifyMsg = document.getElementById('role-verify-msg');
  const currentRoleLabel = document.getElementById('current-role-label');

  const updateRoleUI = () => {
    roleButtons.forEach(btn => {
      if (btn.dataset.role === (currentPersona.role || 'student')) {
        btn.classList.add('active');
        btn.style.background = 'var(--accent-blue)';
        btn.style.color = '#fff';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.color = 'var(--text-secondary)';
      }
    });

    const roleMap = {
      student: 'นักเรียน (Student)',
      teacher: 'คุณครู ท.ล.ว. (Teacher) 👨‍🏫',
      moderator: 'สภานักเรียน (Student Council) 🛡️'
    };
    if (currentRoleLabel) {
      currentRoleLabel.textContent = roleMap[currentPersona.role || 'student'] || 'นักเรียน';
    }
  };
  updateRoleUI();

  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetRole = btn.dataset.role;
      selectedPendingRole = targetRole;

      if (targetRole === 'student') {
        currentPersona.role = 'student';
        localStorage.setItem('ghostwire_persona', JSON.stringify(currentPersona));
        if (rolePinContainer) rolePinContainer.classList.add('hidden');
        updateRoleUI();
        showToast('เปลี่ยนบทบาทเป็นนักเรียนเรียบร้อย', 'info');
      } else {
        if (rolePinContainer) {
          rolePinContainer.classList.remove('hidden');
          rolePinInput.value = '';
          rolePinInput.focus();
          if (roleVerifyMsg) roleVerifyMsg.classList.add('hidden');
          if (rolePinLabel) {
            rolePinLabel.textContent = targetRole === 'teacher' ? 'กรอกรหัสผ่านยืนยันตัวตนคุณครู' : 'กรอกรหัสผ่านยืนยันสภานักเรียน';
          }
        }
      }
    });
  });

  if (btnVerifyRolePin && rolePinInput) {
    btnVerifyRolePin.addEventListener('click', async () => {
      const pin = rolePinInput.value.trim();
      if (!pin) return;

      try {
        const res = await fetch('/api/auth/verify-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: selectedPendingRole, pin })
        });
        const data = await res.json();
        if (data.success) {
          currentPersona.role = data.role;
          currentPersona.verified = true;
          currentPersona.roleToken = data.roleToken || null;
          localStorage.setItem('ghostwire_persona', JSON.stringify(currentPersona));
          updateRoleUI();
          if (rolePinContainer) rolePinContainer.classList.add('hidden');
          showToast(`ยืนยันสิทธิ์เป็น ${data.badge} สำเร็จ!`, 'success');
          window.soundEngine.playPublish();
        } else {
          if (roleVerifyMsg) {
            roleVerifyMsg.classList.remove('hidden');
            roleVerifyMsg.style.color = '#ef4444';
            roleVerifyMsg.textContent = data.error || 'รหัสไม่ถูกต้อง โปรดตรวจสอบอีกครั้ง';
          }
        }
      } catch (e) {
        showToast('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์', 'error');
      }
    });
  }

  btnRerollPersonaName.addEventListener('click', () => {
    const fresh = generateRandomPersona();
    currentPersona.name = fresh.name;
    updatePersonaDisplay();
    window.soundEngine.playClick();
  });

  // Emoji picker
  document.querySelectorAll('.emoji-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emoji-pick-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentPersona.badge = btn.dataset.emoji;
      updatePersonaDisplay();
      window.soundEngine.playClick();
    });
  });

  // Color picker
  document.querySelectorAll('.color-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-pick-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentPersona.color = btn.dataset.color;
      updatePersonaDisplay();
      window.soundEngine.playClick();
    });
  });

  // Rules Modal Triggers
  if (btnAcceptRules) {
    btnAcceptRules.addEventListener('click', () => {
      if (rulesModal) rulesModal.classList.add('hidden');
      localStorage.setItem('tlw_accepted_rules', 'true');
      if (window.soundEngine) window.soundEngine.playPublish();
      showToast('ยินดีต้อนรับสู่ TLW Connect — ชุมชนชาวท่าลี่วิทยา 🏫', 'success');
    });
  }

  if (btnCloseRules) {
    btnCloseRules.addEventListener('click', () => {
      if (rulesModal) rulesModal.classList.add('hidden');
      if (window.soundEngine) window.soundEngine.playClick();
    });
  }

  if (btnOpenRules) {
    btnOpenRules.addEventListener('click', () => {
      if (rulesModal) rulesModal.classList.remove('hidden');
      if (window.soundEngine) window.soundEngine.playClick();
    });
  }

  // Click outside rules modal to close
  if (rulesModal) {
    rulesModal.addEventListener('click', (e) => {
      if (e.target === rulesModal) {
        rulesModal.classList.add('hidden');
      }
    });
  }

  // Report Modal Handlers
  if (btnCloseReportModal) {
    btnCloseReportModal.addEventListener('click', () => {
      closeReportModal();
      window.soundEngine.playClick();
    });
  }

  if (btnCancelReport) {
    btnCancelReport.addEventListener('click', () => {
      closeReportModal();
      window.soundEngine.playClick();
    });
  }

  if (reportModal) {
    reportModal.addEventListener('click', (e) => {
      if (e.target === reportModal) closeReportModal();
    });
  }

  if (reportForm) {
    reportForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!currentReportingPost) return;

      const reason = reportReasonSelect ? reportReasonSelect.value : 'ละเมิดกฎ';
      const details = reportDetailsInput ? reportDetailsInput.value.trim() : '';

      socket.emit('report_post', {
        postId: currentReportingPost.id,
        reason,
        details,
        reporterName: currentPersona ? currentPersona.name : 'Anon'
      });

      closeReportModal();
      window.soundEngine.playPublish();
      showToast('🚨 ส่งรายงานไปยังผู้ดูแลเรียบร้อยแล้ว ขอบคุณที่ช่วยดูแลความปลอดภัยของโรงเรียน', 'success');
    });
  }

  // ================= MOBILE NAVIGATION & INTERACTIONS =================
  const setMobileNavActive = (activeBtn) => {
    document.querySelectorAll('.bottom-nav-item').forEach(btn => btn.classList.remove('active'));
    if (activeBtn) activeBtn.classList.add('active');
  };

  // 1. Mobile Feed Button
  if (btnBottomNavFeed) {
    btnBottomNavFeed.addEventListener('click', () => {
      setMobileNavActive(btnBottomNavFeed);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.soundEngine.playClick();
    });
  }

  // 2. Mobile Shoutbox Drawer Toggle
  if (btnBottomNavShoutbox) {
    btnBottomNavShoutbox.addEventListener('click', () => {
      setMobileNavActive(btnBottomNavShoutbox);
      if (mobileShoutboxDrawer) {
        mobileShoutboxDrawer.classList.remove('hidden');
        if (mobileShoutboxList) mobileShoutboxList.scrollTop = mobileShoutboxList.scrollHeight;
        if (mobileShoutboxInput) mobileShoutboxInput.focus();
      }
      if (bottomShoutboxDot) bottomShoutboxDot.classList.add('hidden');
      window.soundEngine.playClick();
    });
  }

  if (btnCloseMobileShoutbox) {
    btnCloseMobileShoutbox.addEventListener('click', () => {
      if (mobileShoutboxDrawer) mobileShoutboxDrawer.classList.add('hidden');
      setMobileNavActive(btnBottomNavFeed);
      window.soundEngine.playClick();
    });
  }

  if (mobileShoutboxDrawer) {
    mobileShoutboxDrawer.addEventListener('click', (e) => {
      if (e.target === mobileShoutboxDrawer) {
        mobileShoutboxDrawer.classList.add('hidden');
        setMobileNavActive(btnBottomNavFeed);
      }
    });
  }

  // 3. Mobile Shoutbox Form Submit
  if (mobileShoutboxForm && mobileShoutboxInput) {
    mobileShoutboxForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = mobileShoutboxInput.value.trim();
      if (!text) return;

      socket.emit('send_shout', {
        author: currentPersona,
        text,
        studentToken: currentStudentUser?.token || null
      });

      mobileShoutboxInput.value = '';
      window.soundEngine.playClick();
    });
  }

  // 4. Mobile FAB Compose
  if (btnBottomNavCompose) {
    btnBottomNavCompose.addEventListener('click', () => {
      composeModal.classList.remove('hidden');
      composeTitleInput.focus();
      window.soundEngine.playClick();
    });
  }

  // 5. Mobile Rules Modal
  if (btnBottomNavRules) {
    btnBottomNavRules.addEventListener('click', () => {
      rulesModal.classList.remove('hidden');
      window.soundEngine.playClick();
    });
  }

  // 6. Mobile Persona Modal
  if (btnBottomNavPersona) {
    btnBottomNavPersona.addEventListener('click', () => {
      personaModal.classList.remove('hidden');
      window.soundEngine.playClick();
    });
  }

  // 7. Mobile Channels Bar Horizontal Pills
  document.querySelectorAll('.mobile-channel-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.mobile-channel-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const ch = pill.dataset.channel;
      currentChannel = ch;

      // Sync desktop sidebar buttons too
      document.querySelectorAll('.channel-item').forEach(b => {
        if (b.dataset.channel === ch) b.classList.add('active');
        else b.classList.remove('active');
      });

      const info = CHANNEL_DATA[currentChannel] || { name: 'กระทู้ทั้งหมด', icon: getChannelSvg('all') };
      activeChannelIcon.innerHTML = info.icon;
      activeChannelTitle.textContent = info.name;

      visiblePostsCount = POSTS_PER_PAGE;
      window.soundEngine.playClick();
      renderFeed();
    });
  });


}

function renderComposedTags() {
  composedTagsList.innerHTML = '';
  composedTags.forEach((tag, idx) => {
    const item = document.createElement('span');
    item.className = 'tag-item-removable';
    item.innerHTML = `#${tag} <span class="remove-tag-x">&times;</span>`;
    item.querySelector('.remove-tag-x').addEventListener('click', () => {
      composedTags.splice(idx, 1);
      renderComposedTags();
    });
    composedTagsList.appendChild(item);
  });
}

// ================= TOAST NOTIFICATION =================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : '📢'}</span> <span>${escapeHtml(message)}</span>`;

  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ================= AMBIENT PARTICLES CANVAS =================
function initAmbientParticles() {
  const container = document.getElementById('particle-canvas-container');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '0';
  canvas.style.opacity = '0.35';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 2 + 1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    requestAnimationFrame(render);
  }
  render();
}

// ================= HELPERS =================
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
  if (diffSec < 60 * 60) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
  if (diffSec < 60 * 60 * 24) return `${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
}

function formatTimeShort(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Start
window.addEventListener('DOMContentLoaded', initApp);
