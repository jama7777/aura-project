# 🤖 AURA Project - Beginner's Complete Guide

## Welcome! 👋

This guide explains **everything** about the AURA project in simple terms. No coding experience needed to understand this!

---

# 📖 Table of Contents

1. [What is AURA?](#-what-is-aura)
2. [What Can AURA Do?](#-what-can-aura-do)
3. [How Does It Work? (Simple Explanation)](#-how-does-it-work-simple-explanation)
4. [All The Technologies We Use](#-all-the-technologies-we-use)
5. [The Files In Our Project](#-the-files-in-our-project)
6. [Step-by-Step: What Happens When You Talk to AURA](#-step-by-step-what-happens-when-you-talk-to-aura)
7. [How to Run AURA](#-how-to-run-aura)
8. [Glossary (Technical Terms Explained)](#-glossary-technical-terms-explained)

---

# 🌟 What is AURA?

**AURA** stands for **A**utonomous **U**niversal **R**esponsive **A**ssistant.

Think of AURA as a **virtual friend** that lives on your computer screen. Unlike text-only chatbots (like ChatGPT), AURA has:

| Feature | Description |
|---------|-------------|
| 👤 **A Face** | A 3D animated character that moves and expresses emotions |
| 👄 **Moving Lips** | The mouth moves in sync when speaking (like a real person) |
| 👂 **Ears** | Can hear you through your microphone |
| 👀 **Eyes** | Can see you through your camera and detect your emotions |
| 🖐️ **Gesture Recognition** | Can see your hand gestures (thumbs up, peace sign, etc.) |
| 🧠 **Memory** | Remembers your past conversations |

**In simple words:** AURA is like having a virtual friend with a face who can see you, hear you, and respond like a real person!

---

# 🎯 What Can AURA Do?

## 1. 💬 Chat With You
Type messages and get responses, just like texting a friend.

## 2. 🎤 Listen to Your Voice
Click the microphone button and talk - AURA will understand what you say!

## 3. 😊 See Your Emotions
Turn on your camera, and AURA can tell if you're:
- Happy 😄
- Sad 😢
- Angry 😠
- Surprised 😲
- And more!

When AURA sees you're sad, it responds with empathy. When you're happy, it matches your energy!

## 4. 👋 Recognize Your Hand Gestures
Show these gestures to AURA:
| Gesture | What Happens |
|---------|--------------|
| ✌️ Peace/Victory | AURA does a dance! |
| 👍 Thumbs Up | AURA gets happy! |
| 🖐️ Open Palm | AURA claps! |
| ✊ Fist | AURA calms down |

## 5. 🗣️ Talk Back to You
AURA doesn't just type - it speaks out loud with a real voice!

## 6. 😀 Show Emotions
The 3D avatar shows emotions:
- Smiles when happy
- Frowns when sad
- Wide eyes when surprised
- And many more expressions!

## 7. 👄 Lip Sync
When AURA speaks, the mouth moves to match the words - just like a real person talking!

---

# 🔄 How Does It Work? (Simple Explanation)

Imagine AURA as a team of specialists working together:

```
YOU (User)
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                    YOUR BROWSER                          │
│                                                          │
│  📷 Camera catches your face                             │
│  🎤 Microphone catches your voice                        │
│  ⌨️  Keyboard catches your typing                        │
│  🖐️ Camera catches your hand gestures                    │
│                                                          │
│  📺 Shows the 3D character on screen                     │
│  🔊 Plays the voice response through speakers            │
└───────────────────────────┬─────────────────────────────┘
                            │
                     (sends to server)
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                 YOUR COMPUTER (Server)                   │
│                                                          │
│  👂 Understands your speech → converts to text           │
│  🧠 Thinks of a response → AI generates reply            │
│  🗣️ Creates voice → converts text to speech              │
│  👄 Creates lip movements → syncs with voice             │
└─────────────────────────────────────────────────────────┘
```

**Simple version:**
1. You talk/type/gesture
2. Computer understands what you did
3. AI thinks of a response
4. Avatar speaks and moves accordingly

---

# 🛠️ All The Technologies We Use

Let me explain EVERY technology in simple terms!

---

## 🐍 Backend (The "Brain" running on your computer)

### 1. **Python** 
| What is it? | A programming language |
|-------------|------------------------|
| **Simple explanation** | The language we write our code in. Like how English is a language for humans, Python is a language for computers. |
| **Why we use it** | It's easy to read and has lots of AI tools available |
| **In AURA** | All the server code is written in Python |

---

### 2. **FastAPI**
| What is it? | A web framework |
|-------------|-----------------|
| **Simple explanation** | Think of it as the "receptionist" of our app. When your browser sends a request ("I want to chat"), FastAPI receives it and directs it to the right place. |
| **Why we use it** | It's very fast and easy to use |
| **In AURA** | Handles all communication between your browser and the AI |

---

### 3. **Uvicorn**
| What is it? | A web server |
|-------------|--------------|
| **Simple explanation** | The "engine" that keeps FastAPI running. Like electricity powering a building. |
| **Why we use it** | It's fast and works great with FastAPI |
| **In AURA** | Runs our server so you can access AURA in your browser |

---

### 4. **OpenAI Whisper** 🎤➡️📝
| What is it? | Speech-to-Text AI |
|-------------|-------------------|
| **Simple explanation** | Converts your voice into text. You speak "Hello" and it types "Hello". |
| **Why we use it** | It's free, works offline, and understands many accents |
| **In AURA** | When you talk to AURA, Whisper converts your speech to text |

**Example:**
```
You say: "Hey AURA, how are you?"
Whisper outputs: "Hey AURA, how are you?"
```

---

### 5. **Coqui TTS** 📝➡️🔊
| What is it? | Text-to-Speech AI |
|-------------|-------------------|
| **Simple explanation** | The opposite of Whisper! Takes text and creates a real voice. |
| **Why we use it** | It's free, works offline, and sounds natural |
| **In AURA** | Gives AURA its voice! When AURA responds, this creates the audio |

**Example:**
```
Input text: "I'm doing great, thanks for asking!"
Output: 🔊 [Audio file of a voice saying those words]
```

---

### 6. **OpenRouter + GPT/Gemini** 🧠
| What is it? | AI Brain (Large Language Model) |
|-------------|--------------------------------|
| **Simple explanation** | This is the "intelligence" - it understands what you say and creates smart responses. Same technology as ChatGPT! |
| **Why we use it** | Creates human-like, intelligent responses |
| **In AURA** | The brain that thinks of what to say back to you |

**OpenRouter** is like a phone switchboard - it connects us to different AI models:
- **GPT-4o-mini** (by OpenAI) - Primary brain
- **Gemini** (by Google) - Backup brain

---

### 7. **ChromaDB** 💾
| What is it? | A memory database |
|-------------|-------------------|
| **Simple explanation** | AURA's memory! Stores past conversations so AURA can remember things about you. |
| **Why we use it** | Lets AURA have long-term memory |
| **In AURA** | Remembers that you told it your name, your hobbies, etc. |

**Example:**
```
Day 1 - You: "My name is Alex"
Day 5 - You: "What's my name?"
AURA: "Your name is Alex!" (remembered from ChromaDB)
```

---

### 8. **NVIDIA Audio2Face (ACE)** 👄😊
| What is it? | Lip Sync + Facial Emotion AI |
|-------------|------------------------------|
| **Simple explanation** | Analyzes audio and creates BOTH mouth movements AND facial emotions that match the speech! |
| **Why we use it** | Makes AURA's lips move realistically AND shows appropriate emotions while speaking |
| **In AURA** | Creates lip-sync animation + emotional facial expressions together |

**It does TWO things at once:**

**1️⃣ Lip Sync (Mouth Movements):**
```
Audio: "Hello there"
Output: 
  - Frame 1: Mouth slightly open (for "He-")
  - Frame 2: Lips together (for "-llo")
  - Frame 3: Tongue touches teeth (for "th-")
  - Frame 4: Mouth open wide (for "-ere")
```

**2️⃣ Facial Emotions (While Speaking):**
```
If AURA is responding happily:
  - Eyes squint slightly (happy eyes!)
  - Cheeks raise up
  - Smile while talking
  
If AURA is responding sadly:
  - Eyebrows go up in the middle
  - Mouth frowns
  - Eyes look down
```

**The magic:** AURA can smile WHILE talking, or look sad WHILE explaining something. The emotions and lip sync work TOGETHER in real-time!

**Example:**
```
AURA says: "I'm so happy to see you!"

What NVIDIA ACE creates:
  - Lips moving to form words ✓
  - Big smile on face ✓
  - Happy eye squint ✓
  - All at the same time! ✓
```

---

### 9. **Transformers (HuggingFace)** 😊
| What is it? | AI Model Library |
|-------------|------------------|
| **Simple explanation** | A collection of AI models. We use it for emotion detection. |
| **Why we use it** | Free, lots of pre-trained models available |
| **In AURA** | Detects emotion from your voice ("you sound happy!") |

---

### 10. **gRPC**
| What is it? | Communication protocol |
|-------------|----------------------|
| **Simple explanation** | A way for our app to talk to NVIDIA's servers. Like a special phone line. |
| **Why we use it** | NVIDIA requires it for their Audio2Face service |
| **In AURA** | Sends audio to NVIDIA and receives lip-sync data back |

---

## 🌐 Frontend (What you see in your browser)

### 11. **HTML**
| What is it? | Web page structure |
|-------------|-------------------|
| **Simple explanation** | The skeleton of a webpage. Defines what elements exist (buttons, text boxes, etc.) |
| **Why we use it** | All websites need HTML |
| **In AURA** | Creates the chat box, buttons, and containers |

---

### 12. **CSS**
| What is it? | Web page styling |
|-------------|------------------|
| **Simple explanation** | The "paint and decoration" of a webpage. Makes things look pretty! |
| **Why we use it** | Makes AURA look modern and beautiful |
| **In AURA** | The purple colors, glassy effects, rounded buttons, animations |

---

### 13. **JavaScript**
| What is it? | Web programming language |
|-------------|-------------------------|
| **Simple explanation** | Makes web pages interactive. HTML is the skeleton, CSS is the clothes, JavaScript is the muscles that make it move! |
| **Why we use it** | Needed for any interactive website |
| **In AURA** | Handles all user interactions, camera, microphone, animations |

---

### 14. **Three.js** 🎮
| What is it? | 3D Graphics Library |
|-------------|---------------------|
| **Simple explanation** | Allows us to show 3D objects in a web browser. Like a video game engine for websites! |
| **Why we use it** | We need to show a 3D character |
| **In AURA** | Renders the 3D avatar, handles animations, lighting, camera controls |

**What it does:**
- Shows the 3D character model
- Animates the character (walking, dancing, etc.)
- Creates lighting effects
- Lets you rotate the camera around the character

---

### 15. **GLTFLoader / FBXLoader**
| What is it? | 3D Model Loaders |
|-------------|------------------|
| **Simple explanation** | Tools that can read 3D model files and show them on screen |
| **Why we use it** | Our avatar is stored as a 3D file that needs to be loaded |
| **In AURA** | Loads the avatar model from the `rpm_avatar.glb` file |

---

### 16. **Face-API.js** 👤😊
| What is it? | Face Detection Library |
|-------------|----------------------|
| **Simple explanation** | Finds faces in camera video and detects emotions |
| **Why we use it** | So AURA can see how you're feeling! |
| **In AURA** | Detects your face and tells if you're happy, sad, angry, etc. |

**How it works:**
```
📷 Camera sees your face
    ⬇️
🔍 Face-API finds your face
    ⬇️
😊 Analyzes expression
    ⬇️
📊 Output: {happy: 0.8, neutral: 0.2}
    ⬇️
"You look happy!"
```

---

### 17. **MediaPipe Hands** 🖐️
| What is it? | Hand Tracking Library |
|-------------|----------------------|
| **Simple explanation** | Detects hands in camera and tracks finger positions |
| **Why we use it** | So AURA can see your hand gestures! |
| **In AURA** | Recognizes thumbs up, peace signs, waving, etc. |

**How it works:**
```
📷 Camera sees your hand
    ⬇️
🖐️ MediaPipe tracks 21 points on your hand
    ⬇️
✌️ Analyzes finger positions
    ⬇️
"That's a victory sign!"
```

---

### 18. **Web Audio API** 🎵
| What is it? | Browser Audio System |
|-------------|---------------------|
| **Simple explanation** | Built into your browser. Lets us analyze audio in real-time |
| **Why we use it** | To detect when you start/stop talking |
| **In AURA** | Voice Activity Detection - knows when you're speaking |

---

## 📦 3D Model

### 19. **Ready Player Me Avatar** 👤
| What is it? | 3D Character Model |
|-------------|-------------------|
| **Simple explanation** | The actual 3D character you see on screen |
| **Why we use it** | Has built-in face expressions (blendshapes) for lip-sync |
| **In AURA** | The visual representation of AURA |

**File format: GLB**
- Contains the 3D mesh (shape)
- Contains textures (colors/skin)
- Contains blendshapes (52 facial expressions!)

**Blendshapes are like facial sliders:**
```
jawOpen: 0.0 (closed) → 1.0 (wide open)
mouthSmileLeft: 0.0 (neutral) → 1.0 (big smile)
eyeBlinkLeft: 0.0 (open) → 1.0 (closed)
```

---

# 📁 The Files In Our Project

Let me explain what each file does:

## Main Files

| File | What it does | Analogy |
|------|--------------|---------|
| `server.py` | Runs the whole backend | The manager of a restaurant |
| `requirements.txt` | Lists all needed software | Shopping list for ingredients |
| `.env` | Stores secret API keys | A safe with passwords |

## Source Code (`src/`)

| File | What it does | Analogy |
|------|--------------|---------|
| `src/core/brain.py` | AI thinking & memory | The brain |
| `src/output/tts.py` | Text-to-speech | The voice box |
| `src/perception/audio.py` | Speech recognition | The ears |
| `src/perception/nv_ace.py` | Lip sync generation | The mouth muscles |

## Web Files (`web/static/`)

| File | What it does | Analogy |
|------|--------------|---------|
| `index.html` | Page structure | The house blueprint |
| `css/style.css` | Visual design | Interior decoration |
| `js/main.js` | Main logic | The house manager |
| `js/avatar.js` | 3D character | The puppet master |
| `js/gesture.js` | Hand tracking | The hand-watcher |

## Assets

| File | What it does |
|------|--------------|
| `assets/models/rpm_avatar.glb` | The 3D character model file |

---

# 🔄 Step-by-Step: What Happens When You Talk to AURA

Let's follow a complete conversation!

## You say: "Hello, how are you?"

### Step 1: 🎤 Recording Your Voice
```
Your microphone captures audio
↓
Browser detects you started talking (volume goes up)
↓
Browser detects you stopped talking (2 seconds of silence)
↓
Audio is saved as a file
```

### Step 2: 📤 Sending to Server
```
Browser sends the audio file to server
↓
URL: POST /api/audio
↓
Server receives the audio file
```

### Step 3: 👂 Understanding Your Speech (Whisper)
```
Audio file → Whisper AI
↓
Whisper analyzes the sound waves
↓
Output: "Hello, how are you?"
```

### Step 4: 😊 Detecting Your Emotion (wav2vec2)
```
Audio file → Emotion AI
↓
Analyzes tone of voice
↓
Output: "neutral" (or "happy", "sad", etc.)
```

### Step 5: 🧠 Thinking of a Response (GPT/Gemini)
```
Input to AI:
- Your message: "Hello, how are you?"
- Your emotion: "neutral"
- Past memories: [previous conversations]
- Instructions: "Be friendly, respond naturally"
↓
AI processes everything
↓
Output: "Hey there! I'm doing great, thanks for asking! [[happy]]"
```

### Step 6: 🗣️ Creating Voice (Coqui TTS)
```
Text: "Hey there! I'm doing great, thanks for asking!"
↓
TTS AI generates speech
↓
Output: audio_file.wav (the spoken words)
```

### Step 7: 👄 Creating Lip Sync (NVIDIA ACE)
```
Audio file → NVIDIA ACE servers
↓
AI analyzes each sound in the audio
↓
Output: Animation data
  - Time 0.0s: jawOpen=0.1, mouthSmile=0.6
  - Time 0.1s: jawOpen=0.4, mouthSmile=0.5
  - Time 0.2s: ...
  (30 frames per second!)
```

### Step 8: 📤 Sending Response Back
```
Server sends back:
{
  "text": "Hey there! I'm doing great!",
  "emotion": "happy",
  "audio_url": "/audio/response.wav",
  "face_animation": [lip sync frames],
  "animations": ["happy"]
}
```

### Step 9: 💬 Showing the Response
```
Browser displays message in chat bubble
↓
Plays audio through speakers
↓
Shows "happy" emotion on avatar's face
```

### Step 10: 👄 Syncing Lips
```
While audio plays:
↓
Every frame (60 times per second):
  1. Get current audio time (e.g., 0.5 seconds)
  2. Find matching animation frame
  3. Apply facial movements to 3D model
  4. Lips move in perfect sync!
```

### Step 11: 💾 Saving to Memory
```
Conversation saved to ChromaDB:
"User said hello → AURA responded happily"
↓
Next time, AURA remembers this interaction!
```

---

# 🚀 How to Run AURA

## What You Need First

1. **Python 3.10 or newer** - The programming language
   - Download: https://www.python.org/downloads/
   
2. **API Keys** (at least one):
   - **OpenRouter** (recommended): https://openrouter.ai/keys
   - Or **Google Gemini**: https://makersuite.google.com/app/apikey

## Steps to Run

### 1. Open Terminal
- **Mac**: Press `Cmd + Space`, type "Terminal", press Enter
- **Windows**: Press `Win + R`, type "cmd", press Enter

### 2. Go to Project Folder
```bash
cd /path/to/aura-project
```

### 3. Activate Virtual Environment
```bash
# Mac/Linux:
source venv/bin/activate

# Windows:
venv\Scripts\activate
```

You'll see `(venv)` appear in your terminal. This means it's working!

### 4. Run the Server
```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

### 5. Open in Browser
Go to: **http://localhost:8000**

### 6. Allow Permissions
- Click "Allow" when asked for camera access
- Click "Allow" when asked for microphone access

### 7. Start Chatting!
- Type in the text box, or
- Click the 🎤 microphone button to talk, or
- Click the 📷 camera button to enable emotion detection

---

# 📚 Glossary (Technical Terms Explained)

| Term | Simple Meaning |
|------|----------------|
| **API** | A way for different software to talk to each other (like a waiter taking orders between you and the kitchen) |
| **Backend** | The part that runs on the server (you don't see it) |
| **Frontend** | The part you see in your browser |
| **Server** | A computer (or program) that waits for requests and sends responses |
| **Client** | The browser that makes requests to the server |
| **Model (AI)** | A trained AI program that can do specific tasks |
| **Inference** | When an AI model makes a prediction |
| **Blendshapes** | Sliders that control facial expressions in 3D models |
| **Morph Targets** | Same as blendshapes (different name) |
| **TTS** | Text-to-Speech (text → voice) |
| **STT** | Speech-to-Text (voice → text) |
| **LLM** | Large Language Model (like ChatGPT) |
| **VAD** | Voice Activity Detection (knows when you're talking) |
| **Endpoint** | A URL that the server listens to (like `/api/chat`) |
| **gRPC** | A fast way for programs to communicate |
| **REST API** | A standard way to make web requests |
| **GLB/GLTF** | File format for 3D models |
| **FBX** | Another file format for 3D models |
| **ARKit** | Apple's standard for facial blendshape names |
| **Embeddings** | Numbers that represent meaning (for memory search) |
| **Vector Database** | A database that can search by meaning |
| **Latency** | Delay/waiting time |
| **Real-time** | Happens immediately, no waiting |

---

# ❓ Common Questions

### Q: Why do we need so many technologies?
**A:** Each technology is specialized for one job. It's like a hospital - you need different specialists (doctors, nurses, surgeons) working together. One AI for hearing, one for speaking, one for thinking, one for lip-syncing, etc.

### Q: Why does the camera need to be on localhost?
**A:** Browsers protect your privacy. They only allow camera/microphone access on secure connections (HTTPS) or localhost. Since we run locally, we use localhost.

### Q: Why use Ready Player Me avatars?
**A:** They come with 52 pre-made facial expressions (blendshapes) that work perfectly with NVIDIA's lip-sync. Making these ourselves would take months!

### Q: Is my data sent anywhere?
**A:** 
- Your voice/text goes to OpenRouter/Google for AI responses
- Audio goes to NVIDIA for lip-sync
- Conversations are stored locally on YOUR computer (ChromaDB)
- Camera/face data stays in your browser (never sent anywhere)

### Q: Can I use a different avatar?
**A:** Yes! You can upload any GLB/FBX model using the 👤 button. For best lip-sync, use avatars with ARKit blendshapes.

---

# 🎉 Congratulations!

You now understand how AURA works! 

**Summary:**
- AURA is a virtual friend with a 3D body
- It can hear you (Whisper), see you (Face-API), and talk back (TTS)
- The AI brain (GPT/Gemini) makes it intelligent
- The lip-sync (NVIDIA ACE) makes it realistic
- Everything runs on your computer (except AI calls)

**Want to contribute?** All the code is in the files mentioned above. Start with `server.py` for backend or `main.js` for frontend!

---

*Created with ❤️ for anyone curious about AI*
*Last updated: January 9, 2025*
