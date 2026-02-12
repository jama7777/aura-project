import os
import sys

# Add src to path
sys.path.append(os.getcwd())

from src.perception.audio import transcribe_audio_file, analyze_emotion_file

# Us an existing file
test_file = "output.wav"

if not os.path.exists(test_file):
    print(f"Error: {test_file} not found. Cannot test.")
    sys.exit(1)

print(f"Testing audio processing on {test_file}...")

print("1. Testing Transcription...")
try:
    text = transcribe_audio_file(test_file)
    print(f"Transcription Result: '{text}'")
except Exception as e:
    print(f"Transcription FAILED: {e}")

print("\n2. Testing Emotion Analysis...")
try:
    emotion = analyze_emotion_file(test_file)
    print(f"Emotion Result: '{emotion}'")
except Exception as e:
    print(f"Emotion Analysis FAILED: {e}")

print("\nDone.")
