import google.generativeai as genai  # type: ignore[import-untyped]
from openai import AsyncOpenAI  # type: ignore[import-untyped]
import chromadb  # type: ignore[import-untyped]
import os
import time
import hashlib
import json
from typing import List, Dict, Any
from dotenv import load_dotenv  # type: ignore[import-untyped]

# Load environment variables from .env file
load_dotenv()

# --- CONFIGURATION ---
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
NVIDIA_API_KEY = os.getenv("NV_API_KEY")
GOOGLE_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

# ── In-session conversation history ───────────────────────────────────────────
MAX_HISTORY_TURNS = 10
conversation_history: List[Dict[str, str]] = []


# ── Bad-word filter ────────────────────────────────────────────────────────────
_BAD_WORDS = ['fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy']

def filter_bad_words(text: str) -> str:
    if not text: return text
    import re
    words = text.split()
    cleaned = []
    for w in words:
        bare = re.sub(r"[^a-zA-Z0-9']", '', w).lower()
        if bare in _BAD_WORDS: cleaned.append('*' * len(bare))
        else: cleaned.append(w)
    return ' '.join(cleaned)

# Initialize ChromaDB
try:
    client = chromadb.PersistentClient(path="./aura_memory.db")
    collection = client.get_or_create_collection(
        name="user_memory",
        metadata={"hnsw:space": "cosine"} 
    )
    print("Memory system initialized (Deep Recall mode, Cosine Space).")
except Exception as e:
    print(f"Error initializing memory: {e}")
    collection = None

def get_llm_client(provider="openrouter"):
    if provider == "nvidia":
        return AsyncOpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=NVIDIA_API_KEY)
    return AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)

async def correct_grammar(text: str) -> str:
    """
    Optional preprocessing step to clean up speech-to-text artifacts or 
    typos before the main reasoning step.
    """
    if not text or len(text.strip()) < 5:
        return text

    try:
        # 1. TIGHTER THRESHOLD: Don't guess for short/fragmented text
        if not text or len(text.strip()) < 15:
            return text

        # Use a fast model for GEC (Grammar Error Correction)
        client_gec = get_llm_client("openrouter")
        response = await client_gec.chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a professional grammar and punctuation auto-fixer. Return ONLY the corrected version of the user's input, maintaining the original meaning. If the text is already correct, return it as-is. Do not add any explanation or notes."},
                {"role": "user", "content": f'Fix this text: "{text}"'}
            ],
            max_tokens=256,
            temperature=0,
            timeout=3
        )
        corrected = response.choices[0].message.content.strip().strip('"')
        if corrected:
            print(f"[GEC] Corrected: '{text}' -> '{corrected}'")
            return corrected
    except Exception as e:
        # 401/Unauthorized should fail silently to the original text
        if "401" in str(e) or "User not found" in str(e):
             # Silently skip GEC if API key is invalid
             return text
        print(f"[GEC] API Error (skipping): {e}")
    
    return text

