import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

GENAI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GENAI_API_KEY:
    print("ERROR: GEMINI_API_KEY not found in .env file!")
    exit(1)

genai.configure(api_key=GENAI_API_KEY)

try:
    print(f"Testing Gemini API with key: {GENAI_API_KEY[:5]}...{GENAI_API_KEY[-5:]}")
    model = genai.GenerativeModel('gemini-flash-latest')
    response = model.generate_content("Hello, can you hear me? Respond with 'Yes, I am working'.")
    print("\nSUCCESS! Gemini Responded:")
    print(response.text)
except Exception as e:
    print("\nFAILURE! Gemini API Error:")
    print(e)
