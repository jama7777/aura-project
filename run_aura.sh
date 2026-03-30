#!/bin/bash
cd /Users/indra/Documents/aura-project
source venv/bin/activate
# Kill any existing server on port 8000
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null
# Start uvicorn in background with log redirection to prevent tty suspension
uvicorn server:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &
echo "[AURA] Starting server in background... logs at server.log"

# Wait for server to be up
for i in {1..30}; do
  if curl -s http://localhost:8000/api/updates > /dev/null; then
    echo "[AURA] Server is LIVE!"
    break
  fi
  echo -n "."
  sleep 1
done

open http://localhost:8000
