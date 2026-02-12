import os
import google.generativeai as genai

# Use the specific key the user wants
key = "AIzaSyD38c0J_CDF4Mf-3TQPIASBQtd1yMJb4EY"
genai.configure(api_key=key)

print(f"Checking models for key ending in ...{key[-4:]}")

try:
    print("Listing available models...")
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"- {m.name}")
except Exception as e:
    print(f"Error listing models: {e}")
