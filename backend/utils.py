import uuid
from datetime import datetime, timezone
from db import db


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def notify(user_id: str, title: str, message: str, ntype: str = "general", link: str = None):
    await db.notifications.insert_one({
        "notification_id": new_id("ntf"),
        "user_id": user_id,
        "title": title,
        "message": message,
        "type": ntype,
        "link": link,
        "read": False,
        "created_at": utcnow(),
    })


async def audit(user_id: str, action: str, resource_type: str = None, resource_id: str = None):
    await db.audit_logs.insert_one({
        "log_id": new_id("log"),
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "timestamp": utcnow(),
    })
