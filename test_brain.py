import asyncio
from src.core.brain import process_input

async def main():
    result = await process_input({"text": "hello", "emotion": "neutral", "face_emotion": "neutral"}, provider="auto")
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
