import os
import re
import io
import json
import uuid
import asyncio
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Response
from typing import Optional
from db import db
from auth import get_current_user, require_roles
from utils import new_id, utcnow, notify, audit
from storage import put_object, get_object, APP_NAME

logger = logging.getLogger(__name__)
router = APIRouter(tags=["reports"])

ALLOWED_EXT = {".pdf", ".jpg", ".jpeg", ".png"}
MIME = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
MAX_SIZE = 10 * 1024 * 1024

SUMMARY_SYSTEM = (
    "You are a medical report analysis assistant for SmartCare AI. You analyze lab report text and respond ONLY "
    "with valid JSON (no markdown fences) in this exact shape: "
    '{"summary": "plain-language 3-5 sentence summary", '
    '"extracted_values": [{"test": "...", "value": "...", "unit": "...", "reference_range": "...", "flag": "normal|high|low|unknown"}], '
    '"explanation": "simple explanation of notable terms", '
    '"questions_for_doctor": ["...", "..."]}. '
    "Rules: never diagnose; only compare values against the reference ranges present in the report; if a range is "
    "missing use flag unknown; if text is unreadable say so in the summary and return empty extracted_values."
)


def extract_text_sync(data: bytes, ext: str) -> str:
    if ext == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    import pytesseract
    from PIL import Image
    return pytesseract.image_to_string(Image.open(io.BytesIO(data)))


async def generate_ai_summary(report_id: str, text: str):
    if not text or len(text.strip()) < 20:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=f"summary_{report_id}_{uuid.uuid4().hex[:6]}",
            system_message=SUMMARY_SYSTEM,
        ).with_model("openai", "gpt-5.4")
        full = ""
        async for ev in chat.stream_message(UserMessage(text=f"Analyze this medical report:\n\n{text[:9000]}")):
            if isinstance(ev, TextDelta):
                full += ev.content
            elif isinstance(ev, StreamDone):
                break
        cleaned = re.sub(r"^```(json)?|```$", "", full.strip(), flags=re.MULTILINE).strip()
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        data = json.loads(match.group(0)) if match else None
        if not data:
            return {"summary": full.strip(), "extracted_values": [], "explanation": "", "questions_for_doctor": []}
        return data
    except Exception as e:
        logger.warning("AI summary failed for %s: %s", report_id, e)
        return None


@router.post("/reports/upload")
async def upload_report(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    test_id: Optional[str] = Form(None),
    user=Depends(require_roles("patient")),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, "Unsupported file type. Upload PDF, JPG, JPEG or PNG.")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large. Maximum size is 10 MB.")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    report_id = new_id("rep")
    storage_path = f"{APP_NAME}/reports/{user['user_id']}/{report_id}{ext}"
    try:
        await asyncio.to_thread(put_object, storage_path, content, MIME[ext])
    except Exception as e:
        logger.error("Storage upload failed: %s", e)
        raise HTTPException(502, "File storage unavailable, please try again later.")

    try:
        text = await asyncio.to_thread(extract_text_sync, content, ext)
    except Exception as e:
        logger.warning("Text extraction failed for %s: %s", report_id, e)
        text = ""
    text = (text or "").strip()

    doc = {
        "report_id": report_id,
        "patient_id": user["user_id"],
        "test_id": test_id,
        "title": title or file.filename,
        "filename": file.filename,
        "storage_path": storage_path,
        "file_type": ext.lstrip("."),
        "extracted_text": text,
        "extraction_status": "ok" if len(text) >= 20 else "failed",
        "is_deleted": False,
        "created_at": utcnow(),
    }
    await db.lab_reports.insert_one(doc)

    summary = None
    if doc["extraction_status"] == "ok":
        summary = await generate_ai_summary(report_id, text)
        if summary:
            await db.lab_reports.update_one({"report_id": report_id}, {"$set": {
                "ai_summary": summary.get("summary", ""),
                "ai_extracted_values": summary.get("extracted_values", []),
                "ai_explanation": summary.get("explanation", ""),
                "ai_questions": summary.get("questions_for_doctor", []),
                "ai_model": "gpt-5.4",
                "ai_summarized_at": utcnow(),
            }})
            doc.update({"ai_summary": summary.get("summary", ""), "ai_extracted_values": summary.get("extracted_values", [])})

    await notify(user["user_id"], "Report uploaded", f"'{doc['title']}' was uploaded" + (" and analyzed by AI." if summary else "."), "report", f"/reports/{report_id}")
    await audit(user["user_id"], "report_upload", "lab_report", report_id)
    doc.pop("_id", None)
    doc.pop("storage_path", None)
    doc.pop("extracted_text", None)
    return doc


