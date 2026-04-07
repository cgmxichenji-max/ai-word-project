from __future__ import annotations

import math
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "ai_word_system.db"


LEVEL_INTERVAL_DAYS = {
    1: 1,
    2: 3,
    3: 7,
    4: 15,
    5: 30,
}


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_target_word_count(user_id: int) -> int:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT target_word_count
            FROM user_study_settings
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    if not row:
        return 20

    value = row["target_word_count"]
    if value is None:
        return 20

    try:
        count = int(value)
    except (TypeError, ValueError):
        return 20

    return count if count > 0 else 20


# 1. New helper function after get_target_word_count
def get_today_queue_date_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def calculate_queue_quota(target_word_count: int) -> dict:
    """
    当前配额规则：
    - 新词固定按总数的 2/5 计算
    - 复习词 = 剩余数量
    - 至少保留 1 个新词（当 target_word_count > 0 时）

    例：
    - 3 个词 -> 新词 1，复习 2
    - 5 个词 -> 新词 2，复习 3
    - 7 个词 -> 新词 3，复习 4
    """
    if target_word_count <= 0:
        return {
            "target_word_count": 0,
            "review_quota": 0,
            "new_quota": 0,
        }

    new_quota = math.floor(target_word_count * 2 / 5)
    if new_quota <= 0:
        new_quota = 1
    if new_quota > target_word_count:
        new_quota = target_word_count

    review_quota = target_word_count - new_quota
    if review_quota < 0:
        review_quota = 0

    return {
        "target_word_count": target_word_count,
        "review_quota": review_quota,
        "new_quota": new_quota,
    }


def get_due_review_words(user_id: int, review_quota: int) -> list[dict]:
    """
    复习词条件（A 方案）：
    1. level < 6
    2. next_review_at 不为空
    3. next_review_at <= 当前时间

    排序：
    1. wrong_count 高优先
    2. correct_count 低优先
    3. last_review_at 更早优先
    4. id 稳定排序
    """
    if review_quota <= 0:
        return []

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, word_id, word, level, correct_count, wrong_count,
                   next_review_at, last_review_at, source_type,
                   meaning_user, word_root_user, affix_user, history_user,
                   forms_user, memory_tip_user
            FROM user_words
            WHERE user_id = ?
              AND level < 6
              AND next_review_at IS NOT NULL
              AND next_review_at <= ?
            ORDER BY
              wrong_count DESC,
              correct_count ASC,
              COALESCE(last_review_at, '') ASC,
              id ASC
            LIMIT ?
            """,
            (user_id, now_str, review_quota),
        ).fetchall()

    items: list[dict] = []
    for r in rows:
        content = resolve_user_word_contents(
            r["word_id"],
            r["meaning_user"],
            r["word_root_user"],
            r["affix_user"],
            r["history_user"],
            r["forms_user"],
            r["memory_tip_user"],
        )
        examples = get_user_word_examples(r["user_id"], r["word_id"])
        stories = get_user_word_stories(r["user_id"], r["word_id"])
        items.append(
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "word_id": r["word_id"],
                "word": r["word"],
                "meaning": content["meaning"],
                "word_root": content["word_root"],
                "affix": content["affix"],
                "history": content["history"],
                "forms": content["forms"],
                "memory_tip": content["memory_tip"],
                "examples": examples,
                "stories": stories,
                "level": r["level"],
                "correct_count": r["correct_count"],
                "wrong_count": r["wrong_count"],
                "next_review_at": r["next_review_at"],
                "last_review_at": r["last_review_at"],
                "source_type": r["source_type"],
                "queue_type": "review",
            }
        )

    return items


# --- Inserted functions ---
def get_new_words_from_user_words(user_id: int, new_quota: int) -> list[dict]:
    """
    新词条件：
    1. level = 1
    2. last_review_at 为空

    排序先改为随机：
    1. RANDOM()
    """
    if new_quota <= 0:
        return []

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, word_id, word, level, correct_count, wrong_count,
                   next_review_at, last_review_at, source_type,
                   meaning_user, word_root_user, affix_user, history_user,
                   forms_user, memory_tip_user
            FROM user_words
            WHERE user_id = ?
              AND level = 1
              AND last_review_at IS NULL
            ORDER BY RANDOM()
            LIMIT ?
            """,
            (user_id, new_quota),
        ).fetchall()

    items: list[dict] = []
    for r in rows:
        content = resolve_user_word_contents(
            r["word_id"],
            r["meaning_user"],
            r["word_root_user"],
            r["affix_user"],
            r["history_user"],
            r["forms_user"],
            r["memory_tip_user"],
        )
        examples = get_user_word_examples(r["user_id"], r["word_id"])
        stories = get_user_word_stories(r["user_id"], r["word_id"])
        items.append(
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "word_id": r["word_id"],
                "word": r["word"],
                "meaning": content["meaning"],
                "word_root": content["word_root"],
                "affix": content["affix"],
                "history": content["history"],
                "forms": content["forms"],
                "memory_tip": content["memory_tip"],
                "examples": examples,
                "stories": stories,
                "level": r["level"],
                "correct_count": r["correct_count"],
                "wrong_count": r["wrong_count"],
                "next_review_at": r["next_review_at"],
                "last_review_at": r["last_review_at"],
                "source_type": r["source_type"],
                "queue_type": "new",
            }
        )

    return items


