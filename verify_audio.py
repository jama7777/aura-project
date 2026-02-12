import sys
import os

# Add cwd to path
sys.path.append(os.getcwd())

from src.perception.audio import transcribe_audio_file, analyze_emotion_file

# Use an existing wav file
test_file = "output.wav" 
if not os.path.exists(test_file):
    print(f"Test file {test_file} not found.")
    # Try finding any wav
    files = [f for f in os.listdir('.') if f.endswith('.wav')]
    if files:
        test_file = files[0]
        print(f"Using {test_file} instead.")
    else:
        print("No wav files found.")
        sys.exit(1)

print(f"Testing audio processing on {test_file}...")

print("1. Transcription:")
text = transcribe_audio_file(test_file)
print(f"Result: '{text}'")

print("\n2. Emotion Analysis:")
emotion = analyze_emotion_file(test_file)
print(f"Result: '{emotion}'")
