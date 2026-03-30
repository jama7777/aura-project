import re

with open('docs/aura_diagrams.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Fix diagram text
# Replace Gemini 2.0 with OpenRouter (fallback)
html = html.replace('Gemini 2.0 Flash', 'OpenRouter (Fallback)')
html = html.replace('gemini-2.0-flash', 'gpt-4o-mini')
html = html.replace('Gemini', 'OpenRouter')
# Replace OpenRouter with Llama-3 70B (primary) where it makes sense
html = html.replace('OPENROUTER["OpenRouter\\nGPT-4o-mini • Priority 2"]', 'OPENROUTER["OpenRouter\\nGPT-4o-mini • Priority 2"]') # Keep this one as is, since we changed Gemini
html = html.replace('GEMINI["Google Gemini\\ngemini-2.0-flash • Priority 3"]', 'GEMINI["(Removed)\\nPriority 3"]') 

with open('docs/aura_diagrams.html', 'w', encoding='utf-8') as f:
    f.write(html)
