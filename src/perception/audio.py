import whisper
import torchaudio
import torch

# Monkeypatch torchaudio.list_audio_backends for speechbrain compatibility
if not hasattr(torchaudio, "list_audio_backends"):
    torchaudio.list_audio_backends = lambda: ["soundfile"] # Mock return

import speechbrain as sb
from speechbrain.inference.classifiers import EncoderClassifier
import os
from transformers import pipeline

# Global model variables
model = None
emotion_model = None
text_emotion_classifier = None

def load_audio_models():
    global model, emotion_model
    if model is None:
        try:
            print("Loading Whisper model (base)...")
            model = whisper.load_model("base")
            print("Whisper model loaded.")
        except Exception as e:
            print(f"Error loading Whisper model: {e}")
            model = None


    if emotion_model is None:
        try:
            print("Loading Audio Emotion model (high-accuracy, 4 emotions)...")
            from transformers import pipeline
            emotion_model = pipeline(
                "audio-classification",
                model="superb/wav2vec2-base-superb-er",
                top_k=1
            )
            print("Audio Emotion model loaded (SUPERB, 4 emotions).")
        except Exception as e:
            print(f"Error loading emotion model: {e}")
            emotion_model = None

def load_text_emotion_model():
    global text_emotion_classifier
    if text_emotion_classifier is None:
        try:
            print("Loading text emotion model...")
            text_emotion_classifier = pipeline("text-classification", model="j-hartmann/emotion-english-distilroberta-base", top_k=1)
            print("Text emotion model loaded.")
        except Exception as e:
            print(f"Error loading Text Emotion model: {e}")
            text_emotion_classifier = None

def transcribe_audio_file(file_path):
    global model
    if model is None:
        load_audio_models()
    
    if model:
        try:
            # Debug: Analyze the audio file first
            import wave
            import numpy as np
            import shutil
            
            # Keep a copy for debugging
            debug_path = "debug_last_audio.wav"
            shutil.copy(file_path, debug_path)
            print(f"Debug audio saved to: {debug_path}")
            
            # Analyze the WAV file
            try:
                with wave.open(file_path, 'rb') as wf:
                    channels = wf.getnchannels()
                    sample_width = wf.getsampwidth()
                    framerate = wf.getframerate()
                    n_frames = wf.getnframes()
                    duration = n_frames / framerate
                    
                    # Read audio data
                    audio_data = wf.readframes(n_frames)
                    
                    # Convert to numpy array to check amplitude (Handle both 16-bit and 32-bit float)
                    audio_array = None
                    if sample_width == 2:
                        audio_array = np.frombuffer(audio_data, dtype=np.int16)
                        denom = 32768
                    elif sample_width == 4:
                        audio_array = np.frombuffer(audio_data, dtype=np.float32)
                        denom = 1.0
                    
                    if audio_array is not None:
                        max_amplitude = np.max(np.abs(audio_array))
                        mean_amplitude = np.mean(np.abs(audio_array))
                        
                        print(f"Audio Analysis: channels={channels}, rate={framerate}Hz, duration={duration:.2f}s")
                        print(f"Audio Levels: max={max_amplitude}, mean={mean_amplitude:.3f}")
                        print(f"Audio Level %: max={max_amplitude/denom*100:.1f}%, mean={mean_amplitude/denom*100:.2f}%")
                        
                        if max_amplitude < (denom * 0.015): # < 1.5% of max
                            print("WARNING: Audio is extremely quiet!")
                    else:
                        print(f"Audio: channels={channels}, sample_width={sample_width}, rate={framerate}, duration={duration:.2f}s")
            except Exception as e:
                print(f"Could not analyze WAV file: {e}")
            
            # Transcribe with Whisper
            print(f"Running Whisper transcription on: {file_path}")
            result = model.transcribe(file_path, language="en", fp16=False)
            text = result.get("text", "").strip()
            
            if text:
                print(f"Whisper Result: '{text}'")
            else:
                # Log if it's potentially silent
                print("Whisper returned empty text - no speech detected (Final Result)")
                
            return text
        except Exception as e:
            print(f"Error transcribing file: {e}")
            import traceback
            traceback.print_exc()
            return ""
    return ""

def analyze_emotion_file(file_path):
    global emotion_model
    if emotion_model is None:
        load_audio_models()

    if emotion_model:
        try:
            preds = emotion_model(file_path)
            top_pred = preds[0]
            label = top_pred['label'].lower()
            score = top_pred['score']

            # Map all model label variants → AURA emotion vocabulary
            label_map = {
                # XLS-R 8-emotion labels (ehcalabres/wav2vec2-lg-xlsr model)
                "angry":     "angry",
                "calm":      "neutral",
                "disgust":   "neutral",
                "fearful":   "sad",
                "fear":      "sad",
                "happy":     "happy",
                "neutral":   "neutral",
                "sad":       "sad",
                "surprise":  "surprised",
                "surprised": "surprised",
                # Old SUPERB abbreviations (fallback model)
                "neu":       "neutral",
                "hap":       "happy",
                "ang":       "angry",
                # Misc extras some models use
                "excited":   "happy",
                "boredom":   "neutral",
                "frustrated":"angry",
            }
            mapped = label_map.get(label, "neutral")
            print(f"[AudioEmotion] raw={label} ({score:.2f}) → mapped={mapped}")
            return mapped
        except Exception as e:
            print(f"Audio Emotion classification failed: {e}")
            return "neutral"
    
    return "neutral"

def analyze_text_sentiment(text: str) -> str:
    """
    Analyze the emotional sentiment of a text string (the transcribed speech).
    Returns AURA core vocabulary: [happy, sad, angry, surprised, neutral]
    """
    if not text or len(text.strip()) < 3:
        return "neutral"

    global text_emotion_classifier
    if text_emotion_classifier is None:
        load_text_emotion_model()

    if text_emotion_classifier:
        try:
            results = text_emotion_classifier(text)
            # Result is a list of dicts: [{'label': 'joy', 'score': 0.99}]
            if results and isinstance(results, list):
                # Handle both list and nested list formats from transformers
                data = results[0]
                if isinstance(data, list): data = data[0]
                
                label = data.get('label', 'neutral').lower()
                score = data.get('score', 0)

                # Map distilroberta-base-emotion labels to AURA core
                label_map = {
                    "joy":      "happy",
                    "sadness":  "sad",
                    "anger":    "angry",
                    "fear":     "sad",
                    "surprise": "surprised",
                    "disgust":  "neutral",
                    "neutral":  "neutral"
                }
                mapped = label_map.get(label, "neutral")
                print(f"[TextEmotion] raw={label} ({score:.2f}) -> mapped={mapped}")
                return mapped
        except Exception as e:
            print(f"Text emotion analysis failed: {e}")
            return "neutral"
    
    return "neutral"