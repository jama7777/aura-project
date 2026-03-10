# AURA Project - Complete Technical Documentation

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Backend Components](#backend-components)
5. [Frontend Components](#frontend-components)
6. [AI & ML Models](#ai--ml-models)
7. [Key Features](#key-features)
8. [API Endpoints](#api-endpoints)
9. [How It Works](#how-it-works)
10. [Project Structure](#project-structure)
11. [Setup & Installation](#setup--installation)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)
14. [Future Improvements](#future-improvements)

---

## 🌟 Project Overview

**AURA (Autonomous Universal Responsive Assistant)** is an advanced, multimodal AI virtual assistant that combines:

- **3D Animated Avatar** with realistic lip-sync and emotional expressions
- **Natural Language Processing** for conversational AI
- **Speech Recognition & Synthesis** (Voice Input/Output)
- **Facial Emotion Detection** using computer vision
- **Hand Gesture Recognition** for touchless interaction
- **Persistent Memory** for contextual conversations

AURA represents the next generation of AI assistants, providing a human-like interaction experience through a web-based interface that combines visual, audio, and gestural input modalities.

### Vision
To create an AI companion that can see (camera), hear (microphone), and respond naturally through a lifelike 3D avatar, making human-computer interaction feel more personal and engaging.

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           WEB BROWSER                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Camera     │  │  Microphone  │  │      Text Input          │  │
│  │  (Emotion)   │  │   (Voice)    │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                 │                       │                 │
│         ▼                 ▼                       ▼                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Frontend (JavaScript)                      │  │
│  │   • main.js (Input Handling, UI)                              │  │
│  │   • avatar.js (Three.js 3D Rendering)                         │  │
│  │   • gesture.js (MediaPipe Hand Recognition)                   │  │
│  │   • Face-API.js (Emotion Detection)                           │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                       │
└─────────────────────────────┼───────────────────────────────────────┘
                              │ HTTP/REST API
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (FastAPI/Python)                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                         server.py                            │   │
│  │   • API Routing (FastAPI)                                    │   │
│  │   • Static File Serving                                      │   │
│  │   • Audio Processing Pipeline                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                 │                       │                 │
│         ▼                 ▼                       ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  brain.py    │  │   tts.py     │  │      nv_ace.py           │  │
│  │ (LLM/Memory) │  │  (Coqui TTS) │  │   (NVIDIA Audio2Face)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────┐  ┌──────────────┐                                │
│  │  audio.py    │  │  ChromaDB    │                                │
│  │  (Whisper)   │  │  (Memory)    │                                │
│  └──────────────┘  └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │      EXTERNAL SERVICES        │
              │   • OpenRouter (LLM API)      │
              │   • NVIDIA ACE (Lip Sync)     │
              │   • HuggingFace (Emotion)     │
              └───────────────────────────────┘
```

### Data Flow

1. **User Input** → Camera (Emotion), Microphone (Voice), or Text
2. **Frontend Processing** → Gesture/Emotion Detection (client-side)
3. **API Request** → Send to backend with emotion/gesture context
4. **Backend Processing**:
   - Speech-to-Text (Whisper)
   - Audio Emotion Analysis
   - LLM Response Generation (OpenRouter/Gemini)
   - Text-to-Speech Generation (Coqui TTS)
   - Lip-Sync Animation (NVIDIA ACE)
5. **Response** → Audio + Blendshape Animation Data
6. **Frontend Rendering** → Avatar lip-sync + body animation

---

## 🛠️ Technology Stack

### Backend Technologies

| Technology | Purpose | Version/Details |
|------------|---------|-----------------|
| **Python** | Core Language | 3.10+ |
| **FastAPI** | Web Framework | Async REST API |
| **Uvicorn** | ASGI Server | High-performance |
| **OpenAI Whisper** | Speech-to-Text | "tiny" model |
| **Coqui TTS** | Text-to-Speech | Tacotron2-DDC |
| **ChromaDB** | Vector Database | Persistent Memory |
| **SpeechBrain** | Audio Processing | wav2vec2 |
| **Transformers** | ML Pipeline | Emotion Detection |
| **gRPC** | Communication | NVIDIA ACE |

### Frontend Technologies

| Technology | Purpose | Version/Details |
|------------|---------|-----------------|
| **Three.js** | 3D Rendering | 0.160.0 |
| **GLTFLoader** | Model Loading | GLB/GLTF Support |
| **Face-API.js** | Face Detection | SSD MobileNet V1 |
| **MediaPipe Hands** | Gesture Recognition | Hand Landmarks |
| **Web Audio API** | Voice Activity Detection | Real-time |

### AI/ML Models

| Model | Provider | Purpose |
|-------|----------|---------|
| **GPT-4o-mini** | OpenAI (via OpenRouter) | Primary LLM |
| **Gemini 2.0 Flash** | Google (via OpenRouter) | Fallback LLM |
| **Whisper Tiny** | OpenAI | Speech Recognition |
| **Tacotron2-DDC** | Coqui | Speech Synthesis |
| **wav2vec2-superb-er** | HuggingFace | Audio Emotion |
| **emotion-distilroberta** | HuggingFace | Text Emotion |
| **NVIDIA Audio2Face** | NVIDIA ACE | Lip Sync |

### External Services

| Service | Purpose | API Type |
|---------|---------|----------|
| **OpenRouter** | LLM Gateway | REST API |
| **NVIDIA ACE (NVCF)** | Audio2Face-3D | gRPC |
| **HuggingFace** | Model Hosting | CDN |

---

## ⚙️ Backend Components

### 1. server.py (Main API Server)

**Location:** `/server.py`

The main FastAPI application serving as the central hub for all backend operations.

```python
# Key Features:
- FastAPI application with CORS middleware
- Static file serving (web/static, assets)
- Model loading on startup
- Three main API endpoints: /api/chat, /api/audio, /a2f
```

**Responsibilities:**
- Route handling for chat, audio, and lip-sync requests
- Orchestrating the AI pipeline
- Animation selection based on response emotion/keywords
- Audio file management

**Animation Logic:**
```python
# Priority Order:
1. Gesture Mapping (thumbs_up → happy, victory → dance, etc.)
2. LLM Emotion Mapping (happy → happy, sad → sad, etc.)
3. User Input Emotion (fallback)
4. Keyword Matching (dance, clap, pray, etc.)
5. Default: idle
```

---

### 2. brain.py (AI Processing Core)

**Location:** `/src/core/brain.py`

The cognitive center of AURA, handling:

```python
# Components:
- OpenRouter API Client (multi-model fallback)
- ChromaDB for persistent memory
- Emotion-tagged response generation
```

**System Prompt:**
AURA is designed to be an empathetic AI friend that:
- Acknowledges gestures immediately
- Responds to emotions appropriately
- Maintains conversation memory
- Tags responses with emotional state `[[emotion]]`

**Model Priority:**
1. `openai/gpt-4o-mini` (Primary)
2. `google/gemini-2.0-flash-exp:free` (Fallback)
3. `google/gemini-pro-1.5` (Fallback)

**Memory System:**
- Uses ChromaDB for semantic search
- Stores conversation history as embeddings
- Recalls relevant context for each query

---

### 3. audio.py (Speech Processing)

**Location:** `/src/perception/audio.py`

Handles all audio-related processing:

```python
# Functions:
- load_audio_models(): Loads Whisper and emotion models
- transcribe_audio_file(): Speech-to-text conversion
- analyze_emotion_file(): Audio emotion classification
- load_text_emotion_model(): Text-based emotion detection
```

**Speech Recognition:**
- Model: OpenAI Whisper (tiny)
- Input: WAV audio files
- Output: Transcribed text

**Audio Emotion Detection:**
- Model: `superb/wav2vec2-base-superb-er`
- Labels: neutral, happy, angry, sad
- Confidence-based classification

---

### 4. tts.py (Text-to-Speech)

**Location:** `/src/output/tts.py`

Generates natural speech from text responses.

```python
# Configuration:
- Model: tts_models/en/ljspeech/tacotron2-DDC
- Output: WAV files with unique UUIDs
- GPU: Disabled for compatibility
```

**Features:**
- Unique filename generation to prevent conflicts
- File-based output for streaming
- macOS compatible (afplay support)

---

### 5. nv_ace.py (NVIDIA ACE Lip Sync)

**Location:** `/src/perception/nv_ace.py`

Integrates NVIDIA Audio2Face for realistic lip-sync.

```python
# Configuration:
- URL: grpc.nvcf.nvidia.com:443
- Function ID: 8efc55f5-6f00-424e-afe9-26212cd2c630 (Mark model)
- Protocol: gRPC with SSL
```

**Process:**
1. Connect to NVIDIA Cloud Functions
2. Stream audio in chunks
3. Receive blendshape animation frames
4. Return time-coded blendshape data

**Emotion Mapping:**
```python
emo_map = {
    "happy": {"happiness": 1.0},
    "sad": {"sadness": 1.0},
    "surprised": {"amazement": 1.0},
    "angry": {"anger": 1.0},
    # ...
}
```

---

## 🖥️ Frontend Components

### 1. index.html (Main UI)

**Location:** `/web/static/index.html`

The entry point for the web application.

**Structure:**
- Canvas container for 3D avatar
- UI overlay with status bar
- Chat history container
- Control buttons (camera, mic, gestures)
- Hidden video element for camera feed

**External Dependencies:**
- Three.js (via importmap)
- Face-API.js (CDN)
- MediaPipe Hands (CDN)

---

### 2. main.js (Application Logic)

**Location:** `/web/static/js/main.js`

The main orchestrator for all frontend functionality.

**Key Features:**

```javascript
// Initialization
- Avatar setup (Three.js)
- Face-API model loading
- Gesture handler initialization
- Event listeners

// Security Check
- Detects insecure contexts (non-HTTPS)
- Disables camera/mic on insecure connections
```

**Voice Activity Detection (VAD):**
```javascript
// Thresholds
const speakThreshold = 15;    // Voice detection
const silenceThreshold = 5;   // Silence detection
const silenceDelay = 2000;    // 2 seconds before auto-stop
```

**Face Detection:**
- Uses SSD MobileNet V1 for accuracy
- 500ms detection interval
- Emotion-based auto-trigger (5s cooldown)

**Lip Sync Implementation:**
```javascript
// Features:
- Binary search for frame lookup
- Cubic interpolation between frames
- Phoneme-aware amplification (2x for mouth shapes)
- requestAnimationFrame for smooth sync
```

---

### 3. avatar.js (3D Avatar System)

**Location:** `/web/static/js/avatar.js`

Manages the 3D avatar rendering and animation.

**Scene Setup:**
```javascript
- Background: 0x111111 (dark)
- Fog: Distance-based
- Camera: 45° FOV, position (0, 150, 400)
- Lights: Hemisphere + Directional
- Ground: Plane with grid
```

**Model Loading:**
- Primary: GLB format (Ready Player Me)
- Fallback: OBJ format
- Auto-scaling to 150 units
- Morph target detection

**Blendshape Mapping:**
```javascript
// NVIDIA ACE → Ready Player Me mapping
aceToRpmMap = {
    'jawOpen': 'jawOpen',
    'mouthSmileLeft': 'mouthSmileLeft',
    'eyeBlinkLeft': 'eyeBlinkLeft',
    // 50+ mappings for full compatibility
}
```

**Emotion Expression System:**
```javascript
// Intensity levels
const STRONG = 0.7;
const MEDIUM = 0.5;
const LIGHT = 0.3;

// Emotions: happy, angry, sad, surprised, fear,
//           disgust, love, confused, thinking, neutral
```

**Fallback Mechanisms:**
1. Morph targets (primary)
2. Jaw bone rotation (secondary)
3. Head bone rotation (tertiary)
4. Model scale pulsing (last resort)

---

### 4. gesture.js (Hand Gesture Recognition)

**Location:** `/web/static/js/gesture.js`

Implements real-time hand gesture detection.

**Supported Gestures:**
| Gesture | Hand Position | Action |
|---------|---------------|--------|
| Victory ✌️ | Index + Middle open | Dance animation |
| Thumbs Up 👍 | Only thumb extended | Happy animation |
| Open Palm 🖐️ | All fingers open | Clap animation |
| Fist ✊ | All fingers closed | Idle |

**Detection Logic:**
```javascript
// Finger state detection
- isFingerOpen(): Tip Y < PIP Y
- isThumbOpen(): Tip distance > IP distance from pinky base

// Cooldown: 2 seconds between gestures
```

---

### 5. style.css (UI Styling)

**Location:** `/web/static/css/style.css`

Modern, glassmorphic UI design.

**Design System:**
```css
:root {
    --primary-color: #6c5ce7;     /* Purple */
    --secondary-color: #a29bfe;   /* Light Purple */
    --bg-color: #000000;          /* Black */
    --glass-bg: rgba(255, 255, 255, 0.1);
    --glass-border: rgba(255, 255, 255, 0.2);
}
```

**Key UI Elements:**
- Status bar with glassmorphism
- Chat bubbles with animations
- Circular control buttons
- Expandable text input
- Mirrored camera preview

---

## 🤖 AI & ML Models

### Large Language Model (LLM)

**Primary:** GPT-4o-mini via OpenRouter
- Context-aware responses
- Emotion tagging
- Gesture acknowledgment

**System Prompt Features:**
1. Immediate gesture response
2. Emotion-aware replies
3. Memory context integration
4. Concise, conversational tone
5. Emotion self-classification

### Speech Recognition

**Model:** OpenAI Whisper (tiny)
- Language: English
- Latency: Low (tiny model)
- Accuracy: Good for clear speech

### Text-to-Speech

**Model:** Tacotron2-DDC (Coqui TTS)
- Voice: LJSpeech (female)
- Quality: High
- Format: WAV 22050Hz

### Emotion Detection

**Audio:** wav2vec2-base-superb-er
- 4 classes: neutral, happy, angry, sad
- Real-time processing

**Text:** emotion-english-distilroberta-base
- 7 classes: anger, disgust, fear, joy, neutral, sadness, surprise
- Context-aware

**Visual:** Face-API.js (SSD MobileNet V1)
- 7 classes: angry, disgusted, fearful, happy, neutral, sad, surprised
- Confidence-weighted

### Lip Sync (NVIDIA ACE)

**Service:** Audio2Face-3D (Mark Model)
- 52 ARKit blendshapes
- Time-coded animation frames
- Emotion-enhanced expressions

---

## ✨ Key Features

### 1. Multimodal Input
- **Text:** Direct typing
- **Voice:** Microphone with VAD
- **Camera:** Facial emotion detection
- **Gestures:** Hand recognition

### 2. Realistic Avatar
- **3D Model:** Ready Player Me GLB
- **Lip Sync:** NVIDIA ACE integration
- **Expressions:** ARKit blendshapes
- **Animations:** Emotion-reactive

### 3. Conversational Memory
- **Storage:** ChromaDB (persistent)
- **Retrieval:** Semantic search
- **Context:** 3 most relevant memories

### 4. Emotion Intelligence
- **Detection:** From voice, text, and face
- **Expression:** Avatar facial expressions
- **Response:** Emotion-appropriate replies

### 5. Interactive Gestures
- **Recognition:** MediaPipe Hands
- **Mapping:** Gesture → Animation
- **Feedback:** Immediate visual response

---

## 🔌 API Endpoints

### POST `/api/chat`

Text-based conversation with the AI.

**Request:**
```json
{
    "text": "Hello, how are you?",
    "emotion": "happy",
    "gesture": "none"
}
```

**Response:**
```json
{
    "text": "I'm doing great, thanks!",
    "emotion": "happy",
    "audio_url": "/audio/output_uuid.wav",
    "animations": ["happy"],
    "face_animation": [
        {"time": 0.0, "blendshapes": {"jawOpen": 0.5, ...}},
        {"time": 0.033, "blendshapes": {...}}
    ]
}
```

---

### POST `/api/audio`

Process voice input from microphone.

**Request:**
- `file`: WAV audio file (multipart/form-data)

**Response:**
```json
{
    "input_text": "Hello there",
    "input_emotion": "happy",
    "text": "Hi! Nice to hear from you!",
    "emotion": "happy",
    "audio_url": "/audio/output_uuid.wav",
    "animations": ["happy"],
    "face_animation": [...]
}
```

---

### POST `/a2f`

Generate lip-sync animation from audio.

**Request:**
```json
{
    "audioPath": "output_uuid.wav",
    "emotion": "happy"
}
```

**Response:**
```json
{
    "blendshapes": [
        {"time": 0.0, "blendshapes": {"jawOpen": 0.5, ...}},
        ...
    ]
}
```

---

### GET `/audio/{filename}`

Retrieve generated audio files.

**Response:** WAV audio file

---

### GET `/`

Serve the main web application.

**Response:** `web/static/index.html`

---

## 🔄 How It Works

### Complete Interaction Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                            USER INPUT                               │
│     Text Input  │  Voice Recording  │  Emotion Detection │ Gesture │
└────────┬────────┴─────────┬─────────┴──────────┬─────────┴────┬────┘
         │                  │                     │              │
         ▼                  ▼                     ▼              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND PROCESSING                          │
│  • Collect all input modalities                                      │
│  • Detect gestures (MediaPipe)                                       │
│  • Detect facial emotions (Face-API)                                 │
│  • Record audio with VAD                                             │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼ API Request
┌──────────────────────────────────────────────────────────────────────┐
│                         BACKEND PROCESSING                           │
│                                                                      │
│  1. Speech-to-Text (Whisper)                                         │
│     Input: audio.wav → Output: "transcribed text"                    │
│                                                                      │
│  2. Audio Emotion Analysis (wav2vec2)                                │
│     Input: audio.wav → Output: "happy"                               │
│                                                                      │
│  3. LLM Processing (OpenRouter)                                      │
│     Input: text + emotion + gesture + memory context                 │
│     Output: response text + response emotion                         │
│                                                                      │
│  4. Text-to-Speech (Coqui TTS)                                       │
│     Input: response text → Output: output.wav                        │
│                                                                      │
│  5. Lip Sync Generation (NVIDIA ACE)                                 │
│     Input: output.wav + emotion                                      │
│     Output: blendshape animation frames                              │
│                                                                      │
│  6. Animation Selection                                              │
│     Input: emotion + keywords                                        │
│     Output: animation names ["happy", "dance", ...]                  │
│                                                                      │
│  7. Memory Storage (ChromaDB)                                        │
│     Store: query + response for future context                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼ API Response
┌──────────────────────────────────────────────────────────────────────┐
│                         FRONTEND RENDERING                           │
│                                                                      │
│  1. Display Response Text (chat bubble)                              │
│                                                                      │
│  2. Play Response Audio                                              │
│                                                                      │
│  3. Animate Lip Sync                                                 │
│     • Binary search for current frame                                │
│     • Interpolate between frames                                     │
│     • Apply blendshapes with amplification                           │
│     • Apply emotion modifiers                                        │
│                                                                      │
│  4. Play Body Animation                                              │
│     • Transition to emotion-appropriate animation                    │
│     • Return to idle after completion                                │
│                                                                      │
│  5. Update Facial Expression                                         │
│     • Smooth transition to response emotion                          │
└──────────────────────────────────────────────────────────────────────┘
```

### Lip Sync Technical Details

1. **Frame Acquisition:**
   - NVIDIA ACE returns ~30fps blendshape data
   - Each frame: `{time: float, blendshapes: {name: value}}`

2. **Synchronization:**
   - Use `audio.currentTime` for timing
   - Binary search for closest frame
   - Cubic interpolation between frames

3. **Amplification:**
   - Mouth shapes (phonemes): 2x boost
   - General shapes: 1.5x boost
   - Clamp to 0-1 range

4. **Emotion Overlay:**
   - Add emotion-specific blendshapes
   - Layer on top of speech animation
   - Smooth transitions between emotions

---

## 📁 Project Structure

```
aura-project/
├── server.py                    # FastAPI main application
├── requirements.txt             # Python dependencies
├── SETUP.md                     # Setup instructions
├── WEB_UI_INSTRUCTIONS.md       # UI usage guide
├── README.md                    # Project readme
│
├── src/
│   ├── core/
│   │   └── brain.py             # LLM + Memory logic
│   ├── output/
│   │   └── tts.py               # Text-to-Speech
│   └── perception/
│       ├── audio.py             # Speech recognition + emotion
│       └── nv_ace.py            # NVIDIA ACE lip sync
│
├── web/
│   └── static/
│       ├── index.html           # Main HTML page
│       ├── css/
│       │   └── style.css        # Styling
│       └── js/
│           ├── main.js          # Main application logic
│           ├── avatar.js        # 3D avatar rendering
│           └── gesture.js       # Hand gesture recognition
│
├── assets/
│   └── models/
│       ├── rpm_avatar.glb       # Primary avatar (Ready Player Me)
│       ├── character.fbx        # Backup FBX model
│       ├── character.obj        # Backup OBJ model
│       └── character.mtl        # OBJ materials
│
├── aura_memory.db/              # ChromaDB persistent storage
├── output/                      # Generated audio files
├── docs/                        # Documentation
│   └── PROJECT_DOCUMENTATION.md # This file
│
├── test_gemini.py               # API testing scripts
├── test_ace_connection.py       # ACE connection test
├── diagnose.py                  # Diagnostic utilities
└── list_models.py               # Model listing utility
```

---

## 🚀 Setup & Installation

### Prerequisites

- **Python 3.10+** (3.11 recommended)
- **Git** for version control
- **8GB+ RAM** (16GB recommended)
- **~5GB disk space** for models

### Installation Steps

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/aura-project.git
cd aura-project

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# or: venv\Scripts\activate  # Windows

# 3. Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# 4. Set up environment variables
touch .env
# Add: GOOGLE_API_KEY=your_key
# Add: NV_API_KEY=your_nvidia_key (optional)
# Add: OPENROUTER_API_KEY=your_key

# 5. Run the server
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Access the Application

Open: `http://localhost:8000`

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes* | Google Gemini API key |
| `OPENROUTER_API_KEY` | Yes* | OpenRouter API key |
| `NV_API_KEY` | Optional | NVIDIA ACE API key |
| `OPENAI_API_KEY` | Optional | OpenAI API key |

*One LLM API key is required

### API Keys Setup

1. **OpenRouter:** https://openrouter.ai/keys
2. **Google Gemini:** https://makersuite.google.com/app/apikey
3. **NVIDIA ACE:** https://build.nvidia.com/

### Avatar Model

The default avatar is a Ready Player Me GLB model with ARKit blendshapes.

**To use custom avatar:**
1. Create at https://readyplayer.me/
2. Export with "ARKit Morph Targets" enabled
3. Place at `assets/models/rpm_avatar.glb`

---

## 🔧 Troubleshooting

### Common Issues

#### "Camera/Mic not working"
- Access via `http://localhost:8000` (not IP address)
- Or use HTTPS for remote access
- Check browser permissions

#### "Avatar not loading"
- Verify `assets/models/rpm_avatar.glb` exists
- Check browser console for errors
- Clear cache: Ctrl+Shift+R

#### "No lip sync"
- Ensure `NV_API_KEY` is set
- Check console for gRPC errors
- Fallback to bone animation works without ACE

#### "AI not responding"
- Verify API keys in `.env`
- Check OpenRouter balance
- Review console for model errors

#### "Port 8000 in use"
```bash
lsof -i :8000  # Find process
kill -9 <PID>   # Kill process
# Or use different port:
uvicorn server:app --port 8001
```

---

## 🔮 Future Improvements

### Planned Features

1. **Multi-language Support**
   - Multilingual TTS
   - Language detection
   - Translation pipeline

2. **Enhanced Animations**
   - Full body motion capture
   - Dance generation from music
   - Custom animation import

3. **Advanced Memory**
   - Long-term relationship tracking
   - Preference learning
   - Conversation summarization

4. **Mobile Support**
   - Progressive Web App (PWA)
   - Touch gesture support
   - Responsive design

5. **Custom Avatars**
   - Avatar customization UI
   - Multiple avatar support
   - VRM format support

6. **Plugin System**
   - Tool use (web search, calendar)
   - Smart home integration
   - Custom skill modules

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Dec 2024 | Initial release with core features |
| 1.1.0 | Dec 2024 | Added NVIDIA ACE lip sync |
| 1.2.0 | Dec 2024 | Improved emotion detection |
| 1.3.0 | Dec 2024 | Ready Player Me avatar support |
| 1.4.0 | Jan 2025 | Enhanced blendshape mapping |

---

## 📄 License

[MIT License / Your License Here]

---

## 👥 Contributors

- Developer: [Your Name]
- AI Assistance: Claude (Anthropic)

---

## 📞 Support

For issues and feature requests, please open a GitHub issue.

---

*Documentation generated on: January 9, 2025*
*Last updated: February 23, 2026*

---

## 🔄 Step-by-Step Input Flow & Output Pipeline

This section provides a **complete, granular trace** of how every input travels through AURA and becomes a rich, animated response.

---

### 🏗️ System-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     BROWSER (Frontend)                           │
│   index.html ← main.js ← avatar.js, gesture.js, face_emotion.js │
└────────────────────────┬─────────────────────────────────────────┘
                         │ HTTP fetch API
┌────────────────────────▼─────────────────────────────────────────┐
│               FastAPI SERVER  (server.py)                        │
│   /api/chat   /api/audio   /a2f   /api/animate   /api/updates    │
└──────┬──────────────┬───────────────────────┬────────────────────┘
       │              │                       │
  brain.py        audio.py             tts.py + nv_ace.py
  (AI/LLM)    (Whisper+Emotion)     (Voice + Lip Sync)
```

---

### 📥 INPUT PATH 1 — Text Chat

**Flow:** User types → AI processes → Avatar responds

| Step | File | What Happens |
|------|------|--------------|
| **1** | `index.html` | User types in `<input id="text-input">` and presses Enter or clicks Send |
| **2** | `main.js → sendMessage()` | Reads the text, calls local `detectEmotionFromText()` using keyword matching (e.g. "happy", "sad", "love") |
| **3** | `main.js` | Sends `POST /api/chat` with `{ text, emotion }` JSON body |
| **4** | `server.py → /api/chat` | Receives the request and calls `process_input()` from `brain.py` |
| **5** | `brain.py → process_input()` | Queries **ChromaDB memory** for the 3 most relevant past interactions, then constructs a prompt: `"User said: '...' Emotion: ... Gesture: ..."` |
| **6** | `brain.py` | Calls **NVIDIA NIM** (llama3-70b) or **OpenRouter** (GPT-4o-mini). LLM reply ends with `[[emotion]]` tag e.g. `"Sure! [[happy]]"`. Regex extracts the emotion. |
| **7** | `server.py` | Calls `speak(response_text)` → `tts.py` generates a `.wav` audio file via **Coqui TTS** (Tacotron2-DDC model), saved with a UUID filename |
| **8** | `server.py` | Calls `ace_client.process_audio()` → `nv_ace.py` sends the WAV to **NVIDIA ACE Audio2Face-3D** via gRPC and receives per-frame blendshape weights for lip sync |
| **9** | `server.py` | Determines body animations via priority: Gesture → LLM Emotion → User Emotion → keywords → `"idle"` |
| **10** | `server.py` | Returns JSON: `{ text, emotion, audio_url, animations[], face_animation[] }` |
| **11** | `main.js → handleResponse()` | Calls `avatar.transitionToEmotion()`, plays audio, starts `startFaceSync()` using `requestAnimationFrame` |
| **12** | `avatar.js` | 3D avatar performs body animation + real-time facial blendshapes synced to audio playback |

---

### 🎤 INPUT PATH 2 — Voice (Microphone)

**Flow:** User speaks → recording → transcription → AI processes → Avatar responds

| Step | File | What Happens |
|------|------|--------------|
| **1** | `main.js → toggleMicrophone()` | User clicks mic button → `startRecording()` is called |
| **2** | `main.js → startRecording()` | `navigator.mediaDevices.getUserMedia()` opens microphone. `MediaRecorder` records in **webm/opus or mp4** (chunks every 500ms) |
| **3** | `main.js → stopRecording()` | User clicks again → recording stops, `onstop` fires → `sendAudioToServer()` |
| **4** | `main.js → sendAudioToServer()` | Plays back the recording locally first (user hears themselves), then calls `sendToServerForTranscription()` |
| **5** | `main.js` | Audio blob sent as `FormData` via `POST /api/audio` |
| **6** | `server.py → /api/audio` | Receives file. Checks RIFF/WAVE header. If not WAV, **FFmpeg** converts to 16kHz mono WAV |
| **7** | `audio.py → transcribe_audio_file()` | **OpenAI Whisper (tiny model)** transcribes speech → returns text string. Saves a debug copy to `debug_last_audio.wav` |
| **8** | `audio.py → analyze_emotion_file()` | **wav2vec2-base-superb-er** (HuggingFace) classifies audio tone → returns "neutral", "happy", "angry", or "sad" |
| **9** | `server.py` | Calls `process_input({text, emotion})` → same LLM + Memory pipeline as the text path |
| **10** | `server.py` | Generates TTS audio + NVIDIA ACE lip sync frames + body animations |
| **11** | `main.js` | Displays transcribed text as user message, calls `handleResponse()` → avatar animates and speaks |

---

### 📷 INPUT PATH 3 — Camera (Face Emotion + Hand Gesture)

These two sub-systems run **continuously in the background** while the camera is on.

---

#### 😊 Sub-path A: Face Emotion Detection

**Flow:** Camera feed → face-api.js → smoothed emotion → Avatar reacts

| Step | File | What Happens |
|------|------|--------------|
| **1** | `main.js → toggleCamera()` | User clicks camera button → `getUserMedia({ video: true })` opens webcam |
| **2** | `main.js → startFaceDetection()` | Creates `FaceEmotionDetector` instance from `face_emotion.js` |
| **3** | `face_emotion.js → _detect()` | Every **120ms**, sends a video frame to **face-api.js TinyFaceDetector** (224×224 input, score threshold 0.4) |
| **4** | `face_emotion.js` | Gets 7 raw expression scores: happy, sad, angry, surprised, disgusted, fearful, neutral from **faceExpressionNet** |
| **5** | `face_emotion.js` | Picks the frame winner only if `score > 0.55` (CONF_THRESHOLD), else defaults to neutral |
| **6** | `face_emotion.js` | Applies **12-frame rolling majority vote** — dominant emotion must win ≥ 45% of window |
| **7** | `face_emotion.js` | **Stability gate**: dominant emotion must hold for **1200ms** before emitting to avoid flickers |
| **8** | `main.js → onEmotion callback` | Updates `currentEmotion` variable, updates status bar text, shows emotion on avatar face via `avatar.showEmotion()` |
| **9** | `main.js` | **Auto-trigger** logic: if emotion sustained 1.5s + confidence >0.35 + 6s cooldown + AURA not talking → sends `POST /api/chat` with detected emotion for a full AI reaction |

---

#### 👋 Sub-path B: Hand Gesture Recognition

**Flow:** Camera feed → MediaPipe Hands → Landmark analysis → Gesture → AI reacts

| Step | File | What Happens |
|------|------|--------------|
| **1** | `gesture.js → GestureHandler.init()` | Initializes **MediaPipe Hands** CDN model (1 hand max, min confidence 0.5) |
| **2** | `gesture.js → processVideo()` | Each `requestAnimationFrame`, sends the video element to `this.hands.send()` |
| **3** | `gesture.js → detectGesture()` | Analyzes 21 hand landmarks; classifies finger open/closed by comparing tip Y vs PIP joint Y |
| **4** | `gesture.js` | Classifies into: `victory` ✌️ (index+middle open), `thumbs_up` 👍 (thumb only, pointing up), `open_palm` 🖐️ (all open), `fist` ✊ (all closed) |
| **5** | `gesture.js → triggerAction()` | Immediately plays a local avatar animation for instant visual feedback (dance, happy, clap, idle) |
| **6** | `main.js → GestureHandler callback` | **Guard check**: if AURA is currently speaking (`isAuraTalking = true`), the gesture is silently ignored |
| **7** | `main.js` | If AURA is not talking and a 2s cooldown has passed → sends `POST /api/chat` with `{ gesture, emotion }` |
| **8** | `brain.py` | LLM generates gesture-aware response (e.g., "Peace! ✌️", "Awesome! 👍", "High five! 🖐️") |
| **9** | Avatar responds | Full pipeline: voice output + lip sync + body animation |

---

### 📤 OUTPUT PIPELINE (All Paths Share This)

```
AI Response Text
     │
     ▼
[TTS — Coqui Tacotron2-DDC]
     → Generates output_<uuid>.wav audio file
     │
     ▼
[NVIDIA ACE Audio2Face-3D — gRPC]
     → Sends WAV audio + emotion weights
     → Receives per-frame blendshape data (52 ARKit shapes @ ~30fps)
     │
     ▼
[server.py]
     → Returns complete JSON response
     │
     ▼
[main.js → handleResponse()]
     ├── addMessage()              → text appears in chat bubble
     ├── avatar.transitionToEmotion() → body animation starts
     ├── new Audio(audio_url).play()  → voice plays in browser
     ├── startFaceSync()           → real-time lip sync loop begins
     │     └── requestAnimationFrame loop:
     │           ├── Binary search: find frame closest to audio.currentTime
     │           ├── Cubic interpolation between frames (smooth)
     │           ├── Phoneme boost: 2.0x for mouth shapes, 1.5x for others
     │           └── avatar.updateFace(blendshapes, emotion)
     └── avatar.playSequence(animations[])
           └── Returns to 'idle' when sequence completes
```

---

### 🎭 Avatar Output Layers

| Layer | What It Controls | Technology |
|-------|----------------|------------|
| **Lip Sync** | Jaw, mouthOpen, phoneme shapes (mouthFunnel, mouthPucker, etc.) | NVIDIA ACE gRPC blendshapes |
| **Facial Expression** | eyeWide, browDown, mouthSmile, mouthFrown, cheekPuff | face-api.js + emotion mapping |
| **Body Animation** | Full body: idle, dance, happy, sad, clap, pray, jump, crouch | FBX animations via Three.js |
| **Voice** | TTS audio playback in browser | Coqui TTS Tacotron2-DDC |

---

### 🧠 Memory System (ChromaDB)

Every interaction is **saved and recalled** automatically:

```
User sends a message
     ↓
brain.py queries ChromaDB for top-3 similar past interactions
     ↓
Context is injected into the LLM prompt:
   "Memory Context: [past_entry_1], [past_entry_2], [past_entry_3]"
     ↓
LLM generates a contextually aware response
     ↓
brain.py saves the new interaction:
   "User said: '...' Emotion: ... → AURA: '...'"
     ↓
Stored permanently in ./aura_memory.db (ChromaDB)
```

---

### 🔌 Chrome Extension / External App Flow

An additional input path allows external AI apps (ChatGPT, Grok, etc.) to drive the avatar:

```
Chrome Extension or External App
     ↓
POST /api/animate  { text: "...", emotion: "..." }
     ↓
server.py generates TTS + ace lip sync + animations
server.py pushes to global_event_queue[]
     ↓
main.js polls GET /api/updates every 1 second
     ↓
If queue has data → handleResponse() → Avatar speaks
```

---

### 🔒 Talking Guard System

A critical system-level guard prevents race conditions:

```javascript
let isAuraTalking = false;

// Set TRUE when audio starts playing
audio.play().then(() => { isAuraTalking = true; });

// Set FALSE when audio ends
audio.onended = () => { isAuraTalking = false; };

// Face emotion and gesture auto-triggers check this flag:
if (isAuraTalking) return; // ← silently skip while AURA is speaking
```
This ensures that face emotion detections and hand gestures never interrupt or stack on an ongoing AURA reply.

---

### 📁 Key Files — Quick Reference

| File | Role |
|------|------|
| `server.py` | FastAPI backend — all API routes, response assembly |
| `src/core/brain.py` | AI brain — LLM calls + ChromaDB memory |
| `src/perception/audio.py` | Whisper STT + wav2vec2 audio emotion |
| `src/output/tts.py` | Coqui TTS voice generation |
| `src/perception/nv_ace.py` | NVIDIA ACE lip sync via gRPC |
| `web/static/js/main.js` | Frontend orchestrator — all UI events and pipeline coordination |
| `web/static/js/avatar.js` | Three.js 3D avatar control and animation |
| `web/static/js/gesture.js` | MediaPipe Hands gesture recognition |
| `web/static/js/face_emotion.js` | face-api.js facial emotion detection with majority-vote smoothing |

---

*Step-by-Step Flow section added: February 23, 2026*

