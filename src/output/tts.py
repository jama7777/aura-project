"""
Text-to-Speech module for AURA.

Uses gTTS (Google Text-to-Speech) as the TTS backend, which is compatible
with Python 3.11+ and available on PyPI. Audio is saved as a WAV file via
pydub so the rest of the application can serve it directly.

Original dependency (Coqui TTS) was removed because:
  - The `TTS` package on PyPI does not resolve correctly in all environments.
  - Coqui TTS has known incompatibilities with Python 3.12+.
  - gTTS provides equivalent quality for a cloud-backed assistant use-case.
"""

import os
import uuid
import tempfile

# gTTS for speech synthesis
try:
    from gtts import gTTS
    _GTTS_AVAILABLE = True
except ImportError:
    _GTTS_AVAILABLE = False
    print("WARNING: gTTS not available. TTS will be disabled. Install with: pip install gTTS")

# pydub for mp3 → wav conversion
try:
    from pydub import AudioSegment
    _PYDUB_AVAILABLE = True
except ImportError:
    _PYDUB_AVAILABLE = False
    print("WARNING: pydub not available. Audio conversion may fail. Install with: pip install pydub")

# Output directory for generated audio files
OUTPUT_DIR = "."


def load_tts_model():
    """
    Initialise the TTS backend.
    gTTS is stateless (cloud API), so there is nothing to pre-load.
    This function exists so server.py can call load_tts_model() on startup
    without errors.
    """
    if _GTTS_AVAILABLE:
        print("TTS backend: gTTS (Google Text-to-Speech) — ready.")
    else:
        print("WARNING: TTS backend unavailable. Responses will have no audio.")


def speak(text: str, return_file: bool = False, lang: str = "en"):
    """
    Convert *text* to speech and save it as a WAV file.

    Parameters
    ----------
    text        : The string to synthesise.
    return_file : If True, return the path to the generated WAV file.
                  If False, return None (kept for API compatibility).
    lang        : BCP-47 language code passed to gTTS (default: "en").

    Returns
    -------
    str | None  : Absolute path to the WAV file, or None on failure.
    """
    if not text or not text.strip():
        print("[TTS] Empty text — skipping synthesis.")
        return None

    if not _GTTS_AVAILABLE:
        print("[TTS] gTTS not available — cannot synthesise audio.")
        return None

    output_filename = f"output_{uuid.uuid4().hex[:8]}.wav"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    try:
        # gTTS produces MP3; convert to WAV so the rest of the stack can use it.
        tts = gTTS(text=text, lang=lang, slow=False)

        if _PYDUB_AVAILABLE:
            # Write MP3 to a temp file, then convert to WAV
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_mp3:
                tmp_mp3_path = tmp_mp3.name

            tts.save(tmp_mp3_path)

            audio = AudioSegment.from_mp3(tmp_mp3_path)
            audio.export(output_path, format="wav")

            os.remove(tmp_mp3_path)
        else:
            # Fallback: save as MP3 and rename — downstream may not play it,
            # but at least the file exists.
            mp3_path = output_path.replace(".wav", ".mp3")
            tts.save(mp3_path)
            output_path = mp3_path
            print("[TTS] pydub unavailable — saved as MP3 instead of WAV.")

        print(f"[TTS] Audio saved to: {output_path}")
        return output_path if return_file else None

    except Exception as e:
        print(f"[TTS] Error during speech synthesis: {e}")
        return None
