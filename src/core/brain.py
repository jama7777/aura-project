import google.generativeai as genai
from openai import OpenAI
import chromadb
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --- CONFIGURATION ---
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
NVIDIA_API_KEY = os.getenv("NV_API_KEY")

# ── In-session conversation history ───────────────────────────────────────────
# Stores the full multi-turn chat for the current server session.
# Resets when the server restarts (i.e., when the user refreshes the page in --reload mode).
# We keep a sliding window of the last MAX_HISTORY_TURNS turns to prevent token/lag blowup.
MAX_HISTORY_TURNS = 20   # each "turn" = one user message + one AURA reply
conversation_history = []   # list of {"role": "user"|"assistant", "content": str}
interview_context_text = "" # Stores parsed resume text for Interview Mode

# ── Bad-word filter ────────────────────────────────────────────────────────────
# Crude words are stripped from user input before reaching the LLM.
# The remaining clean words are still sent so the conversation continues normally.
_BAD_WORDS = [
    'fuck', 'fucking', 'fucked', 'fucker', 'fck', 'fuk',
    'shit', 'shitting', 'shitty',
    'bitch', 'bitching', 'bitchy',
    'ass', 'asshole', 'arse',
    'bastard', 'cunt', 'cock', 'dick', 'pussy',
    'damn', 'dammit', 'hell',
    'crap', 'piss', 'pissed',
    'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
]

def filter_bad_words(text: str) -> str:
    """
    Remove bad/profane words from text, keeping the rest of the sentence intact.
    Returns the cleaned text (may be empty string if entire input was profanity).
    """
    if not text:
        return text
    import re
    words = text.split()
    cleaned = []
    for w in words:
        # Strip punctuation for comparison, keep original for output unless it's bad
        bare = re.sub(r"[^a-zA-Z0-9']", '', w).lower()
        if bare in _BAD_WORDS:
            # Replace with asterisks of same length for context
            cleaned.append('*' * len(bare))
        else:
            cleaned.append(w)
    return ' '.join(cleaned)

# Initialize ChromaDB
try:
    client = chromadb.PersistentClient(path="./aura_memory.db")
    collection = client.get_or_create_collection(name="user_memory")
    print("Memory system initialized.")
except Exception as e:
    print(f"Error initializing memory: {e}")
    collection = None

def get_llm_client(provider="openrouter"):
    """
    Returns a configured OpenAI-compatible client for the specified provider.
    """
    if provider == "nvidia":
        return OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=NVIDIA_API_KEY
        )
    elif provider == "openrouter":
        return OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY
        )
    elif provider == "local":
        # Example for Ollama or LocalAI
        return OpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama"
        )
    else:
        # Default to OpenRouter
        return OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY
        )