# --- New helper function ---
def get_additional_user_words(user_id: int, need_count: int, exclude_ids: set[int]) -> list[dict]:
    """
    当复习词 + 新词配额抽完后，如果总数仍不足，
    先继续从 user_words 里补，而不是立刻去 words 总表。

    规则：
    1. 只取当前用户 level < 6 的词
    2. 排除已经入队的 id
    3. 排序先改为随机：RANDOM()
    """
    if need_count <= 0:
        return []

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, word_id, word, level, correct_count, wrong_count,
                   next_review_at, last_review_at, source_type,
                   meaning_user, word_root_user, affix_user, history_user,
                   forms_user, memory_tip_user
            FROM user_words
            WHERE user_id = ?
              AND level < 6
            ORDER BY RANDOM()
            """,
            (user_id,),
        ).fetchall()

    items: list[dict] = []
    for r in rows:
        row_id = int(r["id"])
        if row_id in exclude_ids:
            continue

        content = resolve_user_word_contents(
            r["word_id"],
            r["meaning_user"],
            r["word_root_user"],
            r["affix_user"],
            r["history_user"],
            r["forms_user"],
            r["memory_tip_user"],
        )
        examples = get_user_word_examples(r["user_id"], r["word_id"])
        stories = get_user_word_stories(r["user_id"], r["word_id"])
        items.append(
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "word_id": r["word_id"],
                "word": r["word"],
                "meaning": content["meaning"],
                "word_root": content["word_root"],
                "affix": content["affix"],
                "history": content["history"],
                "forms": content["forms"],
                "memory_tip": content["memory_tip"],
                "examples": examples,
                "stories": stories,
                "level": r["level"],
                "correct_count": r["correct_count"],
                "wrong_count": r["wrong_count"],
                "next_review_at": r["next_review_at"],
                "last_review_at": r["last_review_at"],
                "source_type": r["source_type"],
                "queue_type": "fallback_user_words",
            }
        )

        if len(items) >= need_count:
            break

    return items


def fill_words_from_words_table(user_id: int, need_count: int, exclude_words: set[str]) -> list[dict]:
    """
    当 user_words 不足时，从 words 临时补足。
    第一版改为只读模式：
    1. 不写入 user_words
    2. 只返回当前队列需要的临时单词
    3. 按 word 文本排重，避免和当前已入队单词重复
    4. 按随机顺序抽取
    """
    if need_count <= 0:
        return []

    normalized_exclude_words = {str(w).strip().lower() for w in exclude_words if str(w).strip()}

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, word, meaning_raw, word_root_raw, affix_raw,
                   history_raw, forms_raw, memory_tip_raw
            FROM words
            ORDER BY RANDOM()
            """
        ).fetchall()

    fill_items: list[dict] = []
    for r in rows:
        if len(fill_items) >= need_count:
            break

        word_text = str(r["word"]).strip()
        if not word_text:
            continue

        word_key = word_text.lower()
        if word_key in normalized_exclude_words:
            continue

        word_id = int(r["id"])
        examples = get_system_word_examples(word_id)
        stories = get_system_word_stories(word_id)

        fill_items.append(
            {
                "id": None,
                "user_id": user_id,
                "word_id": int(r["id"]),
                "word": word_text,
                "meaning": str(r["meaning_raw"] or "").strip(),
                "word_root": str(r["word_root_raw"] or "").strip(),
                "affix": str(r["affix_raw"] or "").strip(),
                "history": str(r["history_raw"] or "").strip(),
                "forms": str(r["forms_raw"] or "").strip(),
                "memory_tip": str(r["memory_tip_raw"] or "").strip(),
                "level": 1,
                "correct_count": 0,
                "wrong_count": 0,
                "next_review_at": None,
                "last_review_at": None,
                "source_type": "words_random_temp",
                "queue_type": "fill",
                "examples": examples,
                "stories": stories,
            }
        )

        normalized_exclude_words.add(word_key)

    return fill_items
