@echo off
echo ========================================================
echo   Launching RAG Studio — Platform & Eval Workbench
echo ========================================================
echo.

start "RAG Studio Backend (FastAPI)" cmd /k ".\venv\Scripts\activate.bat && set PYTHONPATH=. && uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"

echo Starting Frontend on http://localhost:5173 ...
cd frontend
npm run dev
