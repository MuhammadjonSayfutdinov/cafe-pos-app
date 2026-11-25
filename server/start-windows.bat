@echo off
rem Kafe mahalliy serveri (Windows). Ikki marta bosing yoki "Ishga tushirish" (Startup) papkasiga yorliq qo'ying.
rem Server to'xtab qolsa, 5 soniyadan keyin o'zi qayta ishga tushadi. Yopish: shu oynani yoping.
chcp 65001 >nul
title Kafe serveri
cd /d "%~dp0.."
:loop
node server\hub.mjs
echo.
echo Server to'xtadi. 5 soniyadan keyin qayta ishga tushadi (yopish uchun oynani yoping)...
timeout /t 5 /nobreak >nul
goto loop
