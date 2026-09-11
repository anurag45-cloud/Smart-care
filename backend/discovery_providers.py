"""Pluggable hospital data providers. Every provider yields normalized candidate dicts.

Only data actually returned by the provider is stored - unknown fields stay None/empty."""
import asyncio
import logging
import os
from typing import AsyncIterator, Callable, Awaitable, Optional

import httpx

logger = logging.getLogger("discovery.providers")

HEALTH_TYPES = {"hospital", "clinic", "doctors", "nursing_home", "health_centre", "healthcare"}
NOMINATIM_URL = "https://nominatim.openstreetmap.org"
USER_AGENT = "SmartCareAI/1.0 (hospital-discovery; contact: admin@smartcare.ai)"
Progress = Callable[[str, int, int], Awaitable[None]]


def _tiles(bbox, n):
    lat_step = (bbox["north"] - bbox["south"]) / n
    lng_step = (bbox["east"] - bbox["west"]) / n
    for i in range(n):
        for j in range(n):
            yield {
                "south": bbox["south"] + i * lat_step, "north": bbox["south"] + (i + 1) * lat_step,
                "west": bbox["west"] + j * lng_step, "east": bbox["west"] + (j + 1) * lng_step,
            }


def _split(tile):
    mid_lat = (tile["south"] + tile["north"]) / 2
    mid_lng = (tile["west"] + tile["east"]) / 2
    return [
        {"south": tile["south"], "north": mid_lat, "west": tile["west"], "east": mid_lng},
        {"south": tile["south"], "north": mid_lat, "west": mid_lng, "east": tile["east"]},
        {"south": mid_lat, "north": tile["north"], "west": tile["west"], "east": mid_lng},
        {"south": mid_lat, "north": tile["north"], "west": mid_lng, "east": tile["east"]},
    ]


class BaseProvider:
    name = "base"
    requires_key = False
    attribution = ""

    def configured(self) -> bool:
        return True

    async def discover(self, city: dict, progress: Progress) -> AsyncIterator[dict]:
        raise NotImplementedError
        yield  # pragma: no cover

    async def lookup(self, external_ids: list[str]) -> list[dict]:
        raise NotImplementedError


