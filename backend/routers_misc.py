from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from db import db
from auth import get_current_user, require_roles
from utils import utcnow

router = APIRouter(tags=["misc"])


@router.get("/")
async def root():
    return {"message": "SmartCare AI API"}


# ---------------- Notifications ----------------

@router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    unread = sum(1 for n in items if not n.get("read"))
    return {"notifications": items, "unread": unread}


@router.post("/notifications/{notification_id}/read")
async def mark_read(notification_id: str, user=Depends(get_current_user)):
    await db.notifications.update_one({"notification_id": notification_id, "user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/read-all")
async def mark_all_read(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---------------- Profile ----------------

class ProfileIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[str] = None
    blood_group: Optional[str] = None
    allergies: Optional[str] = None


@router.put("/profile")
async def update_profile(payload: ProfileIn, user=Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})


# ---------------- Admin ----------------

@router.get("/admin/stats")
async def admin_stats(user=Depends(require_roles("admin"))):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_patients = await db.users.count_documents({"role": "patient"})
    total_doctors = await db.doctors.count_documents({"active": True})
    total_hospitals = await db.hospitals.count_documents({})
    total_appointments = await db.appointments.count_documents({})
    todays = await db.appointments.count_documents({"date": today})
    completed = await db.appointments.count_documents({"status": "completed"})
    cancelled = await db.appointments.count_documents({"status": "cancelled"})
    no_show = await db.appointments.count_documents({"status": "no-show"})
    pending_leave = await db.leave_requests.count_documents({"status": "pending"})
    reports = await db.lab_reports.count_documents({})

    pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    by_status = {x["_id"]: x["count"] for x in await db.appointments.aggregate(pipeline).to_list(20)}

    recent_users = await db.users.find({}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "created_at": 1}).sort("created_at", -1).to_list(8)
    return {
        "total_patients": total_patients, "total_doctors": total_doctors, "total_hospitals": total_hospitals,
        "total_appointments": total_appointments, "todays_appointments": todays, "completed_appointments": completed,
        "cancelled_appointments": cancelled, "no_shows": no_show, "pending_leave": pending_leave,
        "total_reports": reports, "appointments_by_status": by_status, "recent_users": recent_users,
    }


@router.get("/admin/users")
async def admin_users(user=Depends(require_roles("admin"))):
    users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"users": users}


class UserUpdateIn(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None


@router.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, payload: UserUpdateIn, user=Depends(require_roles("admin"))):
    updates = {}
    if payload.role:
        if payload.role not in ("patient", "doctor", "admin"):
            raise HTTPException(400, "Invalid role")
        updates["role"] = payload.role
    if payload.status:
        if payload.status not in ("active", "deactivated"):
            raise HTTPException(400, "Invalid status")
        updates["status"] = payload.status
    if user_id == user["user_id"] and updates.get("status") == "deactivated":
        raise HTTPException(400, "You cannot deactivate your own account")
    if updates:
        await db.users.update_one({"user_id": user_id}, {"$set": updates})
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


@router.get("/admin/audit-logs")
async def admin_audit_logs(user=Depends(require_roles("admin"))):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(200)
    return {"logs": logs}


# ---------------- Doctor dashboard stats ----------------

@router.get("/doctor/stats")
async def doctor_stats(user=Depends(require_roles("doctor"))):
    doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
    if not doctor:
        raise HTTPException(404, "Doctor profile not found")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    did = doctor["doctor_id"]
    todays = await db.appointments.find({"doctor_id": did, "date": today, "status": {"$in": ["scheduled", "confirmed"]}}, {"_id": 0}).sort("time", 1).to_list(100)
    upcoming = await db.appointments.count_documents({"doctor_id": did, "date": {"$gt": today}, "status": {"$in": ["scheduled", "confirmed"]}})
    completed = await db.appointments.count_documents({"doctor_id": did, "status": "completed"})
    patient_ids = await db.appointments.distinct("patient_id", {"doctor_id": did})
    for a in todays:
        p = await db.users.find_one({"user_id": a["patient_id"]}, {"_id": 0, "name": 1, "picture": 1, "email": 1})
        a["patient"] = p
    return {"todays_appointments": todays, "upcoming_count": upcoming, "completed_count": completed,
            "patient_count": len(patient_ids), "doctor": doctor}
