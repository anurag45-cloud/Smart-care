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
router = APIRouter(tags=["files"])

MIME = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}
MAX_SIZE = 10 * 1024 * 1024


async def read_validated(file: UploadFile):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in MIME:
        raise HTTPException(400, "Unsupported file type. Allowed: PDF, JPG, JPEG, PNG, WEBP, GIF.")
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large. Maximum size is 10 MB.")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")
    return content, ext


# ---------------- Media files (admin: hospital images, doctor photos) ----------------

@router.post("/files/upload")
async def upload_media(file: UploadFile = File(...), user=Depends(require_roles("admin"))):
    content, ext = await read_validated(file)
    file_id = new_id("file")
    storage_path = f"{APP_NAME}/media/{file_id}{ext}"
    try:
        await asyncio.to_thread(put_object, storage_path, content, MIME[ext])
    except Exception as e:
        logger.error("Media upload failed: %s", e)
        raise HTTPException(502, "File storage unavailable, please try again later.")
    doc = {"file_id": file_id, "storage_path": storage_path, "filename": file.filename,
           "content_type": MIME[ext], "size": len(content), "uploaded_by": user["user_id"],
           "is_deleted": False, "created_at": utcnow()}
    await db.media_files.insert_one(doc)
    await audit(user["user_id"], "media_upload", "media_file", file_id)
    return {"file_id": file_id, "url": f"/api/files/{file_id}", "filename": file.filename, "content_type": MIME[ext]}


@router.get("/files/{file_id}")
async def get_media(file_id: str, user=Depends(get_current_user)):
    doc = await db.media_files.find_one({"file_id": file_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "File not found")
    try:
        content, content_type = await asyncio.to_thread(get_object, doc["storage_path"])
    except Exception:
        raise HTTPException(404, "File not found in storage")
    return Response(content=content, media_type=doc.get("content_type", content_type),
                    headers={"Content-Disposition": f"inline; filename=\"{doc['filename']}\""})


# ---------------- Patient document library ----------------

DOC_CATEGORIES = ["prescription", "lab", "scan", "insurance", "id", "other"]


@router.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    category: Optional[str] = Form("other"),
    user=Depends(require_roles("patient")),
):
    content, ext = await read_validated(file)
    if category not in DOC_CATEGORIES:
        category = "other"
    document_id = new_id("doc")
    storage_path = f"{APP_NAME}/documents/{user['user_id']}/{document_id}{ext}"
    try:
        await asyncio.to_thread(put_object, storage_path, content, MIME[ext])
    except Exception as e:
        logger.error("Document upload failed: %s", e)
        raise HTTPException(502, "File storage unavailable, please try again later.")
    doc = {"document_id": document_id, "patient_id": user["user_id"], "title": title or file.filename,
           "category": category, "filename": file.filename, "storage_path": storage_path,
           "content_type": MIME[ext], "file_type": ext.lstrip("."), "size": len(content),
           "is_deleted": False, "created_at": utcnow()}
    await db.documents.insert_one(doc)
    await audit(user["user_id"], "document_upload", "document", document_id)
    doc.pop("_id", None)
    doc.pop("storage_path", None)
    return doc


@router.get("/documents")
async def list_documents(patient_id: Optional[str] = None, user=Depends(get_current_user)):
    if user["role"] == "patient":
        query = {"patient_id": user["user_id"]}
    elif user["role"] == "doctor" and patient_id:
        doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
        link = await db.appointments.find_one({"doctor_id": doctor["doctor_id"], "patient_id": patient_id}, {"_id": 0}) if doctor else None
        if not link:
            raise HTTPException(403, "Not authorized to view this patient's documents")
        query = {"patient_id": patient_id}
    elif user["role"] == "admin":
        query = {"patient_id": patient_id} if patient_id else {}
    else:
        raise HTTPException(403, "Not authorized")
    query["is_deleted"] = {"$ne": True}
    docs = await db.documents.find(query, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(500)
    return {"documents": docs}


async def get_document_scoped(document_id: str, user):
    d = await db.documents.find_one({"document_id": document_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Document not found")
    if user["role"] == "patient" and d["patient_id"] != user["user_id"]:
        raise HTTPException(403, "Not your document")
    if user["role"] == "doctor":
        doctor = await db.doctors.find_one({"email": user["email"]}, {"_id": 0})
        link = await db.appointments.find_one({"doctor_id": doctor["doctor_id"], "patient_id": d["patient_id"]}, {"_id": 0}) if doctor else None
        if not link:
            raise HTTPException(403, "Not authorized to view this document")
    return d


@router.get("/documents/{document_id}/file")
async def get_document_file(document_id: str, user=Depends(get_current_user)):
    d = await get_document_scoped(document_id, user)
    try:
        content, content_type = await asyncio.to_thread(get_object, d["storage_path"])
    except Exception:
        raise HTTPException(404, "File not found in storage")
    return Response(content=content, media_type=d.get("content_type", content_type),
                    headers={"Content-Disposition": f"inline; filename=\"{d['filename']}\""})


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, user=Depends(get_current_user)):
    d = await get_document_scoped(document_id, user)
    if user["role"] != "admin" and d["patient_id"] != user["user_id"]:
        raise HTTPException(403, "Only the owner can delete this document")
    await db.documents.update_one({"document_id": document_id}, {"$set": {"is_deleted": True}})
    await audit(user["user_id"], "document_delete", "document", document_id)
    return {"ok": True}
