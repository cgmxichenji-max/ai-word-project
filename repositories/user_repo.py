

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from typing import Optional

from utils.db import get_conn


def get_user_by_username(username: str) -> Optional[sqlite3.Row]:
    username = str(username or "").strip()
    if not username:
        return None

    with get_conn() as conn:
        cur = conn.execute(
            "SELECT * FROM users WHERE username = ? LIMIT 1",
            (username,),
        )
        return cur.fetchone()


def get_user_by_id(user_id: int) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT * FROM users WHERE id = ? LIMIT 1",
            (user_id,),
        )
        return cur.fetchone()


def get_user_setting(user_id: int) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT * FROM user_study_settings WHERE user_id = ? LIMIT 1",
            (user_id,),
        )
        return cur.fetchone()


def save_user_setting(user_id: int, target_word_count: int) -> None:
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO user_study_settings (user_id, target_word_count)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                target_word_count = excluded.target_word_count
            """,
            (user_id, target_word_count),
        )
        conn.commit()


def save_user_password(user_id: int, password_hash: str) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )
        conn.commit()


def is_password_set(user_row: sqlite3.Row) -> bool:
    value = user_row["password_hash"] if user_row else ""
    return bool(str(value or "").strip())


def get_user_word_row(user_id: int, word: str) -> Optional[sqlite3.Row]:
    word = str(word or "").strip()
    if not user_id or not word:
        return None

    with get_conn() as conn:
        cur = conn.execute(
            "SELECT * FROM user_words WHERE user_id = ? AND word = ? LIMIT 1",
            (user_id, word),
        )
        return cur.fetchone()


def increment_user_word_correct_count(user_id: int, word: str, delta: int = 1) -> None:
    word = str(word or "").strip()
    delta = int(delta or 0)
    if not user_id or not word or delta <= 0:
        return

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE user_words
            SET correct_count = COALESCE(correct_count, 0) + ?
            WHERE user_id = ? AND word = ?
            """,
            (delta, user_id, word),
        )
        conn.commit()


def increment_user_word_wrong_count(user_id: int, word: str, delta: int = 1) -> None:
    word = str(word or "").strip()
    delta = int(delta or 0)
    if not user_id or not word or delta <= 0:
        return

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE user_words
            SET wrong_count = COALESCE(wrong_count, 0) + ?
            WHERE user_id = ? AND word = ?
            """,
            (delta, user_id, word),
        )
        conn.commit()


def increment_user_word_level(user_id: int, word: str, delta: int = 1) -> None:
    word = str(word or "").strip()
    delta = int(delta or 0)
    if not user_id or not word or delta <= 0:
        return

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE user_words
            SET level = COALESCE(level, 0) + ?
            WHERE user_id = ? AND word = ?
            """,
            (delta, user_id, word),
        )
        conn.commit()


def get_srs_interval_days(level: int) -> int:
    try:
        value = int(level or 1)
    except (TypeError, ValueError):
        value = 1

    if value <= 1:
        return 1
    if value == 2:
        return 2
    if value == 3:
        return 4
    if value == 4:
        return 7
    if value == 5:
        return 15
    return 30


def update_user_word_review_schedule(user_id: int, word: str, level: int) -> None:
    word = str(word or "").strip()
    if not user_id or not word:
        return

    now = datetime.now()
    interval_days = get_srs_interval_days(level)
    next_review_at = now + timedelta(days=interval_days)

    with get_conn() as conn:
        conn.execute(
            """
            UPDATE user_words
            SET last_review_at = ?,
                next_review_at = ?
            WHERE user_id = ? AND word = ?
            """,
            (
                now.strftime("%Y-%m-%d %H:%M:%S"),
                next_review_at.strftime("%Y-%m-%d %H:%M:%S"),
                user_id,
                word,
            ),
        )
        conn.commit()