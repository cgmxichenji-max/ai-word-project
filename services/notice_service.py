import os
import markdown

_NOTICE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "notice",
    "system_notice.md",
)


def notice_exists() -> bool:
    return os.path.isfile(_NOTICE_PATH)


def get_notice_html() -> str | None:
    """读取 notice/system_notice.md 并转为 HTML；文件不存在返回 None。"""
    if not notice_exists():
        return None
    with open(_NOTICE_PATH, encoding="utf-8") as f:
        md_text = f.read()
    return markdown.markdown(md_text, extensions=["nl2br"])
