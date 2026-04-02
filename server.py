import os
import shutil
import time
import uuid
import sys
import subprocess
import re
from typing import List, Optional

# Suppress HuggingFace tokenizer parallelism warnings (prevents deadlocks on fork)
os.environ["TOKENIZERS_PARALLELISM"] = "false"

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request  # type: ignore
from fastapi.staticfiles import StaticFiles  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from fastapi.responses import FileResponse, JSONResponse  # type: ignore
from pydantic import BaseModel  # type: ignore
from dotenv import load_dotenv  # type: ignore
from starlette.concurrency import run_in_threadpool # for non-blocking task execution
import google.generativeai as genai  # type: ignore
import PyPDF2  # type: ignore

# Load environment variables
load_dotenv()

# Ensure src is in path for imports
sys.path.append(os.getcwd())

# Aura modules
from src.core.brain import (  # type: ignore
    process_input,
    clear_conversation_history,
    clear_long_term_memory,
    load_memory_into_session
)
from src.output.tts import speak, load_tts_model, update_voice_config # Import update_voice_config
from src.perception.audio import (  # type: ignore
    transcribe_audio_file,
    analyze_emotion_file,
    load_audio_models,
    load_text_emotion_model,
    text_emotion_classifier
)
from src.perception.grammar import load_grammar_model, correct_text_local, get_corrections  # type: ignore
from src.perception.nv_ace import ace_client  # type: ignore

# ── End of Imports ─────────────────────────────────────────────────────────────

# ── ffmpeg path resolution ─────────────────────────────────────────────────────
FFMPEG_PATHS = [
    '/opt/homebrew/bin/ffmpeg',   # Apple Silicon
    '/usr/local/bin/ffmpeg',      # Intel Mac
    '/usr/bin/ffmpeg',            # Linux
]
FFMPEG_BIN = next((p for p in FFMPEG_PATHS if os.path.isfile(p)), 'ffmpeg')
if FFMPEG_BIN != 'ffmpeg':
    _ffmpeg_dir = os.path.dirname(FFMPEG_BIN)
    os.environ['PATH'] = _ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')

app = FastAPI()

print("\n" + "="*50)
print("AURA SERVER STARTED")
print("ACCESS URL: http://localhost:8000")
print("="*50 + "\n")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="web/static"), name="static")
app.mount("/assets", StaticFiles(directory="assets"), name="assets")
app.mount("/face-models", StaticFiles(directory="assets/face-models"), name="face-models")



# Load models on startup
@app.on_event("startup")
async def startup_event():
    print("Loading models...")
    try:
        load_audio_models()
        load_text_emotion_model()
        load_grammar_model()
        load_tts_model()
        print("Models loaded.")
    except Exception as e:
        print(f"Error loading models: {e}")

    # ── Seed conversation context from long-term ChromaDB memory ──────────────────
    # This ensures AURA remembers the user's name / past topics even after
    # a page refresh or server restart — without the user repeating themselves.
    try:
        load_memory_into_session()
        print("[server] Memory seeded from ChromaDB on startup.")
    except Exception as e:
        print(f"[server] Could not seed memory from ChromaDB: {e}")

class ChatRequest(BaseModel):
    text: str
    emotion: str = "neutral"
    face_emotion: str = "neutral"   # from camera/face detection (separate channel)
    gesture: str = "none"
    provider: str = "auto"
    mode: str = "normal"          # "normal" or "interview"
    level: str = "mid"            # "junior", "mid", "senior"
    company: str = "General"      # "Microsoft", "Google", etc.
    domain: str = "Software Engineer" # "Data Analyst", "AI Engineer", etc.
    code: Optional[str] = None
    language: Optional[str] = None

# Global or persistent storage for resume content (per session/user)
# In a real app, this would be in a DB, but here we can use a simple dict or ChromaDB
user_resumes = {} 

