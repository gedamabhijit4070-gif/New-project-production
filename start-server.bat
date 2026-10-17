@echo off
title LEMKEN Production Tracker - Local Server
cd /d "%~dp0"

echo ============================================================
echo   LEMKEN Production Tracker - starting local web server
echo ============================================================
echo.
echo   Open this address in your browser (do NOT double-click
echo   index.html - that causes the file:// CORS errors):
echo.
echo   http://127.0.0.1:8123/index.html
echo.
echo   Keep this window open while using the app.
echo   Press Ctrl+C to stop the server.
echo ============================================================
echo.

start "" "http://127.0.0.1:8123/index.html"

python -m http.server 8123 --bind 127.0.0.1 --directory "%~dp0"

pause
