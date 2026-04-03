
import requests
import json
import time

URL = "http://localhost:1400/api/chat"
ANIMATE_URL = "http://localhost:1400/api/animate"

def test_chat_gesture(gesture="wave"):
    print(f"\n--- Testing Gesture: {gesture} ---")
    payload = {
        "text": "Hello there!",
        "emotion": "happy",
        "gesture": gesture,
        "provider": "local" # Use local to avoid API costs/delays if possible, essentially echo
    }
    
    try:
        start = time.time()
        print(f"Sending request to {URL}...")
        response = requests.post(URL, json=payload)
        elapsed = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response received in {elapsed:.2f}s")
            
            # Verify Animation
            anims = data.get("animations", [])
            print(f"Animations: {anims}")
            
            # Verify Face Animation (Lip Sync)
            face_anim = data.get("face_animation")
            if face_anim:
                print(f"✅ Face Animation Data present ({len(face_anim)} frames)")
            else:
                print("⚠️ Face Animation Data MISSING (Server might not have ACE connected or audio failed)")
                
            # Verify Audio
            audio_url = data.get("audio_url")
            print(f"Audio URL: {audio_url}")
            
            return True
        else:
            print(f"❌ Error: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

def test_animate_endpoint():
    print(f"\n--- Testing Direct Animation Endpoint ---")
    payload = {
        "text": "I am testing the direct animation system.",
        "emotion": "excited"
    }
    
    try:
        start = time.time()
        print(f"Sending request to {ANIMATE_URL}...")
        response = requests.post(ANIMATE_URL, json=payload)
        elapsed = time.time() - start
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Response received in {elapsed:.2f}s")
             # Verify keys
            print(f"Keys: {list(data.keys())}")
            
            face_anim = data.get("face_animation")
            if face_anim:
                 print(f"✅ Face Animation Data present ({len(face_anim)} frames)")
            else:
                 print("⚠️ Face Animation Data MISSING")
                 
            return True
        else:
            print(f"❌ Error: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

if __name__ == "__main__":
    print("Starting Integration Test...")
    
    # Test 1: Chat with Gesture
    test_chat_gesture("wave")
    
    # Test 2: Chat with Emotion that triggers animation
    test_chat_gesture("none") # Request has emotion: happy, should trigger happy animation
    
    # Test 3: Direct Animate
    # test_animate_endpoint()
