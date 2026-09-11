import hmac
import os
import re
import time
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Request, Response, BackgroundTasks
from pydantic import BaseModel

from db import db
from auth import get_current_user, require_roles
from utils import new_id, utcnow, audit
from discovery_cities import CITIES, get_city
from discovery_providers import get_provider, provider_status, GooglePlacesProvider
import discovery_service as svc

router = APIRouter(tags=["discovery"])

_cache: dict = {}
CACHE_TTL = 30


def cached(key, fn):
    async def run():
        hit = _cache.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
        value = await fn()
        _cache[key] = (time.time() + CACHE_TTL, value)
        return value
    return run()


def bust_cache():
    _cache.clear()


def public_hospital(h: dict):
    h.pop("_id", None)
    h.pop("phone_norm", None)
    h.pop("history", None)
    return h


async def enrich(h: dict):
    hid = h["hospital_id"]
    h["doctor_count"] = await db.doctors.count_documents({"hospital_id": hid, "active": True})
    h["departments"] = [d["name"] for d in await db.departments.find({"hospital_id": hid}, {"_id": 0, "name": 1}).to_list(50)]
    img = await db.hospital_images.find_one({"hospital_id": hid, "$or": [{"url": {"$ne": None}}, {"image_reference": {"$ne": None}}]}, {"_id": 0})
    h["cover_image"] = image_url(img) if img else None
    h["booking_available"] = h["doctor_count"] > 0
    return public_hospital(h)


def image_url(img: dict):
    if img.get("url"):
        return img["url"]
    if img.get("image_reference"):
        return f"/api/hospitals/{img['hospital_id']}/images/{img['image_id']}/media"
    return None


# ---------------- Public search ----------------

async def search_hospitals(params: dict):
    query = {}
    q = params.get("search")
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"area": rx}, {"address": rx}, {"specialties": rx}, {"city": rx}]
    if params.get("city"):
        query["city"] = {"$regex": f"^{re.escape(params['city'])}$", "$options": "i"}
    if params.get("area"):
        query["area"] = {"$regex": re.escape(params["area"]), "$options": "i"}
    if params.get("hospital_type"):
        query["hospital_type"] = params["hospital_type"]
    if params.get("emergency") is not None:
        query["emergency_available"] = params["emergency"]
    if params.get("verification_status"):
        query["verification_status"] = params["verification_status"]
    if params.get("department"):
        drx = {"$regex": re.escape(params["department"]), "$options": "i"}
        hosp_ids = [d["hospital_id"] for d in await db.departments.find({"name": drx}, {"_id": 0, "hospital_id": 1}).to_list(500)]
        query["$and"] = [{"$or": [{"hospital_id": {"$in": hosp_ids}}, {"specialties": drx}]}]
    page, limit = max(1, params.get("page", 1)), min(50, params.get("limit", 12))
    lat, lng = params.get("lat"), params.get("lng")
    if lat is not None and lng is not None:
        geo = {"near": svc.geo_point(lat, lng), "distanceField": "distance_m", "spherical": True, "query": query, "key": "location"}
        if params.get("radius_km"):
            geo["maxDistance"] = params["radius_km"] * 1000
        pipeline = [{"$geoNear": geo}, {"$project": {"_id": 0}}]
        counted = await db.hospitals.aggregate(pipeline + [{"$count": "n"}]).to_list(1)
        total = counted[0]["n"] if counted else 0
        hospitals = await db.hospitals.aggregate(pipeline + [{"$skip": (page - 1) * limit}, {"$limit": limit}]).to_list(limit)
        for h in hospitals:
            h["distance_km"] = round(h.pop("distance_m") / 1000, 1)
    else:
        sort_field = {"name": "name", "city": "city", "newest": "created_at", "area": "area"}.get(params.get("sort") or "name", "name")
        total = await db.hospitals.count_documents(query)
        hospitals = await db.hospitals.find(query, {"_id": 0}).sort(sort_field, 1).skip((page - 1) * limit).limit(limit).to_list(limit)
    hospitals = [await enrich(h) for h in hospitals]
    return {"hospitals": hospitals, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}


