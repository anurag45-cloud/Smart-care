"""
SmartCare AI backend integration tests.
Covers: auth, admin CRUD (hospital/dept/doctor), patient search,
appointments (book/double-book/reschedule/cancel/scope), leave blocking,
medical records/prescriptions/lab-tests, report upload + AI summary,
AI chat SSE, notifications, admin stats.
"""
import io
import os
import time
import uuid
import json
import datetime as dt
from datetime import timezone, timedelta
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://doctor-finder-hub-2.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]


# ------------- helpers -----------------
def make_user(role: str, email: str | None = None, name: str | None = None) -> tuple[str, str, str]:
    uid = f"TESTUSR_{uuid.uuid4().hex[:10]}"
    tok = f"TESTSES_{uuid.uuid4().hex[:16]}"
    email = email or f"TEST_{uid}@example.com"
    db.users.insert_one({
        "user_id": uid, "email": email.lower(), "name": name or f"Test {role}",
        "picture": "", "role": role, "status": "active",
        "created_at": dt.datetime.now(timezone.utc),
    })
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": tok,
        "expires_at": dt.datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": dt.datetime.now(timezone.utc),
    })
    return uid, tok, email.lower()


def h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def cleanup():
    db.users.delete_many({"email": {"$regex": "^TEST_", "$options": "i"}})
    db.user_sessions.delete_many({"session_token": {"$regex": "^TESTSES_"}})
    db.hospitals.delete_many({"name": {"$regex": "^TESTHOSP_"}})
    db.hospital_images.delete_many({"caption": {"$regex": "^TEST_"}})
    db.departments.delete_many({"name": {"$in": ["Cardiology-TEST", "Neurology-TEST"]}})
    db.doctors.delete_many({"email": {"$regex": "^TEST_"}})
    db.appointments.delete_many({"reason": {"$regex": "^TEST_"}})
    db.notifications.delete_many({"title": {"$regex": "^TEST_"}})
    db.leave_requests.delete_many({"reason": {"$regex": "^TEST_"}})
    db.medical_records.delete_many({"notes": {"$regex": "^TEST_"}})
    db.prescriptions.delete_many({"notes": {"$regex": "^TEST_"}})
    db.lab_tests.delete_many({"notes": {"$regex": "^TEST_"}})
    db.lab_reports.delete_many({"title": {"$regex": "^TEST_"}})
    db.chatbot_conversations.delete_many({"title": {"$regex": "^TEST_"}})


# ------------- fixtures --------------
@pytest.fixture(scope="session", autouse=True)
def _setup_and_teardown():
    cleanup()
    yield
    cleanup()


@pytest.fixture(scope="session")
def admin():
    uid, tok, email = make_user("admin", email=f"TEST_admin_{uuid.uuid4().hex[:6]}@example.com")
    return {"user_id": uid, "token": tok, "email": email}


@pytest.fixture(scope="session")
def patient1():
    uid, tok, email = make_user("patient", email=f"TEST_p1_{uuid.uuid4().hex[:6]}@example.com", name="Patient One")
    return {"user_id": uid, "token": tok, "email": email}


@pytest.fixture(scope="session")
def patient2():
    uid, tok, email = make_user("patient", email=f"TEST_p2_{uuid.uuid4().hex[:6]}@example.com", name="Patient Two")
    return {"user_id": uid, "token": tok, "email": email}


@pytest.fixture(scope="session")
def doctor_email():
    return f"TEST_doc_{uuid.uuid4().hex[:6]}@example.com"


@pytest.fixture(scope="session")
def doctor_session(doctor_email):
    # role='doctor' user (matching a doctor record created via admin API later)
    uid, tok, email = make_user("doctor", email=doctor_email, name="Test Doctor")
    return {"user_id": uid, "token": tok, "email": email}


