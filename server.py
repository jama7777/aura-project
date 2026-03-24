from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import shutil
import os
import time
import uuid
from pydantic import BaseModel

# ── ffmpeg path resolution ─────────────────────────────────────────────────────
# On Apple Silicon Macs, Homebrew installs to /opt/homebrew/bin which is NOT
# automatically on the PATH when launched by some tools. Patch it in here so
# both subprocess calls and Python libraries (whisper, huggingface) can find it.
FFMPEG_PATHS = [
    '/opt/homebrew/bin/ffmpeg',   # Apple Silicon (M1/M2/M3)
    '/usr/local/bin/ffmpeg',      # Intel Mac Homebrew
    '/usr/bin/ffmpeg',            # Linux
]
FFMPEG_BIN = next((p for p in FFMPEG_PATHS if os.path.isfile(p)), 'ffmpeg')
if FFMPEG_BIN != 'ffmpeg':
    # Prepend the directory to PATH so child processes and libraries also find it
    _ffmpeg_dir = os.path.dirname(FFMPEG_BIN)
    os.environ['PATH'] = _ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
    print(f'[server] ffmpeg found at: {FFMPEG_BIN} (added {_ffmpeg_dir} to PATH)')
else:
    print('[server] WARNING: ffmpeg not found in known paths — audio conversion may fail!')

# Import Aura modules
# Ensure src is in path
import sys
sys.path.append(os.getcwd())

from src.core.brain import process_input, clear_conversation_history, set_interview_context, clear_long_term_memory
from src.output.tts import speak, load_tts_model
from src.perception.audio import transcribe_audio_file, analyze_emotion_file, load_audio_models, load_text_emotion_model
from src.perception.nv_ace import ace_client

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

# Global Event Queue for External Controls
global_event_queue = []

# Load models on startup
@app.on_event("startup")
async def startup_event():
    print("Loading models...")
    try:
        load_tts_model()
        load_audio_models()
        load_text_emotion_model()
        print("Models loaded.")
    except Exception as e:
        print(f"Error loading models: {e}")

class ChatRequest(BaseModel):
    text: str
    emotion: str = "neutral"
    face_emotion: str = "neutral"   # from camera/face detection (separate channel)
    gesture: str = "none"
    provider: str = "auto"

# Emotion priority weights — higher = more trusted source
EMOTION_WEIGHTS = {
    'audio': 0.70,  # audio tone of voice (from Wav2Vec2)
    'text':  0.65,  # words the user said / typed
    'face':  0.30,  # face camera detection (less reliable in real use)
}
EMOTION_PRIORITY = ['happy','excited','joy','sad','angry','surprised','love','fear','disgust','confused','thinking','neutral']

def fuse_emotions(text_or_audio_emotion: str, face_emotion: str) -> str:
    """
    Blend multiple emotion signals into one.
    Rule:
      - If both agree → return that emotion (boosted confidence, no change needed)
      - If face is neutral → trust audio/text fully
      - If audio/text is neutral → trust face at lower weight
      - If they conflict → audio/text wins (higher weight)
    """
    a = (text_or_audio_emotion or 'neutral').lower()
    f = (face_emotion or 'neutral').lower()

    if a == f:
        return a                          # perfect agreement
    if a == 'neutral' and f != 'neutral':
        return f                          # only face has signal
    # audio/text always wins over face in a conflict
    return a

@app.post("/api/clear-history")
async def clear_history_endpoint():
    """Reset BOTH deep ChromaDB memory and short-term session history."""
    clear_conversation_history()
    success = clear_long_term_memory()
    return {"status": "success" if success else "failed", "memory": "wiped"}

