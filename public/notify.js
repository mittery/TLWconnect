// =====================================================================
// TLWconnect — NOTIFICATION SYSTEM
// =====================================================================
// ระบบแจ้งเตือน 2 ระดับ:
//   1. In-App Banner    — แบนเนอร์กลางหน้าจอ + เปลี่ยนชื่อแท็บ (ทำงานทุกอุปกรณ์)
//   2. Browser Push     — แจ้งเตือนออกนอกเว็บ (ต้องอนุญาต + HTTPS)

class TLWNotify {
  constructor() {
    this._originalTitle = document.title;
    this._flashInterval = null;
    this._flashCount = 0;
    this._banner = null;
    this._permissionState = Notification?.permission || 'default';
    this._storageKey = 'tlw_notify_perm_asked';

    this._injectStyles();
    this._createBanner();
    this._createPermissionToast();
  }

  // ---------------------------------------------------------------
  // STYLES (inject once)
  // ---------------------------------------------------------------
  _injectStyles() {
    if (document.getElementById('tlw-notify-styles')) return;
    const style = document.createElement('style');
    style.id = 'tlw-notify-styles';
    style.textContent = `
      /* ── ANNOUNCEMENT BANNER ── */
      #tlw-announce-banner {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 9999;
        transform: translateY(-110%);
        transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        pointer-events: none;
      }
      #tlw-announce-banner.show {
        transform: translateY(0);
        pointer-events: all;
      }
      .tlw-banner-inner {
        margin: 12px 16px 0;
        background: linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(7,14,30,0.99) 100%);
        border: 1.5px solid rgba(56,189,248,0.55);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(56,189,248,0.12), inset 0 1px 0 rgba(255,255,255,0.06);
        backdrop-filter: blur(20px);
        padding: 14px 16px 14px 20px;
        display: flex;
        align-items: center;
        gap: 14px;
        animation: tlw-banner-glow 2s ease-in-out infinite alternate;
      }
      @keyframes tlw-banner-glow {
        from { box-shadow: 0 8px 32px rgba(0,0,0,0.65), 0 0 12px rgba(56,189,248,0.15), inset 0 1px 0 rgba(255,255,255,0.06); }
        to   { box-shadow: 0 8px 32px rgba(0,0,0,0.65), 0 0 28px rgba(56,189,248,0.3),  inset 0 1px 0 rgba(255,255,255,0.06); }
      }
      .tlw-banner-icon {
        font-size: 1.6rem;
        flex-shrink: 0;
        animation: tlw-pulse-icon 1.4s ease-in-out infinite;
      }
      @keyframes tlw-pulse-icon {
        0%, 100% { transform: scale(1); }
        50%       { transform: scale(1.18) rotate(-4deg); }
      }
      .tlw-banner-body {
        flex: 1;
        min-width: 0;
      }
      .tlw-banner-label {
        font-size: 0.68rem;
        font-weight: 700;
        color: #38bdf8;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 2px;
      }
      .tlw-banner-title {
        font-size: 0.95rem;
        font-weight: 700;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tlw-banner-sub {
        font-size: 0.75rem;
        color: #94a3b8;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tlw-banner-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .tlw-banner-btn-view {
        background: linear-gradient(135deg, #38bdf8, #0ea5e9);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 7px 14px;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        transition: opacity 0.2s, transform 0.15s;
      }
      .tlw-banner-btn-view:hover { opacity: 0.88; transform: scale(1.04); }
      .tlw-banner-btn-close {
        background: rgba(255,255,255,0.08);
        color: #94a3b8;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        font-size: 1rem;
        transition: background 0.2s, color 0.2s;
      }
      .tlw-banner-btn-close:hover { background: rgba(239,68,68,0.18); color: #f87171; }

      /* ── PERMISSION TOAST ── */
      #tlw-notify-permission-toast {
        position: fixed;
        bottom: 24px; left: 50%;
        transform: translateX(-50%) translateY(20px);
        opacity: 0;
        transition: opacity 0.35s ease, transform 0.35s ease;
        z-index: 9998;
        pointer-events: none;
        max-width: min(480px, calc(100vw - 32px));
        width: 100%;
      }
      #tlw-notify-permission-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
        pointer-events: all;
      }
      .tlw-perm-inner {
        background: linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(10,18,35,0.99) 100%);
        border: 1.5px solid rgba(245,158,11,0.5);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(245,158,11,0.12);
        padding: 14px 18px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .tlw-perm-icon { font-size: 1.5rem; flex-shrink: 0; }
      .tlw-perm-body { flex: 1; min-width: 0; }
      .tlw-perm-title {
        font-size: 0.88rem;
        font-weight: 700;
        color: #fbbf24;
        margin-bottom: 2px;
      }
      .tlw-perm-sub {
        font-size: 0.74rem;
        color: #94a3b8;
        line-height: 1.4;
      }
      .tlw-perm-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .tlw-perm-btn-allow {
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 7px 14px;
        font-size: 0.8rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        transition: opacity 0.2s, transform 0.15s;
      }
      .tlw-perm-btn-allow:hover { opacity: 0.88; transform: scale(1.04); }
      .tlw-perm-btn-later {
        background: rgba(255,255,255,0.07);
        color: #94a3b8;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 7px 12px;
        font-size: 0.8rem;
        cursor: pointer;
        transition: background 0.2s;
      }
      .tlw-perm-btn-later:hover { background: rgba(255,255,255,0.12); color: #cbd5e1; }

      /* ── NOTIFICATION BELL BUTTON ── */
      #btn-notify-bell {
        background: transparent;
        border: 1.5px solid rgba(255,255,255,0.12);
        color: #94a3b8;
        border-radius: 10px;
        width: 38px; height: 38px;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        font-size: 1.1rem;
        position: relative;
        transition: border-color 0.2s, color 0.2s, background 0.2s;
      }
      #btn-notify-bell:hover {
        border-color: rgba(56,189,248,0.4);
        color: #38bdf8;
        background: rgba(56,189,248,0.08);
      }
      #btn-notify-bell.enabled {
        border-color: rgba(34,197,94,0.5);
        color: #4ade80;
        background: rgba(34,197,94,0.08);
      }
      #btn-notify-bell.denied {
        border-color: rgba(239,68,68,0.4);
        color: #f87171;
        opacity: 0.6;
        cursor: not-allowed;
      }
      .bell-badge {
        position: absolute;
        top: -3px; right: -3px;
        background: #ef4444;
        color: #fff;
        border-radius: 9999px;
        font-size: 0.55rem;
        font-weight: 800;
        min-width: 14px; height: 14px;
        display: flex; align-items: center; justify-content: center;
        padding: 0 3px;
        border: 1.5px solid #0f172a;
        animation: bell-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        display: none;
      }
      .bell-badge.visible { display: flex; }
      @keyframes bell-pop {
        from { transform: scale(0); }
        to   { transform: scale(1); }
      }
      .bell-shake {
        animation: bell-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97);
      }
      @keyframes bell-shake {
        10%, 90% { transform: rotate(-4deg); }
        20%, 80% { transform: rotate(6deg); }
        30%, 50%, 70% { transform: rotate(-6deg); }
        40%, 60% { transform: rotate(6deg); }
      }

      /* ── TAB FLASH INDICATOR ── */
      /* (handled in JS by title change) */

      /* ── MOBILE RESPONSIVE ── */
      @media (max-width: 768px) {
        .tlw-banner-inner {
          margin: 8px 10px 0;
          padding: 10px 12px 10px 14px;
          gap: 10px;
          border-radius: 12px;
        }
        .tlw-banner-icon { font-size: 1.3rem; }
        .tlw-banner-label { font-size: 0.6rem; }
        .tlw-banner-title { font-size: 0.82rem; }
        .tlw-banner-sub   { font-size: 0.68rem; }
        .tlw-banner-btn-view {
          padding: 6px 10px;
          font-size: 0.72rem;
        }
        .tlw-banner-btn-close {
          width: 28px; height: 28px;
          font-size: 0.85rem;
        }
        /* Permission toast sits above mobile bottom nav (70px tall) */
        #tlw-notify-permission-toast {
          bottom: 80px;
        }
        /* Mobile bell in bottom nav */
        #btn-notify-bell-mobile {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 1.2rem;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%; height: 100%;
          cursor: pointer;
          transition: color 0.2s;
        }
        #btn-notify-bell-mobile.enabled { color: #4ade80; }
        #btn-notify-bell-mobile.denied  { color: #f87171; opacity: 0.6; }
        .mobile-bell-badge {
          position: absolute;
          top: 2px; right: calc(50% - 18px);
          background: #ef4444;
          color: #fff;
          border-radius: 9999px;
          font-size: 0.52rem;
          font-weight: 800;
          min-width: 14px; height: 14px;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 0 3px;
          border: 1.5px solid #0f172a;
          animation: bell-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .mobile-bell-badge.visible { display: flex; }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------
  // CREATE ANNOUNCEMENT BANNER (DOM)
  // ---------------------------------------------------------------
  _createBanner() {
    const el = document.createElement('div');
    el.id = 'tlw-announce-banner';
    el.innerHTML = `
      <div class="tlw-banner-inner">
        <div class="tlw-banner-icon" id="tlw-banner-icon">📢</div>
        <div class="tlw-banner-body">
          <div class="tlw-banner-label">ประกาศโรงเรียน</div>
          <div class="tlw-banner-title" id="tlw-banner-title">—</div>
          <div class="tlw-banner-sub" id="tlw-banner-sub">—</div>
        </div>
        <div class="tlw-banner-actions">
          <button class="tlw-banner-btn-view" id="tlw-banner-btn-view">📖 ดูประกาศ</button>
          <button class="tlw-banner-btn-close" id="tlw-banner-btn-close" title="ปิด">✕</button>
        </div>
      </div>
    `;
    document.body.prepend(el);
    this._banner = el;

    document.getElementById('tlw-banner-btn-close').addEventListener('click', () => this.hideBanner());
    document.getElementById('tlw-banner-btn-view').addEventListener('click', () => {
      this.hideBanner();
      // Switch to announcements channel if app is available
      if (typeof window.switchChannel === 'function') {
        window.switchChannel('announcements');
      } else {
        // Scroll to top of feed
        document.getElementById('posts-container')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // ---------------------------------------------------------------
  // CREATE PERMISSION TOAST (DOM)
  // ---------------------------------------------------------------
  _createPermissionToast() {
    const el = document.createElement('div');
    el.id = 'tlw-notify-permission-toast';
    el.innerHTML = `
      <div class="tlw-perm-inner">
        <div class="tlw-perm-icon">🔔</div>
        <div class="tlw-perm-body">
          <div class="tlw-perm-title">เปิดรับการแจ้งเตือนประกาศโรงเรียน</div>
          <div class="tlw-perm-sub">เมื่อมีประกาศใหม่จะแจ้งเตือนคุณ แม้พับหน้าจอไว้</div>
        </div>
        <div class="tlw-perm-actions">
          <button class="tlw-perm-btn-allow" id="tlw-perm-btn-allow">🔔 อนุญาต</button>
          <button class="tlw-perm-btn-later" id="tlw-perm-btn-later">ไว้ทีหลัง</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById('tlw-perm-btn-allow').addEventListener('click', () => {
      this._hidePermissionToast();
      this.requestPermission();
    });
    document.getElementById('tlw-perm-btn-later').addEventListener('click', () => {
      this._hidePermissionToast();
      localStorage.setItem(this._storageKey, 'later_' + Date.now());
    });
  }

