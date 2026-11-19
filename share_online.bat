@echo off
chcp 65001 > nul
title NexusAI - Chia Se Link Online Ra Internet

echo ======================================================================
echo           🌐 TẠO ĐƯỜNG LINK ONLINE CHO NEXUSAI STUDIO
echo ======================================================================
echo.
echo Hãy chọn 1 phương thức tạo link online (Nhấn 1 hoặc 2 hoặc 3 rồi Enter):
echo.
echo [1] KÊNH 1 (Khuyên dùng - Cực nhanh, có mã QR quét thẳng vào điện thoại)
echo [2] KÊNH 2 (Localtunnel - Dùng Node.js npx)
echo [3] KÊNH 3 (Localhost.run - Dự phòng)
echo.
set /p choice="Nhập lựa chọn của bạn (Mặc định nhấn 1): "

if "%choice%"=="2" goto opt_localtunnel
if "%choice%"=="3" goto opt_localhostrun

:opt_pinggy
echo.
echo 🚀 Đang kết nối Kênh 1 (Pinggy Tunnel)...
echo Đang tạo link HTTPS và mã QR cho bạn trong giây lát...
echo (Lưu ý: Không đóng cửa sổ này khi bạn bè hoặc điện thoại đang dùng)
echo ----------------------------------------------------------------------
ssh -p 443 -o StrictHostKeyChecking=no -R0:localhost:5000 a.pinggy.io
goto end

:opt_localtunnel
echo.
echo 🚀 Đang kết nối Kênh 2 (Localtunnel)...
echo Đang tạo đường link 'your url is: https://...'
echo (Lưu ý: Không đóng cửa sổ này khi bạn bè hoặc điện thoại đang dùng)
echo ----------------------------------------------------------------------
call npx.cmd --yes localtunnel --port 5000
goto end

:opt_localhostrun
echo.
echo 🚀 Đang kết nối Kênh 3 (Localhost.run)...
echo ----------------------------------------------------------------------
ssh -o StrictHostKeyChecking=no -R 80:localhost:5000 nokey@localhost.run
goto end

:end
pause