# --- New helper functions ---
def resolve_user_word_contents(
    word_id: int | None,
    meaning_user: str | None,
    word_root_user: str | None,
    affix_user: str | None,
    history_user: str | None,
    forms_user: str | None,
    memory_tip_user: str | None,
) -> dict:
    fallback = {
        "meaning": "",
        "word_root": "",
        "affix": "",
        "history": "",
        "forms": "",
        "memory_tip": "",
    }

    raw_payload: dict | None = None
    if word_id:
        raw_payload = get_word_full_payload_from_words(int(word_id))

    if raw_payload:
        fallback["meaning"] = str(raw_payload.get("meaning_user") or "").strip()
        fallback["word_root"] = str(raw_payload.get("word_root_user") or "").strip()
        fallback["affix"] = str(raw_payload.get("affix_user") or "").strip()
        fallback["history"] = str(raw_payload.get("history_user") or "").strip()
        fallback["forms"] = str(raw_payload.get("forms_user") or "").strip()
        fallback["memory_tip"] = str(raw_payload.get("memory_tip_user") or "").strip()

    return {
        "meaning": str(meaning_user or "").strip() or fallback["meaning"],
        "word_root": str(word_root_user or "").strip() or fallback["word_root"],
        "affix": str(affix_user or "").strip() or fallback["affix"],
        "history": str(history_user or "").strip() or fallback["history"],
        "forms": str(forms_user or "").strip() or fallback["forms"],
        "memory_tip": str(memory_tip_user or "").strip() or fallback["memory_tip"],
    }


def get_user_word_examples(user_id: int | None, word_id: int | None) -> list[dict]:
    if user_id is None or word_id is None:
        return []

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, word_id, example_en, example_zh, source_type, sort_order
            FROM user_word_examples
            WHERE user_id = ?
              AND word_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (user_id, word_id),
        ).fetchall()

    return [dict(row) for row in rows]


def get_user_word_stories(user_id: int | None, word_id: int | None) -> list[dict]:
    if user_id is None or word_id is None:
        return []

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, word_id, story_en, story_zh, source_type, sort_order
            FROM user_word_stories
            WHERE user_id = ?
              AND word_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (user_id, word_id),
        ).fetchall()

    return [dict(row) for row in rows]


def get_system_word_examples(word_id: int | None) -> list[dict]:
    if word_id is None:
        return []

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, word_id, example_en, example_zh, source_type
            FROM word_examples
            WHERE word_id = ?
            ORDER BY id ASC
            """,
            (word_id,),
        ).fetchall()

    return [dict(row) for row in rows]


def get_system_word_stories(word_id: int | None) -> list[dict]:
    if word_id is None:
        return []

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, word_id, story_en, story_zh, source_type
            FROM word_stories
            WHERE word_id = ?
            ORDER BY id ASC
            """,
            (word_id,),
        ).fetchall()

    return [dict(row) for row in rows]


