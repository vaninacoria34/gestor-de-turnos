@echo off
cd /d "%~dp0backend"
echo Iniciando Gestor de Turnos...
echo Deja esta ventana abierta mientras el equipo usa el sistema.
node server.js
pause
