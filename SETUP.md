# AURA Project - Setup Guide

This guide explains how to set up and run the AURA AI Assistant on any computer.

## 📋 Prerequisites

### System Requirements
- **OS**: macOS, Linux, or Windows 10/11
- **Python**: 3.10 or 3.11 (recommended)
- **RAM**: 8GB minimum (16GB recommended for faster model loading)
- **Storage**: ~5GB free space for models and dependencies
- **GPU**: Optional but recommended (CUDA for NVIDIA, MPS for Apple Silicon)

### Required Software
1. **Python 3.10+**: [Download Python](https://www.python.org/downloads/)
2. **Git**: [Download Git](https://git-scm.com/downloads)
3. **Node.js** (optional, for advanced frontend dev): [Download Node.js](https://nodejs.org/)

---

## 🚀 Installation Steps

### Step 1: Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/aura-project.git
cd aura-project
```

Or download and extract the ZIP file.

### Step 2: Create Virtual Environment

**macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**Windows (Command Prompt):**
```cmd
python -m venv venv
venv\Scripts\activate
```

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### Step 3: Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

> ⚠️ **Note for Apple Silicon (M1/M2/M3):**
> PyTorch will automatically use MPS (Metal Performance Shaders) for acceleration.

> ⚠️ **Note for NVIDIA GPU users:**
> Install PyTorch with CUDA support:
> ```bash
> pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
> ```

### Step 4: Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# Create .env file
touch .env  # macOS/Linux
# or: type nul > .env  # Windows
```

Add your API keys to `.env`:

```env
# Required: Google Gemini API Key (for AI responses)
GOOGLE_API_KEY=your_gemini_api_key_here

# Optional: OpenAI API Key (if using OpenAI models)
OPENAI_API_KEY=your_openai_api_key_here

# Optional: NVIDIA ACE API Key (for enhanced lip sync)
NV_API_KEY=your_nvidia_ace_api_key_here
```

**Get your API keys:**
- **Google Gemini**: https://makersuite.google.com/app/apikey
- **OpenAI**: https://platform.openai.com/api-keys
- **NVIDIA ACE**: https://build.nvidia.com/

### Step 5: Download/Verify Assets

Make sure the `assets/models/` folder contains the avatar file:
- `rpm_avatar.glb` (Ready Player Me avatar with facial blendshapes)

If missing, you can:
1. Create your own at [Ready Player Me](https://readyplayer.me/)
2. Export as GLB with "ARKit Morph Targets" enabled
3. Place in `assets/models/rpm_avatar.glb`

---

## ▶️ Running the Application

### Start the Server

```bash
# Make sure virtual environment is activated
source venv/bin/activate  # macOS/Linux
# or: venv\Scripts\activate  # Windows

# Run the server
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### Access the Application

Open your browser and navigate to:
```
http://localhost:8000
```

---

## 🌐 Running on a Local Network (Access from Other Devices)

If you want to access AURA from other devices on the same network:

### 1. Find Your Local IP Address

**macOS:**
```bash
ipconfig getifaddr en0
```

**Linux:**
```bash
hostname -I | awk '{print $1}'
```

**Windows:**
```cmd
ipconfig
# Look for "IPv4 Address" under your network adapter
```

### 2. Start Server with Network Access

```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

### 3. Access from Other Devices

On other devices connected to the same network, open:
```
http://YOUR_IP_ADDRESS:8000
```

Example: `http://192.168.1.100:8000`

> ⚠️ **Important**: Camera and microphone features only work on:
> - `localhost` / `127.0.0.1`
> - HTTPS connections
> 
> For remote access with full features, you need HTTPS (see Advanced section).

---

## 🔧 Troubleshooting

### Common Issues

#### 1. "Port 8000 already in use"
```bash
# Find the process using port 8000
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill the process or use a different port
uvicorn server:app --host 0.0.0.0 --port 8001
```

#### 2. "ModuleNotFoundError"
```bash
# Make sure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

#### 3. "CUDA out of memory" or slow performance
The TTS and AI models will fall back to CPU if GPU memory is insufficient. This is normal but slower.

#### 4. "Face detection not working"
- Ensure good lighting
- Position your face clearly in the camera view
- The Face API models load from CDN if local models are missing

#### 5. Avatar not loading
- Check browser console (F12 → Console) for errors
- Verify `assets/models/rpm_avatar.glb` exists
- Try refreshing with cache clear: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

---

## 🔒 Advanced: HTTPS for Remote Access

For full camera/microphone access from remote devices, you need HTTPS.

### Option 1: ngrok (Easiest)
```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/download

# Start tunnel
ngrok http 8000
```

Use the provided `https://xxxx.ngrok.io` URL.

### Option 2: Self-signed Certificate
```bash
# Generate certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Run with HTTPS
uvicorn server:app --host 0.0.0.0 --port 8000 --ssl-keyfile key.pem --ssl-certfile cert.pem
```

---

## 📁 Project Structure

```
aura-project/
├── server.py              # FastAPI backend server
├── requirements.txt       # Python dependencies
├── .env                   # API keys (create this)
├── assets/
│   └── models/
│       └── rpm_avatar.glb # 3D avatar model
├── src/
│   ├── core/
│   │   └── brain.py       # AI processing logic
│   ├── output/
│   │   └── tts.py         # Text-to-speech
│   └── perception/
│       ├── audio.py       # Speech recognition
│       └── nv_ace.py      # NVIDIA ACE lip sync
└── web/
    └── static/
        ├── index.html     # Main UI
        ├── css/           # Styles
        └── js/
            ├── main.js    # Main app logic
            ├── avatar.js  # 3D avatar control
            └── gesture.js # Hand gesture recognition
```

---

## 🎯 Features

| Feature | Description |
|---------|-------------|
| 💬 **Chat** | Text-based conversation with AI |
| 🎤 **Voice Input** | Speech-to-text with Whisper |
| 🔊 **Voice Output** | Text-to-speech responses |
| 🎭 **3D Avatar** | Animated Ready Player Me character |
| 👄 **Lip Sync** | Realistic mouth movements |
| 😊 **Emotions** | Facial expression detection & display |
| 👋 **Gestures** | Hand gesture recognition |

---

## 📝 License

[Add your license here]

## 🤝 Contributing

[Add contribution guidelines here]
