from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

_DAYS_PER_MONTH = {1: 31, 2: 62, 3: 93}


def _parse_expires_at(expires_at: Optional[str]) -> Optional[datetime]:
    if not expires_at:
        return None
    try:
        return datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def get_expiry_status(expires_at: Optional[str]) -> dict:
    """
    返回到期状态字典：
      status: "未开通" | "已到期" | "有效中"
      expires_at: 原始字符串或 None
    """
    dt = _parse_expires_at(expires_at)
    if dt is None:
        return {"status": "未开通", "expires_at": None}
    if dt <= datetime.now():
        return {"status": "已到期", "expires_at": expires_at}
    return {"status": "有效中", "expires_at": expires_at}


def calculate_new_expiry(expires_at: Optional[str], months: int) -> str:
    """
    计算续费后的新到期时间。
    - expires_at 为空或已过期：从当前时间起算
    - expires_at 还在有效期内：从 expires_at 继续往后加
    - months 对应天数：1→31天，2→62天，3→93天
    """
    days = _DAYS_PER_MONTH.get(months, 31)
    now = datetime.now()

    base_dt = now
    dt = _parse_expires_at(expires_at)
    if dt is not None and dt > now:
        base_dt = dt

    new_expiry = base_dt + timedelta(days=days)
    return new_expiry.strftime("%Y-%m-%d %H:%M:%S")
