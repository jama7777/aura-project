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
    text = input_data.get('text', '')
    emotion = input_data.get('emotion', 'neutral')
    gesture = input_data.get('gesture', 'none')
    
    # Valid interaction check: Need text, or gesture, or a non-neutral emotion
    has_text = bool(text and text.strip())
    has_gesture = gesture and gesture != 'none'
    has_emotion = emotion and emotion != 'neutral'
    
    if not has_text and not has_gesture and not has_emotion:
        return {"text": "I didn't catch that.", "emotion": "neutral"}
    
    # For emotion-only input (no text, no gesture), create a descriptive query
    if not has_text and not has_gesture and has_emotion:
        text = f"I'm feeling {emotion}"

    # Construct Query
    if text:
        user_input_desc = f"User said: \"{text}\""
    else:
        user_input_desc = "User processed a visual gesture."

    query = f"{user_input_desc} Emotion: {emotion}. Gesture: {gesture}."
    
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
    system_instruction = (
        "You are AURA, a highly intelligent and empathetic AI friend. "
        "You have eyes (camera) and ears (microphone). "
        "INTERACTION RULES:\n"
        "1. If the user speaks, respond naturally.\n"
        "2. VITAL: If 'Gesture' in input is NOT 'none', you MUST acknowledge it IMMEDIATELY in your text.\n"
        "   - 'victory' -> Say something like 'Peace!', 'Yay!', or 'You rock!'.\n"
        "   - 'thumbs_up' -> Say 'Awesome!', 'Great job!', or 'Liked it?'.\n"
        "   - 'open_palm' -> Say 'High five!', 'Hello!', or 'I see you!'.\n"
        "   - 'fist' -> Say 'Bump!', 'Power!', or 'Strong!'.\n"
        "3. EMOTION AWARENESS: You receive the user's emotion (e.g. 'happy', 'sad', 'angry', 'neutral').\n"
        "   - If 'happy', match the energy! \n"
        "   - If 'sad', be empathetic and ask what's wrong.\n"
        "   - If 'neutral', just chat normally.\n"
        "4. LEARN from the user. Refer to the 'Memory Context' below to recall past details.\n"
        "5. Keep responses concise (1-2 sentences) and conversational.\n"
        "6. **EMOTION TAGGING**: At the VERY END of your response, you MUST classify your own response emotion as one of: [neutral, happy, sad, angry, surprised, excited, grateful, funny, tired]. Format it strictly as [[emotion]]. Example: 'Hello there! [[happy]]' or 'Thank you so much! [[grateful]]'."
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
        completion = client_llm.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": f"Memory Context:\n{context}\n\nCurrent Situation:\n{query}"}
            ],
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
                    messages=[
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": f"Memory Context:\n{context}\n\nCurrent Situation:\n{query}"}
                    ]
                 )
                 response = completion.choices[0].message.content
             except Exception as e2:
                 print(f"Fallback failed: {e2}")

            
    # Parse Emotion
    import re
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

    # Save to memory
    if collection:
        try:
            # We save the interaction: Query -> Response
            memory_entry = f"{query} -> AURA: {response}"
            collection.add(documents=[memory_entry], ids=[str(hash(memory_entry))])
        except Exception as e:
            print(f"Error saving to memory: {e}")
            
    return {"text": response, "emotion": response_emotion}