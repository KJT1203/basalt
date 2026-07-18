@echo off
title Basalt
start /min cmd /c "timeout /t 1 >nul & start http://localhost:8088"
node "%~dp0server.js"
