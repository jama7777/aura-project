import os
import sys
import importlib

print("--- AURA SYSTEM DIAGNOSTIC ---")

def check_import(module_name):
    try:
        importlib.import_module(module_name)
        print(f"[OK] {module_name} imported.")
        return True
    except ImportError as e:
        print(f"[FAIL] {module_name} FAILED: {e}")
        return False
    except Exception as e:
        print(f"[FAIL] {module_name} CRASHED: {e}")
        return False

# 1. Check Core Libraries
print("\n1. Checking Dependencies...")
deps = [
    "fastapi", "uvicorn", "pydantic", 
    "torch", "torchaudio", 
    "whisper", 
    "transformers", 
    "google.generativeai",
    "chromadb"
]
all_deps_ok = True
for dep in deps:
    if not check_import(dep):
        all_deps_ok = False

if not all_deps_ok:
    print("\n[CRITICAL] Some dependencies are missing. Run: pip install -r requirements.txt")
else:
    print("\n[OK] All core dependencies installed.")

# 2. Check Model Loading (Audio)
print("\n2. Checking Audio Models...")
try:
    import whisper
    model = whisper.load_model("tiny")
    print(f"[OK] Whisper 'tiny' model loaded.")
except Exception as e:
    print(f"[FAIL] Whisper load failed: {e}")

try:
    from transformers import pipeline
    emotion_model = pipeline("audio-classification", model="superb/wav2vec2-base-superb-er")
    print(f"[OK] Transformers Emotion model loaded.")
except Exception as e:
    print(f"[FAIL] Transformers Emotion model failed: {e}")

# 3. Check Gemini API
print("\n3. Checking Gemini Connection...")
try:
    import google.generativeai as genai
    # Check multiple possible env vars
    key = os.getenv("GEMINI_API_KEY") or os.getenv("NV_API_KEY")
    if not key:
        print("[WARNING] GEMINI_API_KEY / NV_API_KEY not set. Using fallback key.")
        key = "AIzaSyD38c0J_CDF4Mf-3TQPIASBQtd1yMJb4EY" 
    
    if key == "AIzaSyD38c0J_CDF4Mf-3TQPIASBQtd1yMJb4EY":
         print("[WARNING] You are using the public/default API Key. This often causes 429 Quota Exceeded errors.")
         print("          Please export NV_API_KEY or gemini_api_key in your shell.")

    genai.configure(api_key=key)
    model = genai.GenerativeModel('gemini-1.5-flash') # Use a stable model name
    print(f"[OK] Gemini Configured with key terminating in ...{key[-4:]}")
except Exception as e:
    print(f"[FAIL] Gemini Configuration failed: {e}")

# 4. Check Environment
print("\n4. Checking Environment...")
print(f"CWD: {os.getcwd()}")
print(f"Python: {sys.version}")
print("--- DIAGNOSTIC COMPLETE ---")
