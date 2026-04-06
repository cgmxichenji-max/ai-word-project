

from __future__ import annotations

import sqlite3
from typing import Optional

from utils.db import get_conn


def get_word_by_text(word: str) -> Optional[sqlite3.Row]:
    normalized = str(word or "").strip().lower()
    if not normalized:
        return None

    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, word
            FROM words
            WHERE lower(word) = ?
            LIMIT 1
            """,
            (normalized,),
        )
        return cur.fetchone()


def get_word_by_id(word_id: int) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, word
            FROM words
            WHERE id = ?
            LIMIT 1
            """,
            (word_id,),
        )
        return cur.fetchone()


def get_word_detail_by_id(word_id: int) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT
                id,
                word,
                meaning_raw,
                examples_raw,
                word_root_raw,
                affix_raw,
                history_raw,
                forms_raw,
                memory_tip_raw,
                story_raw
            FROM words
            WHERE id = ?
            LIMIT 1
            """,
            (word_id,),
        )
        return cur.fetchone()