  // ---------------------------------------------------------------
  // BELL BUTTON (inserted into header by setupBellButton())
  // ---------------------------------------------------------------
  setupBellButton() {
    const slot = document.getElementById('notify-bell-slot');
    if (!slot || document.getElementById('btn-notify-bell')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-notify-bell';
    btn.title = 'การแจ้งเตือนประกาศโรงเรียน';
    btn.innerHTML = `<span id="bell-icon">🔔</span><span class="bell-badge" id="bell-badge"></span>`;
    slot.appendChild(btn);

    btn.addEventListener('click', () => {
      this._clearBadge();
      if (this._permissionState === 'granted') {
        if (window.showToast) showToast('✅ คุณเปิดรับการแจ้งเตือนแล้ว', 'success');
      } else if (this._permissionState === 'denied') {
        if (window.showToast) showToast('🚫 การแจ้งเตือนถูกบล็อกในเบราว์เซอร์ กรุณาไปยกเลิกการบล็อกด้วยตนเอง', 'info');
      } else {
        this.requestPermission();
      }
      this._shakeBell();
    });

    this._updateBellUI();
  }

  _shakeBell() {
    const btn = document.getElementById('btn-notify-bell');
    if (!btn) return;
    btn.classList.remove('bell-shake');
    void btn.offsetWidth; // reflow
    btn.classList.add('bell-shake');
    setTimeout(() => btn.classList.remove('bell-shake'), 600);
  }

  _updateBellUI() {
    // Desktop
    const btn = document.getElementById('btn-notify-bell');
    const icon = document.getElementById('bell-icon');
    if (btn) {
      btn.classList.remove('enabled', 'denied');
      if (this._permissionState === 'granted') {
        btn.classList.add('enabled');
        btn.title = 'การแจ้งเตือนเปิดอยู่ ✅';
        if (icon) icon.textContent = '🔔';
      } else if (this._permissionState === 'denied') {
        btn.classList.add('denied');
        btn.title = 'การแจ้งเตือนถูกบล็อก — คลิกเพื่อดูวิธีแก้ไข';
        if (icon) icon.textContent = '🔕';
      } else {
        btn.title = 'คลิกเพื่อเปิดรับการแจ้งเตือนประกาศโรงเรียน';
        if (icon) icon.textContent = '🔔';
      }
    }
    // Mobile
    const mobileBtn = document.getElementById('btn-notify-bell-mobile');
    if (mobileBtn) {
      mobileBtn.classList.remove('enabled', 'denied');
      if (this._permissionState === 'granted') {
        mobileBtn.classList.add('enabled');
        mobileBtn.title = 'การแจ้งเตือนเปิดอยู่ ✅';
      } else if (this._permissionState === 'denied') {
        mobileBtn.classList.add('denied');
      }
    }
  }

  _showBadge(count = '') {
    // Desktop bell badge
    const badge = document.getElementById('bell-badge');
    if (badge) {
      badge.textContent = count || '';
      badge.classList.add('visible');
    }
    // Mobile bell badge
    const mobileBadge = document.getElementById('mobile-bell-badge');
    if (mobileBadge) {
      mobileBadge.textContent = count || '';
      mobileBadge.classList.add('visible');
    }
    this._shakeBell();
  }

  _clearBadge() {
    const badge = document.getElementById('bell-badge');
    if (badge) badge.classList.remove('visible');
    const mobileBadge = document.getElementById('mobile-bell-badge');
    if (mobileBadge) mobileBadge.classList.remove('visible');
  }

  // ---------------------------------------------------------------
  // BROWSER PERMISSION
  // ---------------------------------------------------------------
  async requestPermission() {
    if (!('Notification' in window)) {
      if (window.showToast) showToast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน', 'info');
      return;
    }
    if (Notification.permission === 'granted') {
      this._permissionState = 'granted';
      this._updateBellUI();
      if (window.showToast) showToast('🔔 เปิดรับการแจ้งเตือนสำเร็จแล้ว!', 'success');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      this._permissionState = result;
      localStorage.setItem(this._storageKey, result === 'granted' ? 'granted' : 'asked_' + Date.now());
      this._updateBellUI();
      if (result === 'granted') {
        if (window.showToast) showToast('🔔 เปิดรับการแจ้งเตือนสำเร็จ! จะแจ้งเมื่อมีประกาศใหม่', 'success');
        // Send a test notification
        setTimeout(() => {
          new Notification('TLWconnect 🏫', {
            body: '✅ ระบบแจ้งเตือนพร้อมใช้งานแล้ว! คุณจะได้รับแจ้งเมื่อมีประกาศใหม่',
            icon: '/favicon.ico',
            tag: 'tlw-welcome'
          });
        }, 500);
      } else if (result === 'denied') {
        if (window.showToast) showToast('การแจ้งเตือนถูกปฏิเสธ สามารถเปิดใหม่ได้ในการตั้งค่าเบราว์เซอร์', 'info');
      }
    } catch (err) {
      console.warn('[TLWNotify] requestPermission failed:', err);
    }
  }

  // ---------------------------------------------------------------
  // SHOW ANNOUNCEMENT PERMISSION TOAST (auto-prompt after delay)
  // ---------------------------------------------------------------
  maybePromptPermission(delayMs = 8000) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      this._permissionState = Notification.permission;
      this._updateBellUI();
      return;
    }
    const stored = localStorage.getItem(this._storageKey);
    if (stored === 'granted') return;
    // If they said "later" less than 3 days ago, don't prompt again
    if (stored && stored.startsWith('later_')) {
      const ts = parseInt(stored.replace('later_', ''), 10);
      if (!isNaN(ts) && Date.now() - ts < 3 * 24 * 60 * 60 * 1000) return;
    }
    // Show the permission toast after delay
    setTimeout(() => this._showPermissionToast(), delayMs);
  }

  _showPermissionToast() {
    const el = document.getElementById('tlw-notify-permission-toast');
    if (el) el.classList.add('show');
  }

  _hidePermissionToast() {
    const el = document.getElementById('tlw-notify-permission-toast');
    if (el) el.classList.remove('show');
  }

  // ---------------------------------------------------------------
  // SHOW IN-APP BANNER
  // ---------------------------------------------------------------
  showBanner(post) {
    const icon    = document.getElementById('tlw-banner-icon');
    const title   = document.getElementById('tlw-banner-title');
    const sub     = document.getElementById('tlw-banner-sub');

    if (icon)  icon.textContent  = '📢';
    if (title) title.textContent = post.title || 'มีประกาศใหม่';
    if (sub)   sub.textContent   = post.content
      ? post.content.slice(0, 80) + (post.content.length > 80 ? '…' : '')
      : `โดย ${post.author?.name || 'ฝ่ายบริหาร'} • เมื่อกี้`;

    if (this._banner) this._banner.classList.add('show');
    // Auto-hide after 12 s
    clearTimeout(this._autoDismiss);
    this._autoDismiss = setTimeout(() => this.hideBanner(), 12000);
  }

  hideBanner() {
    if (this._banner) this._banner.classList.remove('show');
    clearTimeout(this._autoDismiss);
    this._stopTabFlash();
  }

  // ---------------------------------------------------------------
  // BROWSER PUSH NOTIFICATION
  // ---------------------------------------------------------------
  pushNotification(post) {
    if (this._permissionState !== 'granted' || document.visibilityState === 'visible') return;
    const title = `📢 ประกาศใหม่จาก ท.ล.ว.`;
    const body  = `${post.title}`;
    try {
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'tlw-announce-' + (post.id || Date.now()),
        renotify: true,
        silent: false
      });
      n.onclick = () => {
        window.focus();
        n.close();
        if (typeof window.switchChannel === 'function') window.switchChannel('announcements');
      };
    } catch (err) {
      console.warn('[TLWNotify] push failed:', err);
    }
  }

  // ---------------------------------------------------------------
  // TAB TITLE FLASH
  // ---------------------------------------------------------------
  _startTabFlash(message = '📢 มีประกาศใหม่!') {
    this._stopTabFlash();
    this._flashCount = 0;
    this._flashInterval = setInterval(() => {
      document.title = this._flashCount % 2 === 0
        ? `${message} — TLWconnect`
        : this._originalTitle;
      this._flashCount++;
      if (this._flashCount > 14) this._stopTabFlash();
    }, 900);
  }

  _stopTabFlash() {
    clearInterval(this._flashInterval);
    this._flashInterval = null;
    document.title = this._originalTitle;
  }

  // ---------------------------------------------------------------
  // MAIN TRIGGER — call this when a new announcement arrives
  // ---------------------------------------------------------------
  onAnnouncement(post) {
    // 1. In-App banner
    this.showBanner(post);
    // 2. Tab flash (if window is not focused)
    if (document.visibilityState !== 'visible') {
      this._startTabFlash();
    }
    // 3. Bell badge
    this._showBadge('!');
    // 4. Browser push (if background)
    this.pushNotification(post);
  }

  // ---------------------------------------------------------------
  // onNewPost — for ANY new post (not just announcements)
  // can pass type to control what kind of notification to show
  // ---------------------------------------------------------------
  onNewPost(post) {
    if (post.channel === 'announcements') {
      this.onAnnouncement(post);
    }
    // No banner for regular posts – existing toast/sound is enough
  }
  // ---------------------------------------------------------------
  // MOBILE BELL BUTTON (call after DOM is ready)
  // ---------------------------------------------------------------
  setupMobileBell(slotId = 'notify-mobile-bell-slot') {
    const slot = document.getElementById(slotId);
    if (!slot || document.getElementById('btn-notify-bell-mobile')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-notify-bell-mobile';
    btn.title = 'การแจ้งเตือนประกาศ';
    btn.innerHTML = `
      <span id="mobile-bell-icon">🔔</span>
      <span class="mobile-bell-badge" id="mobile-bell-badge"></span>
    `;
    slot.appendChild(btn);

    btn.addEventListener('click', () => {
      this._clearBadge();
      if (this._permissionState === 'granted') {
        if (window.showToast) showToast('✅ เปิดรับการแจ้งเตือนอยู่แล้ว', 'success');
      } else if (this._permissionState === 'denied') {
        if (window.showToast) showToast('🚫 ถูกบล็อก — ไปยกเลิกในการตั้งค่าเบราว์เซอร์', 'info');
      } else {
        this.requestPermission();
      }
    });

    this._updateBellUI();
  }
}

// Instantiate and expose globally
window.tlwNotify = new TLWNotify();
