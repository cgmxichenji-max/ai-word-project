from flask import Blueprint, jsonify

from services.notice_service import get_notice_html

notice_bp = Blueprint("notice", __name__)


@notice_bp.route("/system-notice-content", methods=["GET"])
def system_notice_content():
    html = get_notice_html()
    if html is None:
        return jsonify({"ok": False, "message": "no notice"}), 404
    return jsonify({"ok": True, "html": html})