def triple_fuse_emotions(audio_emo: str, text_emo: str, face_emo: str) -> str:
    """
    Blend three source signals into a single unified emotion signal.
    PRIORITY HIERARCHY (AURA standard):
    1. Audio (Prosody/Tone) — Humans can't easily fake tone-of-voice.
    2. Text (NLP/Sentiment) — The words used.
    3. Face (Vision/Cam)   — Least reliable due to lighting/camera artifacts.
    """
    a = (audio_emo or 'neutral').lower()
    t = (text_emo or 'neutral').lower()
    f = (face_emo or 'neutral').lower()

    print(f"[Fusion] Input: Audio={a}, Text={t}, Face={f}")

    # 1. AUDIO IS PRIMARY (Tone-of-Voice wins in all conflicts)
    if a != 'neutral':
        return a
    
    # 2. TEXT IS SECONDARY (Meaning of words wins over face)
    if t != 'neutral':
        return t
    
    # 3. FACE IS TERTIARY (Visual backup)
    return f

@app.post("/api/clear-history")
async def clear_history_endpoint():
    """Reset ONLY the short-term in-session conversation window.
    Long-term ChromaDB memory is preserved so AURA still remembers
    the user's name, preferences, and past topics after a new chat."""
    clear_conversation_history()
    return {"status": "success", "memory": "session_cleared"}


@app.post("/api/wipe-memory")
async def wipe_memory_endpoint():
    """Permanently erase ALL memory (ChromaDB + session history).
    Only use this when you truly want AURA to forget everything."""
    clear_conversation_history()
    success = clear_long_term_memory()
    return {"status": "success" if success else "failed", "memory": "fully_wiped"}


@app.get("/api/updates")
async def get_updates():
    """
    Health check / Queue polling endpoint.
    Used by startup scripts and diagnostic UI to confirm server readiness.
    """
    return {"status": "online", "updates": [], "timestamp": time.time()}



