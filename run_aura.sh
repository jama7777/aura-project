#!/bin/bash
cd /Users/indra/Documents/aura-project
source venv/bin/activate
# Kill any existing server on port 8000
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null
uvicorn server:app --host 0.0.0.0 --port 8000 &
sleep 3
open http://localhost:8000
