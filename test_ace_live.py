import os
import sys
from src.perception.nv_ace import ace_client

def test_ace():
    test_wav = "debug_last_audio.wav" # common file in root
    if not os.path.exists(test_wav):
        print(f"Test wav not found: {test_wav}")
        # Search for any wav
        import glob
        wavs = glob.glob("*.wav")
        if wavs:
            test_wav = wavs[0]
            print(f"Using {test_wav} instead.")
        else:
            print("No wav files found in root.")
            return

    print(f"Processing ACE with {test_wav}...")
    result = ace_client.process_audio(test_wav)

    if result:
        print(f"SUCCESS! Received {len(result)} frames.")
    else:
        print("FAILED to receive animation data.")

if __name__ == "__main__":
    test_ace()