@router.get("/reports")
async def list_reports(patient_id: Optional[str] = None, user=Depends(get_current_user)):
    if user["role"] == "patient":
        query = {"patient_id": user["user_id"]}
    elif user["role"] == "doctor" and patient_id:
        doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
        link = await db.appointments.find_one({"doctor_id": doctor["doctor_id"], "patient_id": patient_id}, {"_id": 0}) if doctor else None
        if not link:
            raise HTTPException(403, "Not authorized to view this patient's reports")
        query = {"patient_id": patient_id}
    elif user["role"] == "admin":
        query = {"patient_id": patient_id} if patient_id else {}
    else:
        raise HTTPException(403, "Not authorized")
    query["is_deleted"] = {"$ne": True}
    reports = await db.lab_reports.find(query, {"_id": 0, "extracted_text": 0, "storage_path": 0}).sort("created_at", -1).to_list(500)
    return {"reports": reports}


async def get_report_scoped(report_id: str, user):
    r = await db.lab_reports.find_one({"report_id": report_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Report not found")
    if user["role"] == "patient" and r["patient_id"] != user["user_id"]:
        raise HTTPException(403, "Not your report")
    if user["role"] == "doctor":
        doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
        link = await db.appointments.find_one({"doctor_id": doctor["doctor_id"], "patient_id": r["patient_id"]}, {"_id": 0}) if doctor else None
        if not link:
            raise HTTPException(403, "Not authorized to view this report")
    return r


@router.get("/reports/{report_id}")
async def get_report(report_id: str, user=Depends(get_current_user)):
    r = await get_report_scoped(report_id, user)
    r.pop("storage_path", None)
    await audit(user["user_id"], "report_view", "lab_report", report_id)
    return r


@router.get("/reports/{report_id}/file")
async def get_report_file(report_id: str, user=Depends(get_current_user)):
    r = await get_report_scoped(report_id, user)
    try:
        content, content_type = await asyncio.to_thread(get_object, r["storage_path"])
    except Exception:
        raise HTTPException(404, "File not found in storage")
    return Response(content=content, media_type=MIME.get(f".{r['file_type']}", content_type),
                    headers={"Content-Disposition": f"inline; filename=\"{r['filename']}\""})


@router.delete("/reports/{report_id}")
async def delete_report(report_id: str, user=Depends(get_current_user)):
    r = await get_report_scoped(report_id, user)
    if user["role"] != "admin" and r["patient_id"] != user["user_id"]:
        raise HTTPException(403, "Only the owner can delete this report")
    await db.lab_reports.update_one({"report_id": report_id}, {"$set": {"is_deleted": True}})
    await audit(user["user_id"], "report_delete", "lab_report", report_id)
    return {"ok": True}


@router.post("/reports/{report_id}/summarize")
async def resummarize(report_id: str, user=Depends(get_current_user)):
    r = await get_report_scoped(report_id, user)
    if r["extraction_status"] != "ok":
        raise HTTPException(400, "Could not reliably extract text from this report, AI summary is unavailable.")
    summary = await generate_ai_summary(report_id, r.get("extracted_text", ""))
    if not summary:
        raise HTTPException(502, "AI service unavailable, please try again later.")
    await db.lab_reports.update_one({"report_id": report_id}, {"$set": {
        "ai_summary": summary.get("summary", ""),
        "ai_extracted_values": summary.get("extracted_values", []),
        "ai_explanation": summary.get("explanation", ""),
        "ai_questions": summary.get("questions_for_doctor", []),
        "ai_model": "gpt-5.4",
        "ai_summarized_at": utcnow(),
    }})
    return summary
