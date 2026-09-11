"""Import / sync / duplicate-detection service for discovered hospitals."""
import asyncio
import logging
import math
import re
from difflib import SequenceMatcher
from typing import Optional

from db import db
from utils import new_id, utcnow
from discovery_cities import get_city
from discovery_providers import get_provider

logger = logging.getLogger("discovery.service")

SYNC_FIELDS = ["name", "official_name", "description", "hospital_type", "categories", "address", "area", "city", "state",
               "country", "postal_code", "latitude", "longitude", "phone", "email", "website", "opening_hours",
               "emergency_available", "specialties", "operator", "beds", "source_url", "map_url"]
_running: dict[str, asyncio.Task] = {}


def slugify(name: str, city: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", f"{name} {city}".lower()).strip("-")


def norm_name(name: str) -> str:
    n = re.sub(r"[^a-z0-9 ]", " ", (name or "").lower())
    n = re.sub(r"\b(the|pvt|ltd|private|limited|jaipur|hospital|hospitals|and|&)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def norm_phone(p: str) -> str:
    digits = re.sub(r"\D", "", p or "")
    return digits[-10:] if len(digits) >= 10 else ""


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def geo_point(lat, lng):
    return {"type": "Point", "coordinates": [lng, lat]}


async def log_sync(hospital_id, provider, action, status, message=""):
    await db.hospital_sync_logs.insert_one({"log_id": new_id("sync"), "hospital_id": hospital_id, "provider": provider,
                                            "action": action, "status": status, "message": message, "synced_at": utcnow()})


async def find_duplicate(cand: dict):
    """Returns (existing_doc, confidence) - confidence in {'exact','high','low'} or (None, None)."""
    exact = await db.hospitals.find_one({"external_provider": cand["external_provider"], "external_provider_id": cand["external_provider_id"]}, {"_id": 0})
    if exact:
        return exact, "exact"
    phone = norm_phone(cand.get("phone"))
    if phone:
        m = await db.hospitals.find_one({"phone_norm": phone}, {"_id": 0})
        if m:
            return m, "high"
    nearby = await db.hospitals.find({"location": {"$near": {"$geometry": geo_point(cand["latitude"], cand["longitude"]), "$maxDistance": 1200}}}, {"_id": 0}).to_list(50)
    cname = norm_name(cand["name"])
    best, best_score = None, 0
    for h in nearby:
        score = SequenceMatcher(None, cname, norm_name(h["name"])).ratio()
        dist = haversine_m(cand["latitude"], cand["longitude"], h["latitude"], h["longitude"])
        if score >= 0.97 and dist < 500:
            return h, "high"
        if score >= 0.82 and score > best_score:
            best, best_score = h, score
    if best:
        return best, "low"
    return None, None


def build_doc(cand: dict, verification_status: str):
    now = utcnow()
    doc = {k: cand.get(k) for k in SYNC_FIELDS}
    doc.update({
        "hospital_id": new_id("hosp"), "slug": slugify(cand["name"], cand.get("city") or ""),
        "emergency_phone": "", "facilities": [], "specialties": cand.get("specialties") or [],
        "location": geo_point(cand["latitude"], cand["longitude"]), "phone_norm": norm_phone(cand.get("phone")),
        "external_provider": cand["external_provider"], "external_provider_id": cand["external_provider_id"],
        "data_source": cand["external_provider"], "verification_status": verification_status,
        "verified": verification_status == "verified", "pending_updates": None, "data_version": 1,
        "last_synced_at": now, "imported_at": now, "created_at": now, "updated_at": now,
    })
    return doc


async def save_images(hospital_id: str, images: list):
    for img in images or []:
        ref = img.get("image_reference") or img.get("image_url")
        if not ref:
            continue
        exists = await db.hospital_images.find_one({"hospital_id": hospital_id, "$or": [{"image_reference": ref}, {"url": ref}]})
        if exists:
            continue
        await db.hospital_images.insert_one({
            "image_id": new_id("img"), "hospital_id": hospital_id, "image_reference": img.get("image_reference"),
            "url": img.get("image_url"), "image_url": img.get("image_url"), "image_type": "exterior", "caption": "",
            "source": img.get("source"), "attribution": img.get("attribution", ""), "verified": False, "created_at": utcnow(),
        })


def diff_fields(existing: dict, cand: dict):
    changes = {}
    for k in SYNC_FIELDS:
        new = cand.get(k)
        if new in (None, "", []):
            continue
        if existing.get(k) != new:
            changes[k] = new
    return changes


async def apply_candidate(existing: dict, cand: dict):
    """Update a hospital from provider data. Verified hospitals only get pending_updates for admin review."""
    changes = diff_fields(existing, cand)
    now = utcnow()
    if not changes:
        await db.hospitals.update_one({"hospital_id": existing["hospital_id"]}, {"$set": {"last_synced_at": now}})
        return "unchanged"
    if existing.get("verification_status") == "verified":
        await db.hospitals.update_one({"hospital_id": existing["hospital_id"]}, {"$set": {"pending_updates": changes, "last_synced_at": now}})
        await log_sync(existing["hospital_id"], cand["external_provider"], "sync", "pending_review", f"{len(changes)} field(s) awaiting admin review")
        return "pending"
    update = dict(changes)
    if "latitude" in changes or "longitude" in changes:
        update["location"] = geo_point(changes.get("latitude", existing["latitude"]), changes.get("longitude", existing["longitude"]))
    if "phone" in changes:
        update["phone_norm"] = norm_phone(changes["phone"])
    update.update({"last_synced_at": now, "updated_at": now})
    await db.hospitals.update_one({"hospital_id": existing["hospital_id"]}, {"$set": update, "$inc": {"data_version": 1},
                                                                            "$push": {"history": {"$each": [{"at": now, "changes": changes}], "$slice": -20}}})
    await log_sync(existing["hospital_id"], cand["external_provider"], "sync", "updated", ", ".join(changes.keys()))
    return "updated"


def validate(cand: dict, city: dict) -> Optional[str]:
    if not cand.get("name") or len(cand["name"]) < 2:
        return "missing name"
    b = city["bbox"]
    if not (b["south"] - 0.05 <= cand["latitude"] <= b["north"] + 0.05 and b["west"] - 0.05 <= cand["longitude"] <= b["east"] + 0.05):
        return "outside city bounds"
    if cand.get("business_status") == "CLOSED_PERMANENTLY":
        return "permanently closed"
    return None


async def process_candidate(cand: dict, city: dict, job_id: str, counters: dict):
    err = validate(cand, city)
    if err:
        counters["failed"] += 1
        await db.hospital_import_items.insert_one({"job_id": job_id, "name": cand.get("name"), "status": "failed", "message": err, "external_provider_id": cand.get("external_provider_id"), "created_at": utcnow()})
        return
    existing, confidence = await find_duplicate(cand)
    if existing and confidence in ("exact", "high"):
        if confidence == "high" and existing.get("external_provider") and existing["external_provider"] != cand["external_provider"]:
            await db.hospitals.update_one({"hospital_id": existing["hospital_id"]}, {"$addToSet": {"other_sources": {"provider": cand["external_provider"], "id": cand["external_provider_id"], "source_url": cand.get("source_url")}}})
        result = await apply_candidate(existing, cand)
        await save_images(existing["hospital_id"], cand.get("images"))
        counters["updated" if result == "updated" else "unchanged"] += 1
        return
    status = "needs_review" if existing else "public_data"
    doc = build_doc(cand, status)
    await db.hospitals.insert_one(doc)
    await save_images(doc["hospital_id"], cand.get("images"))
    await log_sync(doc["hospital_id"], cand["external_provider"], "import", "imported", f"verification={status}")
    counters["imported"] += 1
    if existing:
        counters["duplicates"] += 1
        await db.hospital_duplicate_candidates.insert_one({
            "candidate_id": new_id("dup"), "hospital_id": doc["hospital_id"], "matched_hospital_id": existing["hospital_id"],
            "hospital_name": doc["name"], "matched_name": existing["name"], "confidence": confidence,
            "distance_m": round(haversine_m(doc["latitude"], doc["longitude"], existing["latitude"], existing["longitude"])),
            "status": "open", "job_id": job_id, "created_at": utcnow(),
        })


async def run_import_job(job_id: str):
    job = await db.hospital_import_jobs.find_one({"job_id": job_id}, {"_id": 0})
    city = get_city(job["city"])
    provider = get_provider(job.get("provider"))
    counters = {"discovered": 0, "imported": 0, "updated": 0, "unchanged": 0, "duplicates": 0, "failed": 0}

    async def progress(step, done, total):
        await db.hospital_import_jobs.update_one({"job_id": job_id}, {"$set": {"progress": {"step": step, "done": done, "total": total, "percent": round(done * 100 / max(total, 1))}, "counters": counters, "updated_at": utcnow()}})

    await db.hospital_import_jobs.update_one({"job_id": job_id}, {"$set": {"status": "running", "provider": provider.name, "started_at": utcnow()}})
    try:
        async for cand in provider.discover(city, progress):
            counters["discovered"] += 1
            try:
                await process_candidate(cand, city, job_id, counters)
            except Exception as exc:
                counters["failed"] += 1
                logger.exception("candidate failed: %s", cand.get("name"))
                await db.hospital_import_items.insert_one({"job_id": job_id, "name": cand.get("name"), "status": "failed", "message": str(exc)[:300], "created_at": utcnow()})
            if counters["discovered"] % 10 == 0:
                await db.hospital_import_jobs.update_one({"job_id": job_id}, {"$set": {"counters": counters}})
        await ensure_indexes()
        status = "completed" if counters["discovered"] > 0 else "completed_empty"
        message = "" if counters["discovered"] else "Provider returned no results. Live hospital data is temporarily unavailable."
        await db.hospital_import_jobs.update_one({"job_id": job_id}, {"$set": {"status": status, "counters": counters, "message": message, "finished_at": utcnow(), "progress.percent": 100}})
    except Exception as exc:
        logger.exception("import job failed")
        await db.hospital_import_jobs.update_one({"job_id": job_id}, {"$set": {"status": "failed", "counters": counters, "message": str(exc)[:500], "finished_at": utcnow()}})
    finally:
        _running.pop(job_id, None)


async def start_import(city_key: str, user_id: str, provider_name: Optional[str] = None):
    city = get_city(city_key)
    if not city:
        raise ValueError("Unknown city")
    active = await db.hospital_import_jobs.find_one({"city": city_key, "status": {"$in": ["queued", "running"]}}, {"_id": 0})
    if active:
        return active, False
    provider = get_provider(provider_name)
    job = {"job_id": new_id("job"), "city": city_key, "city_name": city["name"], "provider": provider.name, "status": "queued",
           "started_by": user_id, "counters": {"discovered": 0, "imported": 0, "updated": 0, "unchanged": 0, "duplicates": 0, "failed": 0},
           "progress": {"step": "Queued", "done": 0, "total": 0, "percent": 0}, "message": "", "created_at": utcnow(), "updated_at": utcnow()}
    await db.hospital_import_jobs.insert_one(job)
    job.pop("_id", None)
    _running[job["job_id"]] = asyncio.create_task(run_import_job(job["job_id"]))
    return job, True


async def sync_hospitals(hospital_ids: list[str]):
    """Re-fetch provider data for the given hospitals, grouped by provider."""
    docs = await db.hospitals.find({"hospital_id": {"$in": hospital_ids}, "external_provider_id": {"$ne": None}}, {"_id": 0}).to_list(len(hospital_ids))
    by_provider: dict[str, list] = {}
    for d in docs:
        by_provider.setdefault(d["external_provider"], []).append(d)
    results = {"updated": 0, "unchanged": 0, "pending": 0, "missing": 0}
    for pname, group in by_provider.items():
        provider = get_provider(pname)
        if not provider.configured():
            for d in group:
                await log_sync(d["hospital_id"], pname, "sync", "skipped", "Provider not configured")
            continue
        city = get_city((group[0].get("city") or "jaipur").lower()) or get_city("jaipur")
        raw = await provider.lookup([d["external_provider_id"] for d in group])
        fetched = {}
        for e in raw:
            cand = provider.normalize(e, city)
            if cand:
                fetched[cand["external_provider_id"]] = cand
        for d in group:
            cand = fetched.get(d["external_provider_id"])
            if not cand:
                results["missing"] += 1
                await log_sync(d["hospital_id"], pname, "sync", "not_found", "Provider no longer returns this place")
                continue
            r = await apply_candidate(d, cand)
            await save_images(d["hospital_id"], cand.get("images"))
            results[r if r in results else "unchanged"] += 1
    return results


async def merge_hospitals(primary_id: str, duplicate_id: str):
    primary = await db.hospitals.find_one({"hospital_id": primary_id}, {"_id": 0})
    dup = await db.hospitals.find_one({"hospital_id": duplicate_id}, {"_id": 0})
    if not primary or not dup:
        raise ValueError("Hospital not found")
    fill = {k: dup[k] for k in SYNC_FIELDS if dup.get(k) not in (None, "", []) and primary.get(k) in (None, "", [])}
    fill["updated_at"] = utcnow()
    other = {"provider": dup.get("external_provider"), "id": dup.get("external_provider_id"), "source_url": dup.get("source_url")}
    await db.hospitals.update_one({"hospital_id": primary_id}, {"$set": fill, "$addToSet": {"other_sources": other, "specialties": {"$each": dup.get("specialties") or []}}})
    for coll in (db.doctors, db.departments, db.hospital_images, db.hospital_services, db.appointments):
        await coll.update_many({"hospital_id": duplicate_id}, {"$set": {"hospital_id": primary_id}})
    await db.hospitals.delete_one({"hospital_id": duplicate_id})
    await db.hospital_duplicate_candidates.update_many({"$or": [{"hospital_id": duplicate_id}, {"matched_hospital_id": duplicate_id}]}, {"$set": {"status": "merged", "resolved_at": utcnow()}})
    await log_sync(primary_id, primary.get("external_provider") or "admin", "merge", "merged", f"merged {dup['name']} ({duplicate_id})")
    return await db.hospitals.find_one({"hospital_id": primary_id}, {"_id": 0})


async def ensure_indexes():
    await db.hospitals.create_index([("location", "2dsphere")])
    await db.hospitals.create_index([("external_provider", 1), ("external_provider_id", 1)])
    await db.hospitals.create_index("slug")
    await db.hospitals.create_index("name")
    await db.hospitals.create_index([("city", 1), ("area", 1)])
    await db.hospitals.create_index("verification_status")
    await db.hospitals.create_index("hospital_type")
    await db.hospitals.create_index("phone_norm")
    await db.hospital_images.create_index("hospital_id")
    await db.hospital_services.create_index("hospital_id")
    await db.hospital_sync_logs.create_index([("hospital_id", 1), ("synced_at", -1)])
    await db.hospital_import_jobs.create_index("job_id", unique=True)
    await db.hospital_duplicate_candidates.create_index("status")


async def backfill_legacy_hospitals():
    """Give admin-created hospitals the discovery fields they lack."""
    async for h in db.hospitals.find({"location": {"$exists": False}}, {"_id": 0, "hospital_id": 1, "latitude": 1, "longitude": 1, "phone": 1, "name": 1, "city": 1}):
        await db.hospitals.update_one({"hospital_id": h["hospital_id"]}, {"$set": {
            "location": geo_point(h["latitude"], h["longitude"]), "phone_norm": norm_phone(h.get("phone")),
            "slug": slugify(h["name"], h.get("city") or ""), "verification_status": "verified", "data_source": "admin",
            "external_provider": None, "external_provider_id": None, "area": "", "data_version": 1}})
