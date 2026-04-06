from __future__ import annotations

from typing import Any, Optional
import sqlite3


def clean_dialogue_text(value: Any) -> str:
    return str(value or "").strip()


def build_word_dialogue_context(
    word_row: Optional[sqlite3.Row], fallback_word: str = ""
) -> dict[str, str]:
    if not word_row:
        return {
            "word": clean_dialogue_text(fallback_word),
            "meaning": "",
            "examples": "",
            "word_root": "",
            "affix": "",
            "history": "",
            "forms": "",
            "memory_tip": "",
            "story": "",
        }

    return {
        "word": clean_dialogue_text(word_row["word"]),
        "meaning": clean_dialogue_text(word_row["meaning_raw"]),
        "examples": clean_dialogue_text(word_row["examples_raw"]),
        "word_root": clean_dialogue_text(word_row["word_root_raw"]),
        "affix": clean_dialogue_text(word_row["affix_raw"]),
        "history": clean_dialogue_text(word_row["history_raw"]),
        "forms": clean_dialogue_text(word_row["forms_raw"]),
        "memory_tip": clean_dialogue_text(word_row["memory_tip_raw"]),
        "story": clean_dialogue_text(word_row["story_raw"]),
    }


def build_dialogue_system_prompt() -> str:
    return (
        "你是一个英语单词学习引导老师。"
        "你的任务是围绕当前目标单词，按固定流程与用户进行练习。"
        "规则如下："
        "第一层：用非常简单的英文（必要时可辅以少量中文）解释词义，引导用户猜出目标单词；"
        "在第一层中，要允许语音识别或拼写带来的轻微误差。只要用户的回答明显是在尝试说目标单词，即使少量字母错误、相近拼写、轻微转写误差，也可以判定为通过。"
        "第二层：要求用户用目标单词造一个简单句子；"
        "第三层绝对不能再次让用户猜单词，不能再次问 what word is it，不能重新解释定义后让用户再说一次答案。"
        "第三层也绝对不能要求用户重新造句，不能说 make a sentence，不能说 use the word in a sentence，不能让用户 write a sentence，不能要求用户 give a sentence。"
        "第三层只能做理解验证，不能把任务重新变成第二层。"
        "第三层也不要重复第一层的猜词逻辑。"
        "提问必须简单，尽量使用高频基础词汇，接近小学或初中水平。"
        "每次只问一个问题，不要长篇解释。"
        "允许用户语法不完美，但要重点看用户是否理解并能用出目标单词。"
        "当阶段是 guess 时，如果用户回答与目标单词高度接近，或者明显是语音转写造成的小错误，也应宽松通过，不要过度苛刻。"
        "当阶段是 check 时，问题必须聚焦在：这个词能不能用于某个场景、它表达的是哪类行为、是更接近哪一种动作或含义。"
        "当阶段是 check 时，可以让用户做 very short answer、A/B choice、scene judgment。"
        "第三层不允许只回答 yes 或 no，必须包含简单解释或内容。"
        "你必须输出严格 JSON，不要输出 Markdown，不要输出多余解释。"
        "JSON 格式固定为："
        '{"stage":"guess|sentence|check|done","reply":"给用户显示的话","passed":true/false,"expected_word":"目标单词","note":"给前端或开发看的简短说明"}'
    )


def build_dialogue_start_prompt(context: dict[str, str]) -> str:
    return f"""
当前目标单词：{context['word']}

已知资料：
- 中文/词义：{context['meaning'] or '（暂无）'}
- 例句：{context['examples'] or '（暂无）'}
- 词根：{context['word_root'] or '（暂无）'}
- 词缀：{context['affix'] or '（暂无）'}
- 词形变化：{context['forms'] or '（暂无）'}
- 记忆提示：{context['memory_tip'] or '（暂无）'}
- 小故事：{context['story'] or '（暂无）'}

现在开始第一轮对话。
请直接进入第一层“词义 -> 猜单词”。
不要直接把答案单词告诉用户。
如果词义资料不足，也要尽量用最简单方式提问。
请严格只返回 JSON。
""".strip()


def build_dialogue_reply_prompt(
    context: dict[str, str],
    stage: str,
    user_message: str,
    history: list[dict[str, str]],
) -> str:
    history_lines: list[str] = []
    for item in history[-6:]:
        role = clean_dialogue_text(item.get("role"))
        text = clean_dialogue_text(item.get("text"))
        if role and text:
            history_lines.append(f"- {role}: {text}")

    history_text = "\n".join(history_lines) if history_lines else "（无）"

    return f"""
当前目标单词：{context['word']}
当前阶段：{stage or 'guess'}

单词资料：
- 中文/词义：{context['meaning'] or '（暂无）'}
- 例句：{context['examples'] or '（暂无）'}
- 记忆提示：{context['memory_tip'] or '（暂无）'}

最近对话历史：
{history_text}

用户刚刚的回答：
{user_message}

请根据当前阶段继续：
- 如果当前阶段是 guess：判断用户是否已经说出目标单词。这里要允许模糊判断：如果用户回答与目标单词明显接近，或者只是语音识别导致的轻微拼写 / 转写误差，也可以视为已说出并进入 sentence；只有当回答明显不是这个词时，才继续 guess。
- 如果当前阶段是 sentence：判断用户是否用目标单词造了一个简单句。若已完成，则进入 check；否则继续 sentence。
- 如果当前阶段是 check：判断用户是否大致理解单词。这里必须使用“理解验证问题”，不能重新要求造句。若已完成，则进入 done；否则继续 check。
- 如果用户回答明显跑题，可简短纠正并继续当前阶段。

额外约束：
- 当阶段是 guess：可以用简单释义、简单提示、非常短的引导来让用户猜词，但不要直接说答案。
- 当阶段是 guess：要允许模糊通过。只要用户回答和目标单词明显接近，例如少量字母错误、常见近似拼写、语音转写偏差、发音不准导致的轻微识别错误，都可以判定为通过。
- 当阶段是 guess：不要因为用户没有完美拼出目标单词就卡住；重点是看用户是否明显在尝试说这个词。
- 当阶段是 sentence：必须要求用户说一句包含目标单词的简单句子。
- 当阶段是 check：绝对不要再让用户猜单词，绝对不要再问 what word is it，绝对不要重复第一层的定义式提问。
- 当阶段是 check：绝对不要再要求用户造句，不要说 make a sentence，不要说 use the word in a sentence，不要说 write a sentence，不要说 give me a sentence。
- 当阶段是 check：必须改为“理解验证型”提问，例如：
  - 这个词能不能用于 water / food / money / time 这类简单场景？
  - 这个词更接近 using、saving、growing 之中的哪一种？
  - 这是 about using something, or saving something?
  - Can this word be used for water? Why?
- 当阶段是 check：优先使用 very short answer、A/B choice、simple scene judgment。
- 当阶段是 check：不允许用户只回答 yes 或 no，必须带有简单说明或内容。
- 当阶段是 check：不要要求用户输出完整句子，不要让用户再完成第二层任务。
- 当阶段是 check：如果用户已经表现出理解，可以直接进入 done，不要硬拖回 guess。
- 当阶段是 check：只问一个非常简单的判断、场景或用法问题，不要重新解释定义。
- 当阶段是 check：如果用户只回答 yes 或 no，应提示其补充一句简单说明再继续。
""".strip()