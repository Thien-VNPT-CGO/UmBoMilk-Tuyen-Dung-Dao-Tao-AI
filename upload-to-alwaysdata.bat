@echo off
chcp 65001 >nul
title Dong bo du lieu len Alwaysdata
echo ====================================================================
echo    DONG BO DU LIEU GOOGLE SHEET VA CAI DAT LEN ALWAYSDATA
echo ====================================================================
echo.
echo Dang chuan bi tai:
echo   1. File cau hinh [.env] (Chua khoa bao mat va key Google Sheet)
echo   2. Co so du lieu [data/db.json] (Chua toan bo du lieu that va Service Account)
echo.
echo May chu se hoi mat khau Alwaysdata cua ban.
echo (Khi go mat khau man hinh se an ky tu, ban cu go dung roi nhan Enter).
echo.
echo --------------------------------------------------------------------
echo [1/2] Dang tai .env...
scp .env umbomilk@ssh-umbomilk.alwaysdata.net:/home/umbomilk/app/.env
echo.
echo [2/2] Dang tai data/db.json (4.3 MB)...
scp data/db.json umbomilk@ssh-umbomilk.alwaysdata.net:/home/umbomilk/app/data/db.json
echo --------------------------------------------------------------------
echo.
echo ====================================================================
echo   DA DONG BO DU LIEU THANH CONG 100%!
echo.
echo   Buoc cuoi: Ban quay lai trang quan tri Alwaysdata (Web -^> Sites)
echo   bam nut Restart (mui ten xoay tron) de web cap nhat du lieu ngay.
echo ====================================================================
echo.
pause
