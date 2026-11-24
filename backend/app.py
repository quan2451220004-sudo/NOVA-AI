import os
import json
import sqlite3
import hashlib
import uuid
from datetime import datetime, timedelta
import requests
from flask import Flask, request, Response, stream_with_context, jsonify, send_from_directory

frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'database.db'))
app = Flask(__name__, static_folder=frontend_dir, static_url_path='')

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")

# THÔNG TIN TÀI KHOẢN ADMIN TRƯƠNG THUỴ ANH QUÂN
ADMIN_STK = "0379340113"
ADMIN_NAME = "TRUONG THUY ANH QUAN"
ADMIN_BANK_DEFAULT = "MB"
ADMIN_DEFAULT_PASSWORD = "admin" # Mật khẩu mặc định siêu dễ nhớ

MASTER_SYSTEM_PROMPT = (
    "Bạn là một Trợ lý Trí tuệ Nhân tạo Cao cấp (Advanced AI Assistant), sở hữu năng lực "
    "tư duy sâu, khả năng phân tích logic, lập trình và sáng tạo tương đương các AI hàng đầu thế giới (ChatGPT, Gemini, Claude).\n\n"
    "NGUYÊN TẮC SUY NGHĨ VÀ TRẢ LỜI:\n"
    "1. TƯ DUY SÂU SẮC (Deep Reasoning): Luôn phân tích bản chất vấn đề trước khi kết luận. "
    "Giải thích logic từng bước (step-by-step), mạch lạc, có ví dụ thực tế minh họa.\n"
    "2. TRÌNH BÀY CHUYÊN NGHIỆP:\n"
    "   - Luôn sử dụng Markdown đẹp mắt: in đậm từ khóa, dùng bullet points, đề mục rõ ràng.\n"
    "   - Kẻ bảng biểu (Tables) khi so sánh các giải pháp hoặc liệt kê thông số.\n"
    "   - Với mã nguồn lập trình: viết code sạch (clean code), chuẩn mực, có chú thích giải thích và hướng dẫn cài đặt/chạy chi tiết.\n"
    "3. PHONG CÁCH GIAO TIẾP: Trả lời bằng tiếng Việt tự nhiên, chuẩn mực, thông thái, lịch thiệp và mang tính hỗ trợ cao nhất."
)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def calculate_expiration(duration: str):
    now = datetime.now()
    days_map = {'1_month': 30, '3_months': 90, '9_months': 270, '1_year': 365, 'lifetime': 36500}
    days = days_map.get(duration, 0)
    if days == 0:
        return None
    return (now + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")

# ----------------- DATABASE QUẢN LÝ ADMIN & TẠO SẴN TÀI KHOẢN ADMIN -----------------
def init_db():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            plan TEXT DEFAULT 'free',
            plan_duration TEXT DEFAULT 'none',
            plan_expires_at TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            user_email TEXT NOT NULL,
            plan_duration TEXT NOT NULL,
            amount INTEGER NOT NULL,
            transfer_code TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    cur.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            messages_json TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')

    # TẠO SẴN 2 TÀI KHOẢN ADMIN VỚI MẬT KHẨU 'admin' HOẶC '123456'
    admin_accounts = [
        ('admin@gmail.com', '123456'),
        ('truongthuyanhquan@gmail.com', '123456')
    ]
    lifetime_exp = calculate_expiration('lifetime')

    for email, pwd in admin_accounts:
        cur.execute("SELECT id FROM users WHERE email = ?", (email,))
        if not cur.fetchone():
            user_id = str(uuid.uuid4())
            cur.execute('''
                INSERT INTO users (id, email, password_hash, role, plan, plan_duration, plan_expires_at)
                VALUES (?, ?, ?, 'admin', 'vip', 'lifetime', ?)
            ''', (user_id, email, hash_password(pwd), lifetime_exp))

    conn.commit()
    conn.close()

init_db()

# ----------------- AUTHENTICATION API -----------------
@app.route('/api/auth/admin-quick', methods=['POST'])
def admin_quick_login():
    """Đăng nhập tức thì 1-click cho Admin TRƯƠNG THUỴ ANH QUÂN không cần nhập mật khẩu"""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
        SELECT id, email, role, plan, plan_duration, plan_expires_at 
        FROM users WHERE email = 'admin@gmail.com' OR email = 'truongthuyanhquan@gmail.com'
    ''')
    user = cur.fetchone()
    conn.close()

    if user:
        return jsonify({
            "message": "Chào mừng Admin Trương Thuỵ Anh Quân!",
            "user": {
                "id": user[0],
                "email": user[1],
                "role": user[2],
                "plan": user[3],
                "plan_duration": user[4],
                "plan_expires_at": user[5]
            }
        })
    return jsonify({"error": "Không tìm thấy tài khoản admin"}), 404

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()
    chosen_plan = data.get('plan', 'free')
    plan_duration = data.get('plan_duration', 'none')

    if not email or not password:
        return jsonify({"error": "Vui lòng nhập đầy đủ Gmail và Mật khẩu!"}), 400
    if '@' not in email or '.' not in email:
        return jsonify({"error": "Định dạng email không hợp lệ (Ví dụ: yourname@gmail.com)"}), 400
    if len(password) < 6:
        return jsonify({"error": "Mật khẩu phải có ít nhất 6 ký tự!"}), 400

    is_admin = ('admin' in email) or ('anhquan' in email)
    role = 'admin' if is_admin else 'user'
    if is_admin:
        chosen_plan = 'vip'
        plan_duration = '1_year'
        expires_at = calculate_expiration('lifetime')
    else:
        expires_at = calculate_expiration(plan_duration) if chosen_plan == 'vip' else None

    user_id = str(uuid.uuid4())
    pw_hash = hash_password(password)

    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute('''
            INSERT INTO users (id, email, password_hash, role, plan, plan_duration, plan_expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, email, pw_hash, role, chosen_plan, plan_duration, expires_at))
        conn.commit()
        conn.close()

        return jsonify({
            "message": "Đăng ký thành công!",
            "user": {
                "id": user_id,
                "email": email,
                "role": role,
                "plan": chosen_plan,
                "plan_duration": plan_duration,
                "plan_expires_at": expires_at
            }
        })
    except sqlite3.IntegrityError:
        return jsonify({"error": "Tài khoản Gmail này đã tồn tại! Bạn hãy đăng nhập với mật khẩu đã tạo (mật khẩu mặc định là 123456)."}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '').strip()

    pw_hash = hash_password(password)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
        SELECT id, email, role, plan, plan_duration, plan_expires_at 
        FROM users WHERE email = ? AND password_hash = ?
    ''', (email, pw_hash))
    user = cur.fetchone()
    conn.close()

    if user:
        return jsonify({
            "message": "Đăng nhập thành công!",
            "user": {
                "id": user[0],
                "email": user[1],
                "role": user[2],
                "plan": user[3],
                "plan_duration": user[4],
                "plan_expires_at": user[5]
            }
        })
    return jsonify({"error": "Email hoặc mật khẩu không đúng! Mật khẩu mặc định cho admin là: 123456"}), 401

@app.route('/api/auth/google-sso', methods=['POST'])
def google_sso():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    name = data.get('name', '').strip()
    picture = data.get('picture', '').strip()

    if not email or '@' not in email:
        return jsonify({"error": "Email Google không hợp lệ"}), 400

    is_admin = ('admin' in email) or ('anhquan' in email)
    role = 'admin' if is_admin else 'user'

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id, email, role, plan, plan_duration, plan_expires_at FROM users WHERE email = ?", (email,))
    user = cur.fetchone()

    if user:
        user_data = {
            "id": user[0],
            "email": user[1],
            "role": user[2],
            "plan": user[3],
            "plan_duration": user[4],
            "plan_expires_at": user[5],
            "name": name,
            "picture": picture
        }
    else:
        user_id = str(uuid.uuid4())
        plan = 'vip' if is_admin else 'free'
        duration = '1_year' if is_admin else 'none'
        exp = calculate_expiration('lifetime') if is_admin else None

        cur.execute('''
            INSERT INTO users (id, email, password_hash, role, plan, plan_duration, plan_expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, email, hash_password("GOOGLE_PASS_" + user_id), role, plan, duration, exp))
        conn.commit()
        user_data = {
            "id": user_id,
            "email": email,
            "role": role,
            "plan": plan,
            "plan_duration": duration,
            "plan_expires_at": exp,
            "name": name,
            "picture": picture
        }

    conn.close()
    return jsonify({"message": "Đăng nhập Google thành công!", "user": user_data})

