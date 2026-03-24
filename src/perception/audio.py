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
                    
                    # Convert to numpy array to check amplitude
                    if sample_width == 2:  # 16-bit audio
                        audio_array = np.frombuffer(audio_data, dtype=np.int16)
                        max_amplitude = np.max(np.abs(audio_array))
                        mean_amplitude = np.mean(np.abs(audio_array))
                        
                        print(f"Audio Analysis: channels={channels}, sample_rate={framerate}Hz, duration={duration:.2f}s")
                        print(f"Audio Levels: max_amplitude={max_amplitude}, mean_amplitude={mean_amplitude:.1f}")
                        print(f"Audio Level %: max={max_amplitude/32768*100:.1f}%, mean={mean_amplitude/32768*100:.2f}%")
                        
                        # Warning if audio is too quiet
                        if max_amplitude < 500:
                            print("WARNING: Audio is extremely quiet! Max amplitude < 500")
                        elif max_amplitude < 2000:
                            print("WARNING: Audio is very quiet. Max amplitude < 2000")
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
                print("Whisper returned empty text - no speech detected")
                
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