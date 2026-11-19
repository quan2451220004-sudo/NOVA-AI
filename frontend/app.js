// Trạng thái ứng dụng
let currentUser = JSON.parse(localStorage.getItem('nexus_ai_user') || 'null');
let currentSessionId = Date.now().toString();
let sessions = {};
let activeMessages = [];
let attachedDocument = null; // RAG file
let currentTransaction = null;

// DOM Elements - Auth & Gmail
const authOverlay = document.getElementById('authOverlay');
const appLayout = document.getElementById('appLayout');
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authErrorMsg = document.getElementById('authErrorMsg');
const tabLoginBtn = document.getElementById('tabLoginBtn');
const tabRegisterBtn = document.getElementById('tabRegisterBtn');
const googleSsoBtn = document.getElementById('googleSsoBtn');
const adminQuickBtn = document.getElementById('adminQuickBtn');

// DOM Elements - Profile, Plan & Admin
const currentEmailSpan = document.getElementById('currentEmail');
const userAvatarBadge = document.getElementById('userAvatarBadge');
const planTag = document.getElementById('planTag');
const openUpgradeModalBtn = document.getElementById('openUpgradeModalBtn');
const logoutBtn = document.getElementById('logoutBtn');
const openAdminBtn = document.getElementById('openAdminBtn');

// Upgrade & Payment QR Modals
const upgradeModal = document.getElementById('upgradeModal');
const closeUpgradeBtn = document.getElementById('closeUpgradeBtn');
const paymentQrModal = document.getElementById('paymentQrModal');
const closePaymentQrBtn = document.getElementById('closePaymentQrBtn');
const vietQrImg = document.getElementById('vietQrImg');
const qrLoading = document.getElementById('qrLoading');
const qrStkText = document.getElementById('qrStkText');
const qrRecipientText = document.getElementById('qrRecipientText');
const qrAmountText = document.getElementById('qrAmountText');
const qrContentText = document.getElementById('qrContentText');
const copyAmountBtn = document.getElementById('copyAmountBtn');
const copyContentBtn = document.getElementById('copyContentBtn');
const confirmPaidBtn = document.getElementById('confirmPaidBtn');

// Admin Modal
const adminModal = document.getElementById('adminModal');
const closeAdminBtn = document.getElementById('closeAdminBtn');
const adminTotalUsers = document.getElementById('adminTotalUsers');
const adminTotalRevenue = document.getElementById('adminTotalRevenue');
const adminUsersTableBody = document.getElementById('adminUsersTableBody');
const pendingCount = document.getElementById('pendingCount');
const adminPendingTableBody = document.getElementById('adminPendingTableBody');

// Main Chat Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messagesFlow = document.getElementById('messagesFlow');
const welcomeScreen = document.getElementById('welcomeScreen');
const modelSelector = document.getElementById('modelSelector');
const modeBadge = document.getElementById('modeBadge');
const newChatBtn = document.getElementById('newChatBtn');
const chatHistoryList = document.getElementById('chatHistoryList');
const engineStatus = document.getElementById('engineStatus');
const attachBtn = document.getElementById('attachBtn');
const fileUploadInput = document.getElementById('fileUploadInput');
const attachmentPreview = document.getElementById('attachmentPreview');
const attachedFileName = document.getElementById('attachedFileName');
const removeAttachmentBtn = document.getElementById('removeAttachmentBtn');

// Settings Modal
const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingOllamaUrl = document.getElementById('settingOllamaUrl');
const settingGeminiKey = document.getElementById('settingGeminiKey');
const settingSystemPrompt = document.getElementById('settingSystemPrompt');

let isLoginMode = true;

// Khởi tạo
document.addEventListener('DOMContentLoaded', () => {
  setupAuthEvents();
  setupPaymentEvents();
  setupAdminEvents();
  checkAuth();

  // Đăng ký Service Worker để điện thoại có nút "Cài đặt ứng dụng"
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW error:', err));
  }

  marked.setOptions({
    highlight: function(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true
  });
});

// ---------------- AUTHENTICATION GMAIL & GOOGLE SSO ----------------
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Error decoding JWT token:', e);
    return null;
  }
}