# ----------------- HỆ THỐNG THANH TOÁN VIETQR -----------------
@app.route('/api/payment/create-qr', methods=['POST'])
def create_payment_qr():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    email = data.get('email', '')
    duration = data.get('duration')
    bank = data.get('bank', ADMIN_BANK_DEFAULT)

    prices = {'1_month': 99000, '3_months': 269000, '9_months': 699000, '1_year': 799000}
    amount = prices.get(duration, 99000)
    
    short_code = str(uuid.uuid4())[:4].upper()
    dur_tag = {"1_month": "1T", "3_months": "3T", "9_months": "9T", "1_year": "1Y"}.get(duration, "VIP")
    transfer_content = f"NEXUS {dur_tag} {short_code}"

    qr_url = f"https://api.vietqr.io/image/{bank}-{ADMIN_STK}-compact2.png?amount={amount}&addInfo={transfer_content}&accountName={ADMIN_NAME.replace(' ', '%20')}"

    tx_id = str(uuid.uuid4())
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
        INSERT INTO transactions (id, user_id, user_email, plan_duration, amount, transfer_code, status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
    ''', (tx_id, user_id, email, duration, amount, transfer_content))
    conn.commit()
    conn.close()

    return jsonify({
        "tx_id": tx_id,
        "qr_url": qr_url,
        "stk": ADMIN_STK,
        "bank": bank,
        "recipient": ADMIN_NAME,
        "amount": amount,
        "amount_formatted": f"{amount:,.0f} VNĐ".replace(',', '.'),
        "transfer_content": transfer_content
    })

@app.route('/api/payment/confirm', methods=['POST'])
def confirm_payment():
    """Người dùng bấm 'Tôi đã chuyển khoản' -> Gửi yêu cầu chờ Admin duyệt, CHƯA lên VIP ngay"""
    data = request.get_json() or {}
    user_id = data.get('user_id')
    tx_id = data.get('tx_id')
    duration = data.get('duration')

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    # Giao dịch được lưu ở trạng thái 'pending' (chờ admin kiểm tra tài khoản)
    if tx_id:
        cur.execute("UPDATE transactions SET status = 'pending' WHERE id = ?", (tx_id,))
    
    # Cập nhật trạng thái người dùng là đang chờ duyệt gói
    cur.execute("UPDATE users SET plan_duration = ? WHERE id = ?", (f"pending_{duration}", user_id))
    conn.commit()

    cur.execute("SELECT id, email, role, plan, plan_duration, plan_expires_at FROM users WHERE id = ?", (user_id,))
    updated_user = cur.fetchone()
    conn.close()

    if updated_user:
        return jsonify({
            "message": "Đã gửi thông báo thanh toán tới Admin TRƯƠNG THUỴ ANH QUÂN! Gói VIP sẽ được kích hoạt ngay sau khi Admin kiểm tra số dư tài khoản MBBank 0379340113.",
            "user": {
                "id": updated_user[0],
                "email": updated_user[1],
                "role": updated_user[2],
                "plan": updated_user[3],
                "plan_duration": updated_user[4],
                "plan_expires_at": updated_user[5]
            }
        })
    return jsonify({"error": "Không tìm thấy người dùng"}), 404

# ----------------- ADMIN DUYỆT GIAO DỊCH SAU KHI NHẬN TIỀN -----------------
@app.route('/api/admin/approve-transaction', methods=['POST'])
def admin_approve_transaction():
    """Admin kiểm tra tiền đã vào tài khoản -> Bấm nút Duyệt thì user mới chính thức lên VIP"""
    data = request.get_json() or {}
    admin_id = data.get('admin_id')
    tx_id = data.get('tx_id')

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT role, email FROM users WHERE id = ?", (admin_id,))
    admin = cur.fetchone()
    if admin and ('admin' in admin[1] or 'truongthuyanhquan' in admin[1]):
        pass
    elif not admin or admin[0] != 'admin':
        conn.close()
        return jsonify({"error": "Từ chối quyền truy cập! Chỉ Admin mới có quyền duyệt tiền."}), 403

    cur.execute("SELECT user_id, plan_duration, amount, user_email FROM transactions WHERE id = ?", (tx_id,))
    tx = cur.fetchone()
    if not tx:
        conn.close()
        return jsonify({"error": "Không tìm thấy thông tin giao dịch"}), 404

    user_id, duration, amount, user_email = tx
    # Tính ngày hết hạn dựa trên gói khách mua
    new_expires_at = calculate_expiration(duration)

    # NÂNG CẤP CHÍNH THỨC SANG VIP
    cur.execute('''
        UPDATE users 
        SET plan = 'vip', plan_duration = ?, plan_expires_at = ?
        WHERE id = ?
    ''', (duration, new_expires_at, user_id))

    # Cập nhật trạng thái giao dịch thành 'approved'
    cur.execute("UPDATE transactions SET status = 'approved' WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()

    return jsonify({
        "message": f"Đã duyệt thành công cho {user_email}! Khách hàng đã được kích hoạt VIP đến ngày: {new_expires_at}"
    })

@app.route('/api/admin/reject-transaction', methods=['POST'])
def admin_reject_transaction():
    """Admin từ chối nếu chưa thấy tiền vào tài khoản"""
    data = request.get_json() or {}
    admin_id = data.get('admin_id')
    tx_id = data.get('tx_id')

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT role FROM users WHERE id = ?", (admin_id,))
    admin = cur.fetchone()
    if not admin or admin[0] != 'admin':
        conn.close()
        return jsonify({"error": "Từ chối quyền truy cập!"}), 403

    cur.execute("SELECT user_id, user_email FROM transactions WHERE id = ?", (tx_id,))
    tx = cur.fetchone()
    if tx:
        cur.execute("UPDATE users SET plan_duration = 'none' WHERE id = ?", (tx[0],))
        cur.execute("UPDATE transactions SET status = 'rejected' WHERE id = ?", (tx_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": f"Đã từ chối giao dịch của {tx[1]}"})
    
    conn.close()
    return jsonify({"error": "Không tìm thấy giao dịch"}), 404

# ----------------- ADMIN DASHBOARD API -----------------
@app.route('/api/admin/overview', methods=['GET'])
def admin_overview():
    user_id = request.args.get('user_id')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    cur.execute("SELECT role, email FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    # Đảm bảo Trương Thuỵ Anh Quân luôn có toàn quyền truy cập
    if row and row[0] != 'admin' and ('admin' in row[1] or 'truongthuyanhquan' in row[1]):
        cur.execute("UPDATE users SET role = 'admin', plan = 'vip', plan_duration = 'lifetime' WHERE id = ?", (user_id,))
        conn.commit()
    elif not row:
        # Nếu phiên cũ chưa đồng bộ, cấp phép tạm thời cho Admin
        pass

    cur.execute("SELECT id, email, role, plan, plan_duration, plan_expires_at, created_at FROM users ORDER BY created_at DESC")
    all_users = [
        {"id": u[0], "email": u[1], "role": u[2], "plan": u[3], "duration": u[4], "expires": u[5], "created": u[6]}
        for u in cur.fetchall()
    ]

    cur.execute("SELECT SUM(amount) FROM transactions WHERE status = 'approved'")
    total_rev = cur.fetchone()[0] or 0

    # LẤY CÁC GIAO DỊCH ĐANG CHỜ ADMIN KIỂM TRA TÀI KHOẢN VÀ DUYỆT
    cur.execute('''
        SELECT id, user_id, user_email, plan_duration, amount, transfer_code, created_at 
        FROM transactions WHERE status = 'pending' ORDER BY created_at DESC
    ''')
    pending_txs = [
        {
            "id": t[0],
            "user_id": t[1],
            "email": t[2],
            "duration": t[3],
            "amount": t[4],
            "amount_formatted": f"{t[4]:,.0f} đ".replace(',', '.'),
            "code": t[5],
            "created": t[6]
        }
        for t in cur.fetchall()
    ]

    cur.execute("SELECT id, user_email, plan_duration, amount, transfer_code, status, created_at FROM transactions ORDER BY created_at DESC LIMIT 10")
    recent_txs = [
        {"id": t[0], "email": t[1], "duration": t[2], "amount": t[3], "code": t[4], "status": t[5], "created": t[6]}
        for t in cur.fetchall()
    ]
    conn.close()

    return jsonify({
        "admin_name": ADMIN_NAME,
        "stk": ADMIN_STK,
        "total_users": len(all_users),
        "total_revenue": f"{total_rev:,.0f} VNĐ".replace(',', '.'),
        "users": all_users,
        "pending_transactions": pending_txs,
        "transactions": recent_txs
    })

@app.route('/api/user/sync-status', methods=['GET'])
def sync_user_status():
    """Kiểm tra xem Admin đã duyệt VIP cho mình chưa & đồng bộ quyền"""
    user_id = request.args.get('user_id')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id, email, role, plan, plan_duration, plan_expires_at FROM users WHERE id = ?", (user_id,))
    user = cur.fetchone()
    
    if user:
        email = user[1]
        role = user[2]
        # Tự động nâng cấp lên admin nếu là Trương Thuỵ Anh Quân
        if ('admin' in email or 'truongthuyanhquan' in email) and role != 'admin':
            cur.execute("UPDATE users SET role = 'admin', plan = 'vip', plan_duration = 'lifetime' WHERE id = ?", (user[0],))
            conn.commit()
            role = 'admin'
        
        conn.close()
        return jsonify({
            "user": {
                "id": user[0],
                "email": user[1],
                "role": role,
                "plan": user[3],
                "plan_duration": user[4],
                "plan_expires_at": user[5]
            }
        })
    conn.close()
    return jsonify({"error": "Không tìm thấy user"}), 404

@app.route('/api/admin/grant-vip', methods=['POST'])
def admin_grant_vip():
    data = request.get_json() or {}
    admin_id = data.get('admin_id')
    target_user_id = data.get('target_user_id')
    duration = data.get('duration', '1_year')

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT role FROM users WHERE id = ?", (admin_id,))
    row = cur.fetchone()
    if not row or row[0] != 'admin':
        conn.close()
        return jsonify({"error": "Từ chối quyền truy cập!"}), 403

    new_expires_at = calculate_expiration(duration)
    cur.execute('''
        UPDATE users 
        SET plan = 'vip', plan_duration = ?, plan_expires_at = ?
        WHERE id = ?
    ''', (duration, new_expires_at, target_user_id))
    conn.commit()
    conn.close()

    return jsonify({"message": f"Đã cấp VIP {duration} thành công cho người dùng!"})

# ----------------- CHAT HISTORY SYNC -----------------
@app.route('/api/chats', methods=['GET'])
def get_user_chats():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "Thiếu user_id"}), 400

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT id, title, messages_json, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC", (user_id,))
    rows = cur.fetchall()
    conn.close()

    chats = []
    for r in rows:
        chats.append({
            "id": r[0],
            "title": r[1],
            "messages": json.loads(r[2]),
            "updatedAt": r[3]
        })
    return jsonify({"chats": chats})

@app.route('/api/chats', methods=['POST'])
def save_user_chat():
    data = request.get_json() or {}
    chat_id = data.get('id')
    user_id = data.get('user_id')
    title = data.get('title', 'Cuộc trò chuyện mới')
    messages = data.get('messages', [])

    if not chat_id or not user_id:
        return jsonify({"error": "Thiếu thông tin"}), 400

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
        INSERT INTO chats (id, user_id, title, messages_json, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            messages_json=excluded.messages_json,
            updated_at=CURRENT_TIMESTAMP
    ''', (chat_id, user_id, title, json.dumps(messages)))
    conn.commit()
    conn.close()

    return jsonify({"status": "saved"})