def search_params(search, city, area, hospital_type, department, emergency, verification_status, sort, page, limit, lat, lng, radius_km):
    return {"search": search, "city": city, "area": area, "hospital_type": hospital_type, "department": department, "emergency": emergency,
            "verification_status": verification_status, "sort": sort, "page": page, "limit": limit, "lat": lat, "lng": lng, "radius_km": radius_km}


@router.get("/hospitals/search")
async def hospitals_search(search: Optional[str] = None, city: Optional[str] = None, area: Optional[str] = None, hospital_type: Optional[str] = None,
                           department: Optional[str] = None, emergency: Optional[bool] = None, verification_status: Optional[str] = None,
                           sort: Optional[str] = "name", page: int = 1, limit: int = 12, lat: Optional[float] = None, lng: Optional[float] = None,
                           radius_km: Optional[float] = None, user=Depends(get_current_user)):
    p = search_params(search, city, area, hospital_type, department, emergency, verification_status, sort, page, limit, lat, lng, radius_km)
    return await cached(("search", tuple(sorted(p.items()))), lambda: search_hospitals(p))


@router.get("/hospitals/jaipur")
async def hospitals_jaipur(search: Optional[str] = None, area: Optional[str] = None, hospital_type: Optional[str] = None, department: Optional[str] = None,
                           emergency: Optional[bool] = None, verification_status: Optional[str] = None, sort: Optional[str] = "name", page: int = 1,
                           limit: int = 12, lat: Optional[float] = None, lng: Optional[float] = None, radius_km: Optional[float] = None,
                           user=Depends(get_current_user)):
    p = search_params(search, "Jaipur", area, hospital_type, department, emergency, verification_status, sort, page, limit, lat, lng, radius_km)
    return await cached(("search", tuple(sorted(p.items()))), lambda: search_hospitals(p))


@router.get("/hospitals/autocomplete")
async def hospitals_autocomplete(q: str, city: Optional[str] = None, user=Depends(get_current_user)):
    if len(q.strip()) < 2:
        return {"suggestions": []}
    rx = {"$regex": re.escape(q.strip()), "$options": "i"}
    query = {"$or": [{"name": rx}, {"area": rx}]}
    if city:
        query["city"] = {"$regex": f"^{re.escape(city)}$", "$options": "i"}
    docs = await db.hospitals.find(query, {"_id": 0, "hospital_id": 1, "name": 1, "area": 1, "city": 1, "verification_status": 1}).limit(8).to_list(8)
    areas = await db.hospitals.distinct("area", {"area": rx, **({"city": query["city"]} if city else {})})
    return {"suggestions": [{"type": "hospital", **d} for d in docs] + [{"type": "area", "name": a} for a in sorted(a for a in areas if a)[:5]]}


@router.get("/hospitals/filters")
async def hospital_filters(city: Optional[str] = None, user=Depends(get_current_user)):
    match = {"city": {"$regex": f"^{re.escape(city)}$", "$options": "i"}} if city else {}

    async def compute():
        areas = sorted(a for a in await db.hospitals.distinct("area", match) if a)
        types = sorted(t for t in await db.hospitals.distinct("hospital_type", match) if t)
        depts = sorted(set([d for d in await db.departments.distinct("name")] + [s for s in await db.hospitals.distinct("specialties", match) if s]))
        return {"areas": areas, "hospital_types": types, "departments": depts, "cities": [c["name"] for c in CITIES.values()]}
    return await cached(("filters", city), compute)


@router.get("/hospitals/by-slug/{slug}")
async def hospital_by_slug(slug: str, user=Depends(get_current_user)):
    h = await db.hospitals.find_one({"slug": slug}, {"_id": 0, "hospital_id": 1})
    if not h:
        raise HTTPException(404, "Hospital not found")
    return h


@router.get("/hospitals/{hospital_id}/images")
async def hospital_images(hospital_id: str, user=Depends(get_current_user)):
    imgs = await db.hospital_images.find({"hospital_id": hospital_id}, {"_id": 0}).to_list(100)
    for i in imgs:
        i["url"] = image_url(i)
    return {"images": [i for i in imgs if i["url"]], "message": None if imgs else "Hospital images are currently unavailable."}


