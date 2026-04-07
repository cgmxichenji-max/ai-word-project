from flask import Blueprint, jsonify, redirect, render_template, request, session, url_for

word_library_bp = Blueprint("word_library", __name__)

def is_system_editor():
    return session.get("username") == "GeorgeJi"


@word_library_bp.route("/word-library")
def word_library_page():
    user_id = session.get("user_id")
    username = session.get("username")
    if not user_id or not username:
        return redirect(url_for("login"))

    return render_template("word_library.html", is_system_editor=is_system_editor())


@word_library_bp.route("/api/word-library/lookup", methods=["POST"])
def lookup_word_library():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"ok": False, "message": "not logged in"}), 401

    payload = request.get_json(silent=True) or {}
    word = str(payload.get("word") or "").strip().lower()
    if not word:
        return jsonify({"ok": False, "message": "请输入单词。"}), 400

    import sqlite3
    from utils.db import get_conn

    conn = get_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    user_id_int = int(user_id)

    def rows_to_examples(rows):
        result = []
        for item in rows:
            if hasattr(item, "keys"):
                result.append({
                    "example_en": item["example_en"] or "",
                    "example_zh": item["example_zh"] or "",
                })
            else:
                result.append({
                    "example_en": item[0] or "",
                    "example_zh": item[1] or "",
                })
        return result

    def rows_to_stories(rows):
        result = []
        for item in rows:
            if hasattr(item, "keys"):
                result.append({
                    "story_en": item["story_en"] or "",
                    "story_zh": item["story_zh"] or "",
                })
            else:
                result.append({
                    "story_en": item[0] or "",
                    "story_zh": item[1] or "",
                })
        return result

    # 1) 先查用户私有词库
    cur.execute(
        """
        SELECT id, word_id, word, note, meaning_user, word_root_user, affix_user,
               history_user, forms_user, memory_tip_user
        FROM user_words
        WHERE user_id = ? AND lower(word) = ?
        LIMIT 1
        """,
        (user_id_int, word),
    )
    user_row = cur.fetchone()

    if user_row:
        if hasattr(user_row, "keys"):
            linked_word_id = user_row["word_id"]
            saved_word = user_row["word"] or word
            context_value = user_row["note"] or ""
            meaning_value = user_row["meaning_user"] or ""
            root_value = user_row["word_root_user"] or ""
            affix_value = user_row["affix_user"] or ""
            history_value = user_row["history_user"] or ""
            forms_value = user_row["forms_user"] or ""
            memory_tip_value = user_row["memory_tip_user"] or ""
        else:
            linked_word_id = user_row[1]
            saved_word = user_row[2] or word
            context_value = user_row[3] or ""
            meaning_value = user_row[4] or ""
            root_value = user_row[5] or ""
            affix_value = user_row[6] or ""
            history_value = user_row[7] or ""
            forms_value = user_row[8] or ""
            memory_tip_value = user_row[9] or ""

        cur.execute(
            """
            SELECT example_en, example_zh
            FROM user_word_examples
            WHERE user_id = ? AND word_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (user_id_int, linked_word_id),
        )
        user_example_rows = cur.fetchall()

        cur.execute(
            """
            SELECT story_en, story_zh
            FROM user_word_stories
            WHERE user_id = ? AND word_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (user_id_int, linked_word_id),
        )
        user_story_rows = cur.fetchall()

        return jsonify({
            "ok": True,
            "exists": True,
            "source": "user",
            "source_label": "当前显示：用户词库",
            "word": saved_word,
            "context": context_value,
            "meaning": meaning_value,
            "word_root": root_value,
            "affix": affix_value,
            "history": history_value,
            "forms": forms_value,
            "memory_tip": memory_tip_value,
            "examples": rows_to_examples(user_example_rows),
            "stories": rows_to_stories(user_story_rows),
        })

    # 2) 用户词库没有，再查系统词库
    cur.execute(
        """
        SELECT id, word, content_raw, meaning_raw, word_root_raw, affix_raw,
               history_raw, forms_raw, memory_tip_raw
        FROM words
        WHERE lower(word) = ?
        LIMIT 1
        """,
        (word,),
    )
    system_row = cur.fetchone()

    if system_row:
        if hasattr(system_row, "keys"):
            system_word_id = system_row["id"]
            saved_word = system_row["word"] or word
            context_value = system_row["content_raw"] or ""
            meaning_value = system_row["meaning_raw"] or ""
            root_value = system_row["word_root_raw"] or ""
            affix_value = system_row["affix_raw"] or ""
            history_value = system_row["history_raw"] or ""
            forms_value = system_row["forms_raw"] or ""
            memory_tip_value = system_row["memory_tip_raw"] or ""
        else:
            system_word_id = system_row[0]
            saved_word = system_row[1] or word
            context_value = system_row[2] or ""
            meaning_value = system_row[3] or ""
            root_value = system_row[4] or ""
            affix_value = system_row[5] or ""
            history_value = system_row[6] or ""
            forms_value = system_row[7] or ""
            memory_tip_value = system_row[8] or ""

        cur.execute(
            """
            SELECT example_en, example_zh
            FROM word_examples
            WHERE word_id = ?
            ORDER BY id ASC
            """,
            (system_word_id,),
        )
        system_example_rows = cur.fetchall()

        cur.execute(
            """
            SELECT story_en, story_zh
            FROM word_stories
            WHERE word_id = ?
            ORDER BY id ASC
            """,
            (system_word_id,),
        )
        system_story_rows = cur.fetchall()

        return jsonify({
            "ok": True,
            "exists": True,
            "source": "system",
            "source_label": "当前显示：系统词库",
            "word": saved_word,
            "context": context_value,
            "meaning": meaning_value,
            "word_root": root_value,
            "affix": affix_value,
            "history": history_value,
            "forms": forms_value,
            "memory_tip": memory_tip_value,
            "examples": rows_to_examples(system_example_rows),
            "stories": rows_to_stories(system_story_rows),
        })

    # 3) 两边都没有，允许新建空表单
    return jsonify({
        "ok": True,
        "exists": False,
        "source": "new",
        "source_label": "当前状态：新建空白词条",
        "word": word,
        "context": "",
        "meaning": "",
        "word_root": "",
        "affix": "",
        "history": "",
        "forms": "",
        "memory_tip": "",
        "examples": [],
        "stories": [],
    })


