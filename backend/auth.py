import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel
from db import db
from utils import new_id, utcnow, audit

router = APIRouter(tags=["auth"])

OWNER_EMAIL = "ambuj142006@gmail.com"
SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


async def resolve_role(email: str) -> str:
    if email.lower() == OWNER_EMAIL:
        return "admin"
    doctor = await db.doctors.find_one({"email": email.lower()}, {"_id": 0})
    if doctor:
        return "doctor"
    return "patient"


async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization")
        if auth and auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("status") == "deactivated":
        raise HTTPException(status_code=403, detail="Account deactivated")
    return user


def require_roles(*roles):
    async def guard(user=Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return guard


class SessionRequest(BaseModel):
    session_id: str


@router.post("/auth/session")
async def create_session(payload: SessionRequest, response: Response):
    async with httpx.AsyncClient(timeout=15) as client_http:
        try:
            r = await client_http.get(SESSION_DATA_URL, headers={"X-Session-ID": payload.session_id})
        except Exception:
            raise HTTPException(status_code=502, detail="Auth provider unreachable")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session id")
    data = r.json()
    email = data["email"].lower()
    role = await resolve_role(email)

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = {
            "user_id": new_id("user"),
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture", ""),
            "role": role,
            "status": "active",
            "created_at": utcnow(),
        }
        await db.users.insert_one(user)
        user.pop("_id", None)
    else:
        updates = {"name": data.get("name", user["name"]), "picture": data.get("picture", user.get("picture", "")), "role": role}
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
        user.update(updates)

    if role == "doctor":
        await db.doctors.update_one({"email": email}, {"$set": {"user_id": user["user_id"]}})

    session_token = data["session_token"]
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": utcnow() + timedelta(days=7),
        "created_at": utcnow(),
    })
    response.set_cookie("session_token", session_token, path="/", secure=True, httponly=True, samesite="none", max_age=7 * 24 * 3600)
    await audit(user["user_id"], "login")
    user.pop("_id", None)
    return user


@router.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return user


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if session:
            await audit(session["user_id"], "logout")
        await db.user_sessions.delete_many({"session_token": token})
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}