// Xử lý phản hồi đăng nhập Google chính thức (Google Identity Services)
window.handleGoogleCredentialResponse = async function(response) {
  try {
    console.log('Google Credential Response received');
    const payload = parseJwt(response.credential);
    if (!payload || !payload.email) {
      alert('Không thể trích xuất thông tin từ tài khoản Google.');
      return;
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || payload.given_name || email.split('@')[0];
    const picture = payload.picture || '';

    const res = await fetch('/api/auth/google-sso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, picture })
    });
    const data = await res.json();

    if (data.user) {
      currentUser = data.user;
      currentUser.name = name;
      currentUser.picture = picture;
      localStorage.setItem('nexus_ai_user', JSON.stringify(currentUser));
      checkAuth();
    } else {
      showAuthError(data.error || 'Lỗi khi xác thực tài khoản Google');
    }
  } catch (err) {
    console.error('Google SSO Error:', err);
    showAuthError('Lỗi kết nối Google: ' + err.message);
  }
};

function setupAuthEvents() {
  tabLoginBtn.addEventListener('click', () => switchAuthMode(true));
  tabRegisterBtn.addEventListener('click', () => switchAuthMode(false));
  authForm.addEventListener('submit', handleAuthSubmit);
  logoutBtn.addEventListener('click', handleLogout);
  if (googleSsoBtn) {
    googleSsoBtn.addEventListener('click', handleGoogleSso);
  }
  if (adminQuickBtn) {
    adminQuickBtn.addEventListener('click', handleAdminQuickLogin);
  }

  openUpgradeModalBtn.addEventListener('click', () => upgradeModal.style.display = 'flex');
  closeUpgradeBtn.addEventListener('click', () => upgradeModal.style.display = 'none');
}

function switchAuthMode(loginMode) {
  isLoginMode = loginMode;
  authErrorMsg.style.display = 'none';

  if (loginMode) {
    tabLoginBtn.classList.add('active');
    tabRegisterBtn.classList.remove('active');
    authTitle.textContent = 'Chào mừng tới NexusAI Studio';
    authSubtitle.textContent = 'Đăng nhập bằng tài khoản Google Gmail để bắt đầu';
    authSubmitBtn.innerHTML = '<span>Đăng Nhập</span> <i class="fa-solid fa-arrow-right"></i>';
  } else {
    tabRegisterBtn.classList.add('active');
    tabLoginBtn.classList.remove('active');
    authTitle.textContent = 'Tạo Tài Khoản Mới';
    authSubtitle.textContent = 'Khởi tạo tài khoản AI cá nhân hóa bằng Gmail';
    authSubmitBtn.innerHTML = '<span>Đăng Ký Tài Khoản</span> <i class="fa-solid fa-user-plus"></i>';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value.trim();

  if (!email || !password) {
    showAuthError('Vui lòng nhập đầy đủ Gmail và mật khẩu.');
    return;
  }
  if (!email.includes('@') || !email.includes('.')) {
    showAuthError('Định dạng Gmail không hợp lệ. Ví dụ: vidu@gmail.com');
    return;
  }

  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showAuthError(data.error || 'Có lỗi xảy ra, vui lòng thử lại.');
      return;
    }

    currentUser = data.user;
    localStorage.setItem('nexus_ai_user', JSON.stringify(currentUser));
    authPassword.value = '';
    authErrorMsg.style.display = 'none';
    checkAuth();
  } catch (err) {
    showAuthError('Không thể kết nối máy chủ: ' + err.message);
  }
}

async function handleGoogleSso() {
  const sampleGmail = prompt('Nhập địa chỉ Google Gmail của bạn để tiếp tục nhanh (Ví dụ: admin@gmail.com):', 'truongthuyanhquan@gmail.com');
  if (!sampleGmail) return;

  try {
    const res = await fetch('/api/auth/google-sso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sampleGmail })
    });
    const data = await res.json();

    if (data.user) {
      currentUser = data.user;
      localStorage.setItem('nexus_ai_user', JSON.stringify(currentUser));
      checkAuth();
    }
  } catch (err) {
    alert('Lỗi đăng nhập Google: ' + err.message);
  }
}

async function handleAdminQuickLogin() {
  try {
    const res = await fetch('/api/auth/admin-quick', { method: 'POST' });
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem('nexus_ai_user', JSON.stringify(currentUser));
      checkAuth();
    } else {
      alert(data.error || 'Lỗi đăng nhập admin');
    }
  } catch (err) {
    alert('Lỗi kết nối máy chủ: ' + err.message);
  }
}

