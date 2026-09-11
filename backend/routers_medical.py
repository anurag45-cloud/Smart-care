from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from db import db
from auth import get_current_user, require_roles
from utils import new_id, utcnow, notify, audit

router = APIRouter(tags=["medical"])


async def doctor_for_user(user):
    return await db.doctors.find_one({"email": user["email"]}, {"_id": 0})


async def assert_doctor_can_access_patient(user, patient_id: str):
    doctor = await doctor_for_user(user)
    if not doctor:
        raise HTTPException(404, "Doctor profile not found")
    link = await db.appointments.find_one({"doctor_id": doctor["doctor_id"], "patient_id": patient_id}, {"_id": 0})
    if not link:
        raise HTTPException(403, "You are not authorized to view this patient")
    return doctor


# ---------------- Medical records ----------------

@router.get("/medical-records")
async def list_records(user=Depends(get_current_user)):
    if user["role"] == "patient":
        query = {"patient_id": user["user_id"]}
    elif user["role"] == "doctor":
        doctor = await doctor_for_user(user)
        query = {"doctor_id": doctor["doctor_id"]} if doctor else {"_none": True}
    else:
        query = {}
    records = await db.medical_records.find(query, {"_id": 0}).sort("visit_date", -1).to_list(500)
    for r in records:
        d = await db.doctors.find_one({"doctor_id": r.get("doctor_id")}, {"_id": 0, "name": 1, "specialization": 1})
        r["doctor"] = d
        h = await db.hospitals.find_one({"hospital_id": r.get("hospital_id")}, {"_id": 0, "name": 1})
        r["hospital"] = h
    await audit(user["user_id"], "records_view", "medical_records", None)
    return {"records": records}


@router.get("/medical-records/patient/{patient_id}")
async def patient_records(patient_id: str, user=Depends(get_current_user)):
    if user["role"] == "patient" and user["user_id"] != patient_id:
        raise HTTPException(403, "Not authorized")
    if user["role"] == "doctor":
        await assert_doctor_can_access_patient(user, patient_id)
    records = await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort("visit_date", -1).to_list(500)
    await audit(user["user_id"], "records_view", "patient", patient_id)
    return {"records": records}


class RecordIn(BaseModel):
    patient_id: str
    appointment_id: Optional[str] = None
    visit_date: str
    record_type: str = "visit"
    symptoms: Optional[str] = ""
    notes: Optional[str] = ""
    diagnosis: Optional[str] = ""
    follow_up_date: Optional[str] = None


