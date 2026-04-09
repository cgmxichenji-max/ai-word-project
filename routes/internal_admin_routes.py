from __future__ import annotations

from flask import Blueprint, redirect, render_template, request, session, url_for

from repositories.user_repo import (
    get_user_by_id,
    get_user_by_username,
    set_user_expires_at,
)
from services.user_expiry_service import calculate_new_expiry, get_expiry_status
from utils.db import get_conn

internal_admin_bp = Blueprint("internal_admin", __name__)


def _require_georgeji():
    """检查当前登录用户是否为 GeorgeJi，返回 (allowed, error_response_or_none)。"""
    user_id = session.get("user_id")
    username = str(session.get("username") or "").strip()
    if not user_id or not username:
        return False, redirect(url_for("login"))
    if username != "GeorgeJi":
        return False, ({"ok": False, "message": "只有 GeorgeJi 可以访问这个页面。"}, 403)
    return True, None


@internal_admin_bp.route("/internal-user-create")
def internal_user_create_page():
    allowed, denied = _require_georgeji()
    if not allowed:
        return denied
    return render_template("internal_admin.html")


@internal_admin_bp.route("/api/internal/create-user", methods=["POST"])
def api_internal_create_user():
    allowed, denied = _require_georgeji()
    if not allowed:
        return denied

    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username") or "").strip()

    if not username:
        return {"ok": False, "message": "用户名不能为空。"}, 400
    if len(username) > 50:
        return {"ok": False, "message": "用户名太长了。"}, 400

    existing = get_user_by_username(username)
    if existing:
        return {"ok": False, "message": "这个用户名已经存在。"}, 400

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO users (
                username, password_hash, display_name, role,
                is_active, created_at, updated_at, note
            ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
            """,
            (username, "", username, "user", 1, "由 GeorgeJi 在内部创建页创建"),
        )
        conn.commit()

    return {"ok": True, "message": f"用户 {username} 创建成功，首次登录时可自行设置密码。"}


@internal_admin_bp.route("/api/internal/user-expiry-info", methods=["POST"])
def api_user_expiry_info():
    allowed, denied = _require_georgeji()
    if not allowed:
        return denied

    payload = request.get_json(silent=True) or {}
    user_id_raw = payload.get("user_id")
    username_raw = str(payload.get("username") or "").strip()

    if user_id_raw is None and not username_raw:
        return {"ok": False, "message": "请提供 user_id 或 username。"}, 400

    user = None
    if user_id_raw is not None:
        try:
            user = get_user_by_id(int(user_id_raw))
        except (TypeError, ValueError):
            pass
    if user is None and username_raw:
        user = get_user_by_username(username_raw)

    if user is None:
        return {"ok": False, "message": "用户不存在。"}, 404

    expiry = get_expiry_status(user["expires_at"])
    return {
        "ok": True,
        "id": int(user["id"]),
        "username": user["username"],
        "expires_at": expiry["expires_at"],
        "status": expiry["status"],
        "message": f"查询成功：{user['username']} 当前状态为「{expiry['status']}」",
    }


@internal_admin_bp.route("/api/internal/extend-user-expiry", methods=["POST"])
def api_extend_user_expiry():
    allowed, denied = _require_georgeji()
    if not allowed:
        return denied

    payload = request.get_json(silent=True) or {}
    user_id_raw = payload.get("user_id")
    months_raw = payload.get("months")

    if user_id_raw is None:
        return {"ok": False, "message": "缺少 user_id。"}, 400
    if months_raw is None:
        return {"ok": False, "message": "缺少 months。"}, 400

    try:
        user_id = int(user_id_raw)
        months = int(months_raw)
    except (TypeError, ValueError):
        return {"ok": False, "message": "参数格式错误。"}, 400

    if months not in (1, 2, 3):
        return {"ok": False, "message": "months 只允许 1 / 2 / 3。"}, 400

    user = get_user_by_id(user_id)
    if user is None:
        return {"ok": False, "message": "用户不存在。"}, 404

    old_expires_at = user["expires_at"]
    new_expires_at = calculate_new_expiry(old_expires_at, months)
    set_user_expires_at(user_id, new_expires_at)

    expiry = get_expiry_status(new_expires_at)
    return {
        "ok": True,
        "id": user_id,
        "username": user["username"],
        "old_expires_at": old_expires_at,
        "new_expires_at": new_expires_at,
        "status": expiry["status"],
        "message": f"续费成功！{user['username']} 新到期时间：{new_expires_at}",
    }
