import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from db import db
from auth import get_current_user, require_roles
from utils import new_id, utcnow, audit

router = APIRouter(tags=["hospitals"])

IMAGE_TYPES = ["exterior", "entrance", "reception", "ward", "icu", "laboratory", "pharmacy", "emergency", "other"]


class HospitalIn(BaseModel):
    name: str
    description: Optional[str] = ""
    hospital_type: Optional[str] = "multi-specialty"
    phone: Optional[str] = ""
    email: Optional[str] = ""
    website: Optional[str] = ""
    emergency_phone: Optional[str] = ""
    address: str
    city: str
    state: Optional[str] = ""
    country: Optional[str] = "India"
    postal_code: Optional[str] = ""
    latitude: float
    longitude: float
    opening_hours: Optional[str] = ""
    emergency_available: Optional[bool] = None
    specialties: Optional[List[str]] = []
    area: Optional[str] = ""


def serialize_hospital(h):
    h.pop("_id", None)
    return h


@router.get("/hospitals")
async def list_hospitals(
    search: Optional[str] = None,
    city: Optional[str] = None,
    hospital_type: Optional[str] = None,
    department: Optional[str] = None,
    emergency: Optional[bool] = None,
    sort: Optional[str] = "name",
    page: int = 1,
    limit: int = 12,
    area: Optional[str] = None,
    verification_status: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    user=Depends(get_current_user),
):
    from routers_discovery import search_hospitals, search_params
    return await search_hospitals(search_params(search, city, area, hospital_type, department, emergency, verification_status, sort, page, limit, lat, lng, radius_km))


@router.post("/hospitals")
async def create_hospital(payload: HospitalIn, user=Depends(require_roles("admin"))):
    doc = payload.model_dump()
    from discovery_service import geo_point, norm_phone, slugify
    doc.update({"hospital_id": new_id("hosp"), "verified": True, "verification_status": "verified", "data_source": "admin",
                "external_provider": None, "external_provider_id": None, "area": "", "facilities": [], "data_version": 1,
                "location": geo_point(doc["latitude"], doc["longitude"]), "phone_norm": norm_phone(doc["phone"]),
                "created_at": utcnow(), "updated_at": utcnow()})
    doc["slug"] = slugify(doc["name"], doc["city"])
    await db.hospitals.insert_one(doc)
    await audit(user["user_id"], "hospital_create", "hospital", doc["hospital_id"])
    doc.pop("_id", None)
    return doc


@router.get("/hospitals/{hospital_id}")
async def get_hospital(hospital_id: str, user=Depends(get_current_user)):
    h = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Hospital not found")
    from routers_discovery import image_url
    h.pop("phone_norm", None)
    h.pop("history", None)
    imgs = await db.hospital_images.find({"hospital_id": hospital_id}, {"_id": 0}).to_list(100)
    for i in imgs:
        i["url"] = image_url(i)
    h["images"] = [i for i in imgs if i["url"]]
    h["services"] = await db.hospital_services.find({"hospital_id": hospital_id}, {"_id": 0}).to_list(200)
    h["departments"] = await db.departments.find({"hospital_id": hospital_id}, {"_id": 0}).to_list(100)
    h["doctors"] = await db.doctors.find({"hospital_id": hospital_id, "active": True}, {"_id": 0}).to_list(200)
    h["booking_available"] = len(h["doctors"]) > 0
    for d in h["doctors"]:
        dept = await db.departments.find_one({"department_id": d.get("department_id")}, {"_id": 0})
        d["department_name"] = dept["name"] if dept else ""
    return h


@router.put("/hospitals/{hospital_id}")
async def update_hospital(hospital_id: str, payload: HospitalIn, user=Depends(require_roles("admin"))):
    from discovery_service import geo_point, norm_phone
    update = payload.model_dump()
    update.update({"updated_at": utcnow(), "location": geo_point(update["latitude"], update["longitude"]), "phone_norm": norm_phone(update["phone"])})
    result = await db.hospitals.update_one({"hospital_id": hospital_id}, {"$set": update, "$inc": {"data_version": 1}})
    if result.matched_count == 0:
        raise HTTPException(404, "Hospital not found")
    await audit(user["user_id"], "hospital_update", "hospital", hospital_id)
    return await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})


@router.delete("/hospitals/{hospital_id}")
async def delete_hospital(hospital_id: str, user=Depends(require_roles("admin"))):
    await db.hospitals.delete_one({"hospital_id": hospital_id})
    await db.hospital_images.delete_many({"hospital_id": hospital_id})
    await db.departments.delete_many({"hospital_id": hospital_id})
    await audit(user["user_id"], "hospital_delete", "hospital", hospital_id)
    return {"ok": True}


class ImageIn(BaseModel):
    url: str
    image_type: str = "other"
    caption: Optional[str] = ""