@router.get("/hospitals/{hospital_id}/images/{image_id}/media")
async def hospital_image_media(hospital_id: str, image_id: str):
    img = await db.hospital_images.find_one({"hospital_id": hospital_id, "image_id": image_id}, {"_id": 0})
    if not img or not img.get("image_reference"):
        raise HTTPException(404, "Image not found")
    provider = GooglePlacesProvider()
    if not provider.configured():
        raise HTTPException(503, "Image provider not configured")
    content, ctype = await provider.photo_bytes(img["image_reference"])
    return Response(content=content, media_type=ctype, headers={"Cache-Control": "public, max-age=86400"})


@router.get("/hospitals/{hospital_id}/doctors")
async def hospital_doctors(hospital_id: str, user=Depends(get_current_user)):
    docs = await db.doctors.find({"hospital_id": hospital_id, "active": True}, {"_id": 0}).to_list(200)
    for d in docs:
        dept = await db.departments.find_one({"department_id": d.get("department_id")}, {"_id": 0, "name": 1})
        d["department_name"] = dept["name"] if dept else ""
    return {"doctors": docs, "booking_available": len(docs) > 0,
            "message": None if docs else "Online appointment booking through SmartCare AI is not currently available for this hospital."}


@router.get("/hospitals/{hospital_id}/services")
async def hospital_services(hospital_id: str, user=Depends(get_current_user)):
    h = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0, "facilities": 1, "specialties": 1})
    if not h:
        raise HTTPException(404, "Hospital not found")
    services = await db.hospital_services.find({"hospital_id": hospital_id}, {"_id": 0}).to_list(200)
    return {"services": services, "facilities": h.get("facilities") or [], "specialties": h.get("specialties") or []}


@router.get("/hospitals/{hospital_id}/location")
async def hospital_location(hospital_id: str, lat: Optional[float] = None, lng: Optional[float] = None, user=Depends(get_current_user)):
    h = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0, "name": 1, "address": 1, "area": 1, "city": 1, "latitude": 1, "longitude": 1, "map_url": 1, "external_provider": 1})
    if not h:
        raise HTTPException(404, "Hospital not found")
    h["directions_url"] = f"https://www.google.com/maps/dir/?api=1&destination={h['latitude']},{h['longitude']}"
    h["open_in_maps_url"] = h.get("map_url") or f"https://www.openstreetmap.org/?mlat={h['latitude']}&mlon={h['longitude']}#map=17/{h['latitude']}/{h['longitude']}"
    if lat is not None and lng is not None:
        h["distance_km"] = round(svc.haversine_m(lat, lng, h["latitude"], h["longitude"]) / 1000, 2)
        h["route"] = await _osrm_route(lat, lng, h["latitude"], h["longitude"])
    return h


async def _osrm_route(lat1, lng1, lat2, lng2):
    import httpx
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(f"https://router.project-osrm.org/route/v1/driving/{lng1},{lat1};{lng2},{lat2}", params={"overview": "false"})
            data = r.json()
            route = data["routes"][0]
            return {"distance_km": round(route["distance"] / 1000, 1), "duration_min": round(route["duration"] / 60), "provider": "OSRM"}
    except Exception:
        return None


# ---------------- Admin ----------------

class ImportIn(BaseModel):
    provider: Optional[str] = None


@router.post("/admin/hospitals/import/{city}")
async def start_city_import(city: str, payload: ImportIn = ImportIn(), user=Depends(require_roles("admin"))):
    if not get_city(city):
        raise HTTPException(404, f"City '{city}' is not configured")
    job, created = await svc.start_import(city, user["user_id"], payload.provider)
    if created:
        await audit(user["user_id"], "hospital_import_start", "import_job", job["job_id"])
    bust_cache()
    return {"job": job, "created": created}