@app.route('/api/chats/<chat_id>', methods=['DELETE'])
def delete_user_chat(chat_id):
    user_id = request.args.get('user_id')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("DELETE FROM chats WHERE id = ? AND user_id = ?", (chat_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"status": "deleted"})

# ----------------- AI STREAMING CORE -----------------
@app.route('/')
def serve_index():
    return send_from_directory(frontend_dir, 'index.html')

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        if resp.status_code == 200:
            models = resp.json().get('models', [])
            return jsonify({
                "status": "online",
                "engine": "Ollama Local Engine",
                "installed_models": [m.get('name') for m in models]
            })
    except Exception as e:
        return jsonify({
            "status": "offline",
            "engine": "Ollama Local Engine",
            "message": "Chưa bật Ollama.",
            "error": str(e)
        }), 200

@app.route('/api/chat/stream', methods=['POST'])
def chat_stream():
    data = request.get_json() or {}
    messages = data.get('messages', [])
    model = data.get('model', 'qwen2.5:3b')
    temperature = float(data.get('temperature', 0.7))
    custom_system_prompt = data.get('system_prompt', '').strip()
    api_key = data.get('cloud_api_key', '')

    system_prompt = custom_system_prompt if custom_system_prompt else MASTER_SYSTEM_PROMPT
    formatted_messages = [{"role": "system", "content": system_prompt}]
    formatted_messages.extend(messages)

    if model.startswith("gemini"):
        return Response(
            stream_with_context(stream_gemini_response(formatted_messages, model, api_key)),
            mimetype="text/event-stream"
        )

    return Response(
        stream_with_context(stream_ollama_response(formatted_messages, model, temperature)),
        mimetype="text/event-stream"
    )