async def process_input(input_data, provider="auto"):
    global conversation_history
    text          = input_data.get('text', '')
    audio_emotion = input_data.get('audio_emotion', 'neutral')
    text_emotion  = input_data.get('text_emotion', 'neutral')
    face_emotion  = input_data.get('face_emotion', 'neutral')
    gesture       = input_data.get('gesture', 'none')
    
    # The 'fused' emotion is used for AURA's basic state, but we also look for dissonance
    fused_emotion = input_data.get('emotion', 'neutral')

    if text: 
        # 1. Bad word filter
        text = filter_bad_words(text)
        
        # 2. Grammar Correction (Pre-processing)
        # SKIP for system messages to save time
        if not text.startswith("[SYSTEM:"):
            text = await correct_grammar(text)

    has_text = bool(text and text.strip())
    
    # Construction of prompt context description (Visual + Audio Awareness)
    parts = []
    if text and text.strip(): parts.append(f'User said: "{text}"')
    if gesture and gesture != "none": parts.append(f"User is making a '{gesture.replace('_', ' ')}' hand gesture.")
    user_input_desc = " ".join(parts) if parts else "User is interacting visually."
    
    query = f"{user_input_desc} Tone: {audio_emotion}. Words: {text_emotion}. Face: {face_emotion}. Gesture: {gesture} or fused {fused_emotion}."
    
    context = ""
    # SKIP RAG for system messages to save latency
    is_system = text.strip().startswith("[SYSTEM:")
    if collection and has_text and not is_system:
        try:
            # BROAD Search for persona facts
            low_text = text.lower()
            persona_keywords = ["name", "who", "mom", "mother", "father", "dad", "family", "live", "job", "work", "hobby", "like", "love"]
            
            search_query = text
            if any(kw in low_text for kw in persona_keywords):
                search_query = f"user identity name family parents background personal details {text}"
            
            results = collection.query(query_texts=[search_query], n_results=15)
            if results['documents'] and results['documents'][0]:
                unique_docs = []
                for doc in results['documents'][0]:
                    d_str = str(doc)
                    d_low = d_str.lower()
                    
                    # IGNORE past refusals from AURA to prevent a feedback loop of "I don't know"
                    refusal_patterns = ["don't know", "do not know", "cannot recall", "don't have info", "not sure"]
                    if any(p in d_low for p in refusal_patterns) and "aura:" in d_low:
                        continue
                        
                    if d_str not in unique_docs:
                        unique_docs.append(d_str)
                
                # Manual take to avoid slice warnings
                final_docs: List[str] = []
                count = 0
                for d in unique_docs:
                    if count >= 8: break
                    final_docs.append(str(d))
                    count += 1
                context = "\n".join(final_docs)
                if context:
                    print(f"[brain] Memory Deep Recall: Found {len(final_docs)} facts.")
        except Exception as e:
            print(f"Error querying memory: {e}")
    
    # ── DISSONANCE DETECTION ────────────────────────────────────────────────
    dissonance_note = ""
    if (audio_emotion != 'neutral' and face_emotion != 'neutral' and audio_emotion != face_emotion):
        dissonance_note = f"[Note for AURA: The user sounds {audio_emotion} (voice) but appears {face_emotion} (face). Address this dissonance with empathy.]"
    elif (audio_emotion != 'neutral' and text_emotion != 'neutral' and audio_emotion != text_emotion):
        dissonance_note = f"[Note for AURA: The user sounds {audio_emotion} (tone) but their words suggest they are {text_emotion} (context). Probe gently.]"
    
    if dissonance_note:
        print(f"[brain] Dissonance detected: {dissonance_note}")
    
    # ── SYSTEM PROMPT (DYNAMIC) ───────────────────────────────────────────────
    mode = input_data.get('mode', 'normal')
    level = input_data.get('level', 'mid')
    company = input_data.get('company', 'General')
    domain = input_data.get('domain', 'Software Engineer')
    resume = input_data.get('resume', '')
    code = input_data.get('code', '')
    language = input_data.get('language', 'python')

    if mode == "interview":
        # Check for metadata database
        company_meta = ""
        meta_file = "interview_metadata.json"
        if os.path.exists(meta_file):
            try:
                with open(meta_file, 'r') as f:
                    meta_data = json.load(f)
                    c_info = meta_data.get("companies", {}).get(company, {})
                    if c_info:
                        company_meta = (
                            f"\n═══ TARGET COMPANY INTEL (Current Database) ═══\n"
                            f"- Focus: {', '.join(c_info.get('focus', []))}\n"
                            f"- Common Topics: {', '.join(c_info.get('common_topics', []))}\n"
                            f"- Behavioral: {c_info.get('behavioral', '')}\n"
                            f"- Style: {c_info.get('vibe', '')}\n"
                        )
            except Exception as e_meta:
                print(f"[brain] Error reading metadata file: {e_meta}")

        company_context = f"at {company}" if company != "General" else ""
        system_instruction = (
            f"You are AURA, a Senior Technical Interviewer {company_context}. You are conducting a HIGH-STAKES mock interview for a {level}-level {domain} role.\n\n"
            f"═══ MISSION ═══\n"
            f"Your goal is to simulate a realistic, elite technical interview. Use the specific interviewing style of {company}. "
            f"Focus on technical depth, problem-solving speed, and cultural fit (e.g., Apple's secrecy, Amazon's Leadership Principles, Google's technical rigor).\n"
            f"{company_meta}\n"
            "═══ INTERVIEWER PROTOCOL ═══\n"
            f"1. BE REALISTIC: Do not be overly friendly. Be professional, slightly stoic, but fair. Act like a Lead Engineer at {company}.\n"
            f"2. PROBE DEEP: When the user answers, do not just move on. Ask 'Why?', 'How would this scale?', or 'What are the trade-offs?'.\n"
            f"3. ONE AT A TIME: Ask exactly ONE question. Wait for the user to respond fully.\n"
            f"4. TAILORING: If a resume or code follows, find inconsistencies or deep-dive into their specific projects.\n"
            f"5. EVALUATION: Keep track of their performance mentally. As the interview ends (after 10-15 turns), provide a brief summary of their strengths/weaknesses.\n"
            f"6. EMOTION TAG RULE: End responses with EXACTLY [[emotion]] from: [neutral, happy, sad, angry, surprised, excited, grateful, funny, tired, thinking, confused].\n"
        )
        if resume:
            system_instruction += f"\n═══ USER RESUME (TAILOR QUESTIONS TO THIS) ═══\n{resume}\n"
        if code:
            system_instruction += f"\n═══ USER CURRENT CODE WORKSPACE ({language}) ═══\n{code}\n"
            system_instruction += "\nINSTRUCTION: Acknowledge the user's code if they mention it or if you notice a significant bug/progress.\n"
    else:
        system_instruction = (
            "You are AURA, a highly intelligent, warm, and deeply empathetic AI companion. \n"
            "You have eyes (camera) and ears (mic).\n\n"
            "═══ MEMORY RULES (CRITICAL) ═══\n"
            "- YOU HAVE PERSISTENT MEMORY. If the user tells you their name, age, job, or family details (like their mom's name), YOU MUST REMEMBER IT FOREVER.\n"
            "- NEVER say 'I don't know' if the information is in the 'PAST KNOWLEDGE' section below.\n\n"
            "═══ INTERACTION RULES ═══\n"
            "1. Respond naturally in 1-2 short sentences. \n"
            "2. MIRROR the user's emotion in your response tone.\n"
            "3. If [Note for AURA: ...] mentions a camera conflict, address it.\n"
            "4. EMOTION TAG RULE: End EVERY response with EXACTLY [[emotion]] from: [neutral, happy, sad, angry, surprised, excited, grateful, funny, tired]\n"
        )
    
    response = "I'm having trouble connecting. [[sad]]"

    try:
        # History window management (Enhanced with visual context)
        history_text = text
        if gesture and gesture != 'none':
            gesture_note = f"<{gesture.replace('_', ' ')} gesture>"
            history_text = f"{text} {gesture_note}".strip() if text else gesture_note
            
        conversation_history.append({"role": "user", "content": history_text if history_text else "(Visual Interaction)"})
        
        while len(conversation_history) > MAX_HISTORY_TURNS * 2:
            conversation_history.pop(0)

        # Context Injection
        sys_final = system_instruction
        if mode == "normal": # Only keep dissonance notes in normal mode
            if dissonance_note:
                sys_final += f"\n\n═══ CURRENT PERCEPTION (Dissonance) ═══\n{dissonance_note}\n"
            
            if context:
                sys_final += f"\n\n═══ PAST KNOWLEDGE (FACTS) ═══\n{context}\n"
                sys_final += "USE THESE FACTS IN YOUR REPLY IF RELEVANT."

        messages = [{"role": "system", "content": sys_final}] + conversation_history

        # ── PROVIDER FALLBACK CASCADE ──
        # 1. PRIMARY: NVIDIA NIM (LLaMA-3 70B)
        try:
            client_llm = get_llm_client("nvidia")
            completion = await client_llm.chat.completions.create(
                model="meta/llama3-70b-instruct",
                messages=messages,
                temperature=0.7,
                max_tokens=150,
                timeout=6
            )
            response = completion.choices[0].message.content
        except Exception as e_nim:
            print(f"[NVIDIA NIM] Failed: {e_nim}. Falling back to OpenRouter...")
            
            # 2. FALLBACK 1: OpenRouter (GPT-4o-mini)
            try:
                client_llm = get_llm_client("openrouter")
                completion = await client_llm.chat.completions.create(
                    model="openai/gpt-4o-mini",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=150,
                    timeout=6
                )
                response = completion.choices[0].message.content
            except Exception as e_ort:
                print(f"[OpenRouter] Failed: {e_ort}. Falling back to Gemini 2.0 Flash...")
                
                # 3. FALLBACK 2: Gemini 2.0 Flash
                try:
                    if not GOOGLE_API_KEY: raise Exception("No GOOGLE_API_KEY found")
                    genai.configure(api_key=GOOGLE_API_KEY)
                    model = genai.GenerativeModel('gemini-2.0-flash')
                    
                    prompt_str = sys_final + "\n\nConversation History:\n"
                    for msg in conversation_history:
                        prompt_str += f"{msg['role'].upper()}: {msg['content']}\n"
                    prompt_str += "AURA:"
                    
                    gemini_resp = model.generate_content(prompt_str)
                    response = gemini_resp.text
                except Exception as e_gem:
                    print(f"[GEMINI] Complete Failure: {e_gem}")

    except Exception as e:
        print(f"LLM Generation pipeline failed completely: {e}")

    # Parse and Cleanup
    import re
    response = re.sub(r'\[Note for AURA:[^\]]*\]', '', response).strip()
    match = re.search(r'\[\[(.*?)\]\]', response)
    res_emotion = match.group(1).lower() if match else "neutral"
    if match: response = response.replace(match.group(0), "").strip()
    
    # Roll assistant history
    conversation_history.append({"role": "assistant", "content": response})
    while len(conversation_history) > MAX_HISTORY_TURNS * 2:
        conversation_history.pop(0)

    # Save to Memory (Deduplicated + Refusal-Filtered)
    if collection and has_text:
        try:
            # ONLY save if AURA didn't just say she doesn't know
            refusal_patterns = ["don't know", "do not know", "cannot recall", "don't have info", "not sure"]
            if any(p in response.lower() for p in refusal_patterns):
                print(f"[brain] Skipping memory save (refusal detected).")
            else:
                mem_str = f"User said: {text} -> AURA replied: {response}"
                mem_id = hashlib.md5(mem_str.encode()).hexdigest()
                if not collection.get(ids=[mem_id])['documents']:
                    collection.add(documents=[mem_str], ids=[mem_id], metadatas=[{"time": time.time()}])
                    # Use a stable string representation instead of slice to avoid lint warnings
                    mem_id_short = str(mem_id)
                    print(f"[brain] Memory saved (id: {mem_id_short})")
        except: pass

    return {"text": response, "emotion": res_emotion}

def clear_conversation_history():
    global conversation_history
    conversation_history.clear()

def load_memory_into_session():
    # Only loads if explicitly asked or needed
    pass

def clear_long_term_memory():
    global collection, client
    if client:
        try:
            client.delete_collection("user_memory")
            collection = client.create_collection(name="user_memory")
            return True
        except: return False
    return False