@router.get("/admin/hospitals/import/status")
async def import_status(user=Depends(require_roles("admin"))):
    jobs = await db.hospital_import_jobs.find({}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    active = next((j for j in jobs if j["status"] in ("queued", "running")), None)
    counts = {
        "total_imported": await db.hospitals.count_documents({"external_provider": {"$ne": None}}),
        "total_hospitals": await db.hospitals.count_documents({}),
        "verified": await db.hospitals.count_documents({"verification_status": "verified"}),
        "public_data": await db.hospitals.count_documents({"verification_status": "public_data"}),
        "needs_review": await db.hospitals.count_documents({"verification_status": "needs_review"}),
        "rejected": await db.hospitals.count_documents({"verification_status": "rejected"}),
        "duplicates": await db.hospital_duplicate_candidates.count_documents({"status": "open"}),
        "pending_updates": await db.hospitals.count_documents({"pending_updates": {"$ne": None}}),
        "failed": sum(j.get("counters", {}).get("failed", 0) for j in jobs),
        "total_discovered": sum(j.get("counters", {}).get("discovered", 0) for j in jobs),
    }
    return {"active_job": active, "jobs": jobs, "counts": counts, "providers": provider_status(), "active_provider": get_provider().name,
            "cities": [{"key": c["key"], "name": c["name"], "state": c["state"]} for c in CITIES.values()]}


@router.get("/admin/hospitals/import/{job_id}/failures")
async def import_failures(job_id: str, user=Depends(require_roles("admin"))):
    return {"items": await db.hospital_import_items.find({"job_id": job_id}, {"_id": 0}).limit(200).to_list(200)}


@router.get("/admin/hospitals/review")
async def review_queue(status: str = "needs_review", page: int = 1, limit: int = 20, user=Depends(require_roles("admin"))):
    q = {"verification_status": status} if status != "pending_updates" else {"pending_updates": {"$ne": None}}
    total = await db.hospitals.count_documents(q)
    docs = await db.hospitals.find(q, {"_id": 0}).sort("updated_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"hospitals": [public_hospital(d) for d in docs], "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}


@router.get("/admin/hospitals/duplicates")
async def duplicate_candidates(user=Depends(require_roles("admin"))):
    items = await db.hospital_duplicate_candidates.find({"status": "open"}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    for it in items:
        it["hospital"] = public_hospital(await db.hospitals.find_one({"hospital_id": it["hospital_id"]}, {"_id": 0}) or {})
        it["matched"] = public_hospital(await db.hospitals.find_one({"hospital_id": it["matched_hospital_id"]}, {"_id": 0}) or {})
    return {"candidates": items}


class DupResolveIn(BaseModel):
    action: str  # merge | keep_both


@router.post("/admin/hospitals/duplicates/{candidate_id}/resolve")
async def resolve_duplicate(candidate_id: str, payload: DupResolveIn, user=Depends(require_roles("admin"))):
    c = await db.hospital_duplicate_candidates.find_one({"candidate_id": candidate_id, "status": "open"}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Candidate not found")
    if payload.action == "merge":
        await svc.merge_hospitals(c["matched_hospital_id"], c["hospital_id"])
    elif payload.action == "keep_both":
        await db.hospital_duplicate_candidates.update_one({"candidate_id": candidate_id}, {"$set": {"status": "kept_both", "resolved_at": utcnow()}})
        await db.hospitals.update_one({"hospital_id": c["hospital_id"], "verification_status": "needs_review"}, {"$set": {"verification_status": "public_data"}})
    else:
        raise HTTPException(400, "action must be merge or keep_both")
    await audit(user["user_id"], f"duplicate_{payload.action}", "hospital", c["hospital_id"])
    bust_cache()
    return {"ok": True}


@router.post("/admin/hospitals/{hospital_id}/sync")
async def sync_one(hospital_id: str, user=Depends(require_roles("admin"))):
    h = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Hospital not found")
    if not h.get("external_provider_id"):
        raise HTTPException(400, "This hospital was added manually and has no external provider to sync from")
    result = await svc.sync_hospitals([hospital_id])
    await audit(user["user_id"], "hospital_sync", "hospital", hospital_id)
    bust_cache()
    return {"result": result, "hospital": public_hospital(await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0}))}


class VerifyIn(BaseModel):
    status: str  # verified | public_data | needs_review | rejected
    apply_pending: Optional[bool] = None
    note: Optional[str] = ""


@router.post("/admin/hospitals/{hospital_id}/verify")
async def verify_hospital(hospital_id: str, payload: VerifyIn, user=Depends(require_roles("admin"))):
    if payload.status not in ("verified", "public_data", "needs_review", "rejected"):
        raise HTTPException(400, "Invalid status")
    h = await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Hospital not found")
    update = {"verification_status": payload.status, "verified": payload.status == "verified", "verified_by": user["user_id"],
              "verified_at": utcnow(), "review_note": payload.note or "", "updated_at": utcnow()}
    if payload.apply_pending is not None and h.get("pending_updates"):
        if payload.apply_pending:
            update.update(h["pending_updates"])
            if "latitude" in h["pending_updates"] or "longitude" in h["pending_updates"]:
                update["location"] = svc.geo_point(update.get("latitude", h["latitude"]), update.get("longitude", h["longitude"]))
        update["pending_updates"] = None
    await db.hospitals.update_one({"hospital_id": hospital_id}, {"$set": update})
    await svc.log_sync(hospital_id, "admin", "verify", payload.status, payload.note or "")
    await audit(user["user_id"], f"hospital_{payload.status}", "hospital", hospital_id)
    bust_cache()
    return public_hospital(await db.hospitals.find_one({"hospital_id": hospital_id}, {"_id": 0}))


class MergeIn(BaseModel):
    duplicate_id: str


@router.post("/admin/hospitals/{hospital_id}/merge")
async def merge_into(hospital_id: str, payload: MergeIn, user=Depends(require_roles("admin"))):
    if hospital_id == payload.duplicate_id:
        raise HTTPException(400, "Cannot merge a hospital into itself")
    try:
        merged = await svc.merge_hospitals(hospital_id, payload.duplicate_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    await audit(user["user_id"], "hospital_merge", "hospital", hospital_id)
    bust_cache()
    return public_hospital(merged)


@router.delete("/admin/hospitals/{hospital_id}")
async def admin_delete_hospital(hospital_id: str, user=Depends(require_roles("admin"))):
    res = await db.hospitals.delete_one({"hospital_id": hospital_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Hospital not found")
    await db.hospital_images.delete_many({"hospital_id": hospital_id})
    await db.hospital_services.delete_many({"hospital_id": hospital_id})
    await db.departments.delete_many({"hospital_id": hospital_id})
    await db.hospital_duplicate_candidates.update_many({"$or": [{"hospital_id": hospital_id}, {"matched_hospital_id": hospital_id}], "status": "open"}, {"$set": {"status": "deleted", "resolved_at": utcnow()}})
    await audit(user["user_id"], "hospital_delete", "hospital", hospital_id)
    bust_cache()
    return {"ok": True}


@router.get("/admin/hospitals/{hospital_id}/sync-logs")
async def sync_logs(hospital_id: str, user=Depends(require_roles("admin"))):
    return {"logs": await db.hospital_sync_logs.find({"hospital_id": hospital_id}, {"_id": 0}).sort("synced_at", -1).limit(50).to_list(50)}


class ServiceIn(BaseModel):
    service_name: str
    description: Optional[str] = ""
    available: bool = True


@router.put("/admin/hospitals/{hospital_id}/services")
async def set_services(hospital_id: str, services: List[ServiceIn], user=Depends(require_roles("admin"))):
    await db.hospital_services.delete_many({"hospital_id": hospital_id})
    if services:
        await db.hospital_services.insert_many([{"service_id": new_id("svc"), "hospital_id": hospital_id, "source": "admin", **s.model_dump()} for s in services])
    return {"ok": True}


@router.post("/admin/hospitals/resync-all")
async def resync_all(background: BackgroundTasks, user=Depends(require_roles("admin"))):
    ids = [h["hospital_id"] for h in await db.hospitals.find({"external_provider_id": {"$ne": None}}, {"_id": 0, "hospital_id": 1}).to_list(5000)]
    background.add_task(svc.sync_hospitals, ids)
    await audit(user["user_id"], "hospital_resync_all", "hospital", None)
    return {"queued": len(ids)}


# ---------------- Cron ----------------

@router.post("/cron/hospital-sync")
async def cron_hospital_sync(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(401, "Unauthorized")
    run_id = request.headers.get("X-Webhook-Id") or new_id("run")
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "job": "hospital-sync", "received_at": utcnow()})
    ids = [h["hospital_id"] for h in await db.hospitals.find({"external_provider_id": {"$ne": None}}, {"_id": 0, "hospital_id": 1}).to_list(5000)]
    background.add_task(svc.sync_hospitals, ids)
    return {"ok": True, "queued": len(ids)}
