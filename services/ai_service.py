

from openai import OpenAI

from config import Config

_client = None


def get_openai_client():
    global _client
    if _client is None:
        if not Config.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY 未配置")
        _client = OpenAI(api_key=Config.OPENAI_API_KEY)
    return _client


def chat_text(prompt: str, system_prompt: str | None = None) -> str:
    client = get_openai_client()

    input_payload = []
    if system_prompt:
        input_payload.append({
            "role": "system",
            "content": [{"type": "input_text", "text": system_prompt}]
        })

    input_payload.append({
        "role": "user",
        "content": [{"type": "input_text", "text": prompt}]
    })

    response = client.responses.create(
        model=Config.OPENAI_MODEL,
        input=input_payload
    )

    return response.output_text.strip()