function showAuthError(msg) {
  authErrorMsg.textContent = msg;
  authErrorMsg.style.display = 'block';
}

function handleLogout() {
  if (confirm('Bạn có chắc muốn đăng xuất khỏi tài khoản này?')) {
    localStorage.removeItem('nexus_ai_user');
    currentUser = null;
    checkAuth();
  }
}

function checkAuth() {
  if (currentUser) {
    authOverlay.style.display = 'none';
    appLayout.style.display = 'flex';
    currentEmailSpan.textContent = currentUser.name ? `${currentUser.name} (${currentUser.email})` : currentUser.email;

    if (currentUser.picture) {
      userAvatarBadge.innerHTML = `<img src="${currentUser.picture}" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
    } else {
      userAvatarBadge.textContent = currentUser.email.charAt(0).toUpperCase();
    }

    // Kiểm tra quyền Admin
    if (currentUser.role === 'admin' || currentUser.email.includes('admin') || currentUser.email.includes('truongthuyanhquan')) {
      currentUser.role = 'admin';
      localStorage.setItem('nexus_ai_user', JSON.stringify(currentUser));
      openAdminBtn.style.display = 'flex';
      userAvatarBadge.className = 'user-avatar-badge admin';
      planTag.textContent = '👑 ADMIN TRƯƠNG THUỴ ANH QUÂN';
      planTag.className = 'plan-tag admin';
      openUpgradeModalBtn.style.display = 'none';
    } else {
      openAdminBtn.style.display = 'none';
      openUpgradeModalBtn.style.display = 'inline-block';
      updatePlanDisplay();
    }

    loadSettings();
    syncUserChats();
    checkEngineHealth();
    setupMainAppEvents();
  } else {
    authOverlay.style.display = 'flex';
    appLayout.style.display = 'none';
  }
}

function updatePlanDisplay() {
  if (!currentUser) return;
  
  // Trường hợp đang chờ Admin nhận tiền và duyệt
  if (currentUser.plan_duration && currentUser.plan_duration.startsWith('pending_')) {
    const rawDur = currentUser.plan_duration.replace('pending_', '');
    const durationNameMap = {
      '1_month': '1 Tháng',
      '3_months': '3 Tháng',
      '9_months': '9 Tháng',
      '1_year': '1 Năm'
    };
    const durLabel = durationNameMap[rawDur] || 'VIP';
    planTag.textContent = `⏳ Chờ Duyệt VIP (${durLabel})`;
    planTag.className = 'plan-tag pending';
    openUpgradeModalBtn.textContent = 'Đổi Gói';
    startVipPolling();
    return;
  }

  if (currentUser.plan === 'vip') {
    const durationNameMap = {
      '1_month': '1 Tháng',
      '3_months': '3 Tháng',
      '9_months': '9 Tháng',
      '1_year': '1 Năm',
      'lifetime': 'Vĩnh Viễn'
    };
    const durLabel = durationNameMap[currentUser.plan_duration] || 'VIP';
    const expDate = currentUser.plan_expires_at ? currentUser.plan_expires_at.split(' ')[0] : '';
    planTag.textContent = `👑 VIP ${durLabel} (${expDate})`;
    planTag.className = 'plan-tag vip';
    openUpgradeModalBtn.textContent = 'Gia Hạn';
    stopVipPolling();
  } else {
    planTag.textContent = 'Gói Thường';
    planTag.className = 'plan-tag free';
    openUpgradeModalBtn.textContent = 'Nâng Cấp VIP';
  }
}

let pollingInterval = null;
function startVipPolling() {
  if (pollingInterval) return;
  pollingInterval = setInterval(async () => {
    if (!currentUser || currentUser.plan === 'vip') {
      stopVipPolling();
      return;
    }
    try {
      const res = await fetch(`/api/user/sync-status?user_id=${currentUser.id}`);
      const data = await res.json();
      if (data.user && data.user.plan === 'vip') {
        currentUser = data.user;
        localStorage.setItem('nexus_ai_user', JSON.stringify(currentUser));
        updatePlanDisplay();
        stopVipPolling();
        alert('🎉 CHÚC MỪNG! Admin TRƯƠNG THUỴ ANH QUÂN đã xác nhận nhận được tiền và kích hoạt VIP thành công cho bạn!');
      }
    } catch (e) {
      console.log('Polling status error:', e);
    }
  }, 5000);
}

function stopVipPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ---------------- HỆ THỐNG THANH TOÁN VIETQR ----------------
function setupPaymentEvents() {
  closePaymentQrBtn.addEventListener('click', () => paymentQrModal.style.display = 'none');

  copyAmountBtn.addEventListener('click', () => {
    if (currentTransaction) copyToClipboard(currentTransaction.amount.toString());
  });

  copyContentBtn.addEventListener('click', () => {
    if (currentTransaction) copyToClipboard(currentTransaction.transfer_content);
  });

  confirmPaidBtn.addEventListener('click', handleConfirmPaid);
}

// Hàm mở Modal Quét Mã VietQR với số tiền tự động
async function openPaymentQR(duration, amount, durationLabel) {
  if (!currentUser) return;
  upgradeModal.style.display = 'none';
  paymentQrModal.style.display = 'flex';

  vietQrImg.style.display = 'none';
  qrLoading.style.display = 'block';

  try {
    const res = await fetch('/api/payment/create-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        email: currentUser.email,
        duration: duration
      })
    });
    const data = await res.json();
    currentTransaction = data;
    currentTransaction.duration = duration;

    // Hiển thị thông tin STK Admin TRUONG THUY ANH QUAN
    qrStkText.textContent = data.stk;
    qrRecipientText.textContent = data.recipient;
    qrAmountText.textContent = data.amount_formatted;
    qrContentText.textContent = data.transfer_content;

    // Tải ảnh mã QR động VietQR
    vietQrImg.onload = () => {
      qrLoading.style.display = 'none';
      vietQrImg.style.display = 'block';
    };
    vietQrImg.src = data.qr_url;
  } catch (err) {
    alert('Lỗi tạo mã QR: ' + err.message);
  }
}

async function handleConfirmPaid() {
  if (!currentTransaction || !currentUser) return;

  confirmPaidBtn.disabled = true;
  confirmPaidBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xác nhận thanh toán...';

  try {
    const res = await fetch('/api/payment/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        tx_id: currentTransaction.tx_id,
        duration: currentTransaction.duration
      })
    });
    const data = await res.json();

    if (data.user) {
      currentUser = data.user;
      localStorage.setItem('nexus_ai_user', JSON.stringify(currentUser));
      updatePlanDisplay();
      paymentQrModal.style.display = 'none';
      alert(`✅ ${data.message}`);
    } else {
      alert('Lỗi: ' + (data.error || 'Chưa kích hoạt được'));
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  } finally {
    confirmPaidBtn.disabled = false;
    confirmPaidBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Tôi Đã Chuyển Khoản Xong';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert(`Đã sao chép: ${text}`);
  }).catch(() => {
    prompt('Sao chép thủ công:', text);
  });
}

// ---------------- BẢNG ĐIỀU KHIỂN QUẢN TRỊ ADMIN ----------------
function setupAdminEvents() {
  openAdminBtn.addEventListener('click', openAdminDashboard);
  closeAdminBtn.addEventListener('click', () => adminModal.style.display = 'none');
}

async function openAdminDashboard() {
  if (!currentUser || currentUser.role !== 'admin') return;
  adminModal.style.display = 'flex';

  try {
    const res = await fetch(`/api/admin/overview?user_id=${currentUser.id}`);
    const data = await res.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    adminTotalUsers.textContent = data.total_users;
    adminTotalRevenue.textContent = data.total_revenue;

    // Render danh sách giao dịch chờ Admin nhận tiền và duyệt
    if (pendingCount && adminPendingTableBody) {
      pendingCount.textContent = data.pending_transactions.length;
      adminPendingTableBody.innerHTML = '';

      if (data.pending_transactions.length === 0) {
        adminPendingTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#a1a1aa; padding:18px;"><i class="fa-solid fa-circle-check" style="color:#10a37f;"></i> Tuyệt vời! Hiện tại không có yêu cầu nào đang chờ duyệt.</td></tr>';
      } else {
        const durMap = { '1_month': '1 Tháng', '3_months': '3 Tháng', '9_months': '9 Tháng', '1_year': '1 Năm' };
        data.pending_transactions.forEach(t => {
          const tr = document.createElement('tr');
          const durText = durMap[t.duration] || t.duration;
          tr.innerHTML = `
            <td><strong>${t.email}</strong></td>
            <td><span class="plan-tag vip">${durText}</span></td>
            <td><strong style="color:var(--gold-color); font-size:13px;">${t.amount_formatted}</strong></td>
            <td><code style="color:#34d399; font-weight:700;">${t.code}</code></td>
            <td>
              <button class="btn-approve" onclick="approvePendingTx('${t.id}')">
                <i class="fa-solid fa-check"></i> Đã Nhận Tiền -> Duyệt VIP
              </button>
              <button class="btn-reject" onclick="rejectPendingTx('${t.id}')">
                <i class="fa-solid fa-xmark"></i> Từ Chối
              </button>
            </td>
          `;
          adminPendingTableBody.appendChild(tr);
        });
      }
    }

    // Render bảng người dùng
    adminUsersTableBody.innerHTML = '';
    data.users.forEach(u => {
      const tr = document.createElement('tr');
      const isUserAdmin = u.role === 'admin';
      const expDate = u.expires ? u.expires.split(' ')[0] : 'Không';

      tr.innerHTML = `
        <td><strong>${u.email}</strong> ${isUserAdmin ? '<span class="plan-tag admin">Admin</span>' : ''}</td>
        <td>${u.role}</td>
        <td><span class="plan-tag ${u.plan}">${u.plan.toUpperCase()}</span></td>
        <td>${expDate}</td>
        <td>
          ${isUserAdmin ? '<span style="color:#a1a1aa">Toàn quyền</span>' : `
            <button class="admin-action-btn" onclick="grantVipFromAdmin('${u.id}', '1_month')">+1 Tháng</button>
            <button class="admin-action-btn" onclick="grantVipFromAdmin('${u.id}', '1_year')">+1 Năm VIP</button>
          `}
        </td>
      `;
      adminUsersTableBody.appendChild(tr);
    });
  } catch (err) {
    alert('Lỗi tải dữ liệu Admin: ' + err.message);
  }
}

async function grantVipFromAdmin(targetUserId, duration) {
  if (!currentUser || currentUser.role !== 'admin') return;

  try {
    const res = await fetch('/api/admin/grant-vip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admin_id: currentUser.id,
        target_user_id: targetUserId,
        duration: duration
      })
    });
    const data = await res.json();
    alert(data.message || 'Thành công!');
    openAdminDashboard(); // refresh
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

async function approvePendingTx(txId) {
  if (!currentUser || currentUser.role !== 'admin') return;

  if (confirm('XÁC NHẬN: Bạn đã kiểm tra tài khoản MBBank 0379340113 và chắc chắn đã nhận được tiền của khách hàng?')) {
    try {
      const res = await fetch('/api/admin/approve-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: currentUser.id,
          tx_id: txId
        })
      });
      const data = await res.json();
      if (data.message) {
        alert(`🎉 ${data.message}`);
        openAdminDashboard(); // refresh danh sách
      } else {
        alert(data.error || 'Có lỗi xảy ra');
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + err.message);
    }
  }
}

async function rejectPendingTx(txId) {
  if (!currentUser || currentUser.role !== 'admin') return;

  if (confirm('Bạn muốn từ chối yêu cầu này (do chưa nhận được tiền hoặc thông tin sai)?')) {
    try {
      const res = await fetch('/api/admin/reject-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: currentUser.id,
          tx_id: txId
        })
      });
      const data = await res.json();
      alert(data.message || 'Đã từ chối');
      openAdminDashboard();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }
}

// ---------------- MAIN CHAT LOGIC ----------------
let isEventsSetup = false;
function setupMainAppEvents() {
  if (isEventsSetup) return;
  isEventsSetup = true;

  // Xử lý bật/tắt Sidebar trên điện thoại
  if (sidebarToggle && sidebar && sidebarBackdrop) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarBackdrop.classList.toggle('active');
    });

    sidebarBackdrop.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarBackdrop.classList.remove('active');
    });
  }

  sendBtn.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + 'px';
  });

  newChatBtn.addEventListener('click', createNewChat);

  modelSelector.addEventListener('change', () => {
    const val = modelSelector.value;
    if (val.startsWith('gemini')) {
      modeBadge.textContent = 'Cloud Engine (Siêu Trí Tuệ)';
      modeBadge.className = 'badge cloud';
    } else {
      modeBadge.textContent = 'Bảo mật Offline';
      modeBadge.className = 'badge';
    }
  });

  openSettingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
  closeSettingsBtn.addEventListener('click', () => settingsModal.style.display = 'none');
  saveSettingsBtn.addEventListener('click', saveSettings);

  attachBtn.addEventListener('click', () => fileUploadInput.click());
  fileUploadInput.addEventListener('change', handleFileUpload);
  removeAttachmentBtn.addEventListener('click', () => {
    attachedDocument = null;
    attachmentPreview.style.display = 'none';
    fileUploadInput.value = '';
  });
}

async function checkEngineHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const dot = engineStatus.querySelector('.status-dot');
    const txt = engineStatus.querySelector('.status-text');

    if (data.status === 'online') {
      dot.className = 'status-dot online';
      txt.textContent = `Ollama: Sẵn sàng (${data.installed_models.length} model)`;
    } else {
      dot.className = 'status-dot online';
      txt.textContent = 'Cloud AI: Sẵn sàng (Gemini)';
      if (modelSelector && modelSelector.value.startsWith('qwen')) {
        modelSelector.value = 'gemini-2.0-flash';
        if (modeBadge) modeBadge.textContent = '⚡ Siêu Trí Tuệ Gemini';
      }
    }
  } catch (err) {
    const dot = engineStatus.querySelector('.status-dot');
    const txt = engineStatus.querySelector('.status-text');
    dot.className = 'status-dot offline';
    txt.textContent = 'Backend: Chưa kết nối';
  }
}

async function handleSendMessage() {
  const text = chatInput.value.trim();
  if (!text && !attachedDocument) return;

  let promptContent = text;
  if (attachedDocument) {
    promptContent = `[Tài liệu đính kèm: ${attachedDocument.filename}]\n"""\n${attachedDocument.text}\n"""\n\nCâu hỏi: ${text}`;
  }

  if (welcomeScreen) welcomeScreen.style.display = 'none';

  appendMessage('user', text || `Đã gửi tài liệu: ${attachedDocument.filename}`);
  activeMessages.push({ role: 'user', content: promptContent });

  chatInput.value = '';
  chatInput.style.height = 'auto';
  if (attachedDocument) {
    attachedDocument = null;
    attachmentPreview.style.display = 'none';
    fileUploadInput.value = '';
  }

  sendBtn.disabled = true;

  const botMessageElement = appendMessage('bot', '');
  const botContentDiv = botMessageElement.querySelector('.message-content');
  botContentDiv.innerHTML = '<span class="cursor-blink"></span>';

  const settings = getSettings();
  let accumulatedText = '';

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: activeMessages,
        model: modelSelector.value,
        system_prompt: settings.systemPrompt,
        cloud_api_key: settings.geminiKey
      })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.error) {
              accumulatedText += `\n\n> ⚠️ **Lỗi:** ${data.error}`;
              renderBotContent(botContentDiv, accumulatedText, false);
              break;
            }
            if (data.content) {
              accumulatedText += data.content;
              renderBotContent(botContentDiv, accumulatedText, true);
            }
            if (data.done) {
              renderBotContent(botContentDiv, accumulatedText, false);
            }
          } catch (e) {
            console.error('Lỗi parse SSE JSON:', e);
          }
        }
      }
    }

    renderBotContent(botContentDiv, accumulatedText, false);
    activeMessages.push({ role: 'assistant', content: accumulatedText });
    saveCurrentSessionToBackend();
  } catch (err) {
    renderBotContent(botContentDiv, `\n\n> ❌ **Không thể kết nối máy chủ:** ${err.message}`, false);
  } finally {
    sendBtn.disabled = false;
  }
}

function renderBotContent(container, markdownText, isStreaming) {
  let html = marked.parse(markdownText);
  if (isStreaming) {
    html += '<span class="cursor-blink"></span>';
  }
  container.innerHTML = html;
  messagesFlow.scrollTop = messagesFlow.scrollHeight;
}

function appendMessage(role, text) {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = `avatar ${role}`;
  avatar.innerHTML = role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-robot"></i>';

  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;

  row.appendChild(avatar);
  row.appendChild(content);
  messagesFlow.appendChild(row);
  messagesFlow.scrollTop = messagesFlow.scrollHeight;

  return row;
}

async function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload-document', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.error) {
      alert('Lỗi: ' + data.error);
      return;
    }

    attachedDocument = data;
    attachedFileName.textContent = `${data.filename} (${data.char_count} ký tự)`;
    attachmentPreview.style.display = 'flex';
  } catch (err) {
    alert('Không thể tải file: ' + err.message);
  }
}

async function syncUserChats() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/chats?user_id=${currentUser.id}`);
    const data = await res.json();
    sessions = {};
    if (data.chats) {
      data.chats.forEach(c => {
        sessions[c.id] = c;
      });
    }
    renderHistoryList();
  } catch (err) {
    console.error('Không thể tải danh sách chat:', err);
  }
}