class NominatimProvider(BaseProvider):
    """OpenStreetMap Nominatim search (ODbL, attribution required, 1 request/second)."""
    name = "openstreetmap"
    attribution = "Data © OpenStreetMap contributors, ODbL 1.0"

    def __init__(self):
        self._last = 0.0

    async def _get(self, client: httpx.AsyncClient, path: str, params: dict):
        wait = 1.1 - (asyncio.get_event_loop().time() - self._last)
        if wait > 0:
            await asyncio.sleep(wait)
        self._last = asyncio.get_event_loop().time()
        r = await client.get(f"{NOMINATIM_URL}{path}", params=params, headers={"User-Agent": USER_AGENT}, timeout=40)
        r.raise_for_status()
        return r.json()

    def normalize(self, e: dict, city: dict) -> Optional[dict]:
        name = (e.get("name") or "").strip()
        if not name or e.get("type") not in HEALTH_TYPES:
            return None
        addr = e.get("address") or {}
        tags = e.get("extratags") or {}
        try:
            lat, lng = float(e["lat"]), float(e["lon"])
        except (KeyError, ValueError):
            return None
        osm_type = {"node": "N", "way": "W", "relation": "R"}.get(e.get("osm_type"), "N")
        ext_id = f"{osm_type}{e['osm_id']}"
        road_parts = [addr.get(k) for k in ("house_number", "road", "neighbourhood") if addr.get(k)]
        area = addr.get("suburb") or addr.get("neighbourhood") or addr.get("quarter") or addr.get("residential") or addr.get("village") or ""
        htype = e.get("type")
        if tags.get("operator:type") in ("government", "public") or tags.get("ownership") in ("public", "government"):
            htype = "government"
        emergency = tags.get("emergency")
        specialties = [s.strip().replace("_", " ") for s in (tags.get("healthcare:speciality") or "").split(";") if s.strip()]
        image = tags.get("image") if (tags.get("image") or "").startswith("http") else None
        return {
            "external_provider": self.name,
            "external_provider_id": ext_id,
            "name": name,
            "official_name": tags.get("official_name") or None,
            "description": tags.get("description") or "",
            "hospital_type": htype,
            "categories": [c for c in [e.get("category"), e.get("type"), tags.get("healthcare")] if c],
            "address": ", ".join(road_parts) or ", ".join(p.strip() for p in (e.get("display_name") or "").split(",")[1:4]),
            "area": area,
            "city": addr.get("city") or addr.get("town") or city["name"],
            "state": addr.get("state") or city["state"],
            "country": addr.get("country") or city["country"],
            "postal_code": addr.get("postcode") or "",
            "latitude": lat,
            "longitude": lng,
            "phone": tags.get("phone") or tags.get("contact:phone") or tags.get("mobile") or "",
            "email": tags.get("email") or tags.get("contact:email") or "",
            "website": tags.get("website") or tags.get("contact:website") or tags.get("url") or "",
            "opening_hours": tags.get("opening_hours") or "",
            "emergency_available": True if emergency == "yes" else False if emergency == "no" else None,
            "specialties": specialties,
            "operator": tags.get("operator") or "",
            "beds": tags.get("beds") or None,
            "source_url": f"https://www.openstreetmap.org/{e.get('osm_type')}/{e['osm_id']}",
            "map_url": f"https://www.openstreetmap.org/?mlat={lat}&mlon={lng}#map=18/{lat}/{lng}",
            "images": [{"image_url": image, "source": "openstreetmap", "attribution": self.attribution}] if image else [],
            "raw_licence": e.get("licence"),
        }

    async def _search_tile(self, client, query, tile, city, seen, depth=0):
        params = {
            "q": query, "format": "jsonv2", "limit": 50, "addressdetails": 1, "extratags": 1, "bounded": 1,
            "viewbox": f"{tile['west']},{tile['north']},{tile['east']},{tile['south']}",
            "countrycodes": city["country_code"],
        }
        try:
            results = await self._get(client, "/search", params)
        except Exception as exc:
            logger.warning("Nominatim search failed (%s / tile): %s", query, exc)
            return
        for e in results:
            key = f"{e.get('osm_type')}/{e.get('osm_id')}"
            if key in seen:
                continue
            seen.add(key)
            cand = self.normalize(e, city)
            if cand:
                yield cand
        if len(results) >= 50 and depth < 2:
            for sub in _split(tile):
                async for c in self._search_tile(client, query, sub, city, seen, depth + 1):
                    yield c

    async def discover(self, city, progress):
        seen = set()
        tiles = list(_tiles(city["bbox"], city.get("grid", 4)))
        total = len(tiles) * len(city["queries"])
        done = 0
        async with httpx.AsyncClient() as client:
            for query in city["queries"]:
                for tile in tiles:
                    async for cand in self._search_tile(client, query, tile, city, seen):
                        yield cand
                    done += 1
                    await progress(f"Searching '{query}'", done, total)

    async def lookup(self, external_ids):
        out = []
        async with httpx.AsyncClient() as client:
            for i in range(0, len(external_ids), 40):
                chunk = external_ids[i:i + 40]
                try:
                    data = await self._get(client, "/lookup", {"osm_ids": ",".join(chunk), "format": "jsonv2", "addressdetails": 1, "extratags": 1})
                except Exception as exc:
                    logger.warning("Nominatim lookup failed: %s", exc)
                    continue
                out.extend(data)
        return out


