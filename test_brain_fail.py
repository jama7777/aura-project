from src.core.brain import get_llm_client

client = get_llm_client("nvidia")
try:
    completion = client.chat.completions.create(
        model="meta/llama3-70b-instruct",
        messages=[{"role": "user", "content": "hello"}],
    )
    print("NVIDIA SUCCESS")
except Exception as e:
    print(f"NVIDIA ERROR: {e}")

try:
    client2 = get_llm_client("openrouter")
    completion = client2.chat.completions.create(
        model="openai/gpt-4o-mini",
        messages=[{"role": "user", "content": "hello"}],
    )
    print("OPENROUTER SUCCESS")
except Exception as e:
    print(f"OPENROUTER ERROR: {e}")