def copy_system_examples_to_user_word(user_id: int, word_id: int) -> None:
    if user_id is None or word_id is None:
        return

    with get_conn() as conn:
        exists = conn.execute(
            """
            SELECT 1
            FROM user_word_examples
            WHERE user_id = ?
              AND word_id = ?
            LIMIT 1
            """,
            (user_id, word_id),
        ).fetchone()
        if exists:
            return

        system_rows = conn.execute(
            """
            SELECT example_en, example_zh
            FROM word_examples
            WHERE word_id = ?
            ORDER BY id ASC
            """,
            (word_id,),
        ).fetchall()
        if not system_rows:
            return

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        payloads = []
        for index, row in enumerate(system_rows):
            payloads.append(
                (
                    user_id,
                    word_id,
                    str(row["example_en"] or "").strip(),
                    str(row["example_zh"] or "").strip(),
                    "system_copy",
                    index,
                    now_str,
                    now_str,
                )
            )

        conn.executemany(
            """
            INSERT INTO user_word_examples (
                user_id,
                word_id,
                example_en,
                example_zh,
                source_type,
                sort_order,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            payloads,
        )
        conn.commit()


def copy_system_stories_to_user_word(user_id: int, word_id: int) -> None:
    if user_id is None or word_id is None:
        return

    with get_conn() as conn:
        exists = conn.execute(
            """
            SELECT 1
            FROM user_word_stories
            WHERE user_id = ?
              AND word_id = ?
            LIMIT 1
            """,
            (user_id, word_id),
        ).fetchone()
        if exists:
            return

        system_rows = conn.execute(
            """
            SELECT story_en, story_zh
            FROM word_stories
            WHERE word_id = ?
            ORDER BY id ASC
            """,
            (word_id,),
        ).fetchall()
        if not system_rows:
            return

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        payloads = []
        for index, row in enumerate(system_rows):
            payloads.append(
                (
                    user_id,
                    word_id,
                    str(row["story_en"] or "").strip(),
                    str(row["story_zh"] or "").strip(),
                    "system_copy",
                    index,
                    now_str,
                    now_str,
                )
            )

        conn.executemany(
            """
            INSERT INTO user_word_stories (
                user_id,
                word_id,
                story_en,
                story_zh,
                source_type,
                sort_order,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            payloads,
        )
        conn.commit()


# --- New helper functions ---
def get_existing_user_word_record_id(user_id: int, word_id: int | None, word: str) -> int | None:
    normalized_word = str(word).strip().lower()
    if not normalized_word:
        return None

    with get_conn() as conn:
        if word_id is not None:
            row = conn.execute(
                """
                SELECT id
                FROM user_words
                WHERE user_id = ?
                  AND word_id = ?
                LIMIT 1
                """,
                (user_id, word_id),
            ).fetchone()
            if row:
                return int(row["id"])

        row = conn.execute(
            """
            SELECT id
            FROM user_words
            WHERE user_id = ?
              AND LOWER(TRIM(word)) = ?
            LIMIT 1
            """,
            (user_id, normalized_word),
        ).fetchone()

    if row:
        return int(row["id"])
    return None



def get_word_full_payload_from_words(word_id: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, word, meaning_raw, word_root_raw, affix_raw,
                   history_raw, forms_raw, memory_tip_raw
            FROM words
            WHERE id = ?
            LIMIT 1
            """,
            (word_id,),
        ).fetchone()

    if not row:
        return None

    return {
        "word_id": int(row["id"]),
        "word": row["word"],
        "meaning_user": row["meaning_raw"],
        "word_root_user": row["word_root_raw"],
        "affix_user": row["affix_raw"],
        "history_user": row["history_raw"],
        "forms_user": row["forms_raw"],
        "memory_tip_user": row["memory_tip_raw"],
    }



def build_initial_user_word_payload(user_id: int, item: dict) -> dict | None:
    word_id = item.get("word_id")
    word = str(item.get("word") or "").strip()
    if not word_id or not word:
        return None

    word_payload = get_word_full_payload_from_words(int(word_id))
    if not word_payload:
        return None

    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    queue_date = now.strftime("%Y-%m-%d")

    default_level = 1
    interval_days = LEVEL_INTERVAL_DAYS.get(default_level, 1)
    next_review_at = (now + timedelta(days=interval_days)).strftime("%Y-%m-%d %H:%M:%S")

    return {
        "user_id": user_id,
        "word_id": word_payload["word_id"],
        "word": word_payload["word"],
        "source_type": "random",
        "level": default_level,
        "correct_count": 0,
        "wrong_count": 0,
        "next_review_at": next_review_at,
        "last_review_at": now_str,
        "queue_date": queue_date,
        "meaning_user": word_payload["meaning_user"],
        "word_root_user": word_payload["word_root_user"],
        "affix_user": word_payload["affix_user"],
        "history_user": word_payload["history_user"],
        "forms_user": word_payload["forms_user"],
        "memory_tip_user": word_payload["memory_tip_user"],
        "created_at": now_str,
    }



def persist_word_to_user_words(user_id: int, item: dict) -> int | None:
    word_id = item.get("word_id")
    word = str(item.get("word") or "").strip()
    if not word:
        return None

    existing_id = get_existing_user_word_record_id(
        user_id=user_id,
        word_id=int(word_id) if word_id is not None else None,
        word=word,
    )
    if existing_id is not None:
        return existing_id

    payload = build_initial_user_word_payload(user_id, item)
    if not payload:
        return None

    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO user_words (
                user_id,
                word_id,
                word,
                source_type,
                level,
                correct_count,
                wrong_count,
                next_review_at,
                last_review_at,
                queue_date,
                meaning_user,
                word_root_user,
                affix_user,
                history_user,
                forms_user,
                memory_tip_user,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["user_id"],
                payload["word_id"],
                payload["word"],
                payload["source_type"],
                payload["level"],
                payload["correct_count"],
                payload["wrong_count"],
                payload["next_review_at"],
                payload["last_review_at"],
                payload["queue_date"],
                payload["meaning_user"],
                payload["word_root_user"],
                payload["affix_user"],
                payload["history_user"],
                payload["forms_user"],
                payload["memory_tip_user"],
                payload["created_at"],
            ),
        )
        conn.commit()
        new_id = int(cur.lastrowid)

    copy_system_examples_to_user_word(user_id, payload["word_id"])
    copy_system_stories_to_user_word(user_id, payload["word_id"])
    return new_id



def persist_queue_words_to_user_words(user_id: int, items: list[dict]) -> dict:
    inserted_ids: list[int] = []
    skipped_ids: list[int] = []

    for item in items:
        word = str(item.get("word") or "").strip()
        word_id = item.get("word_id")
        if not word or word_id is None:
            continue

        existing_id = get_existing_user_word_record_id(
            user_id=user_id,
            word_id=int(word_id),
            word=word,
        )
        if existing_id is not None:
            skipped_ids.append(existing_id)
            continue

        new_id = persist_word_to_user_words(user_id, item)
        if new_id is not None:
            inserted_ids.append(new_id)

    return {
        "inserted_count": len(inserted_ids),
        "skipped_count": len(skipped_ids),
        "inserted_ids": inserted_ids,
        "skipped_ids": skipped_ids,
    }


# 7. Insert new helper functions after persist_queue_words_to_user_words
def get_today_started_queue_words(user_id: int, target_word_count: int) -> list[dict]:
    today_queue_date = get_today_queue_date_str()

    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, word_id, word, level, correct_count, wrong_count,
                   next_review_at, last_review_at, source_type, queue_date, created_at,
                   meaning_user, word_root_user, affix_user, history_user,
                   forms_user, memory_tip_user
            FROM user_words
            WHERE user_id = ?
              AND date(last_review_at) = ?
            ORDER BY datetime(last_review_at) DESC, id ASC
            LIMIT ?
            """,
            (user_id, today_queue_date, target_word_count),
        ).fetchall()

    items: list[dict] = []
    for r in rows:
        content = resolve_user_word_contents(
            r["word_id"],
            r["meaning_user"],
            r["word_root_user"],
            r["affix_user"],
            r["history_user"],
            r["forms_user"],
            r["memory_tip_user"],
        )
        examples = get_user_word_examples(r["user_id"], r["word_id"])
        stories = get_user_word_stories(r["user_id"], r["word_id"])
        items.append(
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "word_id": r["word_id"],
                "word": r["word"],
                "meaning": content["meaning"],
                "word_root": content["word_root"],
                "affix": content["affix"],
                "history": content["history"],
                "forms": content["forms"],
                "memory_tip": content["memory_tip"],
                "examples": examples,
                "stories": stories,
                "level": r["level"],
                "correct_count": r["correct_count"],
                "wrong_count": r["wrong_count"],
                "next_review_at": r["next_review_at"],
                "last_review_at": r["last_review_at"],
                "source_type": r["source_type"],
                "queue_date": r["queue_date"],
                "queue_type": "today_started",
            }
        )

    return items