@app.post("/api/chat")
async def chat(request: ChatRequest):
    # For text-only chat, audio emotion is obviously neutral
    fused_emotion = triple_fuse_emotions("neutral", request.emotion, request.face_emotion)
    print(f"Received chat: {request.text} | text_emo={request.emotion} face_emo={request.face_emotion} → fused={fused_emotion} | Gesture: {request.gesture}")

    # Process input normally even if text is empty (allows responding to gestures/emotions)
    processed_result = await process_input(
        {
            "text": request.text,
            "emotion": fused_emotion,
            "audio_emotion": "neutral",           # No audio in text chat
            "text_emotion": request.emotion,      # request.emotion is text sentiment in chat
            "face_emotion": request.face_emotion, # raw camera emotion for conflict detection
            "gesture": request.gesture,
            "mode": request.mode,
            "level": request.level,
            "company": request.company,
            "domain": request.domain,
            "resume": user_resumes.get("current", ""), # Simple session handling
            "code": request.code,
            "language": request.language
        },
        provider=request.provider
    )
    response_text = processed_result["text"]
    response_emotion = processed_result["emotion"]
    
    # Generate Audio
    audio_file = speak(response_text, return_file=True)
    
    # (Redundant face animation call removed)
    
    # Determine animations (list)
    # Determine animations (list)
    animations = []
    lower_resp = response_text.lower()
    
    # Priority: Gesture -> Keywords -> Default
    
    # 1. Gesture Mapping (Explicit Visual Feedback)
    if "thumbs_up" in request.gesture:
        animations.append("happy")
    elif "victory" in request.gesture:
        animations.append("dance")
    elif "wave" in request.gesture:
        animations.append("clap") # Fallback for wave
    elif "thumbs_down" in request.gesture:
        animations.append("sad")
    elif "ok" in request.gesture:
        animations.append("happy")
    elif "iloveyou" in request.gesture:
        animations.append("pray")
    elif "vulcan" in request.gesture:
        animations.append("jump")
    elif "point" in request.gesture:
        animations.append("happy")
    elif "horns" in request.gesture:
        animations.append("dance")
    elif "call_me" in request.gesture:
        animations.append("happy")
    elif "fist" in request.gesture:
        animations.append("idle")
    elif "clap" in request.gesture:
        animations.append("clap")
    elif "dance" in request.gesture:
        animations.append("dance")
    elif "hug" in request.gesture:
        animations.append("happy") # Fallback for hug

    # 1.5 Emotion Mapping (Visual Feedback for Face)
    # 1.5 Emotion Mapping (Visual Feedback for Face)
    # PRIORITIZE LLM Emotion for Body Animation
    # Maps LLM Emotion tags to animation names in avatar.js
    emo = response_emotion
    if emo == "happy":
        animations.append("happy") # Sitting Laughing
    elif emo == "funny":
        animations.append("happy") # Sitting Laughing
    elif emo == "excited":
        animations.append("clap") # Clapping
    elif emo == "sad":
        animations.append("sad") # Defeated
    elif emo == "tired":
        animations.append("crouch") # Crouch To Stand
    elif emo == "surprised":
        animations.append("jump") # Surprise -> Jump or similar
    elif emo == "angry":
        animations.append("sad") # Fallback
    elif emo == "grateful":
        animations.append("pray") # Praying
    
    # Also consider Fused Input Emotion or Raw Face Emotion if LLM is neutral
    active_input_emo = fused_emotion if fused_emotion != "neutral" else request.face_emotion
    if not animations and active_input_emo != "neutral":
        if active_input_emo == "happy":
            animations.append("happy")
        elif active_input_emo == "sad":
            animations.append("sad")
        elif active_input_emo == "surprised":
            animations.append("jump")
        elif active_input_emo == "angry":
            animations.append("sad") # fallback 
        elif active_input_emo == "excited":
            animations.append("clap")
    
    # 2. Keyword Mapping (if no gesture specific animation or to add more)
    if not animations:
        lower_text = lower_resp
        if "hug" in lower_text: animations.append("happy")
        if "dance" in lower_text: animations.append("dance")
        if "happy" in lower_text or "laugh" in lower_text: animations.append("happy")
        if "sad" in lower_text or "cry" in lower_text: animations.append("sad")
        if "clap" in lower_text: animations.append("clap")
        if "pray" in lower_text or "thanks" in lower_text: animations.append("pray")
        if "jump" in lower_text or "wow" in lower_text: animations.append("jump")
    
    # If no specific animation, default to "idle" (client handles talking state separately logic)
    # or "talk" if we had one.
    if not animations:
        animations = ["idle"]
    
    # Generate Face Animation using NVIDIA ACE
    face_animation = None
    if audio_file:
        face_animation = ace_client.process_audio(audio_file, emotion=response_emotion)
    
    audio_url = f"/audio/{os.path.basename(audio_file)}" if audio_file else None
    
    return {
        "text": response_text,
        "emotion": response_emotion,
        "audio_url": audio_url,
        "animations": animations, # Return list
        "face_animation": face_animation # New field for blendshapes
    }

class AnimateRequest(BaseModel):
    text: str
    emotion: str = "neutral"

