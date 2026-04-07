from __future__ import annotations

import json
from datetime import datetime

from flask import Blueprint, jsonify, request, session

from repositories.word_repo import get_word_detail_by_id
from repositories.user_repo import (
    get_user_word_row,
    increment_user_word_correct_count,
    increment_user_word_level,
    increment_user_word_wrong_count,
    update_user_word_review_schedule,
)
from services.ai_service import chat_text
from services.dialogue_service import (
    build_dialogue_reply_prompt,
    build_dialogue_start_prompt,
    build_dialogue_system_prompt,
    build_word_dialogue_context,
    clean_dialogue_text,
)


ai_bp = Blueprint("ai", __name__)


@ai_bp.route("/api/ai/ping", methods=["POST"])
def api_ai_ping():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "").strip()

    if not text:
        return jsonify({"ok": False, "error": "text 不能为空"}), 400

    try:
        result = chat_text(
            prompt=text,
            system_prompt="你是一个英语学习助手，请简短回答。",
        )
        return jsonify({"ok": True, "result": result})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@ai_bp.route("/api/dialogue/start", methods=["POST"])
def api_dialogue_start():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    data = request.get_json(silent=True) or {}
    raw_word_id = data.get("word_id")
    fallback_word = clean_dialogue_text(data.get("word"))

    word_row = None
    if raw_word_id is not None:
        try:
            word_row = get_word_detail_by_id(int(raw_word_id))
        except (TypeError, ValueError):
            word_row = None

    context = build_word_dialogue_context(word_row, fallback_word)
    if not context["word"]:
        return jsonify({"ok": False, "error": "缺少当前单词"}), 400

    try:
        result = chat_text(
            prompt=build_dialogue_start_prompt(context),
            system_prompt=build_dialogue_system_prompt(),
        )
        return jsonify(
            {
                "ok": True,
                "stage": "guess",
                "word": context["word"],
                "context": context,
                "result": result,
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@ai_bp.route("/api/dialogue/reply", methods=["POST"])
def api_dialogue_reply():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    data = request.get_json(silent=True) or {}
    user_message = clean_dialogue_text(data.get("message"))
    stage = clean_dialogue_text(data.get("stage")) or "guess"
    history = data.get("history") or []
    context_payload = data.get("context") or {}

    if not user_message:
        return jsonify({"ok": False, "error": "message 不能为空"}), 400
    if not isinstance(history, list):
        return jsonify({"ok": False, "error": "history 格式错误"}), 400
    if not isinstance(context_payload, dict):
        return jsonify({"ok": False, "error": "context 格式错误"}), 400

    context = {
        "word": clean_dialogue_text(context_payload.get("word")),
        "meaning": clean_dialogue_text(context_payload.get("meaning")),
        "examples": clean_dialogue_text(context_payload.get("examples")),
        "word_root": clean_dialogue_text(context_payload.get("word_root")),
        "affix": clean_dialogue_text(context_payload.get("affix")),
        "history": clean_dialogue_text(context_payload.get("history")),
        "forms": clean_dialogue_text(context_payload.get("forms")),
        "memory_tip": clean_dialogue_text(context_payload.get("memory_tip")),
        "story": clean_dialogue_text(context_payload.get("story")),
    }

    if not context["word"]:
        return jsonify({"ok": False, "error": "context.word 不能为空"}), 400

    normalized_history: list[dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            continue
        role = clean_dialogue_text(item.get("role"))
        text = clean_dialogue_text(item.get("text"))
        if role and text:
            normalized_history.append({"role": role, "text": text})

    try:
        result = chat_text(
            prompt=build_dialogue_reply_prompt(
                context=context,
                stage=stage,
                user_message=user_message,
                history=normalized_history,
            ),
            system_prompt=build_dialogue_system_prompt(),
        )
        return jsonify(
            {
                "ok": True,
                "stage": stage,
                "word": context["word"],
                "context": context,
                "result": result,
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# 新增接口：/api/example-test/check
@ai_bp.route("/api/example-test/check", methods=["POST"])
def api_example_test_check():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    data = request.get_json(silent=True) or {}
    word = clean_dialogue_text(data.get("word"))
    user_answer = clean_dialogue_text(data.get("user_answer"))
    examples = data.get("examples") or []

    if not word:
        return jsonify({"ok": False, "error": "word 不能为空"}), 400
    if not user_answer:
        return jsonify({"ok": False, "error": "user_answer 不能为空"}), 400
    if not isinstance(examples, list):
        return jsonify({"ok": False, "error": "examples 格式错误"}), 400

    normalized_examples: list[str] = []
    for item in examples:
        text = clean_dialogue_text(item)
        if text:
            normalized_examples.append(text)

    examples_text = "\n".join(f"- {item}" for item in normalized_examples) or "（暂无现成例句）"

    system_prompt = (
        "你是一个英语听力测试评分助手。"
        "用户已经听过若干包含目标单词的英文例句。"
        "现在用户会用中文或英文复述大意。"
        "你的任务是判断：用户的回答是否大致正确，是否抓住了这些例句的核心意思，并且是否体现了目标单词的核心语义。"
        "评分规则："
        "第一，允许模糊判断，不要求逐字翻译；"
        "第二，允许中文回答、英文回答、或中英混合回答；"
        "第三，允许口语化表达；"
        "第四，如果用户中文发音不准、语音识别有轻微错误，但整体语义仍明显接近，也应宽松通过；"
        "第五，必须检查用户是否表达出了目标单词的核心语义；"
        "第六，如果只是答非所问，或者完全没有体现目标单词语义，就不能通过。"
        "你必须输出严格 JSON，不要输出 Markdown，不要输出多余解释。"
        'JSON 格式固定为：{"passed":true/false,"score":"good|partial|bad","feedback":"给用户看的简短中文反馈","keyword_hit":true/false,"meaning_ok":true/false,"note":"给前端或开发看的简短说明"}'
    )

    prompt = f"""
目标单词：{word}

测试例句：
{examples_text}

用户回答：
{user_answer}

请判断：
1. 用户回答是否大致表达了例句意思；
2. 用户回答是否体现了目标单词“{word}”的核心语义；
3. 回答可以是中文、英文、或混合表达；
4. 不要求逐字翻译，只要大意接近即可；
5. 如果只是部分对，可以给 partial；
6. 如果明显抓住大意和核心语义，就判 passed=true；
7. 如果完全没抓住，就判 passed=false。

请严格只返回 JSON。
""".strip()

    try:
        result = chat_text(prompt=prompt, system_prompt=system_prompt)
        parsed_result = None
        if isinstance(result, str):
            try:
                parsed_result = json.loads(result)
            except Exception:
                parsed_result = None
        elif isinstance(result, dict):
            parsed_result = result

        if not isinstance(parsed_result, dict):
            parsed_result = {
                "passed": False,
                "score": "bad",
                "feedback": "AI 返回格式异常，请重试。",
                "keyword_hit": False,
                "meaning_ok": False,
                "note": "raw_result_parse_failed",
                "raw_result": result,
            }

        return jsonify({
            "ok": True,
            "word": word,
            "examples": normalized_examples,
            "user_answer": user_answer,
            "result": parsed_result,
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# 新增接口：/api/example-test/fill-examples
@ai_bp.route("/api/example-test/fill-examples", methods=["POST"])
def api_example_test_fill_examples():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    data = request.get_json(silent=True) or {}
    word = clean_dialogue_text(data.get("word"))
    examples = data.get("examples") or []

    if not word:
        return jsonify({"ok": False, "error": "word 不能为空"}), 400
    if not isinstance(examples, list):
        return jsonify({"ok": False, "error": "examples 格式错误"}), 400

    normalized_examples: list[str] = []
    for item in examples:
        text = clean_dialogue_text(item)
        if text:
            normalized_examples.append(text)

    # 如果已经 >=3 句，直接返回
    if len(normalized_examples) >= 3:
        return jsonify({
            "ok": True,
            "examples": normalized_examples,
            "note": "already_enough_examples"
        })

    system_prompt = (
        "你是一个英语例句生成助手。"
        "你需要根据给定单词，补充自然、常见、适合英语学习的例句。"
        "要求："
        "第一，每个句子必须包含目标单词；"
        "第二，句子要自然、口语或常见书面语；"
        "第三，不要重复已有例句；"
        "第四，长度适中，适合听力训练；"
        "第五，只返回 JSON，不要解释。"
        '格式：{"examples":["句子1","句子2"]}'
    )

    need_count = max(0, 3 - len(normalized_examples))

    existing_text = "\n".join(f"- {e}" for e in normalized_examples) or "（无现有例句）"

    prompt = f"""
目标单词：{word}

已有例句：
{existing_text}

请补充 {need_count} 条新的英文例句：
- 每句必须包含单词 "{word}"
- 不要与已有例句重复
- 只返回 JSON
""".strip()

    try:
        result = chat_text(prompt=prompt, system_prompt=system_prompt)

        parsed = None
        if isinstance(result, str):
            try:
                parsed = json.loads(result)
            except Exception:
                parsed = None
        elif isinstance(result, dict):
            parsed = result

        new_examples: list[str] = []
        if isinstance(parsed, dict) and isinstance(parsed.get("examples"), list):
            for item in parsed.get("examples"):
                text = clean_dialogue_text(item)
                if text and text not in normalized_examples:
                    new_examples.append(text)

        final_examples = normalized_examples + new_examples

        # 兜底：如果AI没补够，就直接返回现有 + 已生成的
        return jsonify({
            "ok": True,
            "examples": final_examples,
            "generated": new_examples,
            "original_count": len(normalized_examples),
            "final_count": len(final_examples)
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# 新增接口：/api/progress/event
@ai_bp.route("/api/progress/event", methods=["POST"])
def api_progress_event():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    data = request.get_json(silent=True) or {}
    word = clean_dialogue_text(data.get("word"))
    source = clean_dialogue_text(data.get("source"))
    is_correct = bool(data.get("is_correct"))

    try:
        progress_delta = int(data.get("progress_delta") or 0)
    except (TypeError, ValueError):
        progress_delta = 0

    try:
        progress_value = int(data.get("progress_value") or 0)
    except (TypeError, ValueError):
        progress_value = 0

    try:
        max_progress = int(data.get("max_progress") or 9)
    except (TypeError, ValueError):
        max_progress = 9

    if not word:
        return jsonify({"ok": False, "error": "word 不能为空"}), 400

    user_word_row = get_user_word_row(user_id, word)
    if not user_word_row:
        return jsonify({"ok": False, "error": "未找到该用户单词记录"}), 404

    try:
        if is_correct:
            increment_user_word_correct_count(user_id, word, 1)
        else:
            increment_user_word_wrong_count(user_id, word, 1)

        current_row = get_user_word_row(user_id, word)
        current_level = int((current_row["level"] if current_row and "level" in current_row.keys() else 0) or 0)
        current_correct_count = int((current_row["correct_count"] if current_row and "correct_count" in current_row.keys() else 0) or 0)
        current_wrong_count = int((current_row["wrong_count"] if current_row and "wrong_count" in current_row.keys() else 0) or 0)
        current_last_review_at = str((current_row["last_review_at"] if current_row and "last_review_at" in current_row.keys() else "") or "")
        current_next_review_at = str((current_row["next_review_at"] if current_row and "next_review_at" in current_row.keys() else "") or "")

        leveled_up = False
        today_str = datetime.now().strftime("%Y-%m-%d")
        last_review_date = current_last_review_at[:10] if current_last_review_at else ""
        next_review_date = current_next_review_at[:10] if current_next_review_at else ""
        review_due = bool(next_review_date) and next_review_date <= today_str

        if progress_value >= max_progress and max_progress > 0 and review_due and last_review_date != today_str:
            increment_user_word_level(user_id, word, 1)
            current_row = get_user_word_row(user_id, word)
            current_level = int((current_row["level"] if current_row and "level" in current_row.keys() else current_level) or current_level)

            update_user_word_review_schedule(user_id, word, current_level)
            current_row = get_user_word_row(user_id, word)
            current_last_review_at = str((current_row["last_review_at"] if current_row and "last_review_at" in current_row.keys() else "") or "")
            current_next_review_at = str((current_row["next_review_at"] if current_row and "next_review_at" in current_row.keys() else "") or "")
            current_correct_count = int((current_row["correct_count"] if current_row and "correct_count" in current_row.keys() else current_correct_count) or current_correct_count)
            current_wrong_count = int((current_row["wrong_count"] if current_row and "wrong_count" in current_row.keys() else current_wrong_count) or current_wrong_count)
            leveled_up = True

        return jsonify({
            "ok": True,
            "word": word,
            "source": source or "unknown",
            "is_correct": is_correct,
            "progress_delta": progress_delta,
            "progress_value": progress_value,
            "max_progress": max_progress,
            "leveled_up": leveled_up,
            "correct_count": current_correct_count,
            "wrong_count": current_wrong_count,
            "level": current_level,
            "last_review_at": current_last_review_at,
            "next_review_at": current_next_review_at,
            "review_due": review_due,
            "note": "progress_event_saved",
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500