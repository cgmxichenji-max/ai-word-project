from __future__ import annotations

import hashlib
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file, session

from services.ai_service import get_openai_client

tts_bp = Blueprint("tts", __name__)

_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "tts_cache"


def _cache_path(text: str) -> Path:
    """用 md5 生成安全文件名，避免特殊字符问题。"""
    key = hashlib.md5(text.strip().lower().encode("utf-8")).hexdigest()
    return _CACHE_DIR / f"{key}.mp3"


@tts_bp.route("/api/tts", methods=["POST"])
def api_tts():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"ok": False, "message": "not logged in"}), 401

    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text") or "").strip()
    if not text:
        return jsonify({"ok": False, "message": "text 不能为空"}), 400

    # 超长文本保护（OpenAI tts-1 上限 4096 字符）
    if len(text) > 4000:
        return jsonify({"ok": False, "message": "text 过长"}), 400

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = _cache_path(text)

    # 命中缓存：直接返回已有 mp3
    if cache_file.exists():
        return send_file(cache_file, mimetype="audio/mpeg")

    # 未命中：调用 OpenAI TTS 生成
    try:
        client = get_openai_client()
        response = client.audio.speech.create(
            model="tts-1",
            voice="nova",
            input=text,
        )
        cache_file.write_bytes(response.content)
    except Exception as e:
        return jsonify({"ok": False, "message": f"TTS 生成失败：{str(e)}"}), 500

    return send_file(cache_file, mimetype="audio/mpeg")
