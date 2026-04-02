

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from services.ai_service import chat_text
from services.word_service import build_study_queue, persist_queue_words_to_user_words

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "ai_word_system.db"

app = Flask(__name__)
app.secret_key = "change-this-to-a-random-secret-key"






def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_user_by_username(username: str) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT * FROM users WHERE username = ? AND is_active = 1",
            (username,),
        )
        return cur.fetchone()


def get_user_by_id(user_id: int) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        cur = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cur.fetchone()


def get_user_setting(user_id: int) -> Optional[sqlite3.Row]:
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT * FROM user_study_settings WHERE user_id = ?",
            (user_id,),
        )
        return cur.fetchone()


# --- Helper functions for manual word study
def get_word_by_text(word_text: str) -> Optional[sqlite3.Row]:
    normalized = str(word_text or "").strip().lower()
    if not normalized:
        return None

    with get_conn() as conn:
        cur = conn.execute(
            """
            SELECT id, word
            FROM words
            WHERE LOWER(TRIM(word)) = ?
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


def normalize_manual_words(words: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for raw in words:
        word = str(raw or "").strip()
        if not word:
            continue
        key = word.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(word)

    return result


def save_user_setting(user_id: int, target_word_count: int) -> None:
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM user_study_settings WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE user_study_settings SET target_word_count = ? WHERE user_id = ?",
                (target_word_count, user_id),
            )
        else:
            conn.execute(
                "INSERT INTO user_study_settings (user_id, target_word_count) VALUES (?, ?)",
                (user_id, target_word_count),
            )
        conn.commit()


def save_user_password(user_id: int, plain_password: str) -> None:
    password_hash = generate_password_hash(plain_password)
    with get_conn() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )
        conn.commit()


def is_password_set(user: sqlite3.Row) -> bool:
    pwd = user["password_hash"]
    return bool(pwd and str(pwd).strip())


@app.route("/")
def index():
    if session.get("user_id"):
        return redirect(url_for("home"))
    return redirect(url_for("login"))


@app.route("/reset-login")
def reset_login():
    session.pop("pending_user_id", None)
    session.pop("pending_username", None)
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("user_id"):
        return redirect(url_for("home"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        if not username:
            return render_template(
                "login.html",
                title="登录",
                desc="先输入用户名。这个系统不开放注册，账号由你在数据库里手工建立。",
                message="请输入用户名。",
                action_url=url_for("login"),
                submit_text="下一步",
                show_reset=False,
                meta="",
                fields=[
                    {
                        "name": "username",
                        "label": "用户名",
                        "type": "text",
                        "value": "",
                        "placeholder": "请输入用户名",
                        "autofocus": True,
                        "required": True,
                    }
                ],
            )

        user = get_user_by_username(username)
        if not user:
            return render_template(
                "login.html",
                title="登录",
                desc="先输入用户名。这个系统不开放注册，账号由你在数据库里手工建立。",
                message="没有找到这个用户名，或者账号已停用。",
                action_url=url_for("login"),
                submit_text="下一步",
                show_reset=False,
                meta="请先在 users 表里手工创建用户。",
                fields=[
                    {
                        "name": "username",
                        "label": "用户名",
                        "type": "text",
                        "value": username,
                        "placeholder": "请输入用户名",
                        "autofocus": True,
                        "required": True,
                    }
                ],
            )

        session["pending_user_id"] = int(user["id"])
        session["pending_username"] = user["username"]
        return redirect(url_for("pool_size"))

    return render_template(
        "login.html",
        title="登录",
        desc="先输入用户名。这个系统不开放注册，账号由你在数据库里手工建立。",
        message=None,
        action_url=url_for("login"),
        submit_text="下一步",
        show_reset=False,
        meta="",
        fields=[
            {
                "name": "username",
                "label": "用户名",
                "type": "text",
                "value": "",
                "placeholder": "请输入用户名",
                "autofocus": True,
                "required": True,
            }
        ],
    )


@app.route("/pool-size", methods=["GET", "POST"])
def pool_size():
    pending_user_id = session.get("pending_user_id")
    pending_username = session.get("pending_username")
    if not pending_user_id or not pending_username:
        return redirect(url_for("login"))

    current_setting = get_user_setting(int(pending_user_id))
    default_value = (
        str(current_setting["target_word_count"])
        if current_setting else
        "20"
    )

    if request.method == "POST":
        raw_value = request.form.get("target_word_count", "").strip()
        try:
            value = int(raw_value)
        except ValueError:
            value = 0

        if value <= 0:
            return render_template(
                "login.html",
                title="设置单词池数量",
                desc=f"当前用户：{pending_username}。请输入这个用户要背的单词池数量。",
                message="请输入大于 0 的整数。",
                action_url=url_for("pool_size"),
                submit_text="下一步",
                show_reset=True,
                meta="如果之前设定过，会显示默认数量；你直接改数字也可以。",
                fields=[
                    {
                        "name": "target_word_count",
                        "label": "单词池数量",
                        "type": "number",
                        "value": default_value,
                        "placeholder": "例如 20",
                        "autofocus": True,
                        "required": True,
                    }
                ],
            )

        save_user_setting(int(pending_user_id), value)
        return redirect(url_for("password_step"))

    return render_template(
        "login.html",
        title="设置单词池数量",
        desc=f"当前用户：{pending_username}。请输入这个用户要背的单词池数量。",
        message=None,
        action_url=url_for("pool_size"),
        submit_text="下一步",
        show_reset=True,
        meta="如果之前设定过，会显示默认数量；你直接改数字也可以。",
        fields=[
            {
                "name": "target_word_count",
                "label": "单词池数量",
                "type": "number",
                "value": default_value,
                "placeholder": "例如 20",
                "autofocus": True,
                "required": True,
            }
        ],
    )


@app.route("/password", methods=["GET", "POST"])
def password_step():
    pending_user_id = session.get("pending_user_id")
    pending_username = session.get("pending_username")
    if not pending_user_id or not pending_username:
        return redirect(url_for("login"))

    user = get_user_by_id(int(pending_user_id))
    if not user:
        return redirect(url_for("reset_login"))

    has_password = is_password_set(user)

    if request.method == "POST":
        password = request.form.get("password", "")

        if has_password:
            if not check_password_hash(user["password_hash"], password):
                return render_template(
                    "login.html",
                    title="输入密码",
                    desc=f"当前用户：{pending_username}。请输入密码登录。",
                    message="密码不正确。",
                    action_url=url_for("password_step"),
                    submit_text="登录",
                    show_reset=True,
                    meta="",
                    fields=[
                        {
                            "name": "password",
                            "label": "密码",
                            "type": "password",
                            "value": "",
                            "placeholder": "请输入密码",
                            "autofocus": True,
                            "required": True,
                        }
                    ],
                )
        else:
            password_confirm = request.form.get("password_confirm", "")
            if not password:
                return render_template(
                    "login.html",
                    title="设置密码",
                    desc=f"当前用户：{pending_username}。这是首次设置密码，请输入并确认。",
                    message="密码不能为空。",
                    action_url=url_for("password_step"),
                    submit_text="确认并登录",
                    show_reset=True,
                    meta="数据库里的 password_hash 如果为空，系统会认为这是首次设置密码。",
                    fields=[
                        {
                            "name": "password",
                            "label": "密码",
                            "type": "password",
                            "value": "",
                            "placeholder": "请输入密码",
                            "autofocus": True,
                            "required": True,
                        },
                        {
                            "name": "password_confirm",
                            "label": "确认密码",
                            "type": "password",
                            "value": "",
                            "placeholder": "请再次输入密码",
                            "autofocus": False,
                            "required": True,
                        },
                    ],
                )
            if password != password_confirm:
                return render_template(
                    "login.html",
                    title="设置密码",
                    desc=f"当前用户：{pending_username}。这是首次设置密码，请输入并确认。",
                    message="两次输入的密码不一致。",
                    action_url=url_for("password_step"),
                    submit_text="确认并登录",
                    show_reset=True,
                    meta="数据库里的 password_hash 如果为空，系统会认为这是首次设置密码。",
                    fields=[
                        {
                            "name": "password",
                            "label": "密码",
                            "type": "password",
                            "value": "",
                            "placeholder": "请输入密码",
                            "autofocus": True,
                            "required": True,
                        },
                        {
                            "name": "password_confirm",
                            "label": "确认密码",
                            "type": "password",
                            "value": "",
                            "placeholder": "请再次输入密码",
                            "autofocus": False,
                            "required": True,
                        },
                    ],
                )
            save_user_password(int(pending_user_id), password)

        session["user_id"] = int(user["id"])
        session["username"] = user["username"]
        session.pop("pending_user_id", None)
        session.pop("pending_username", None)
        return redirect(url_for("home"))

    if has_password:
        return render_template(
            "login.html",
            title="输入密码",
            desc=f"当前用户：{pending_username}。请输入密码登录。",
            message=None,
            action_url=url_for("password_step"),
            submit_text="登录",
            show_reset=True,
            meta="",
            fields=[
                {
                    "name": "password",
                    "label": "密码",
                    "type": "password",
                    "value": "",
                    "placeholder": "请输入密码",
                    "autofocus": True,
                    "required": True,
                }
            ],
        )

    return render_template(
        "login.html",
        title="设置密码",
        desc=f"当前用户：{pending_username}。这是首次设置密码，请输入并确认。",
        message=None,
        action_url=url_for("password_step"),
        submit_text="确认并登录",
        show_reset=True,
        meta="数据库里的 password_hash 如果为空，系统会认为这是首次设置密码。",
        fields=[
            {
                "name": "password",
                "label": "密码",
                "type": "password",
                "value": "",
                "placeholder": "请输入密码",
                "autofocus": True,
                "required": True,
            },
            {
                "name": "password_confirm",
                "label": "确认密码",
                "type": "password",
                "value": "",
                "placeholder": "请再次输入密码",
                "autofocus": False,
                "required": True,
            },
        ],
    )


@app.route("/home")
def home():
    user_id = session.get("user_id")
    username = session.get("username")
    if not user_id or not username:
        return redirect(url_for("login"))

    setting = get_user_setting(int(user_id))
    target_word_count = setting["target_word_count"] if setting else "未设置"

    queue = build_study_queue(int(user_id))
    items = queue.get("items", [])
    queue_locked = bool(queue.get("queue_locked", False))

    return render_template(
        "home.html",
        user_id=user_id,
        username=username,
        target_word_count=target_word_count,
        items=items,
        queue_locked=queue_locked,
    )


# --- Insert test-study-queue route above logout
@app.route("/test-study-queue")
def test_study_queue():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401
    return build_study_queue(int(user_id))



# --- Insert api_start_study route
@app.route("/api/start-study", methods=["POST"])
def api_start_study():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    queue = build_study_queue(int(user_id))
    items = queue.get("items", [])
    queue_locked = bool(queue.get("queue_locked", False))

    result = persist_queue_words_to_user_words(int(user_id), items)

    if queue_locked:
        queue = build_study_queue(int(user_id))
        items = queue.get("items", [])

    return {
        "ok": True,
        "queue_count": len(items),
        "queue_locked": queue_locked,
        "inserted_count": result["inserted_count"],
        "skipped_count": result["skipped_count"],
        "inserted_ids": result["inserted_ids"],
        "skipped_ids": result["skipped_ids"],
        "items": items,
    }


# --- Manual word study API
@app.route("/api/find-word", methods=["POST"])
def api_find_word():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    payload = request.get_json(silent=True) or {}
    word = str(payload.get("word") or "").strip()
    current_queue = build_study_queue(int(user_id))
    if current_queue.get("queue_locked"):
        return {
            "ok": False,
            "message": "今天已经开始学习，不能再手工添加单词。",
            "queue_locked": True,
        }, 400
    if not word:
        return {"ok": False, "message": "请输入单词。"}, 400

    row = get_word_by_text(word)
    if not row:
        return {
            "ok": False,
            "exists": False,
            "word": word,
            "message": "词库中未找到该单词。",
        }

    return {
        "ok": True,
        "exists": True,
        "word_id": int(row["id"]),
        "word": row["word"],
    }


@app.route("/api/start-study-manual", methods=["POST"])
def api_start_study_manual():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    payload = request.get_json(silent=True) or {}
    raw_words = payload.get("words") or []
    current_queue = build_study_queue(int(user_id))
    if current_queue.get("queue_locked"):
        return {
            "ok": False,
            "message": "今天已经开始学习，不能再手工添加单词。",
            "queue_locked": True,
        }, 400
    if not isinstance(raw_words, list):
        return {"ok": False, "message": "words 参数格式错误。"}, 400

    manual_words = normalize_manual_words(raw_words)
    if not manual_words:
        return {"ok": False, "message": "请先至少添加一个单词。"}, 400

    setting = get_user_setting(int(user_id))
    target_word_count = int(setting["target_word_count"]) if setting else 20

    manual_items: list[dict] = []
    missing_words: list[str] = []
    manual_seen: set[str] = set()

    for word in manual_words:
        row = get_word_by_text(word)
        if not row:
            missing_words.append(word)
            continue

        normalized = str(row["word"]).strip().lower()
        if normalized in manual_seen:
            continue
        manual_seen.add(normalized)
        manual_items.append(
            {
                "word_id": int(row["id"]),
                "word": row["word"],
                "source_type": "manual",
            }
        )

    if missing_words:
        return {
            "ok": False,
            "message": "有单词不在词库中。",
            "missing_words": missing_words,
        }, 400

    final_items = list(manual_items)
    if len(final_items) < target_word_count:
        queue = build_study_queue(int(user_id))
        queue_items = queue.get("items", [])
        existing_keys = {str(item["word"]).strip().lower() for item in final_items}

        for item in queue_items:
            word = str(item.get("word") or "").strip()
            if not word:
                continue
            key = word.lower()
            if key in existing_keys:
                continue
            final_items.append(item)
            existing_keys.add(key)
            if len(final_items) >= target_word_count:
                break

    final_items = final_items[:target_word_count]
    result = persist_queue_words_to_user_words(int(user_id), final_items)

    return {
        "ok": True,
        "queue_count": len(final_items),
        "manual_count": len(manual_items),
        "fill_count": max(0, len(final_items) - len(manual_items)),
        "inserted_count": result["inserted_count"],
        "skipped_count": result["skipped_count"],
        "items": final_items,
    }

@app.route("/api/check-dictation", methods=["POST"])
def api_check_dictation():
    user_id = session.get("user_id")
    if not user_id:
        return {"error": "not logged in"}, 401

    payload = request.get_json(silent=True) or {}
    answer = str(payload.get("answer") or "")
    word = str(payload.get("word") or "").strip()
    word_id = payload.get("word_id")

    correct_word = word
    if not correct_word and word_id is not None:
        try:
            row = get_word_by_id(int(word_id))
        except (TypeError, ValueError):
            row = None
        if row:
            correct_word = str(row["word"] or "").strip()

    if not correct_word:
        return {"ok": False, "message": "缺少单词。"}, 400

    is_correct = answer.strip().lower() == correct_word.strip().lower()
    # TODO: 这里以后接入 correct_count / wrong_count / 进度条 / level 逻辑

    return {
        "ok": True,
        "is_correct": is_correct,
        "correct_word": correct_word,
    }

@app.route("/api/ai/ping", methods=["POST"])
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

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


if __name__ == "__main__":
    app.run(debug=True)
