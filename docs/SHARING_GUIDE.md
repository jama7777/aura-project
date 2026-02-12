# 🚀 How to Share AURA with Friends

This guide explains how you can share the AURA project with anyone!

---

## 📤 Option 1: Share the Code (GitHub)

### Step 1: Create a GitHub Account
1. Go to https://github.com
2. Click "Sign Up" and create a free account

### Step 2: Create a New Repository
1. Click the "+" button (top right) → "New repository"
2. Name it: `aura-project`
3. Description: "AI Virtual Friend with 3D Avatar, Lip Sync & Emotion Detection"
4. Choose "Public" (so anyone can see it)
5. Click "Create repository"

### Step 3: Upload Your Code

Open Terminal and run:
```bash
cd /Users/indra/Documents/aura-project

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "AURA - AI Virtual Assistant with 3D Avatar"

# Add your GitHub repository
git remote add origin https://github.com/YOUR_USERNAME/aura-project.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### Step 4: Share the Link!
Send your friends: `https://github.com/YOUR_USERNAME/aura-project`

**Your friends can then:**
1. Go to the link
2. Click "Code" → "Download ZIP"
3. Extract and follow the setup instructions!

---

## 💻 Option 2: Share the Folder Directly

### Using Google Drive / OneDrive / Dropbox:
1. Compress the folder:
   - **Mac**: Right-click `aura-project` folder → "Compress"
   - **Windows**: Right-click → "Send to" → "Compressed (zipped) folder"
2. Upload `aura-project.zip` to your cloud storage
3. Share the link with friends!

### Using USB/External Drive:
1. Copy the `aura-project` folder to USB
2. Give the USB to your friend

---

## 🌐 Option 3: Let Friends Access Over Network (Same WiFi)

If your friends are on the same WiFi network, they can access AURA running on YOUR computer!

### Step 1: Find Your IP Address

**Mac:**
```bash
ipconfig getifaddr en0
```
Example output: `192.168.1.100`

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" (usually starts with 192.168...)

### Step 2: Run AURA
```bash
uvicorn server:app --host 0.0.0.0 --port 8000
```

### Step 3: Give Friends the URL
Tell your friends to open in their browser:
```
http://YOUR_IP_ADDRESS:8000
```
Example: `http://192.168.1.100:8000`

⚠️ **Note:** Camera/Microphone won't work for them (browser security). They can only use text chat.

---

## ☁️ Option 4: Deploy Online (Advanced)

To put AURA on the internet so anyone can access it:

### Free Options:
| Service | Website | Notes |
|---------|---------|-------|
| **Render** | render.com | Free tier, easy setup |
| **Railway** | railway.app | Free tier, fast |
| **Replit** | replit.com | Browser-based coding |
| **Hugging Face Spaces** | huggingface.co/spaces | Good for AI projects |

### Deploy to Render (Example):
1. Push code to GitHub (Option 1)
2. Go to https://render.com
3. Sign up with GitHub
4. Click "New" → "Web Service"
5. Connect your GitHub repository
6. Settings:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
7. Click "Create Web Service"
8. Wait 5-10 minutes for deployment
9. Share the provided URL!

⚠️ **Important:** You'll need to set your API keys as "Environment Variables" in Render's settings.

---

## 📱 Option 5: Make a Demo Video

Can't share the running app? Make a video!

### Screen Recording:
**Mac:**
- Press `Cmd + Shift + 5` → "Record Screen"

**Windows:**
- Press `Win + G` → Click record button

### What to Show:
1. The 3D avatar
2. Type a message → show response
3. Talk to it → show voice recognition
4. Show the lip sync and emotions
5. Try hand gestures

### Share Video On:
- YouTube
- Google Drive
- WhatsApp
- Discord
- Instagram

---

## 📋 What Your Friends Need to Run AURA

When sharing, tell them they need:

### Required:
| Item | Link |
|------|------|
| Python 3.10+ | https://www.python.org/downloads/ |
| OpenRouter API Key | https://openrouter.ai/keys |
| OR Google Gemini Key | https://makersuite.google.com/app/apikey |

### Optional (for lip sync):
| Item | Link |
|------|------|
| NVIDIA ACE API Key | https://build.nvidia.com/ |

### Quick Install Commands:
```bash
# 1. Go to folder
cd aura-project

# 2. Create virtual environment
python3 -m venv venv

# 3. Activate it
source venv/bin/activate  # Mac/Linux
# or: venv\Scripts\activate  # Windows

# 4. Install everything
pip install -r requirements.txt

# 5. Create .env file and add:
# OPENROUTER_API_KEY=your_key_here
# NV_API_KEY=your_nvidia_key_here (optional)

# 6. Run!
uvicorn server:app --host 0.0.0.0 --port 8000

# 7. Open browser: http://localhost:8000
```

---

## 🎥 Demo Script for Showing Friends

When demoing AURA, try this:

```
1. "This is AURA - my AI virtual friend with a 3D avatar"

2. "Watch the lips move when it talks" 
   → Type: "Tell me a joke"
   → Point out lip sync

3. "It can also show emotions"
   → Type: "I'm feeling sad today"
   → Show the avatar's sad expression

4. "I can talk to it too!"
   → Click mic, say something
   → Show voice recognition working

5. "It even recognizes hand gestures"
   → Turn on camera
   → Show thumbs up → avatar reacts

6. "And it remembers our conversations"
   → Tell it your name
   → Ask "what's my name?" later
```

---

## 🔗 Quick Links to Include When Sharing

```
📦 AURA Project

🎯 What is it?
An AI virtual friend with a 3D animated avatar that can:
- Chat through text or voice
- See your emotions through camera
- Recognize hand gestures
- Talk back with lip-synced speech
- Remember your conversations

🛠️ Technologies Used:
- Python + FastAPI (backend)
- Three.js (3D avatar)
- OpenAI Whisper (speech-to-text)
- Coqui TTS (text-to-speech)
- GPT-4 / Gemini (AI brain)
- NVIDIA Audio2Face (lip sync + emotions)
- Face-API.js (emotion detection)
- MediaPipe (gesture recognition)

📖 Documentation:
- BEGINNER_GUIDE.md - For everyone
- PROJECT_DOCUMENTATION.md - Technical details

🚀 Quick Start:
1. Install Python 3.10+
2. Get API key from openrouter.ai
3. Run: pip install -r requirements.txt
4. Run: uvicorn server:app --port 8000
5. Open: http://localhost:8000
```

---

Happy sharing! 🎉

*Your friends are going to love AURA!*