@router.post("/hospitals/{hospital_id}/images")
async def add_hospital_image(hospital_id: str, payload: ImageIn, user=Depends(require_roles("admin"))):
    if payload.image_type not in IMAGE_TYPES:
        raise HTTPException(400, "Invalid image type")
    doc = {"image_id": new_id("img"), "hospital_id": hospital_id, "url": payload.url,
           "image_type": payload.image_type, "caption": payload.caption, "source": "admin", "verified": True, "created_at": utcnow()}
    await db.hospital_images.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/hospitals/{hospital_id}/images/{image_id}")
async def delete_hospital_image(hospital_id: str, image_id: str, user=Depends(require_roles("admin"))):
    await db.hospital_images.delete_one({"image_id": image_id, "hospital_id": hospital_id})
    return {"ok": True}


class FacilityIn(BaseModel):
    name: str
    available: bool = True
    description: Optional[str] = ""


@router.put("/hospitals/{hospital_id}/facilities")
async def set_facilities(hospital_id: str, facilities: List[FacilityIn], user=Depends(require_roles("admin"))):
    await db.hospitals.update_one({"hospital_id": hospital_id}, {"$set": {"facilities": [f.model_dump() for f in facilities], "updated_at": utcnow()}})
    return {"ok": True}


class DepartmentIn(BaseModel):
    name: str
    description: Optional[str] = ""


@router.post("/hospitals/{hospital_id}/departments")
async def add_department(hospital_id: str, payload: DepartmentIn, user=Depends(require_roles("admin"))):
    doc = {"department_id": new_id("dept"), "hospital_id": hospital_id, "name": payload.name, "description": payload.description}
    await db.departments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/departments/{department_id}")
async def delete_department(department_id: str, user=Depends(require_roles("admin"))):
    await db.departments.delete_one({"department_id": department_id})
    return {"ok": True}


# ---------------- Doctors ----------------

class DoctorIn(BaseModel):
    name: str
    email: str
    hospital_id: str
    department_id: Optional[str] = None
    specialization: str
    qualification: Optional[str] = ""
    experience_years: int = 0
    languages: Optional[List[str]] = []
    consultation_fee: float = 0
    photo_url: Optional[str] = ""
    bio: Optional[str] = ""
    gender: Optional[str] = ""
    working_days: Optional[List[int]] = [0, 1, 2, 3, 4, 5]
    start_time: Optional[str] = "09:00"
    end_time: Optional[str] = "17:00"
    slot_minutes: Optional[int] = 30


@router.get("/doctors")
async def list_doctors(
    search: Optional[str] = None,
    hospital_id: Optional[str] = None,
    department_id: Optional[str] = None,
    specialization: Optional[str] = None,
    user=Depends(get_current_user),
):
    query = {"active": True}
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [{"name": rx}, {"specialization": rx}]
    if hospital_id:
        query["hospital_id"] = hospital_id
    if department_id:
        query["department_id"] = department_id
    if specialization:
        query["specialization"] = {"$regex": re.escape(specialization), "$options": "i"}
    doctors = await db.doctors.find(query, {"_id": 0}).to_list(500)
    for d in doctors:
        h = await db.hospitals.find_one({"hospital_id": d["hospital_id"]}, {"_id": 0, "name": 1, "city": 1})
        d["hospital_name"] = h["name"] if h else ""
        dept = await db.departments.find_one({"department_id": d.get("department_id")}, {"_id": 0})
        d["department_name"] = dept["name"] if dept else ""
    return {"doctors": doctors}


@router.post("/doctors")
async def create_doctor(payload: DoctorIn, user=Depends(require_roles("admin"))):
    email = payload.email.lower()
    existing = await db.doctors.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(400, "A doctor with this email already exists")
    doc = payload.model_dump()
    doc["email"] = email
    doc.update({"doctor_id": new_id("doc"), "user_id": None, "active": True, "created_at": utcnow()})
    await db.doctors.insert_one(doc)
    await audit(user["user_id"], "doctor_create", "doctor", doc["doctor_id"])
    doc.pop("_id", None)
    return doc


@router.get("/doctors/{doctor_id}")
async def get_doctor(doctor_id: str, user=Depends(get_current_user)):
    d = await db.doctors.find_one({"doctor_id": doctor_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Doctor not found")
    h = await db.hospitals.find_one({"hospital_id": d["hospital_id"]}, {"_id": 0})
    d["hospital"] = h
    dept = await db.departments.find_one({"department_id": d.get("department_id")}, {"_id": 0})
    d["department_name"] = dept["name"] if dept else ""
    return d


@router.put("/doctors/{doctor_id}")
async def update_doctor(doctor_id: str, payload: DoctorIn, user=Depends(require_roles("admin"))):
    result = await db.doctors.update_one({"doctor_id": doctor_id}, {"$set": payload.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(404, "Doctor not found")
    await audit(user["user_id"], "doctor_update", "doctor", doctor_id)
    return await db.doctors.find_one({"doctor_id": doctor_id}, {"_id": 0})


@router.delete("/doctors/{doctor_id}")
async def delete_doctor(doctor_id: str, user=Depends(require_roles("admin"))):
    await db.doctors.update_one({"doctor_id": doctor_id}, {"$set": {"active": False}})
    await audit(user["user_id"], "doctor_remove", "doctor", doctor_id)
    return {"ok": True}
