"""
Audio perception module - Fallback implementation using faster-whisper
"""

_audio_available = False

try:
    from faster_whisper import WhisperModel
    _whisper_model = None
    
    def load_audio_models():
        global _whisper_model
        try:
            print("Loading Faster Whisper model (base)...")
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
            print("Faster Whisper model loaded.")
        except Exception as e:
            print(f"Error loading Whisper model: {e}")
            _whisper_model = None
    
    def transcribe_audio_file(audio_path):
        global _whisper_model
        if _whisper_model is None:
            load_audio_models()
        if _whisper_model is None:
            return "Transcription unavailable"
        try:
            segments, info = _whisper_model.transcribe(audio_path)
            text = " ".join([seg.text for seg in segments])
            return text
        except Exception as e:
            print(f"Transcription error: {e}")
            return "Transcription failed"
    
    _audio_available = True
    print("[Audio] Faster Whisper loaded successfully")
    
except ImportError as e:
    print(f"[Audio] faster-whisper not available: {e}")
    
    def load_audio_models():
        print("[Audio] No audio models available")
    
    def transcribe_audio_file(audio_path):
        return "Transcription unavailable"

# Audio emotion analysis - simplified fallback
def analyze_emotion_file(audio_path):
    """Analyze emotion from audio file - simplified fallback"""
    return "neutral"

def load_text_emotion_model():
    """Load text emotion model - fallback"""
    return None

text_emotion_classifier = None

def analyze_text_sentiment(text: str) -> str:
    """Analyze text sentiment - fallback"""
    return "neutral"
