from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from db import db
from auth import get_current_user, require_roles
from utils import new_id, utcnow, notify, audit

router = APIRouter(tags=["appointments"])

ACTIVE_STATUSES = ["scheduled", "confirmed"]


async def get_doctor_or_404(doctor_id: str):
    doc = await db.doctors.find_one({"doctor_id": doctor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor not found")
    return doc


async def doctor_on_leave(doctor_id: str, date_str: str) -> bool:
    leave = await db.leave_requests.find_one({
        "staff_id": doctor_id, "status": "approved",
        "start_date": {"$lte": date_str}, "end_date": {"$gte": date_str},
    }, {"_id": 0})
    return leave is not None


def build_slots(doctor, date_str: str, booked: set):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")
    if d.weekday() not in (doctor.get("working_days") or []):
        return []
    try:
        start = datetime.strptime(doctor.get("start_time", "09:00"), "%H:%M")
        end = datetime.strptime(doctor.get("end_time", "17:00"), "%H:%M")
    except ValueError:
        return []
    slot_minutes = max(10, int(doctor.get("slot_minutes", 30)))
    today = datetime.now(timezone.utc).date()
    now_hm = datetime.now(timezone.utc).strftime("%H:%M")
    slots = []
    cur = start
    while cur + timedelta(minutes=slot_minutes) <= end:
        t = cur.strftime("%H:%M")
        is_past = d < today or (d == today and t <= now_hm)
        slots.append({"time": t, "booked": (t in booked) or is_past})
        cur += timedelta(minutes=slot_minutes)
    return slots


@router.get("/doctors/{doctor_id}/availability")
async def doctor_availability(doctor_id: str, date: str, user=Depends(get_current_user)):
    doctor = await get_doctor_or_404(doctor_id)
    on_leave = await doctor_on_leave(doctor_id, date)
    if on_leave:
        return {"date": date, "on_leave": True, "slots": []}
    booked = {
        a["time"] for a in await db.appointments.find(
            {"doctor_id": doctor_id, "date": date, "status": {"$in": ACTIVE_STATUSES}}, {"_id": 0}
        ).to_list(200)
    }
    return {"date": date, "on_leave": False, "slots": build_slots(doctor, date, booked)}


class ScheduleIn(BaseModel):
    working_days: List[int]
    start_time: str
    end_time: str
    slot_minutes: int = 30


@router.get("/doctors/me/profile")
async def doctor_me(user=Depends(require_roles("doctor"))):
    doc = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Doctor profile not found")
    h = await db.hospitals.find_one({"hospital_id": doc["hospital_id"]}, {"_id": 0, "name": 1, "city": 1})
    doc["hospital_name"] = h["name"] if h else ""
    dept = await db.departments.find_one({"department_id": doc.get("department_id")}, {"_id": 0})
    doc["department_name"] = dept["name"] if dept else ""
    return doc


@router.put("/doctors/me/schedule")
async def update_schedule(payload: ScheduleIn, user=Depends(require_roles("doctor"))):
    await db.doctors.update_one({"email": user["email"]}, {"$set": payload.model_dump()})
    return {"ok": True}


class AppointmentIn(BaseModel):
    hospital_id: str
    doctor_id: str
    department_id: Optional[str] = None
    date: str
    time: str
    reason: Optional[str] = ""


async def enrich_appointment(a):
    a.pop("_id", None)
    h = await db.hospitals.find_one({"hospital_id": a["hospital_id"]}, {"_id": 0, "hospital_id": 1, "name": 1, "city": 1, "address": 1, "latitude": 1, "longitude": 1})
    a["hospital"] = h
    d = await db.doctors.find_one({"doctor_id": a["doctor_id"]}, {"_id": 0, "doctor_id": 1, "name": 1, "specialization": 1, "photo_url": 1})
    a["doctor"] = d
    p = await db.users.find_one({"user_id": a["patient_id"]}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1})
    a["patient"] = p
    return a


@router.post("/appointments")
async def book_appointment(payload: AppointmentIn, user=Depends(require_roles("patient"))):
    doctor = await get_doctor_or_404(payload.doctor_id)
    if not doctor.get("active", True):
        raise HTTPException(400, "Doctor is not available")
    hospital = await db.hospitals.find_one({"hospital_id": payload.hospital_id}, {"_id": 0})
    if not hospital:
        raise HTTPException(400, "Hospital not found")
    try:
        appt_date = datetime.strptime(payload.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date")
    if appt_date < datetime.now(timezone.utc).date():
        raise HTTPException(400, "Cannot book an appointment in the past")
    if await doctor_on_leave(payload.doctor_id, payload.date):
        raise HTTPException(409, "Doctor is on leave on the selected date")
    booked = {
        a["time"] for a in await db.appointments.find(
            {"doctor_id": payload.doctor_id, "date": payload.date, "status": {"$in": ACTIVE_STATUSES}}, {"_id": 0}
        ).to_list(200)
    }
    valid = {s["time"]: s["booked"] for s in build_slots(doctor, payload.date, booked)}
    if payload.time not in valid:
        raise HTTPException(400, "Selected time is outside the doctor's working hours")
    if valid[payload.time]:
        raise HTTPException(409, "This time slot is already booked")

    doc = {
        "appointment_id": new_id("appt"),
        "patient_id": user["user_id"],
        "hospital_id": payload.hospital_id,
        "doctor_id": payload.doctor_id,
        "department_id": payload.department_id,
        "date": payload.date,
        "time": payload.time,
        "reason": payload.reason,
        "status": "scheduled",
        "created_at": utcnow(),
    }
    await db.appointments.insert_one(doc)
    doc.pop("_id", None)
    await notify(user["user_id"], "Appointment booked", f"Your appointment with Dr. {doctor['name']} at {hospital['name']} on {payload.date} at {payload.time} is scheduled.", "appointment", "/appointments")
    if doctor.get("user_id"):
        await notify(doctor["user_id"], "New appointment", f"{user['name']} booked an appointment on {payload.date} at {payload.time}.", "appointment", "/doctor/appointments")
    await audit(user["user_id"], "appointment_book", "appointment", doc["appointment_id"])
    return await enrich_appointment(doc)


@router.get("/appointments")
async def list_appointments(status: Optional[str] = None, user=Depends(get_current_user)):
    query = {}
    if user["role"] == "patient":
        query["patient_id"] = user["user_id"]
    elif user["role"] == "doctor":
        doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
        if not doctor:
            return {"appointments": []}
        query["doctor_id"] = doctor["doctor_id"]
    if status:
        query["status"] = status
    appts = await db.appointments.find(query, {"_id": 0}).sort([("date", 1), ("time", 1)]).to_list(1000)
    return {"appointments": [await enrich_appointment(a) for a in appts]}


async def get_appointment_scoped(appointment_id: str, user):
    a = await db.appointments.find_one({"appointment_id": appointment_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Appointment not found")
    if user["role"] == "patient" and a["patient_id"] != user["user_id"]:
        raise HTTPException(403, "Not your appointment")
    if user["role"] == "doctor":
        doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
        if not doctor or a["doctor_id"] != doctor["doctor_id"]:
            raise HTTPException(403, "Not your appointment")
    return a


@router.get("/appointments/{appointment_id}")
async def get_appointment(appointment_id: str, user=Depends(get_current_user)):
    return await enrich_appointment(await get_appointment_scoped(appointment_id, user))


@router.post("/appointments/{appointment_id}/cancel")
async def cancel_appointment(appointment_id: str, user=Depends(get_current_user)):
    a = await get_appointment_scoped(appointment_id, user)
    if a["status"] in ("completed", "cancelled"):
        raise HTTPException(400, f"Cannot cancel a {a['status']} appointment")
    await db.appointments.update_one({"appointment_id": appointment_id}, {"$set": {"status": "cancelled", "updated_at": utcnow()}})
    doctor = await db.doctors.find_one({"doctor_id": a["doctor_id"]}, {"_id": 0})
    await notify(a["patient_id"], "Appointment cancelled", f"Your appointment on {a['date']} at {a['time']} was cancelled.", "appointment", "/appointments")
    if doctor and doctor.get("user_id") and doctor["user_id"] != user["user_id"]:
        await notify(doctor["user_id"], "Appointment cancelled", f"Appointment on {a['date']} at {a['time']} was cancelled.", "appointment", "/doctor/appointments")
    await audit(user["user_id"], "appointment_cancel", "appointment", appointment_id)
    return {"ok": True}


class RescheduleIn(BaseModel):
    date: str
    time: str


@router.post("/appointments/{appointment_id}/reschedule")
async def reschedule_appointment(appointment_id: str, payload: RescheduleIn, user=Depends(get_current_user)):
    a = await get_appointment_scoped(appointment_id, user)
    if a["status"] in ("completed", "cancelled"):
        raise HTTPException(400, f"Cannot reschedule a {a['status']} appointment")
    doctor = await get_doctor_or_404(a["doctor_id"])
    try:
        appt_date = datetime.strptime(payload.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date")
    if appt_date < datetime.now(timezone.utc).date():
        raise HTTPException(400, "Cannot reschedule to a past date")
    if await doctor_on_leave(a["doctor_id"], payload.date):
        raise HTTPException(409, "Doctor is on leave on the selected date")
    booked = {
        x["time"] for x in await db.appointments.find(
            {"doctor_id": a["doctor_id"], "date": payload.date, "status": {"$in": ACTIVE_STATUSES},
             "appointment_id": {"$ne": appointment_id}}, {"_id": 0}
        ).to_list(200)
    }
    valid = {s["time"]: s["booked"] for s in build_slots(doctor, payload.date, booked)}
    if payload.time not in valid:
        raise HTTPException(400, "Selected time is outside the doctor's working hours")
    if valid[payload.time]:
        raise HTTPException(409, "This time slot is already booked")
    await db.appointments.update_one({"appointment_id": appointment_id},
        {"$set": {"date": payload.date, "time": payload.time, "status": "scheduled", "updated_at": utcnow()}})
    await notify(a["patient_id"], "Appointment rescheduled", f"Your appointment was moved to {payload.date} at {payload.time}.", "appointment", "/appointments")
    if doctor.get("user_id"):
        await notify(doctor["user_id"], "Appointment rescheduled", f"Appointment moved to {payload.date} at {payload.time}.", "appointment", "/doctor/appointments")
    await audit(user["user_id"], "appointment_reschedule", "appointment", appointment_id)
    return {"ok": True}


class StatusIn(BaseModel):
    status: str


@router.post("/appointments/{appointment_id}/status")
async def set_status(appointment_id: str, payload: StatusIn, user=Depends(require_roles("doctor", "admin"))):
    if payload.status not in ["scheduled", "confirmed", "completed", "cancelled", "no-show"]:
        raise HTTPException(400, "Invalid status")
    a = await get_appointment_scoped(appointment_id, user)
    await db.appointments.update_one({"appointment_id": appointment_id}, {"$set": {"status": payload.status, "updated_at": utcnow()}})
    await notify(a["patient_id"], f"Appointment {payload.status}", f"Your appointment on {a['date']} at {a['time']} is now {payload.status}.", "appointment", "/appointments")
    await audit(user["user_id"], f"appointment_status_{payload.status}", "appointment", appointment_id)
    return {"ok": True}


# ---------------- Leave requests ----------------

class LeaveIn(BaseModel):
    start_date: str
    end_date: str
    leave_type: str = "casual"
    reason: Optional[str] = ""


@router.post("/leave")
async def apply_leave(payload: LeaveIn, user=Depends(require_roles("doctor"))):
    doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
    if not doctor:
        raise HTTPException(404, "Doctor profile not found")
    if payload.end_date < payload.start_date:
        raise HTTPException(400, "End date must be after start date")
    doc = {"leave_id": new_id("leave"), "staff_id": doctor["doctor_id"], "staff_name": doctor["name"],
           "start_date": payload.start_date, "end_date": payload.end_date, "leave_type": payload.leave_type,
           "reason": payload.reason, "status": "pending", "reviewed_by": None, "created_at": utcnow()}
    await db.leave_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/leave")
async def list_leave(user=Depends(get_current_user)):
    if user["role"] == "admin":
        leaves = await db.leave_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    else:
        doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
        leaves = await db.leave_requests.find({"staff_id": doctor["doctor_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100) if doctor else []
    return {"leave_requests": leaves}


class LeaveReviewIn(BaseModel):
    status: str


@router.post("/leave/{leave_id}/review")
async def review_leave(leave_id: str, payload: LeaveReviewIn, user=Depends(require_roles("admin"))):
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(400, "Invalid status")
    leave = await db.leave_requests.find_one({"leave_id": leave_id}, {"_id": 0})
    if not leave:
        raise HTTPException(404, "Leave request not found")
    await db.leave_requests.update_one({"leave_id": leave_id}, {"$set": {"status": payload.status, "reviewed_by": user["user_id"]}})
    doctor = await db.doctors.find_one({"doctor_id": leave["staff_id"]}, {"_id": 0})
    if doctor and doctor.get("user_id"):
        await notify(doctor["user_id"], f"Leave {payload.status}", f"Your leave request ({leave['start_date']} to {leave['end_date']}) was {payload.status}.", "leave", "/doctor/schedule")
    await audit(user["user_id"], f"leave_{payload.status}", "leave", leave_id)
    return {"ok": True}