@app.post("/api/animate")
async def animate_text(request: AnimateRequest):
    """
    Direct endpoint to make the avatar speak specific text without using the Brain/LLM.
    Used for integrations with external AIs (ChatGPT, Grok, etc).
    """
    print(f"Received animation request: {request.text} ({request.emotion})")
    
    # 1. Generate Audio directly from text
    audio_file = speak(request.text, return_file=True)
    
    # 2. Generate Face Animation using NVIDIA ACE
    face_animation = None
    if audio_file:
        try:
            face_animation = ace_client.process_audio(audio_file, emotion=request.emotion)
        except Exception as e:
            print(f"ACE Error: {e}")
    
    # 3. Determine body animations based on text keywords
    animations = []
    lower_text = request.text.lower()
    
    if "hug" in lower_text: animations.append("happy")
    if "dance" in lower_text: animations.append("dance")
    if "happy" in lower_text or "laugh" in lower_text or "funny" in lower_text or "haha" in lower_text: animations.append("funny")
    if "sad" in lower_text or "cry" in lower_text or "upset" in lower_text: animations.append("sad")
    if "clap" in lower_text or "congrats" in lower_text: animations.append("clap")
    if "pray" in lower_text or "thanks" in lower_text or "grateful" in lower_text: animations.append("grateful")
    if "jump" in lower_text or "wow" in lower_text or "amazing" in lower_text: animations.append("amazed")
    if "tired" in lower_text or "sleepy" in lower_text or "exhausted" in lower_text: animations.append("tired")
    if "bored" in lower_text or "boring" in lower_text: animations.append("bored")
    if "hi " in lower_text or "hello" in lower_text or "hey" in lower_text or "bye" in lower_text: animations.append("waving")
    
    if not animations:
        # Fallback to pure emotion if no keywords
        animations = [request.emotion] if request.emotion != "neutral" else ["idle"]
        
    audio_url = f"/audio/{os.path.basename(audio_file)}" if audio_file else None
    
    return {
        "text": request.text,
        "emotion": request.emotion,
        "audio_url": audio_url,
        "animations": animations,
        "face_animation": face_animation,
        "timestamp": time.time()
    }

class VoiceSelectionRequest(BaseModel):
    lang: str = "en"
    tld: str = "com"

@app.post("/api/set-voice")
async def set_voice(request: VoiceSelectionRequest):
    """
    Change the gTTS voice (language and accent/TLD).
    """
    update_voice_config(lang=request.lang, tld=request.tld)
    return {"status": "success", "voice": f"{request.lang} (tld: {request.tld})"}

@app.get("/api/voices")
async def get_voices():
    """Returns the list of common voices (TLDs) supported for English."""
    voices = [
        {"name": "United States (US)", "lang": "en", "tld": "com"},
        {"name": "United Kingdom (UK)", "lang": "en", "tld": "co.uk"},
        {"name": "India (IN)", "lang": "en", "tld": "co.in"},
        {"name": "Australia (AU)", "lang": "en", "tld": "com.au"},
        {"name": "Canada (CA)", "lang": "en", "tld": "ca"},
        {"name": "South Africa (ZA)", "lang": "en", "tld": "co.za"},
        {"name": "Hindi (India)", "lang": "hi", "tld": "com"},
        {"name": "French (France)", "lang": "fr", "tld": "com"},
        {"name": "Spanish (Spain)", "lang": "es", "tld": "com"},
    ]
    return {"status": "success", "voices": voices}




class A2FRequest(BaseModel):
    audioPath: str
    emotion: str = "neutral"