@word_library_bp.route("/api/word-library/save", methods=["POST"])
def save_word_library():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"ok": False, "message": "not logged in"}), 401

    payload = request.get_json(silent=True) or {}
    word = str(payload.get("word") or "").strip()
    meaning = str(payload.get("meaning") or "").strip()

    if not word:
        return jsonify({"ok": False, "message": "单词不能为空。"}), 400
    if not meaning:
        return jsonify({"ok": False, "message": "词义不能为空。"}), 400

    word_root = str(payload.get("word_root") or "").strip()
    affix = str(payload.get("affix") or "").strip()
    history = str(payload.get("history") or "").strip()
    forms = str(payload.get("forms") or "").strip()
    memory_tip = str(payload.get("memory_tip") or "").strip()
    examples = payload.get("examples") or []
    stories = payload.get("stories") or []

    import sqlite3
    from datetime import datetime, timezone
    from utils.db import get_conn

    conn = get_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    user_id_int = int(user_id)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    result = {}
    try:
        # 1) 查系统词库，获取系统 word_id
        cur.execute(
            "SELECT id FROM words WHERE lower(word) = ? LIMIT 1",
            (word.lower(),),
        )
        sys_row = cur.fetchone()
        system_word_id = sys_row["id"] if sys_row else None

        # 2) 查用户词库是否已存在，同时读取旧 word_id
        cur.execute(
            "SELECT id, word_id FROM user_words WHERE user_id = ? AND lower(word) = ? LIMIT 1",
            (user_id_int, word.lower()),
        )
        user_row = cur.fetchone()

        if user_row:
            # 更新：user_words 无 updated_at 字段，不写它
            uw_id = user_row["id"]
            old_word_id = user_row["word_id"]
            # 最终 word_id：优先系统词库，没有则沿用旧值（旧值可能是 uw_id 本身）
            word_id = system_word_id if system_word_id else (old_word_id or uw_id)
            cur.execute(
                """
                UPDATE user_words
                SET word = ?, word_id = ?, meaning_user = ?, word_root_user = ?,
                    affix_user = ?, history_user = ?, forms_user = ?, memory_tip_user = ?
                WHERE id = ?
                """,
                (word, word_id, meaning, word_root, affix, history, forms, memory_tip, uw_id),
            )
            # 如果 word_id 发生了变化，要把旧 word_id 下的子记录一并清掉，避免脏数据
            old_word_id_for_delete = old_word_id if (old_word_id and old_word_id != word_id) else None
        else:
            # 新建：user_words 无 updated_at 字段，不写它
            cur.execute(
                """
                INSERT INTO user_words
                    (user_id, word_id, word, note, meaning_user, word_root_user,
                     affix_user, history_user, forms_user, memory_tip_user,
                     created_at)
                VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id_int,
                    system_word_id if system_word_id else 0,
                    word,
                    meaning, word_root, affix, history, forms, memory_tip,
                    now,
                ),
            )
            uw_id = cur.lastrowid
            if system_word_id:
                word_id = system_word_id
            else:
                # 没有系统词，用自己的 id 回写 word_id
                cur.execute(
                    "UPDATE user_words SET word_id = ? WHERE id = ?",
                    (uw_id, uw_id),
                )
                word_id = uw_id
            old_word_id_for_delete = None

        # 3) 先删后加 user_word_examples
        # 若旧 word_id 与新 word_id 不同，先清旧 word_id 下的脏数据
        if old_word_id_for_delete:
            cur.execute(
                "DELETE FROM user_word_examples WHERE user_id = ? AND word_id = ?",
                (user_id_int, old_word_id_for_delete),
            )
        cur.execute(
            "DELETE FROM user_word_examples WHERE user_id = ? AND word_id = ?",
            (user_id_int, word_id),
        )
        for idx, ex in enumerate(examples):
            en = str(ex.get("example_en") or "").strip()
            zh = str(ex.get("example_zh") or "").strip()
            if not en and not zh:
                continue
            cur.execute(
                """
                INSERT INTO user_word_examples
                    (user_id, word_id, example_en, example_zh, source_type,
                     sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)
                """,
                (user_id_int, word_id, en, zh, idx, now, now),
            )

        # 4) 先删后加 user_word_stories
        if old_word_id_for_delete:
            cur.execute(
                "DELETE FROM user_word_stories WHERE user_id = ? AND word_id = ?",
                (user_id_int, old_word_id_for_delete),
            )
        cur.execute(
            "DELETE FROM user_word_stories WHERE user_id = ? AND word_id = ?",
            (user_id_int, word_id),
        )
        for idx, st in enumerate(stories):
            en = str(st.get("story_en") or "").strip()
            zh = str(st.get("story_zh") or "").strip()
            if not en and not zh:
                continue
            cur.execute(
                """
                INSERT INTO user_word_stories
                    (user_id, word_id, story_en, story_zh, source_type,
                     sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)
                """,
                (user_id_int, word_id, en, zh, idx, now, now),
            )

        conn.commit()
        result = {"ok": True, "message": "已保存到我的词库。", "word": word, "word_id": word_id}
    except Exception as e:
        conn.rollback()
        result = {"ok": False, "message": f"保存失败：{str(e)}"}
    finally:
        conn.close()

    if not result.get("ok"):
        return jsonify(result), 500
    return jsonify(result)


@word_library_bp.route("/api/word-library/save-system", methods=["POST"])
def save_system_word_library():
    # 权限校验：仅 GeorgeJi 可用
    if not is_system_editor():
        return jsonify({"ok": False, "message": "无权限。"}), 403

    payload = request.get_json(silent=True) or {}
    word = str(payload.get("word") or "").strip()
    meaning = str(payload.get("meaning") or "").strip()

    if not word:
        return jsonify({"ok": False, "message": "单词不能为空。"}), 400
    if not meaning:
        return jsonify({"ok": False, "message": "词义不能为空。"}), 400

    word_root = str(payload.get("word_root") or "").strip()
    affix = str(payload.get("affix") or "").strip()
    history = str(payload.get("history") or "").strip()
    forms = str(payload.get("forms") or "").strip()
    memory_tip = str(payload.get("memory_tip") or "").strip()
    examples = payload.get("examples") or []
    stories = payload.get("stories") or []

    import sqlite3
    from datetime import datetime, timezone
    from utils.db import get_conn

    conn = get_conn()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    result = {}
    try:
        # 1) 查 words 表是否已存在
        cur.execute(
            "SELECT id FROM words WHERE lower(word) = ? LIMIT 1",
            (word.lower(),),
        )
        sys_row = cur.fetchone()

        if sys_row:
            # 更新
            word_id = sys_row["id"]
            cur.execute(
                """
                UPDATE words
                SET word = ?, meaning_raw = ?, word_root_raw = ?, affix_raw = ?,
                    history_raw = ?, forms_raw = ?, memory_tip_raw = ?, updated_at = ?
                WHERE id = ?
                """,
                (word, meaning, word_root, affix, history, forms, memory_tip, now, word_id),
            )
        else:
            # 新建；content_raw NOT NULL，写空字符串占位
            cur.execute(
                """
                INSERT INTO words
                    (word, content_raw, meaning_raw, word_root_raw, affix_raw,
                     history_raw, forms_raw, memory_tip_raw, created_at, updated_at)
                VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (word, meaning, word_root, affix, history, forms, memory_tip, now, now),
            )
            word_id = cur.lastrowid

        # 2) 先删后加 word_examples（无 sort_order 字段）
        cur.execute(
            "DELETE FROM word_examples WHERE word_id = ?",
            (word_id,),
        )
        for ex in examples:
            en = str(ex.get("example_en") or "").strip()
            zh = str(ex.get("example_zh") or "").strip()
            if not en and not zh:
                continue
            cur.execute(
                """
                INSERT INTO word_examples (word_id, example_en, example_zh, source_type)
                VALUES (?, ?, ?, 'system')
                """,
                (word_id, en, zh),
            )

        # 3) 先删后加 word_stories（无 sort_order 字段）
        cur.execute(
            "DELETE FROM word_stories WHERE word_id = ?",
            (word_id,),
        )
        for st in stories:
            en = str(st.get("story_en") or "").strip()
            zh = str(st.get("story_zh") or "").strip()
            if not en and not zh:
                continue
            cur.execute(
                """
                INSERT INTO word_stories (word_id, story_en, story_zh, source_type)
                VALUES (?, ?, ?, 'system')
                """,
                (word_id, en, zh),
            )

        conn.commit()
        result = {"ok": True, "message": "已保存到系统词库。", "word": word, "word_id": word_id}
    except Exception as e:
        conn.rollback()
        result = {"ok": False, "message": f"保存失败：{str(e)}"}
    finally:
        conn.close()

    if not result.get("ok"):
        return jsonify(result), 500
    return jsonify(result)