# ------------- AUTH -----------------
class TestAuth:
    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_patient(self, patient1):
        r = requests.get(f"{API}/auth/me", headers=h(patient1["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == patient1["email"]
        assert data["role"] == "patient"
        assert data["user_id"] == patient1["user_id"]

    def test_me_admin(self, admin):
        r = requests.get(f"{API}/auth/me", headers=h(admin["token"]))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_me_doctor(self, doctor_session):
        r = requests.get(f"{API}/auth/me", headers=h(doctor_session["token"]))
        assert r.status_code == 200
        assert r.json()["role"] == "doctor"

    def test_invalid_token(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer badtoken_xyz"})
        assert r.status_code == 401


# ------------- ADMIN FLOW ------------
STATE = {}


class TestAdminFlow:
    def test_create_hospital(self, admin):
        payload = {
            "name": f"TESTHOSP_{uuid.uuid4().hex[:6]}",
            "description": "Test hospital",
            "phone": "+911111111111", "email": "hosp@test.com",
            "address": "123 Test Road", "city": "Delhi", "state": "DL",
            "latitude": 28.6139, "longitude": 77.2090,
            "emergency_available": True, "specialties": ["Cardiology"],
        }
        r = requests.post(f"{API}/hospitals", json=payload, headers=h(admin["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert "hospital_id" in data
        STATE["hospital_id"] = data["hospital_id"]
        STATE["hospital_name"] = data["name"]

    def test_non_admin_cannot_create_hospital(self, patient1):
        r = requests.post(f"{API}/hospitals", json={
            "name": "TESTHOSP_forbidden", "address": "a", "city": "b",
            "latitude": 1.0, "longitude": 1.0,
        }, headers=h(patient1["token"]))
        assert r.status_code == 403

    def test_add_hospital_image(self, admin):
        r = requests.post(
            f"{API}/hospitals/{STATE['hospital_id']}/images",
            json={"url": "https://picsum.photos/seed/hosp/800/500", "image_type": "exterior", "caption": "TEST_exterior"},
            headers=h(admin["token"]),
        )
        assert r.status_code == 200
        assert r.json()["image_type"] == "exterior"

    def test_add_departments(self, admin):
        for name in ["Cardiology-TEST", "Neurology-TEST"]:
            r = requests.post(
                f"{API}/hospitals/{STATE['hospital_id']}/departments",
                json={"name": name}, headers=h(admin["token"]),
            )
            assert r.status_code == 200, r.text
            if name == "Cardiology-TEST":
                STATE["dept_id"] = r.json()["department_id"]

    def test_create_doctor(self, admin, doctor_session):
        payload = {
            "name": "Dr. Test", "email": doctor_session["email"],
            "hospital_id": STATE["hospital_id"], "department_id": STATE["dept_id"],
            "specialization": "Cardiology", "qualification": "MBBS",
            "experience_years": 5, "consultation_fee": 500,
            "working_days": [0, 1, 2, 3, 4, 5, 6],  # include all days so tomorrow works
            "start_time": "09:00", "end_time": "17:00", "slot_minutes": 30,
        }
        r = requests.post(f"{API}/doctors", json=payload, headers=h(admin["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        STATE["doctor_id"] = data["doctor_id"]
        # doctor record should be linked to the doctor user
        # The auth's resolve_role attaches user_id on login; here we manually link.
        db.doctors.update_one({"doctor_id": data["doctor_id"]},
                              {"$set": {"user_id": doctor_session["user_id"]}})

    def test_admin_stats(self, admin):
        r = requests.get(f"{API}/admin/stats", headers=h(admin["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["total_hospitals"] >= 1
        assert data["total_doctors"] >= 1


# ------------- HOSPITAL SEARCH -----------
class TestHospitalSearch:
    def test_search_partial_name(self, patient1):
        partial = STATE["hospital_name"][:8]
        r = requests.get(f"{API}/hospitals", params={"search": partial}, headers=h(patient1["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        names = [x["name"] for x in data["hospitals"]]
        assert STATE["hospital_name"] in names

    def test_filter_by_city(self, patient1):
        r = requests.get(f"{API}/hospitals", params={"city": "Delhi"}, headers=h(patient1["token"]))
        assert r.status_code == 200
        assert any(h_["hospital_id"] == STATE["hospital_id"] for h_ in r.json()["hospitals"])

    def test_get_hospital_detail(self, patient1):
        r = requests.get(f"{API}/hospitals/{STATE['hospital_id']}", headers=h(patient1["token"]))
        assert r.status_code == 200
        data = r.json()
        assert len(data["images"]) >= 1
        assert len(data["departments"]) >= 2
        assert len(data["doctors"]) >= 1


# ------------- APPOINTMENTS --------------
def _tomorrow_str():
    return (dt.datetime.now(timezone.utc).date() + timedelta(days=1)).strftime("%Y-%m-%d")


class TestAppointments:
    def test_availability(self, patient1):
        date = _tomorrow_str()
        r = requests.get(f"{API}/doctors/{STATE['doctor_id']}/availability",
                         params={"date": date}, headers=h(patient1["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["on_leave"] is False
        assert len(data["slots"]) > 0
        free = [s for s in data["slots"] if not s["booked"]]
        assert free, "expected at least one free slot for tomorrow"
        STATE["slot_time"] = free[0]["time"]
        STATE["slot_time2"] = free[1]["time"] if len(free) > 1 else None
        STATE["appt_date"] = date

    def test_book_appointment(self, patient1):
        payload = {
            "hospital_id": STATE["hospital_id"], "doctor_id": STATE["doctor_id"],
            "department_id": STATE["dept_id"], "date": STATE["appt_date"],
            "time": STATE["slot_time"], "reason": "TEST_checkup",
        }
        r = requests.post(f"{API}/appointments", json=payload, headers=h(patient1["token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        STATE["appointment_id"] = data["appointment_id"]
        assert data["status"] == "scheduled"
        assert data["hospital_id"] == STATE["hospital_id"]
        assert data["hospital"]["name"]

    def test_double_booking_prevention(self, patient2):
        payload = {
            "hospital_id": STATE["hospital_id"], "doctor_id": STATE["doctor_id"],
            "date": STATE["appt_date"], "time": STATE["slot_time"], "reason": "TEST_dup",
        }
        r = requests.post(f"{API}/appointments", json=payload, headers=h(patient2["token"]))
        assert r.status_code == 409

    def test_list_appointments_patient(self, patient1):
        r = requests.get(f"{API}/appointments", headers=h(patient1["token"]))
        assert r.status_code == 200
        ids = [a["appointment_id"] for a in r.json()["appointments"]]
        assert STATE["appointment_id"] in ids

    def test_list_appointments_doctor(self, doctor_session):
        r = requests.get(f"{API}/appointments", headers=h(doctor_session["token"]))
        assert r.status_code == 200
        ids = [a["appointment_id"] for a in r.json()["appointments"]]
        assert STATE["appointment_id"] in ids

    def test_doctor_sets_status_confirmed(self, doctor_session):
        r = requests.post(
            f"{API}/appointments/{STATE['appointment_id']}/status",
            json={"status": "confirmed"}, headers=h(doctor_session["token"]),
        )
        assert r.status_code == 200

    def test_other_patient_cannot_access(self, patient2):
        r = requests.get(f"{API}/appointments/{STATE['appointment_id']}", headers=h(patient2["token"]))
        assert r.status_code == 403

    def test_reschedule(self, patient1):
        if not STATE.get("slot_time2"):
            pytest.skip("No second slot available")
        r = requests.post(
            f"{API}/appointments/{STATE['appointment_id']}/reschedule",
            json={"date": STATE["appt_date"], "time": STATE["slot_time2"]},
            headers=h(patient1["token"]),
        )
        assert r.status_code == 200, r.text

    def test_cancel(self, patient1):
        r = requests.post(
            f"{API}/appointments/{STATE['appointment_id']}/cancel",
            headers=h(patient1["token"]),
        )
        assert r.status_code == 200


# ------------- LEAVE + BLOCKING --------
class TestLeave:
    def test_doctor_applies_leave(self, doctor_session):
        # Use day-after-tomorrow to avoid conflicting with earlier active appointment
        date = (dt.datetime.now(timezone.utc).date() + timedelta(days=2)).strftime("%Y-%m-%d")
        STATE["leave_date"] = date
        r = requests.post(f"{API}/leave", json={
            "start_date": date, "end_date": date, "leave_type": "casual", "reason": "TEST_leave"
        }, headers=h(doctor_session["token"]))
        assert r.status_code == 200, r.text
        STATE["leave_id"] = r.json()["leave_id"]

    def test_admin_approves_leave(self, admin):
        r = requests.post(f"{API}/leave/{STATE['leave_id']}/review",
                          json={"status": "approved"}, headers=h(admin["token"]))
        assert r.status_code == 200

    def test_availability_shows_on_leave(self, patient1):
        r = requests.get(f"{API}/doctors/{STATE['doctor_id']}/availability",
                         params={"date": STATE["leave_date"]}, headers=h(patient1["token"]))
        assert r.status_code == 200
        assert r.json()["on_leave"] is True

    def test_booking_blocked_on_leave(self, patient1):
        r = requests.post(f"{API}/appointments", json={
            "hospital_id": STATE["hospital_id"], "doctor_id": STATE["doctor_id"],
            "date": STATE["leave_date"], "time": "10:00", "reason": "TEST_onleave",
        }, headers=h(patient1["token"]))
        assert r.status_code == 409


# ------------- MEDICAL --------
class TestMedical:
    def test_doctor_creates_record(self, doctor_session, patient1):
        r = requests.post(f"{API}/medical-records", json={
            "patient_id": patient1["user_id"],
            "visit_date": _tomorrow_str(),
            "record_type": "visit",
            "symptoms": "Cough", "notes": "TEST_note", "diagnosis": "Cold",
        }, headers=h(doctor_session["token"]))
        assert r.status_code == 200, r.text
        STATE["record_id"] = r.json()["record_id"]

    def test_prescription(self, doctor_session, patient1):
        r = requests.post(f"{API}/prescriptions", json={
            "patient_id": patient1["user_id"],
            "medicines": [{"name": "Paracetamol", "dosage": "500mg", "frequency": "TDS", "duration": "3d"}],
            "notes": "TEST_rx",
        }, headers=h(doctor_session["token"]))
        assert r.status_code == 200, r.text

    def test_lab_test_request(self, doctor_session, patient1):
        r = requests.post(f"{API}/lab-tests", json={
            "patient_id": patient1["user_id"], "test_name": "CBC", "notes": "TEST_labreq"
        }, headers=h(doctor_session["token"]))
        assert r.status_code == 200

    def test_patient_can_see_records(self, patient1):
        r = requests.get(f"{API}/medical-records", headers=h(patient1["token"]))
        assert r.status_code == 200
        assert any(rec["record_id"] == STATE["record_id"] for rec in r.json()["records"])

    def test_patient2_cannot_access_p1(self, patient2, patient1):
        r = requests.get(f"{API}/medical-records/patient/{patient1['user_id']}",
                         headers=h(patient2["token"]))
        assert r.status_code == 403


# ------------- REPORTS + AI ------
def _make_pdf_bytes() -> bytes:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 750
    for line in [
        "TEST Lab Report - Complete Blood Count",
        "Patient: Test Patient   Date: 2026-01-15",
        "",
        "Hemoglobin:      10.5 g/dL     Reference: 13.0 - 17.0",
        "WBC Count:       7200 /uL      Reference: 4000 - 11000",
        "Platelets:       250000 /uL    Reference: 150000 - 400000",
        "RBC Count:       4.2 M/uL      Reference: 4.5 - 5.9",
        "",
        "Note: Hemoglobin is below the reference range.",
    ]:
        c.drawString(60, y, line)
        y -= 20
    c.showPage()
    c.save()
    return buf.getvalue()


class TestReports:
    def test_upload_report(self, patient1):
        pdf = _make_pdf_bytes()
        files = {"file": ("TEST_report.pdf", pdf, "application/pdf")}
        data = {"title": "TEST_CBC_Report"}
        r = requests.post(f"{API}/reports/upload", files=files, data=data,
                          headers=h(patient1["token"]), timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        STATE["report_id"] = body["report_id"]
        assert body["extraction_status"] == "ok", f"got: {body}"
        # AI summary may or may not succeed
        STATE["has_ai_summary"] = bool(body.get("ai_summary"))

    def test_get_report(self, patient1):
        r = requests.get(f"{API}/reports/{STATE['report_id']}", headers=h(patient1["token"]))
        assert r.status_code == 200

    def test_report_file_streams(self, patient1):
        r = requests.get(f"{API}/reports/{STATE['report_id']}/file", headers=h(patient1["token"]))
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 100

    def test_other_patient_forbidden(self, patient2):
        r = requests.get(f"{API}/reports/{STATE['report_id']}", headers=h(patient2["token"]))
        assert r.status_code in (403, 404)

    def test_delete_report(self, patient1):
        r = requests.delete(f"{API}/reports/{STATE['report_id']}", headers=h(patient1["token"]))
        assert r.status_code == 200
        # after soft delete, GET should 404
        r2 = requests.get(f"{API}/reports/{STATE['report_id']}", headers=h(patient1["token"]))
        assert r2.status_code == 404


# ------------- AI CHAT (SSE) --------
class TestAIChat:
    def test_chat_stream(self, patient1):
        # Upload another report for chat context
        pdf = _make_pdf_bytes()
        files = {"file": ("TEST_report2.pdf", pdf, "application/pdf")}
        data = {"title": "TEST_ChatContextReport"}
        up = requests.post(f"{API}/reports/upload", files=files, data=data,
                           headers=h(patient1["token"]), timeout=90)
        assert up.status_code == 200

        r = requests.post(f"{API}/ai/chat",
                          json={"message": "What does my hemoglobin value indicate?"},
                          headers=h(patient1["token"]), stream=True, timeout=90)
        assert r.status_code == 200
        got_done = False
        got_token_or_error = False
        convo_id = None
        for raw in r.iter_lines(decode_unicode=True):
            if not raw:
                continue
            if raw.startswith("data: "):
                obj = json.loads(raw[6:])
                if "conversation_id" in obj:
                    convo_id = obj["conversation_id"]
                if "token" in obj or "error" in obj:
                    got_token_or_error = True
                if obj.get("done"):
                    got_done = True
                    break
        assert convo_id, "no conversation_id emitted"
        assert got_done, "no done event"
        STATE["convo_id"] = convo_id

    def test_list_conversations(self, patient1):
        r = requests.get(f"{API}/ai/conversations", headers=h(patient1["token"]))
        assert r.status_code == 200
        ids = [c["conversation_id"] for c in r.json()["conversations"]]
        assert STATE["convo_id"] in ids

    def test_chat_leak_prevention(self, patient2):
        # patient2 has no reports - chat should still respond but with no report context
        r = requests.post(f"{API}/ai/chat", json={"message": "Show me my report"},
                          headers=h(patient2["token"]), stream=True, timeout=90)
        assert r.status_code == 200
        # drain
        for raw in r.iter_lines(decode_unicode=True):
            if raw and raw.startswith("data: "):
                obj = json.loads(raw[6:])
                if obj.get("done"):
                    break


# ------------- NOTIFICATIONS ---------
class TestNotifications:
    def test_list_notifications_patient(self, patient1):
        r = requests.get(f"{API}/notifications", headers=h(patient1["token"]))
        assert r.status_code == 200
        # patient1 booked/cancelled/received records, so has notifications
        assert len(r.json()["notifications"]) > 0

    def test_read_all(self, patient1):
        r = requests.post(f"{API}/notifications/read-all", headers=h(patient1["token"]))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/notifications", headers=h(patient1["token"]))
        assert r2.json()["unread"] == 0