@app.post("/a2f")
async def process_a2f(request: A2FRequest):
    print(f"Processing A2F for: {request.audioPath}")
    
    # Resolve absolute path if needed
    if not os.path.isabs(request.audioPath):
        # Assuming file is in current directory or output folder
        # Check if it exists in root
        if os.path.exists(request.audioPath):
            file_path = os.path.abspath(request.audioPath)
        elif os.path.exists(os.path.join("output", request.audioPath)):
            file_path = os.path.abspath(os.path.join("output", request.audioPath))
        else:
             # Try logical path from URL assumption (e.g. "output_xyz.wav")
             file_path = os.path.abspath(request.audioPath)
    else:
        file_path = request.audioPath
        
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Audio file not found: {file_path}")

    # Call NVIDIA ACE
    # We use the existing shared client
    try:
        animations = ace_client.process_audio(file_path, emotion=request.emotion)
        return {"blendshapes": animations}
    except Exception as e:
        print(f"A2F Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    """Upload and parse a PDF resume."""
    try:
        # Save temp file
        raw_filename = f"resume_{uuid.uuid4()}.pdf"
        with open(raw_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Parse PDF
        text = ""
        try:
            with open(raw_filename, "rb") as f:
                pdf_reader = PyPDF2.PdfReader(f)
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
        except Exception as e:
            print(f"PDF parsing error: {e}")
            raise HTTPException(status_code=400, detail="Could not parse PDF. Please ensure it's a valid PDF file.")
        finally:
            if os.path.exists(raw_filename):
                os.remove(raw_filename)

        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract any text from the PDF.")

        # Save to session (Mocked session: "current")
        user_resumes["current"] = text.strip()
        print(f"[Resume] Uploaded and parsed ({len(text)} characters)")
        
        return {"status": "success", "message": "Resume uploaded and indexed. AURA is now aware of your experience.", "char_count": len(text)}
    except Exception as e:
        print(f"[Resume] Upload failed: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/voice-chat")
async def upload_audio(file: UploadFile = File(...), face_emotion: str = Form("neutral"), gesture: str = Form("none"), mode: str = Form("normal"), level: str = Form("mid"), company: str = Form("General"), domain: str = Form("Software Engineer")):
    try:
        import subprocess
        
        # Save the uploaded audio file
        raw_filename = f"temp_raw_{uuid.uuid4()}"
        wav_filename = f"temp_{uuid.uuid4()}.wav"
        
        with open(raw_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(raw_filename)
        print(f"Processing audio file: {raw_filename} ({file_size} bytes)")
        
        # Check if it's already a WAV file (starts with RIFF header)
        is_wav = False
        try:
            with open(raw_filename, 'rb') as f:
                header = f.read(12)
                is_wav = header.startswith(b'RIFF') and header.startswith(b'WAVE', 8)
        except:
            pass
        
        if is_wav:
            # Already a proper WAV, just rename
            print("File is already WAV format, using directly")
            os.rename(raw_filename, wav_filename)
        else:
            # Convert to WAV using ffmpeg
            print("Converting to WAV format using FFmpeg...")
            try:
                result = subprocess.run([
                    FFMPEG_BIN, '-y', '-i', raw_filename,
                    '-ar', '16000',  # 16kHz sample rate (optimal for Whisper)
                    '-ac', '1',      # Mono audio
                    '-af', 'speechnorm=e=12.5:r=0.0001:l=1', # Normalize/Boost speech
                    '-f', 'wav',     # Output format
                    wav_filename
                ], capture_output=True, text=True, timeout=10)
                
                if result.returncode != 0:
                    print(f"FFmpeg conversion failed: {result.stderr}")
                    # Try to use raw file anyway
                    os.rename(raw_filename, wav_filename)
            except FileNotFoundError:
                print("FFmpeg not found, using raw audio file")
                os.rename(raw_filename, wav_filename)
            except Exception as e:
                print(f"FFmpeg error: {e}")
                os.rename(raw_filename, wav_filename)
            finally:
                # Cleanup raw file if it still exists
                if os.path.exists(raw_filename):
                    os.remove(raw_filename)
        
        # Verify file exists and has content
        if not os.path.exists(wav_filename) or os.path.getsize(wav_filename) < 100:
            print("Audio file is empty or missing")
            return {"input_text": None, "text": None, "audio_url": None, "animations": ["idle"]}
        
        print(f"Transcribing: {wav_filename} ({os.path.getsize(wav_filename)} bytes)")
        
        # Transcribe (Blocking CPU task -> run in threadpool)
        text = await run_in_threadpool(transcribe_audio_file, wav_filename)
        
        # Analyze Emotion (Audio) (Blocking CPU task -> run in threadpool)
        audio_emotion = await run_in_threadpool(analyze_emotion_file, wav_filename)
        print(f"🎤 Voice Emotion Detected: {audio_emotion}")

        # Cleanup temp file
        try:
            if os.path.exists(wav_filename):
                os.remove(wav_filename)
        except Exception as e:
            print(f"Cleanup error: {e}")
        
        if not text or not text.strip():
            print("No speech detected in audio")
            return {"input_text": None, "text": None, "audio_url": None, "animations": ["idle"]}
            
        print(f"Transcribed: '{text}', Audio Emotion: {audio_emotion} | Face Emotion: {face_emotion}")
        
        # Analyze Text sentiment of the speech too!
        from src.perception.audio import analyze_text_sentiment
        text_sentiment = await run_in_threadpool(analyze_text_sentiment, text)

        # Fused Emotion using NEW triple-signal logic
        fused_emotion = triple_fuse_emotions(audio_emotion, text_sentiment, face_emotion)
        print(f"Fused Emotion → {fused_emotion} (audio={audio_emotion}, text={text_sentiment}, face={face_emotion})")

        # Process — pass both fused emotion and raw individual signals for dissonance detection
        processed_result = await process_input({
            "text": text,
            "emotion": fused_emotion,
            "audio_emotion": audio_emotion,
            "text_emotion": text_sentiment,
            "face_emotion": face_emotion,
            "gesture": gesture,
            "mode": mode,
            "level": level,
            "company": company,
            "domain": domain,
            "resume": user_resumes.get("current", "")
        })
        response_text = processed_result["text"]
        response_emotion = processed_result["emotion"]
        
        # Generate Audio (Blocking I/O/CPU task -> run in threadpool)
        audio_file = await run_in_threadpool(speak, response_text, return_file=True)

        # Generate Face Animation using NVIDIA ACE
        face_animation = None
        if audio_file:
            # Process NVIDIA ACE (sync blocking call -> threadpool)
            face_animation = await run_in_threadpool(ace_client.process_audio, audio_file, emotion=response_emotion)
        
        # Determine animations (list)
        animations = []
        lower_resp = response_text.lower()
        
        if gesture and gesture != "none":
            if "thumbs_up" in gesture: animations.append("happy")
            elif "victory" in gesture: animations.append("dance")
            elif "wave" in gesture: animations.append("clap")
            elif "thumbs_down" in gesture: animations.append("sad")
            elif "ok" in gesture: animations.append("happy")
            elif "iloveyou" in gesture: animations.append("pray")
            elif "vulcan" in gesture: animations.append("jump")
            elif "point" in gesture: animations.append("happy")
            elif "horns" in gesture: animations.append("dance")
            elif "call_me" in gesture: animations.append("happy")
            elif "fist" in gesture: animations.append("idle")
            elif "clap" in gesture: animations.append("clap")
            elif "dance" in gesture: animations.append("dance")
            elif "hug" in gesture: animations.append("happy")
            
        emo = response_emotion
        if not animations:
            if emo in ["happy", "joy", "funny"]: animations.append("funny")
            elif emo == "excited": animations.append("excited")
            elif emo == "sad": animations.append("sad")
            elif emo == "tired": animations.append("tired")
            elif emo == "surprised": animations.append("amazed")
            elif emo == "angry": animations.append("angry")
            elif emo == "grateful": animations.append("grateful")
            elif emo == "thinking": animations.append("thinking")
            elif emo == "confused": animations.append("confused")
        
        if not animations:
            if "hug" in lower_resp: animations.append("happy")
            if "dance" in lower_resp: animations.append("dance")
            if "happy" in lower_resp or "laugh" in lower_resp or "funny" in lower_resp or "haha" in lower_resp: animations.append("funny")
            if "sad" in lower_resp or "cry" in lower_resp or "upset" in lower_resp: animations.append("sad")
            if "clap" in lower_resp or "congrats" in lower_resp: animations.append("clap")
            if "pray" in lower_resp or "thanks" in lower_resp or "grateful" in lower_resp: animations.append("grateful")
            if "jump" in lower_resp or "wow" in lower_resp or "amazing" in lower_resp: animations.append("amazed")
            if "tired" in lower_resp or "sleepy" in lower_resp or "exhausted" in lower_resp: animations.append("tired")
            if "bored" in lower_resp or "boring" in lower_resp: animations.append("bored")
            if "hi " in lower_resp or "hello" in lower_resp or "hey" in lower_resp or "bye" in lower_resp: animations.append("waving")
        
        if not animations:
            animations = ["idle"]
        
        audio_url = f"/audio/{os.path.basename(audio_file)}" if audio_file else None
        
        return {
            "input_text": text,
            "input_emotion": audio_emotion,           # audio-detected emotion
            "face_emotion": face_emotion,       # camera face emotion
            "fused_emotion": fused_emotion,     # what was actually sent to the brain
            "text": response_text,
            "emotion": response_emotion,
            "audio_url": audio_url,
            "animations": animations,
            "face_animation": face_animation
        }
    except Exception as e:
        print(f"[CRITICAL] Detailed Audio processing error: {e}")
        import traceback
        traceback.print_exc()
        # Return a structured error so main.js/avatar.js don't crash and user sees a hint
        return JSONResponse(
            status_code=500,
            content={"error": f"Audio process failure: {str(e)}", "animations": ["sad"]}
        )

class CorrectionRequest(BaseModel):
    text: str
    source: str = "text"   # "text" | "voice"

def get_llm_client_async(provider="openrouter"):
    """Helper to get Async OpenAI-compatible client for NIM or OpenRouter."""
    NV_KEY = os.getenv("NV_API_KEY")
    OR_KEY = os.getenv("OPENROUTER_API_KEY")
    from openai import AsyncOpenAI
    if provider == "nvidia" and NV_KEY:
        return AsyncOpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=NV_KEY), "meta/llama3-70b-instruct"
    if OR_KEY:
        return AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=OR_KEY), "openai/gpt-4o-mini"
    return None, None

async def correct_text_llm(raw_text: str):
    """Attempt grammar correction using LLMs (NVIDIA -> OpenRouter)."""
    try:
        # 1. Try NVIDIA first
        client, model = get_llm_client_async("nvidia")
        if not client:
             # 2. Fallback to OpenRouter
             client, model = get_llm_client_async("openrouter")
        
        if not client: return None
        
        completion = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a professional spelling/grammar corrector. Return ONLY the fixed text, maintaining the original meaning. If correct, return as-is. No explanations."},
                {"role": "user", "content": raw_text}
            ],
            temperature=0,
            max_tokens=256,
            timeout=4
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        # Handle 401/User not found silently
        if "401" in str(e) or "User not found" in str(e):
             return None
        print(f"[Correction LLM] API error: {e}")
        return None

@app.post("/api/correct-text")
async def correct_text(request: CorrectionRequest):
    """
    Correct spelling and grammar in user input.
    Hierarchy: Cloud Gemini -> Cloud NVIDIA/OpenRouter -> Local small-T5 -> Original
    """
    raw = (request.text or "").strip()
    if not raw or len(raw) < 3:
        return {"corrected": raw, "original": raw, "changed": False, "corrections": []}

    corrected = None
    
    # 1. Try Gemini (Primary Cloud)
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("models/gemini-2.0-flash")
            prompt = f"Correct any grammar or spelling errors in this casual sentence, keeping it natural. Return ONLY the corrected text: \"{raw}\""
            result = model.generate_content(prompt)
            corrected = (result.text or "").strip()
            print(f"[Correction] Gemini Cloud fixed: {corrected}")
        except:
            corrected = None

    # 2. Try NIM / OpenRouter (Secondary Cloud)
    if not corrected:
        corrected = await correct_text_llm(raw)

    # 3. Try Local Fallback (T5)
    if not corrected:
        try:
            print("[Correction] Cloud methods failed, using local T5 model...")
            corrected = correct_text_local(raw)
        except Exception as e:
            print(f"[Correction] Local fallback failed: {e}")
            corrected = None

    if not corrected:
        return {"corrected": raw, "original": raw, "changed": False, "corrections": []}

    if len(corrected) >= 2 and ((corrected.startswith('"') and corrected.endswith('"')) or (corrected.startswith("'") and corrected.endswith("'"))):
        corrected = corrected.strip("\"'")

    changed = corrected.strip().lower() != raw.strip().lower()
    corrections = []
    if changed:
        # Use helper from grammar module for cleaner diffs
        corrections = get_corrections(raw, corrected)

    return {
        "corrected": corrected,
        "original": raw,
        "changed": changed,
        "corrections": corrections
    }

@app.get("/audio/{filename}")
async def get_audio(filename: str):
    print(f"[Audio endpoint] Requested: {filename}")
    # Check in root first (old behavior)
    file_path = os.path.abspath(filename)
    if not os.path.exists(file_path):
        # Then check in dedicated output folder
        file_path = os.path.abspath(os.path.join("output", filename))

    if os.path.exists(file_path):
        return FileResponse(file_path)
    
    print(f"[Audio endpoint] File not found: {file_path}")
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/")
async def read_index():
    return FileResponse("web/static/index.html")

@app.get("/animation-studio")
async def animation_studio():
    """Blend Shape Animation Studio"""
    return FileResponse("web/animation_studio.html")

@app.get("/gesture-studio")
async def gesture_studio():
    """Gesture / Body Animation Studio"""
    return FileResponse("web/gesture_studio.html")

@app.get("/voice-test")
async def voice_test():
    """Voice command input & emotion detection test lab"""
    return FileResponse("web/voice_test.html")

@app.post("/api/voice-test")
async def voice_test_api(file: UploadFile = File(...)):
    """
    Dedicated endpoint for the Voice Test Lab.
    Returns rich emotion analysis with the transcript.
    """
    import subprocess

    raw_filename = f"temp_raw_{uuid.uuid4()}"
    wav_filename = f"temp_{uuid.uuid4()}.wav"

    with open(raw_filename, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(raw_filename)
    print(f"[VoiceTest] Processing audio: {raw_filename} ({file_size} bytes)")

    # Check WAV header
    is_wav = False
    try:
        with open(raw_filename, 'rb') as f:
            header = f.read(12)
            is_wav = header.startswith(b'RIFF') and header.startswith(b'WAVE', 8)
    except:
        pass

    if is_wav:
        os.rename(raw_filename, wav_filename)
    else:
        try:
            result = subprocess.run([
                FFMPEG_BIN, '-y', '-i', raw_filename,
                '-ar', '16000', '-ac', '1', '-f', 'wav', wav_filename
            ], capture_output=True, text=True, timeout=15)
            if result.returncode != 0:
                os.rename(raw_filename, wav_filename)
        except Exception:
            os.rename(raw_filename, wav_filename)
        finally:
            if os.path.exists(raw_filename):
                os.remove(raw_filename)

    if not os.path.exists(wav_filename) or os.path.getsize(wav_filename) < 100:
        return JSONResponse({"success": False, "error": "Audio file too small or missing"})

    # Transcribe
    transcript = transcribe_audio_file(wav_filename)
    # Analyze emotion
    audio_emotion = analyze_emotion_file(wav_filename)

    # Cleanup
    try:
        if os.path.exists(wav_filename):
            os.remove(wav_filename)
    except:
        pass

    print(f"[VoiceTest] Transcript: '{transcript}' | Audio Emotion: {audio_emotion}")

    # Also run text emotion if transcript found
    text_emotion = None
    if transcript and transcript.strip():
        if text_emotion_classifier:
            try:
                # Use classifier normally
                res = text_emotion_classifier(transcript)
                # Correct access: res is a list of dicts [{'label': '...', 'score': ...}]
                if res and len(res) > 0:
                    text_emotion = res[0]['label'].lower()
            except Exception as e:
                print(f"Text emotion error: {e}")

    return JSONResponse({
        "success": bool(transcript and transcript.strip()),
        "transcript": transcript or "",
        "audio_emotion": audio_emotion,
        "text_emotion": text_emotion,
        "emotions": [
            {"emotion": audio_emotion, "source": "audio", "confidence": 0.85},
            {"emotion": text_emotion or "neutral", "source": "text", "confidence": 0.80}
        ]
    })