@router.post("/medical-records")
async def create_record(payload: RecordIn, user=Depends(require_roles("doctor"))):
    doctor = await assert_doctor_can_access_patient(user, payload.patient_id)
    patient = await db.users.find_one({"user_id": payload.patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(404, "Patient not found")
    doc = payload.model_dump()
    doc.update({"record_id": new_id("rec"), "doctor_id": doctor["doctor_id"], "hospital_id": doctor["hospital_id"], "created_at": utcnow()})
    await db.medical_records.insert_one(doc)
    doc.pop("_id", None)
    await notify(payload.patient_id, "New medical record", f"Dr. {doctor['name']} added a {payload.record_type} record to your timeline.", "record", "/records")
    await audit(user["user_id"], "record_create", "medical_record", doc["record_id"])
    return doc


# ---------------- Prescriptions ----------------

class MedicineItem(BaseModel):
    name: str
    dosage: str
    frequency: str
    duration: str
    instructions: Optional[str] = ""


class PrescriptionIn(BaseModel):
    patient_id: str
    appointment_id: Optional[str] = None
    medicines: List[MedicineItem]
    notes: Optional[str] = ""


@router.post("/prescriptions")
async def create_prescription(payload: PrescriptionIn, user=Depends(require_roles("doctor"))):
    doctor = await assert_doctor_can_access_patient(user, payload.patient_id)
    if not payload.medicines:
        raise HTTPException(400, "At least one medicine is required")
    doc = {"prescription_id": new_id("rx"), "patient_id": payload.patient_id, "doctor_id": doctor["doctor_id"],
           "hospital_id": doctor["hospital_id"], "appointment_id": payload.appointment_id,
           "medicines": [m.model_dump() for m in payload.medicines], "notes": payload.notes, "created_at": utcnow()}
    await db.prescriptions.insert_one(doc)
    doc.pop("_id", None)
    await notify(payload.patient_id, "New prescription", f"Dr. {doctor['name']} issued a prescription with {len(payload.medicines)} medicine(s).", "prescription", "/records")
    await audit(user["user_id"], "prescription_create", "prescription", doc["prescription_id"])
    return doc


@router.get("/prescriptions")
async def list_prescriptions(patient_id: Optional[str] = None, user=Depends(get_current_user)):
    if user["role"] == "patient":
        query = {"patient_id": user["user_id"]}
    elif user["role"] == "doctor":
        if patient_id:
            await assert_doctor_can_access_patient(user, patient_id)
            query = {"patient_id": patient_id}
        else:
            doctor = await doctor_for_user(user)
            query = {"doctor_id": doctor["doctor_id"]} if doctor else {"_none": True}
    else:
        query = {"patient_id": patient_id} if patient_id else {}
    rxs = await db.prescriptions.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in rxs:
        d = await db.doctors.find_one({"doctor_id": r["doctor_id"]}, {"_id": 0, "name": 1, "specialization": 1})
        r["doctor"] = d
    return {"prescriptions": rxs}


# ---------------- Lab test requests ----------------

class LabTestIn(BaseModel):
    patient_id: str
    test_name: str
    notes: Optional[str] = ""


@router.post("/lab-tests")
async def request_lab_test(payload: LabTestIn, user=Depends(require_roles("doctor"))):
    doctor = await assert_doctor_can_access_patient(user, payload.patient_id)
    doc = {"test_id": new_id("test"), "patient_id": payload.patient_id, "doctor_id": doctor["doctor_id"],
           "hospital_id": doctor["hospital_id"], "test_name": payload.test_name, "notes": payload.notes,
           "status": "requested", "request_date": utcnow()}
    await db.lab_tests.insert_one(doc)
    doc.pop("_id", None)
    await notify(payload.patient_id, "Lab test requested", f"Dr. {doctor['name']} requested: {payload.test_name}.", "lab", "/records")
    return doc


@router.get("/lab-tests")
async def list_lab_tests(patient_id: Optional[str] = None, user=Depends(get_current_user)):
    if user["role"] == "patient":
        query = {"patient_id": user["user_id"]}
    elif user["role"] == "doctor":
        doctor = await doctor_for_user(user)
        query = {"doctor_id": doctor["doctor_id"]} if doctor else {"_none": True}
        if patient_id:
            query["patient_id"] = patient_id
    else:
        query = {}
    tests = await db.lab_tests.find(query, {"_id": 0}).sort("request_date", -1).to_list(500)
    return {"lab_tests": tests}


# ---------------- Patients (doctor view) ----------------

@router.get("/patients")
async def list_my_patients(user=Depends(require_roles("doctor"))):
    doctor = await doctor_for_user(user)
    if not doctor:
        return {"patients": []}
    appts = await db.appointments.find({"doctor_id": doctor["doctor_id"]}, {"_id": 0}).to_list(1000)
    patient_ids = sorted({a["patient_id"] for a in appts})
    patients = []
    for pid in patient_ids:
        u = await db.users.find_one({"user_id": pid}, {"_id": 0, "password_hash": 0})
        if not u:
            continue
        mine = [a for a in appts if a["patient_id"] == pid]
        u["visit_count"] = len(mine)
        u["last_visit"] = max(a["date"] for a in mine)
        patients.append(u)
    return {"patients": patients}


@router.get("/patients/{patient_id}")
async def patient_detail(patient_id: str, user=Depends(get_current_user)):
    if user["role"] == "patient" and user["user_id"] != patient_id:
        raise HTTPException(403, "Not authorized")
    if user["role"] == "doctor":
        await assert_doctor_can_access_patient(user, patient_id)
    patient = await db.users.find_one({"user_id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(404, "Patient not found")
    records = await db.medical_records.find({"patient_id": patient_id}, {"_id": 0}).sort("visit_date", -1).to_list(200)
    prescriptions = await db.prescriptions.find({"patient_id": patient_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    reports = await db.lab_reports.find({"patient_id": patient_id}, {"_id": 0, "extracted_text": 0}).sort("created_at", -1).to_list(200)
    tests = await db.lab_tests.find({"patient_id": patient_id}, {"_id": 0}).sort("request_date", -1).to_list(200)
    await audit(user["user_id"], "patient_view", "patient", patient_id)
    return {"patient": patient, "records": records, "prescriptions": prescriptions, "reports": reports, "lab_tests": tests}