async function saveCurrentSessionToBackend() {
  if (!currentUser || activeMessages.length === 0) return;
  const firstUserMsg = activeMessages.find(m => m.role === 'user');
  const title = firstUserMsg ? firstUserMsg.content.substring(0, 30) + '...' : 'Cuộc trò chuyện mới';

  sessions[currentSessionId] = {
    id: currentSessionId,
    user_id: currentUser.id,
    title: title,
    messages: activeMessages
  };

  try {
    await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessions[currentSessionId])
    });
    renderHistoryList();
  } catch (err) {
    console.error('Lỗi lưu chat:', err);
  }
}

function closeMobileSidebar() {
  if (sidebar && sidebarBackdrop) {
    sidebar.classList.remove('open');
    sidebarBackdrop.classList.remove('active');
  }
}

function createNewChat() {
  closeMobileSidebar();
  activeMessages = [];
  currentSessionId = Date.now().toString();
  messagesFlow.innerHTML = '';
  if (welcomeScreen) {
    welcomeScreen.style.display = 'block';
    messagesFlow.appendChild(welcomeScreen);
  }
  renderHistoryList();
}

function renderHistoryList() {
  chatHistoryList.innerHTML = '';
  const list = Object.values(sessions);

  list.forEach(s => {
    const item = document.createElement('div');
    item.className = `history-item ${s.id === currentSessionId ? 'active' : ''}`;
    item.innerHTML = `
      <span class="history-title"><i class="fa-regular fa-message"></i> ${s.title}</span>
      <button class="delete-history-btn" title="Xóa"><i class="fa-solid fa-trash"></i></button>
    `;

    item.querySelector('.history-title').addEventListener('click', () => loadSession(s.id));
    item.querySelector('.delete-history-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });

    chatHistoryList.appendChild(item);
  });
}

function loadSession(id) {
  closeMobileSidebar();
  const session = sessions[id];
  if (!session) return;

  currentSessionId = id;
  activeMessages = session.messages || [];
  messagesFlow.innerHTML = '';

  activeMessages.forEach(m => {
    if (m.role === 'user') {
      appendMessage('user', m.content);
    } else if (m.role === 'assistant') {
      const botMsg = appendMessage('bot', '');
      renderBotContent(botMsg.querySelector('.message-content'), m.content, false);
    }
  });

  renderHistoryList();
}

async function deleteSession(id) {
  if (!confirm('Bạn có chắc muốn xóa cuộc trò chuyện này?')) return;
  try {
    await fetch(`/api/chats/${id}?user_id=${currentUser.id}`, { method: 'DELETE' });
    delete sessions[id];
    if (currentSessionId === id) {
      createNewChat();
    } else {
      renderHistoryList();
    }
  } catch (err) {
    alert('Lỗi xóa chat: ' + err.message);
  }
}

function loadSettings() {
  const settings = getSettings();
  settingOllamaUrl.value = settings.ollamaUrl;
  settingGeminiKey.value = settings.geminiKey;
  settingSystemPrompt.value = settings.systemPrompt;
}

function saveSettings() {
  const settings = {
    ollamaUrl: settingOllamaUrl.value.trim() || 'http://localhost:11434',
    geminiKey: settingGeminiKey.value.trim(),
    systemPrompt: settingSystemPrompt.value.trim()
  };
  localStorage.setItem('nexus_ai_settings', JSON.stringify(settings));
  settingsModal.style.display = 'none';
  checkEngineHealth();
  alert('Đã lưu cấu hình AI!');
}

function getSettings() {
  return JSON.parse(localStorage.getItem('nexus_ai_settings') || JSON.stringify({
    ollamaUrl: 'http://localhost:11434',
    geminiKey: '',
    systemPrompt: ''
  }));
}

function sendQuickPrompt(promptText) {
  chatInput.value = promptText;
  handleSendMessage();
}
