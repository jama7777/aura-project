from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import shutil
import os
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from src.core.brain import process_input
from src.output.tts import speak

# from src.output.avatar import instance as avatar_instance

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    text: str
    emotion: str = "neutral"

@app.get("/")
def read_root():
    return {"status": "AURA Brain Online"}

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Process input
        input_data = {"text": request.text, "emotion": request.emotion}
        response_text = process_input(input_data)
        
        # Generate audio
        # We need to modify speak to return the file path or handle it here
        # For now, assuming speak saves to 'output.wav'
        audio_file = speak(response_text, return_file=True)
        
        return {
            "response": response_text,
            "emotion": "happy", # TODO: Analyze emotion from text
            "audio_url": "/audio"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import src.perception.audio as audio_module

@app.get("/status")
def get_status():
    return {
        "audio_emotion": audio_module.latest_audio_emotion,
        "status": "online"
    }

@app.get("/audio")
async def get_audio():
    audio_path = "output.wav"
    if os.path.exists(audio_path):
        return FileResponse(audio_path, media_type="audio/wav")
    return {"error": "No audio available"}
