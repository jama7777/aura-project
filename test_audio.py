from src.perception.audio import analyze_emotion_file
import subprocess
try:
    subprocess.run(['say', '-o', 'test.wav', '--data-format=LEI16@16000', 'hello world, I am so angry right now'])
    print("Emotion:", analyze_emotion_file("test.wav"))
except Exception as e:
    print(f"Error: {e}")