class GooglePlacesProvider(BaseProvider):
    """Google Places API (New) text search. Active only when GOOGLE_PLACES_API_KEY is set."""
    name = "google_places"
    requires_key = True
    attribution = "Powered by Google"
    FIELDS = ("places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,"
              "places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.regularOpeningHours,"
              "places.primaryType,places.types,places.businessStatus,places.googleMapsUri,places.photos,places.editorialSummary,nextPageToken")

    def __init__(self):
        self.key = os.environ.get("GOOGLE_PLACES_API_KEY") or os.environ.get("GOOGLE_MAPS_API_KEY")

    def configured(self):
        return bool(self.key)

    def normalize(self, p: dict, city: dict) -> Optional[dict]:
        name = (p.get("displayName") or {}).get("text", "").strip()
        loc = p.get("location") or {}
        if not name or "latitude" not in loc:
            return None
        comps = {}
        for c in p.get("addressComponents") or []:
            for t in c.get("types", []):
                comps.setdefault(t, c.get("longText"))
        hours = (p.get("regularOpeningHours") or {}).get("weekdayDescriptions") or []
        photos = [{"image_reference": ph.get("name"), "image_url": None, "source": "google_places",
                   "attribution": ", ".join(a.get("displayName", "") for a in ph.get("authorAttributions", []))}
                  for ph in (p.get("photos") or [])[:8]]
        return {
            "external_provider": self.name,
            "external_provider_id": p["id"],
            "name": name,
            "official_name": None,
            "description": (p.get("editorialSummary") or {}).get("text", ""),
            "hospital_type": p.get("primaryType") or "hospital",
            "categories": p.get("types") or [],
            "address": p.get("formattedAddress") or "",
            "area": comps.get("sublocality_level_1") or comps.get("sublocality") or comps.get("neighborhood") or "",
            "city": comps.get("locality") or city["name"],
            "state": comps.get("administrative_area_level_1") or city["state"],
            "country": comps.get("country") or city["country"],
            "postal_code": comps.get("postal_code") or "",
            "latitude": loc["latitude"],
            "longitude": loc["longitude"],
            "phone": p.get("nationalPhoneNumber") or p.get("internationalPhoneNumber") or "",
            "email": "",
            "website": p.get("websiteUri") or "",
            "opening_hours": "; ".join(hours),
            "emergency_available": None,
            "specialties": [],
            "operator": "",
            "beds": None,
            "source_url": p.get("googleMapsUri") or "",
            "map_url": p.get("googleMapsUri") or "",
            "images": photos,
            "business_status": p.get("businessStatus"),
        }

    async def discover(self, city, progress):
        seen = set()
        total = len(city["queries"])
        async with httpx.AsyncClient(timeout=30) as client:
            for i, query in enumerate(city["queries"], 1):
                token = None
                for _ in range(3):
                    body = {"textQuery": f"{query} in {city['name']}, {city['state']}", "pageSize": 20,
                            "locationRestriction": {"rectangle": {"low": {"latitude": city["bbox"]["south"], "longitude": city["bbox"]["west"]},
                                                                  "high": {"latitude": city["bbox"]["north"], "longitude": city["bbox"]["east"]}}}}
                    if token:
                        body["pageToken"] = token
                    try:
                        r = await client.post("https://places.googleapis.com/v1/places:searchText", json=body,
                                              headers={"X-Goog-Api-Key": self.key, "X-Goog-FieldMask": self.FIELDS})
                        r.raise_for_status()
                        data = r.json()
                    except Exception as exc:
                        logger.warning("Google Places search failed: %s", exc)
                        break
                    for p in data.get("places", []):
                        if p["id"] in seen:
                            continue
                        seen.add(p["id"])
                        cand = self.normalize(p, city)
                        if cand:
                            yield cand
                    token = data.get("nextPageToken")
                    if not token:
                        break
                    await asyncio.sleep(2)
                await progress(f"Searching '{query}'", i, total)

    async def lookup(self, external_ids):
        out = []
        async with httpx.AsyncClient(timeout=30) as client:
            for pid in external_ids:
                try:
                    r = await client.get(f"https://places.googleapis.com/v1/places/{pid}",
                                         headers={"X-Goog-Api-Key": self.key, "X-Goog-FieldMask": self.FIELDS.replace("places.", "").replace(",nextPageToken", "")})
                    r.raise_for_status()
                    out.append(r.json())
                except Exception as exc:
                    logger.warning("Google Places lookup failed: %s", exc)
        return out

    async def photo_bytes(self, reference: str):
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            r = await client.get(f"https://places.googleapis.com/v1/{reference}/media", params={"maxWidthPx": 1000, "key": self.key})
            r.raise_for_status()
            return r.content, r.headers.get("content-type", "image/jpeg")


PROVIDERS = {NominatimProvider.name: NominatimProvider, GooglePlacesProvider.name: GooglePlacesProvider}


def get_provider(name: Optional[str] = None) -> BaseProvider:
    if name and name in PROVIDERS:
        return PROVIDERS[name]()
    preferred = os.environ.get("HOSPITAL_DATA_PROVIDER")
    if preferred in PROVIDERS and PROVIDERS[preferred]().configured():
        return PROVIDERS[preferred]()
    google = GooglePlacesProvider()
    return google if google.configured() else NominatimProvider()


def provider_status():
    return [{"name": n, "configured": cls().configured(), "requires_key": cls.requires_key, "attribution": cls.attribution} for n, cls in PROVIDERS.items()]
