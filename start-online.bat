@echo off
chcp 65001 >nul
title Um Bo Milk - Online Server (Cloudflare)
echo =====================================================================
echo    HE THONG UM BO MILK - KHOI DONG TRUC TIEP ONLINE (CLOUDFLARE)
echo =====================================================================
echo.
echo 1. Dang khoi dong Node.js Server (Port 3000)...
start "Um Bo Milk Server" cmd /k "chcp 65001 >nul && npm start"
timeout /t 4 >nul
echo.
echo 2. Dang ket noi Cloudflare Tunnel de lay link HTTPS mien phi toan cau...
echo (Vui long nhin dong chu mau xanh ben duoi co link dang: https://...trycloudflare.com)
echo.
.\cloudflared.exe tunnel --url http://localhost:3000
pause
