# AURA Web UI

This is the new Web-Based UI for AURA, featuring a 3D avatar, voice interaction, and text chat.

## Prerequisites

1.  **Python 3.10+**
2.  **Ollama** running (for the brain).
3.  **Microphone** (for voice chat).

## Setup

1.  Install dependencies (if not already done):
    ```bash
    ./venv/bin/pip install fastapi uvicorn python-multipart
    ```

## Running the Server

1.  Start the FastAPI server:
    ```bash
    ./venv/bin/uvicorn server:app --host 0.0.0.0 --port 8000
    ```
    *Note: It may take a minute to load all AI models (TTS, Whisper, Emotion).*

2.  Open your browser and go to:
    ```
    http://localhost:8000
    ```

## Features

*   **3D Avatar**: Renders `assets/models/character.fbx`.
*   **Voice Chat**: Click/Hold the Microphone button to talk.
*   **Text Chat**: Type messages in the input box.
*   **Camera**: Toggle the camera button to see yourself (Face interaction foundation).
*   **Emotions**: The avatar and UI respond to detected emotions.

## Troubleshooting

*   **Models not loading**: Ensure you have internet access to download models on the first run.
*   **Microphone not working**: Ensure your browser has permission to access the microphone.
*   **Avatar not showing**: Ensure `assets/models/character.fbx` exists and is a valid FBX file.
