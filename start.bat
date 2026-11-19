@echo off
chcp 65001 > nul
title Khởi động Hệ Thống AI Chatbot (ChatGPT / Gemini Alternative)

echo ======================================================================
echo          🚀 CHÀO MỪNG BẠN ĐẾN VỚI HỆ THỐNG AI CÁ NHÂN HOÁ
echo ======================================================================
echo.
echo [1/2] Đang kiểm tra môi trường Python...
python --version
if %errorlevel% neq 0 (
    echo [LỖI] Không tìm thấy Python! Vui lòng cài Python 3.10+ và tích chọn 'Add Python to PATH'.
    pause
    exit /b
)

echo.
echo [2/2] Đang khởi động Backend Web Server (Flask SSE)...
echo ----------------------------------------------------------------------
echo 👉 Địa chỉ giao diện Web: http://127.0.0.1:5000
echo 👉 Lưu ý: Để dùng AI cục bộ miễn phí, hãy chắc chắn Ollama đang chạy!
echo ----------------------------------------------------------------------
echo.

start http://127.0.0.1:5000
python backend\app.py

pause