@app.post("/api/upload-resume")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    # Save the file temporarily
    temp_filename = f"temp_{uuid.uuid4()}.pdf"
    with open(temp_filename, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        import PyPDF2
        text = ""
        with open(temp_filename, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")
                
        # Update the brain's context with the resume
        set_interview_context(text)
        
        return {"status": "success", "message": "Resume parsed and Interview Mode enabled."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse resume: {str(e)}")
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

@app.post("/api/chat")
async def chat(request: ChatRequest):
    # Fuse camera face emotion + text/speech emotion before sending to brain
    fused_emotion = fuse_emotions(request.emotion, request.face_emotion)
    print(f"Received chat: {request.text} | text_emo={request.emotion} face_emo={request.face_emotion} → fused={fused_emotion} | Gesture: {request.gesture}")

    # NEW: If text is totally empty but gesture exists, just return animations! NO LLM!
    if not request.text or not request.text.strip():
        if request.gesture and request.gesture != "none":
            animations = []
            req_g = request.gesture.lower()
            if "thumbs_up" in req_g: animations.append("happy")
            elif "victory" in req_g: animations.append("dance")
            elif "wave" in req_g: animations.append("clap")
            elif "clap" in req_g: animations.append("clap")
            elif "dance" in req_g: animations.append("dance")
            elif "hug" in req_g: animations.append("happy")
            
            if not animations:
                animations = ["idle"]
                
            return {
                "text": "",
                "emotion": "neutral",
                "audio_url": None,
                "blendshapes": {},
                "animations": animations
            }

    # Process input — pass both the fused emotion AND the raw face emotion so
    # the brain can detect conflicts between what the face shows vs what words say
    processed_result = process_input(
        {
            "text": request.text,
            "emotion": fused_emotion,          # primary emotion (text/audio wins in conflict)
            "face_emotion": request.face_emotion,  # raw camera emotion for conflict detection
            "gesture": request.gesture
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
    
    # Also consider User Input Emotion if LLM is neutral
    if not animations and request.emotion != "neutral":
        if request.emotion == "happy":
            animations.append("happy")
        elif request.emotion == "sad":
            animations.append("sad")
    
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
    if "happy" in lower_text or "laugh" in lower_text: animations.append("happy")
    if "sad" in lower_text or "cry" in lower_text: animations.append("sad")
    if "clap" in lower_text: animations.append("clap")
    if "pray" in lower_text or "thanks" in lower_text: animations.append("pray")
    if "jump" in lower_text or "wow" in lower_text: animations.append("jump")
    
    if not animations:
        animations = ["idle"]
        
    audio_url = f"/audio/{os.path.basename(audio_file)}" if audio_file else None
    
    
    # --- EXTERNAL CONTROL QUEUE ---
    # Store commands for the frontend to pick up (Simple Polling)
    # In production, use WebSockets or SSE.
    # global_event_queue is defined globally
    
    # Add to queue for the frontend to pick up
    event_data = {
        "text": request.text,
        "emotion": request.emotion,
        "audio_url": audio_url,
        "animations": animations,
        "face_animation": face_animation,
        "timestamp": time.time()
    }
    global_event_queue.append(event_data)
    
    # Keep queue size small
    if len(global_event_queue) > 5:
        global_event_queue.pop(0)

    print(f"Added animation to queue. Queue size: {len(global_event_queue)}")

    return event_data

@app.get("/api/updates")
async def get_updates():
    """
    Frontend polls this endpoint to see if there are any external commands (from ChatGPT ext)
    to execute.
    """
    if global_event_queue:
        # Return and clear the oldest event
        return global_event_queue.pop(0)
    return {}


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

@app.post("/api/audio")
async def upload_audio(file: UploadFile = File(...), face_emotion: str = Form("neutral"), gesture: str = Form("none")):
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
                is_wav = header[:4] == b'RIFF' and header[8:12] == b'WAVE'
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
        
        # Transcribe
        text = transcribe_audio_file(wav_filename)
        
        # Analyze Emotion (Audio)
        audio_emotion = analyze_emotion_file(wav_filename)
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

        # Fuse audio-detected emotion with face-camera emotion for richer context
        fused_emotion = fuse_emotions(audio_emotion, face_emotion)
        print(f"Fused Emotion → {fused_emotion} (audio={audio_emotion}, face={face_emotion})")

        # Process — pass both fused emotion and raw face emotion for conflict detection
        processed_result = process_input({
            "text": text,
            "emotion": fused_emotion,
            "face_emotion": face_emotion,   # raw camera emotion for conflict detection
            "gesture": gesture
        })
        response_text = processed_result["text"]
        response_emotion = processed_result["emotion"]
        
        # Generate Audio
        audio_file = speak(response_text, return_file=True)

        # Generate Face Animation using NVIDIA ACE
        face_animation = None
        if audio_file:
            face_animation = ace_client.process_audio(audio_file, emotion=response_emotion)
        
        # Determine animations (list)
        animations = []
        lower_resp = response_text.lower()
        
        if gesture and gesture != "none":
            if "thumbs_up" in gesture: animations.append("happy")
            elif "victory" in gesture: animations.append("dance")
            elif "wave" in gesture: animations.append("clap")
            elif "clap" in gesture: animations.append("clap")
            elif "dance" in gesture: animations.append("dance")
            elif "hug" in gesture: animations.append("happy")
            
        emo = response_emotion
        if not animations:
            if emo in ["happy", "funny"]: animations.append("happy")
            elif emo == "excited": animations.append("clap")
            elif emo == "sad": animations.append("sad")
            elif emo == "tired": animations.append("crouch")
            elif emo == "surprised": animations.append("jump")
            elif emo == "angry": animations.append("sad")
            elif emo == "grateful": animations.append("pray")
        
        if not animations:
            if "hug" in lower_resp: animations.append("happy")
            if "dance" in lower_resp: animations.append("dance")
            if "happy" in lower_resp or "laugh" in lower_resp: animations.append("happy")
            if "sad" in lower_resp or "cry" in lower_resp: animations.append("sad")
            if "clap" in lower_resp: animations.append("clap")
            if "pray" in lower_resp or "thanks" in lower_resp: animations.append("pray")
            if "jump" in lower_resp or "wow" in lower_resp: animations.append("jump")
        
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

@app.post("/api/correct-text")
async def correct_text(request: CorrectionRequest):
    """
    Correct spelling and grammar in user input.
    Fallback chain: Gemini 2.0 Flash → OpenRouter GPT-4o-mini → passthrough
    """
    raw = (request.text or "").strip()
    if not raw or len(raw) < 3:
        return {"corrected": raw, "original": raw, "changed": False, "corrections": []}

    correction_prompt = (
        "You are a spelling and grammar corrector. "
        "Your ONLY job is to fix spelling mistakes and obvious grammar errors in the user's input. "
        "Rules:\n"
        "1. Preserve the meaning and intent exactly.\n"
        "2. Preserve casual/conversational phrasing (do NOT make it formal).\n"
        "3. Do NOT add extra words, explanations, or punctuation unless it was clearly missing.\n"
        "4. If the text is already correct, return it EXACTLY as-is.\n"
        "5. Reply with ONLY the corrected text — nothing else.\n\n"
        f"Input: {raw}"
    )
    corrected = None
    import os
    from dotenv import load_dotenv
    load_dotenv()

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            model = genai.GenerativeModel("models/gemini-2.0-flash")
            result = model.generate_content(correction_prompt)
            corrected = (result.text or "").strip()
        except:
            corrected = None

    if not corrected:
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        if openrouter_key:
            try:
                from openai import OpenAI
                _client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=openrouter_key)
                completion = _client.chat.completions.create(
                    model="openai/gpt-4o-mini",
                    messages=[{"role": "user", "content": correction_prompt}],
                    temperature=0.1, max_tokens=200
                )
                corrected = (completion.choices[0].message.content or "").strip()
            except:
                corrected = None

    if not corrected:
        return {"corrected": raw, "original": raw, "changed": False, "corrections": []}

    if len(corrected) >= 2 and corrected[0] in ('"', "'") and corrected[-1] == corrected[0]:
        corrected = corrected[1:-1].strip()

    changed = corrected.lower() != raw.lower()
    corrections = []
    if changed:
        orig_words = raw.split()
        corr_words = corrected.split()
        for i in range(min(len(orig_words), len(corr_words))):
            if orig_words[i].lower() != corr_words[i].lower():
                corrections.append({"original": orig_words[i], "corrected": corr_words[i]})

    return {
        "corrected": corrected,
        "original": raw,
        "changed": changed,
        "corrections": corrections[:5]
    }

@app.get("/audio/{filename}")
async def get_audio(filename: str):
    print(f"[Audio endpoint] Requested: {filename}")
    file_path = os.path.abspath(filename)
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
            is_wav = header[:4] == b'RIFF' and header[8:12] == b'WAVE'
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
        from src.perception.audio import text_emotion_classifier
        if text_emotion_classifier:
            try:
                result = text_emotion_classifier(transcript)
                if result and result[0]:
                    text_emotion = result[0][0]['label'].lower()
            except Exception as e:
                print(f"Text emotion error: {e}")

    return JSONResponse({
        "success": bool(transcript and transcript.strip()),
        "transcript": transcript or "",
        "audio_emotion": audio_emotion,
        "text_emotion": text_emotion,
        "emotions": [
            {"emotion": audio_emotion, "source": "audio", "confidence": 0.85},
            {"emotion": text_emotion or "N/A", "source": "text", "confidence": 0.80} if text_emotion else None
        ]
    })
