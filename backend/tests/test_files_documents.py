"""
Iteration 2: file upload (admin media) + patient document library + chat attach (reports/upload).
"""
import io
import os
import uuid
import datetime as dt
from datetime import timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://doctor-finder-hub-2.preview.emergentagent.com").rstrip("/")
API = BASE_URL + "/api"

client = MongoClient("mongodb://localhost:27017")
db = client["test_database"]


def make_user(role, prefix):
    uid = f"TESTUSR2_{uuid.uuid4().hex[:10]}"
    tok = f"TESTSES2_{uuid.uuid4().hex[:16]}"
    email = f"TEST2_{prefix}_{uuid.uuid4().hex[:6]}@example.com"
    db.users.insert_one({
        "user_id": uid, "email": email, "name": f"Test {role}",
        "picture": "", "role": role, "status": "active",
        "created_at": dt.datetime.now(timezone.utc),
    })
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": tok,
        "expires_at": dt.datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": dt.datetime.now(timezone.utc),
    })
    return {"user_id": uid, "token": tok, "email": email}


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _cleanup():
    db.users.delete_many({"email": {"$regex": "^TEST2_"}})
    db.user_sessions.delete_many({"session_token": {"$regex": "^TESTSES2_"}})
    db.media_files.delete_many({"filename": {"$regex": "^TEST2_"}})
    db.documents.delete_many({"filename": {"$regex": "^TEST2_"}})
    db.lab_reports.delete_many({"title": {"$regex": "^TEST2_"}})


@pytest.fixture(scope="module", autouse=True)
def _setup():
    _cleanup()
    yield
    _cleanup()


@pytest.fixture(scope="module")
def admin():
    return make_user("admin", "adm")


@pytest.fixture(scope="module")
def patient1():
    return make_user("patient", "p1")


@pytest.fixture(scope="module")
def patient2():
    return make_user("patient", "p2")


# 1x1 PNG
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c626001000000ffff03000006000557bfabd4000000"
    "0049454e44ae426082"
)


def _pdf_bytes():
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for i, line in enumerate([
        "TEST2 Lab Report",
        "Hemoglobin: 10.5 g/dL   Reference: 13.0 - 17.0",
        "WBC: 7200 /uL   Reference: 4000 - 11000",
    ]):
        c.drawString(60, 750 - i * 20, line)
    c.showPage()
    c.save()
    return buf.getvalue()


STATE = {}


class TestMediaUpload:
    def test_admin_upload_png(self, admin):
        files = {"file": ("TEST2_img.png", PNG_BYTES, "image/png")}
        r = requests.post(f"{API}/files/upload", files=files, headers=h(admin["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["file_id"]
        assert body["url"].startswith("/api/files/")
        assert body["content_type"] == "image/png"
        STATE["file_id"] = body["file_id"]

    def test_get_media_authenticated(self, patient1):
        r = requests.get(f"{API}/files/{STATE['file_id']}", headers=h(patient1["token"]))
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")
        assert len(r.content) > 50

    def test_get_media_unauthenticated(self):
        r = requests.get(f"{API}/files/{STATE['file_id']}")
        assert r.status_code == 401

    def test_patient_upload_forbidden(self, patient1):
        files = {"file": ("TEST2_img2.png", PNG_BYTES, "image/png")}
        r = requests.post(f"{API}/files/upload", files=files, headers=h(patient1["token"]))
        assert r.status_code == 403

    def test_unauthenticated_upload(self):
        files = {"file": ("TEST2_img3.png", PNG_BYTES, "image/png")}
        r = requests.post(f"{API}/files/upload", files=files)
        assert r.status_code == 401

    def test_bad_extension(self, admin):
        files = {"file": ("TEST2_bad.exe", b"MZ\x00\x00binary", "application/octet-stream")}
        r = requests.post(f"{API}/files/upload", files=files, headers=h(admin["token"]))
        assert r.status_code == 400


class TestDocuments:
    def test_upload_pdf(self, patient1):
        pdf = _pdf_bytes()
        files = {"file": ("TEST2_labs.pdf", pdf, "application/pdf")}
        data = {"title": "TEST2 Lab Result", "category": "lab"}
        r = requests.post(f"{API}/documents", files=files, data=data, headers=h(patient1["token"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["title"] == "TEST2 Lab Result"
        assert body["category"] == "lab"
        assert body["file_type"] == "pdf"
        assert "storage_path" not in body
        STATE["doc_pdf_id"] = body["document_id"]

    def test_upload_png(self, patient1):
        files = {"file": ("TEST2_id.png", PNG_BYTES, "image/png")}
        data = {"title": "TEST2 ID card", "category": "id"}
        r = requests.post(f"{API}/documents", files=files, data=data, headers=h(patient1["token"]))
        assert r.status_code == 200
        STATE["doc_png_id"] = r.json()["document_id"]

    def test_list_documents(self, patient1):
        r = requests.get(f"{API}/documents", headers=h(patient1["token"]))
        assert r.status_code == 200
        ids = [d["document_id"] for d in r.json()["documents"]]
        assert STATE["doc_pdf_id"] in ids
        assert STATE["doc_png_id"] in ids

    def test_download_file(self, patient1):
        r = requests.get(f"{API}/documents/{STATE['doc_pdf_id']}/file", headers=h(patient1["token"]))
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 100

    def test_other_patient_forbidden(self, patient2):
        r = requests.get(f"{API}/documents/{STATE['doc_pdf_id']}/file", headers=h(patient2["token"]))
        assert r.status_code in (403, 404)

    def test_bad_extension_doc(self, patient1):
        files = {"file": ("TEST2_bad.exe", b"binary", "application/octet-stream")}
        r = requests.post(f"{API}/documents", files=files,
                          data={"title": "bad", "category": "other"},
                          headers=h(patient1["token"]))
        assert r.status_code == 400

    def test_txt_extension_rejected(self, patient1):
        files = {"file": ("TEST2_note.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/documents", files=files,
                          data={"title": "notes", "category": "other"},
                          headers=h(patient1["token"]))
        assert r.status_code == 400

    def test_delete_soft(self, patient1):
        r = requests.delete(f"{API}/documents/{STATE['doc_png_id']}", headers=h(patient1["token"]))
        assert r.status_code == 200
        # list should not show
        r2 = requests.get(f"{API}/documents", headers=h(patient1["token"]))
        ids = [d["document_id"] for d in r2.json()["documents"]]
        assert STATE["doc_png_id"] not in ids
        # file access after delete → 404
        r3 = requests.get(f"{API}/documents/{STATE['doc_png_id']}/file", headers=h(patient1["token"]))
        assert r3.status_code == 404