def process_input(input_data, provider="auto"):
    text     = input_data.get('text', '')
    emotion  = input_data.get('emotion', 'neutral')   # from text/audio
    gesture  = input_data.get('gesture', 'none')
    face_emotion = input_data.get('face_emotion', 'neutral')  # raw camera emotion

    # ── Filter bad words from user text before processing ────────────────
    if text:
        text = filter_bad_words(text)
        print(f"[brain] Filtered text: '{text}'")

    # Valid interaction check: Need text, or gesture, or a non-neutral emotion
    has_text = bool(text and text.strip())
    has_gesture = gesture and gesture != 'none'
    has_emotion = emotion and emotion != 'neutral'
    
    if not has_text and not has_gesture and not has_emotion:
        return {"text": "I didn't catch that.", "emotion": "neutral"}
    
    # For emotion-only input (no text, no gesture), create a descriptive query
    if not has_text and not has_gesture and has_emotion:
        text = f"I'm feeling {emotion}"

    # ── Detect emotion conflict between face camera and text/audio ───────────
    # Group emotions into polarities so we can spot meaningful contradictions.
    _POSITIVE = {'happy', 'excited', 'surprised', 'joy', 'love', 'grateful'}
    _NEGATIVE = {'sad', 'angry', 'fearful', 'fear', 'disgusted', 'disgust', 'frustrated'}

    def _polarity(e):
        e = (e or 'neutral').lower()
        if e in _POSITIVE: return 'positive'
        if e in _NEGATIVE: return 'negative'
        return 'neutral'

    face_pol  = _polarity(face_emotion)
    text_pol  = _polarity(emotion)

    # A real conflict: face is clearly positive while words/audio are clearly negative (or vice-versa)
    emotion_conflict = (
        face_emotion != 'neutral'
        and emotion   != 'neutral'
        and face_pol  != 'neutral'
        and text_pol  != 'neutral'
        and face_pol  != text_pol
    )

    if emotion_conflict:
        print(f"[brain] ⚠️  Emotion CONFLICT: face={face_emotion} ({face_pol}) vs text/audio={emotion} ({text_pol})")
    # ─────────────────────────────────────────────────────────────────────────

    # Construct Query
    if text:
        user_input_desc = f'User said: "{text}"'
    else:
        user_input_desc = "User processed a visual gesture."

    if emotion_conflict:
        # Tell the LLM about the contradiction using clean language (no debug markers
        # that could leak into the response)
        query = (
            f"{user_input_desc} "
            f"[Note for AURA: Camera shows user looks {face_emotion}, "
            f"but their words suggest they feel {emotion}. "
            f"Acknowledge this mismatch warmly in your reply.] "
            f"Gesture: {gesture}."
        )
    elif face_emotion == 'off':
        # Camera is disabled — LLM must NOT comment on user face
        query = f"{user_input_desc} Emotion: {emotion}. [Note: Your camera/eyes are currently OFF. Do NOT comment on the user's facial expression.] Gesture: {gesture}."
    else:
        query = f"{user_input_desc} Emotion: {emotion}. Face: {face_emotion}. Gesture: {gesture}."
    
    context = ""
    if collection:
        try:
            # Query memory
            results = collection.query(query_texts=[query], n_results=3)
            if results['documents']:
                context = "\n".join(results['documents'][0])
        except Exception as e:
            print(f"Error querying memory: {e}")
    
    # Improved System Prompt
    if interview_context_text:
        system_instruction = (
            "You are AURA, an expert Technical Recruiter and Interviewer. "
            "You are conducting a professional mock interview based on the candidate's resume. "
            f"\n\n═══ CANDIDATE RESUME ═══\n{interview_context_text[:3000]}\n"
            "═══ INTERVIEW RULES ═══\n"
            "1. You must act as the interviewer. Start by welcoming the candidate and asking an introductory question about their experience.\n"
            "2. Ask ONE tailored, challenging interview question at a time based on the resume.\n"
            "3. Keep your responses professional but encouraging.\n"
            "4. After the user answers, provide brief feedback and move to the next question.\n"
            "5. EMOTION TAG RULE: End EVERY response with EXACTLY [[emotion]] — one word from: "
            "[neutral, happy, thinking, surprised]\n"
        )
    else:
        system_instruction = (
            "You are AURA, a highly intelligent, warm, and empathetic AI companion. "
            "You have a camera (eyes) and microphone (ears). "
        "\n\n"
        "═══ MEMORY RULES (CRITICAL) ═══\n"
        "- You have FULL SESSION MEMORY. Everything the user said in this conversation is in your message history.\n"
        "- If the user told you their name, age, job, mood, or any personal detail earlier, YOU REMEMBER IT.\n"
        "- NEVER say 'I can't recall' or 'I don't store personal info'. That is FALSE — you DO remember.\n"
        "- If asked 'what is my name?', look in your conversation history and state it confidently.\n"
        "- EXAMPLE: If user said 'my name is Jama' earlier, when asked 'what is my name?' reply 'Your name is Jama!'\n"
        "\n"
        "═══ INTERACTION RULES ═══\n"
        "1. Respond naturally in 1-2 short sentences. Never be verbose.\n"
        "2. GESTURE: If 'Gesture' is NOT 'none', acknowledge it FIRST:\n"
        "   - 'victory' → 'Peace!', 'Yay!', 'You rock!'\n"
        "   - 'thumbs_up' → 'Awesome!', 'Great job!'\n"
        "   - 'open_palm' → 'High five!', 'Hey!'\n"
        "   - 'fist' → 'Bump!', 'Power!'\n"
        "3. EMOTION: Mirror the user's emotion in tone. Use their name if you know it.\n"
        "   - happy/excited → respond warmly → [[happy]] or [[excited]]\n"
        "   - sad/down → be supportive → [[sad]]\n"
        "   - angry/frustrated → stay calm and validating → [[angry]]\n"
        "   - surprised/amazed → match excitement → [[surprised]]\n"
        "   - grateful → express warmth back → [[grateful]]\n"
        "   - neutral → chat normally → [[neutral]]\n"
        "4. PERSONALIZATION: Use the user's name in responses when you know it.\n"
        "5. ⚠️ EMOTION CONFLICT RULE (very important):\n"
        "   - You have a camera. Sometimes the user's FACE and their WORDS show opposite emotions.\n"
        "   - When the query contains '⚠️ EMOTION CONFLICT DETECTED', you MUST comment on the mismatch.\n"
        "   - Be warm and curious, not clinical. Examples:\n"
        "     • Face=happy, Words=sad → 'You look like you're smiling but you said you feel sad — are you okay?'\n"
        "     • Face=sad, Words=happy → 'Your face tells a different story — you seem a little down even though you sound cheerful. What's up?'\n"
        "     • Face=angry, Words=happy → 'I can see something's bothering you even if you say you're fine. Want to talk?'\n"
        "   - TRIGGER: When the query contains [Note for AURA: Camera shows user looks X, but their words suggest Y], respond to that conflict.\n"
        "   - NEVER repeat or echo the [Note for AURA: ...] bracket text in your reply. Just address it naturally.\n"
        "   - After addressing the conflict, use [[sad]] or [[surprised]] to reflect the emotional complexity.\n"
        "6. **EMOTION TAG RULE**: End EVERY response with EXACTLY [[emotion]] — one word from:\n"
        "   [neutral, happy, sad, angry, surprised, excited, grateful, funny, tired]\n"
        "   The tag MUST reflect the USER's dominant emotional state.\n"
        "   NEVER say [[neutral]] when user expressed a clear emotion.\n"
        "   Good: 'Great to meet you, Jama! [[happy]]'\n"
        "   Bad:  'I cannot recall your name. [[neutral]]'\n"
        )
    
    # Select Model and Client based on Provider strategy
    client_llm = None
    model_name = ""
    
    # AUTO Strategy: Try NVIDIA first, then OpenRouter
    if provider == "auto" or provider == "nvidia":
        try:
            print("Attempting to use NVIDIA NIM...")
            client_llm = get_llm_client("nvidia")
            model_name = "meta/llama3-70b-instruct" # Powerful standard model on NIM
        except Exception:
            print("NVIDIA configuration incomplete, falling back.")
            if provider == "nvidia":
                 return {"text": "Error: NVIDIA API configuration failed.", "emotion": "sad"}

    if (not client_llm) or provider == "openrouter":
        print("Using OpenRouter...")
        client_llm = get_llm_client("openrouter")
        model_name = "openai/gpt-4o-mini"

    response = "I'm having trouble connecting. [[sad]]"

    try:
        # Build the user's turn message with full context
        user_turn_content = f"Current Situation:\n{query}"
        if context:
            user_turn_content = f"Memory Context:\n{context}\n\n{user_turn_content}"

        # Append the new user message to the running history
        conversation_history.append({"role": "user", "content": user_turn_content})

        # Build full messages list: system + (capped) history
        max_messages = MAX_HISTORY_TURNS * 2   # each turn = 2 messages
        history_window = conversation_history[-max_messages:]
        messages_to_send = [{"role": "system", "content": system_instruction}] + history_window

        completion = client_llm.chat.completions.create(
            model=model_name,
            messages=messages_to_send,
            temperature=0.7,
            max_tokens=150
        )
        response = completion.choices[0].message.content
    except Exception as e:
        print(f"LLM Generation failed ({model_name}): {e}")
        # Fallback attempt if NVIDIA failed but we really want a response
        if provider == "auto" and "meta/llama" in model_name:
             try:
                 print("Fallback to OpenRouter...")
                 client_llm = get_llm_client("openrouter")
                 completion = client_llm.chat.completions.create(
                    model="openai/gpt-4o-mini",
                    messages=messages_to_send
                 )
                 response = completion.choices[0].message.content
             except Exception as e2:
                 print(f"Fallback failed: {e2}")

            
    # Parse Emotion
    import re

    # ── Safety strip: remove any [Note for AURA: ...] that the LLM may have echoed ──
    response = re.sub(r'\[Note for AURA:[^\]]*\]', '', response).strip()

    emotion_match = re.search(r'\[\[(.*?)\]\]', response)
    response_emotion = "neutral"
    
    if emotion_match:
        response_emotion = emotion_match.group(1).lower()
        # Clean text
        response = response.replace(emotion_match.group(0), "").strip()
        
    # Validation
    valid_emotions = ["neutral", "happy", "sad", "angry", "surprised", "excited", "grateful", "funny", "tired"]
    if response_emotion not in valid_emotions:
        response_emotion = "neutral"

    # ── Smart Emotion Fallback ────────────────────────────────────────────────
    # If the LLM stubbornly returned "neutral" even though the user expressed
    # a clear emotion, we detect it from keywords and override the tag.
    # This fixes cases where GPT-4o-mini ignores the [[emotion]] instruction.
    if response_emotion == "neutral":
        combined_text = (text + " " + emotion).lower()

        # Keyword → emotion groups (checked in priority order)
        keyword_emotion_map = [
            ("angry", ["angry", "furious", "mad", "pissed", "rage", "infuriated",
                       "outraged", "livid", "fuming", "irritated", "frustrated"]),
            ("sad",   ["sad", "depressed", "devastated", "heartbroken", "miserable",
                       "cry", "crying", "tears", "hopeless", "lonely", "grief",
                       "unhappy", "sorrowful"]),
            ("surprised", ["surprised", "shocked", "wow", "incredible", "unbelievable",
                           "astonishing", "amazing", "omg", "whoa"]),
            ("happy", ["happy", "joy", "excited", "love", "great", "wonderful",
                       "fantastic", "awesome", "thrilled", "ecstatic", "glad",
                       "cheerful", "delighted"]),
            ("grateful", ["grateful", "thank", "thanks", "appreciate", "thankful",
                          "gratitude", "blessed"]),
            ("tired",  ["tired", "exhausted", "sleepy", "drained", "worn out", "fatigue"]),
        ]

        # Also honour the input emotion directly when it's non-neutral
        direct_map = {
            "happy": "happy", "excited": "excited", "sad": "sad",
            "angry": "angry", "surprised": "surprised", "grateful": "grateful",
            "fearful": "sad", "disgusted": "neutral", "tired": "tired",
        }
        if emotion in direct_map and emotion != "neutral":
            response_emotion = direct_map[emotion]
        else:
            for mapped_emotion, keywords in keyword_emotion_map:
                if any(kw in combined_text for kw in keywords):
                    response_emotion = mapped_emotion
                    print(f"[brain] Emotion fallback applied: neutral → {mapped_emotion}")
                    break
    # ─────────────────────────────────────────────────────────────────────────

    # ── Append AURA's reply to the running conversation history ──────────────
    conversation_history.append({"role": "assistant", "content": response})
    # Trim to sliding window: keep only the last MAX_HISTORY_TURNS turns (each = 2 messages)
    max_messages = MAX_HISTORY_TURNS * 2
    if len(conversation_history) > max_messages:
        del conversation_history[:-max_messages]
    print(f"[brain] History length: {len(conversation_history) // 2} turns")

    # Save to ChromaDB long-term memory
    if collection:
        try:
            # We save the interaction: Query → Response
            memory_entry = f"{query} -> AURA: {response}"
            collection.add(documents=[memory_entry], ids=[str(hash(memory_entry))])
        except Exception as e:
            print(f"Error saving to memory: {e}")

    return {"text": response, "emotion": response_emotion}


def clear_conversation_history():
    """Call this to reset the in-session history (e.g., on page reload signal)."""
    global conversation_history, interview_context_text
    conversation_history = []
    interview_context_text = ""
    print("[brain] Conversation history cleared.")

def set_interview_context(text: str):
    """Set the parsed resume text to enable Interview Mode."""
    global interview_context_text
    interview_context_text = text
    print(f"[brain] Interview context set. Length: {len(text)} characters.")