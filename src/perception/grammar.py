from transformers import pipeline
import os

# Global pipeline instance
grammar_pipeline = None

def load_grammar_model():
    """
    Load the local grammar correction model (T5-based).
    """
    global grammar_pipeline
    if grammar_pipeline is None:
        try:
            print("Loading tiny grammar correction model (FLAN-T5-small)...")
            # Using a tiny T5 model for faster inference and smaller memory footprint
            grammar_pipeline = pipeline(
                "text2text-generation", 
                model="pszemraj/grammar-synthesis-small"
            )
            print("Tiny grammar model loaded successfully.")
        except Exception as e:
            print(f"Error loading grammar model: {e}")
            grammar_pipeline = None

def correct_text_local(text: str):
    """
    Perform grammar and spelling correction using the local model.
    """
    if not text or len(text.strip()) < 3:
        return text

    global grammar_pipeline
    if grammar_pipeline is None:
        load_grammar_model()

    if grammar_pipeline is not None:
        try:
            # Use a clear prefix to guide the T5 model
            prefix = "gec: " 
            # We cast/assert to Any to avoid 'Never' or 'Unknown' lint issues
            from typing import Any
            result: Any = grammar_pipeline(f"{prefix}{text}", max_length=128)
            corrected = result[0]['generated_text']
            
            # ── CLEANUP: Remove common model-generated meta-text ──────────────────
            prefixes_to_strip = [
                "gec: ", "thanks :", "thanks:", "result:", "corrected:", "correction:",
                "thanks a lot:", "thanks a lot :", "final result:", "output:", "sentence:",
                "grammarsynthesis:", "the corrected sentence is:", "i think you mean:",
                "fixed:", "here is the corrected text:", "corrected version:",
                "user said:", "aura replied:", "aura:", "user:"
            ]
            
            clean_corrected = corrected.strip()
            # 1. Clean prefixes
            changed = True
            while changed:
                changed = False
                for p in prefixes_to_strip:
                    if clean_corrected.lower().startswith(p):
                        clean_corrected = clean_corrected[len(p):].strip()
                        changed = True
            
            # 2. Clean common suffixes
            suffixes = [" (corrected)", " (fixed)", " [corrected]"]
            for s in suffixes:
                if clean_corrected.lower().endswith(s):
                    clean_corrected = clean_corrected[:-len(s)].strip()

            # 3. Strip quotes if added
            if clean_corrected.startswith('"') and clean_corrected.endswith('"'):
                clean_corrected = clean_corrected[1:-1].strip()

            # Simple fallback: If the model generated something wildly different in length (+100%),
            # use original. T5-small can sometimes repeat words infinitely.
            if len(clean_corrected) > len(text) * 3:
                 return text

            return clean_corrected if clean_corrected else text

            return clean_corrected if clean_corrected else text
        except Exception as e:
            print(f"Local grammar correction failed: {e}")
            return text
    
    return text

def get_corrections(original, corrected):
    """
    Helper to identify which words were changed.
    """
    orig_words = original.split()
    corr_words = corrected.split()
    
    corrections = []
    # Simple word-by-word diff (can be improved with SequenceMatcher)
    for o, c in zip(orig_words, corr_words):
        if o.lower() != c.lower():
            corrections.append({"original": o, "corrected": c})
            if len(corrections) >= 5: break
            
    return corrections