def stream_ollama_response(messages, model, temperature):
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": temperature,
            "top_p": 0.9,
            "num_ctx": 4096
        }
    }
    try:
        req = requests.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, stream=True, timeout=120)
        if req.status_code != 200:
            yield f"data: {json.dumps({'error': f'Lỗi từ Ollama ({req.status_code}): {req.text}'})}\n\n"
            return

        for line in req.iter_lines():
            if line:
                chunk = json.loads(line.decode('utf-8'))
                content = chunk.get('message', {}).get('content', '')
                is_done = chunk.get('done', False)
                yield f"data: {json.dumps({'content': content, 'done': is_done})}\n\n"
                if is_done:
                    break
    except requests.exceptions.ConnectionError:
        yield f"data: {json.dumps({'error': 'Không kết nối được tới Ollama. Hãy đảm bảo Ollama đang chạy!'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"

def stream_gemini_response(messages, model_name, api_key):
    if not api_key:
        api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        yield f"data: {json.dumps({'error': 'Chưa cấu hình Gemini API Key! Hãy nhập API Key trong phần Cài đặt hoặc đặt biến môi trường GEMINI_API_KEY trên Cloud.'})}\n\n"
        return

    # Danh sách model ưu tiên (tự động thử model mới nhất và fallback thông minh)
    if "1.5" in model_name:
        candidate_models = ["gemini-1.5-flash", "gemini-2.5-flash"]
    else:
        candidate_models = ["gemini-2.5-flash", "gemini-1.5-flash"]

    contents = []
    system_instruction = None

    for m in messages:
        role = m.get('role')
        text = m.get('content', '')
        if role == 'system':
            system_instruction = {"parts": [{"text": text}]}
        elif role == 'user':
            contents.append({"role": "user", "parts": [{"text": text}]})
        elif role == 'assistant':
            contents.append({"role": "model", "parts": [{"text": text}]})

    payload = {"contents": contents}
    if system_instruction:
        payload["systemInstruction"] = system_instruction

    req = None
    last_error = ""

    for target_model in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:streamGenerateContent?key={api_key}&alt=sse"
        try:
            r = requests.post(url, json=payload, stream=True, timeout=120)
            if r.status_code == 200:
                req = r
                break
            elif r.status_code == 404:
                last_error = r.text
                continue
            else:
                yield f"data: {json.dumps({'error': f'Lỗi Gemini API ({r.status_code}): {r.text}'})}\n\n"
                return
        except Exception as e:
            last_error = str(e)
            continue

    if not req or req.status_code != 200:
        yield f"data: {json.dumps({'error': f'Không thể kết nối mô hình Gemini: {last_error}'})}\n\n"
        return

    try:
        for line in req.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    chunk_data = json.loads(line_str[6:])
                    candidates = chunk_data.get('candidates', [])
                    if candidates:
                        parts = candidates[0].get('content', {}).get('parts', [])
                        if parts:
                            text_piece = parts[0].get('text', '')
                            yield f"data: {json.dumps({'content': text_piece, 'done': False})}\n\n"
        yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"

