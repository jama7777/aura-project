import os
import sys
from src.perception.nv_ace import ace_client

# Pick a wav file to test
test_wav = "/Users/indra/Documents/aura-project/output_d576b7e0-30a1-426f-addb-2a44b1ab469a.wav"
if not os.path.exists(test_wav):
    print(f"Test wav not found: {test_wav}")
    sys.exit(1)

result = ace_client.process_audio(test_wav)

if result:
    print(f"Success! Received {len(result)} frames.")
    keys = sorted(list(result[0]['blendshapes'].keys()))
    print(f"All keys ({len(keys)}):")
    for i in range(0, len(keys), 5):
        print(", ".join(keys[i:i+5]))
else:
    print("Failed to receive animation data.")