def get_started_study_queue(user_id: int) -> dict | None:
    target_word_count = get_target_word_count(user_id)
    today_items = get_today_started_queue_words(user_id, target_word_count)

    if not today_items:
        return None

    return {
        "user_id": user_id,
        "target_word_count": target_word_count,
        "review_quota": 0,
        "new_quota": 0,
        "review_count": 0,
        "new_count": 0,
        "fallback_count": 0,
        "fill_count": 0,
        "items": today_items,
        "queue_locked": len(today_items) >= target_word_count,
    }


def build_study_queue(user_id: int) -> dict:
    """
    当前版本：
    1. 先检查今天是否已有 last_review_at=今天 的单词
       - 如果有，则优先保留今天这批单词继续学习
       - 如果数量已达到 target_word_count，则直接锁定今天这批单词
       - 如果数量不足，则保留今天这批单词，再补足剩余数量
    2. 补足规则：
       - 先按配额抽取到期复习词（next_review_at <= now）
       - 再用 words 总表随机补足剩余数量
    3. 不再从 user_words 中随机补位，避免把未到期旧词重新拉回队列
    """
    started_queue = get_started_study_queue(user_id)
    if started_queue is not None and started_queue.get("queue_locked"):
        return started_queue

    target_word_count = get_target_word_count(user_id)
    quota = calculate_queue_quota(target_word_count)

    base_items = started_queue.get("items", []) if started_queue is not None else []
    items = list(base_items)
    selected_words = {str(item["word"]).strip().lower() for item in items if item.get("word")}

    need_count = target_word_count - len(items)
    review_need = min(quota["review_quota"], max(0, need_count))

    review_items: list[dict] = []
    if review_need > 0:
        due_candidates = get_due_review_words(user_id, max(target_word_count, review_need))
        for item in due_candidates:
            word_key = str(item.get("word") or "").strip().lower()
            if not word_key or word_key in selected_words:
                continue
            review_items.append(item)
            selected_words.add(word_key)
            if len(review_items) >= review_need:
                break
        items.extend(review_items)

    need_count = target_word_count - len(items)

    fill_items: list[dict] = []
    if need_count > 0:
        fill_items = fill_words_from_words_table(user_id, need_count, selected_words)
        items.extend(fill_items)

    return {
        "user_id": user_id,
        "target_word_count": quota["target_word_count"],
        "review_quota": quota["review_quota"],
        "new_quota": quota["new_quota"],
        "review_count": len(review_items),
        "new_count": len(fill_items),
        "fallback_count": 0,
        "fill_count": len(fill_items),
        "queue_locked": False,
        "items": items,
    }