@app.route('/api/upload-document', methods=['POST'])
def upload_document():
    if 'file' not in request.files:
        return jsonify({"error": "Không có file nào được gửi"}), 400
    file = request.files['file']
    filename = file.filename.lower()
    try:
        content = ""
        if filename.endswith(('.txt', '.md', '.json', '.py', '.js', '.html', '.css', '.csv')):
            content = file.read().decode('utf-8', errors='ignore')
        elif filename.endswith('.docx'):
            import docx
            doc = docx.Document(file)
            content = "\n".join([p.text for p in doc.paragraphs if p.text])
        else:
            return jsonify({"error": "Định dạng file chưa được hỗ trợ."}), 400

        max_chars = 15000
        truncated = False
        if len(content) > max_chars:
            content = content[:max_chars]
            truncated = True

        return jsonify({
            "filename": file.filename,
            "char_count": len(content),
            "truncated": truncated,
            "text": content
        })
    except Exception as e:
        return jsonify({"error": f"Lỗi đọc file: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print("=" * 70)
    print("🚀 NexusAI Studio: Sẵn Sàng Tài Khoản Admin & Thanh Toán VietQR")
    print(f"👑 ADMIN: {ADMIN_NAME} (STK: {ADMIN_STK})")
    print(f"🔑 Tài khoản Admin mặc định: admin@gmail.com | Mật khẩu: 123456")
    print(f"👉 Khởi động máy chủ tại port: {port}")
    print("=" * 70)
    app.run(host='0.0.0.0', port=port, debug=False)
