import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader, EmptyState, VerificationBadge } from "../../components/common";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { Search, MapPin, Phone, Stethoscope, Building2, ChevronLeft, ChevronRight, Siren, LocateFixed, ImageOff, Map as MapIcon, CalendarPlus } from "lucide-react";

const ANY = "all";

export default function HospitalSearch() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ area: ANY, type: ANY, emergency: ANY, department: "", distance: ANY, sort: "name" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [options, setOptions] = useState({ areas: [], hospital_types: [], departments: [] });
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState(null);
  const [locError, setLocError] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => { api.get("/hospitals/filters").then((r) => setOptions(r.data)).catch(() => {}); }, []);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: 9, sort: filters.sort };
    if (search) params.search = search;
    if (filters.area !== ANY) params.area = filters.area;
    if (filters.type !== ANY) params.hospital_type = filters.type;
    if (filters.emergency !== ANY) params.emergency = filters.emergency === "yes";
    if (filters.department) params.department = filters.department;
    if (pos) { params.lat = pos.lat; params.lng = pos.lng; if (filters.distance !== ANY) params.radius_km = Number(filters.distance); }
    api.get("/hospitals/search", { params })
      .then((r) => setResult(r.data))
      .catch(() => setResult({ hospitals: [], total: 0, pages: 1, error: true }))
      .finally(() => setLoading(false));
  }, [search, filters, page, pos]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    if (search.trim().length < 2) { setSuggestions([]); return; }
    const t = setTimeout(() => api.get("/hospitals/autocomplete", { params: { q: search } }).then((r) => setSuggestions(r.data.suggestions)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setShowSug(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const locate = () => {
    if (!navigator.geolocation) { setLocError("Location is not supported by this browser."); return; }
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setPage(1); },
      () => setLocError("Location permission denied. Distance filters need your location.")
    );
  };

  return (
    <div data-testid="hospital-search-page">
      <PageHeader title="Find a Hospital" description="Search publicly listed hospitals in Jaipur by name, area, type or department." testid="hospital-search-title" />

      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm mb-6 space-y-3">
        <div className="relative" ref={boxRef}>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); setShowSug(true); }} onFocus={() => setShowSug(true)}
            placeholder="Search hospitals in Jaipur..." className="pl-12 h-12 text-base rounded-xl" data-testid="hospital-search-input" />
          {showSug && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" data-testid="autocomplete-list">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => { if (s.type === "hospital") navigate(`/hospitals/${s.hospital_id}`); else { setSearch(""); setF("area", s.name); } setShowSug(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-sky-50 flex items-center gap-2" data-testid={`suggestion-${i}`}>
                  {s.type === "hospital" ? <Building2 className="h-4 w-4 text-sky-600" /> : <MapPin className="h-4 w-4 text-teal-600" />}
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.type === "hospital" ? <span className="text-xs text-slate-400">{s.area}</span> : <span className="text-xs text-slate-400">Area</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Select value={filters.area} onValueChange={(v) => setF("area", v)}>
            <SelectTrigger className="rounded-xl" data-testid="filter-area"><SelectValue placeholder="Area" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value={ANY}>All areas</SelectItem>
              {options.areas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.type} onValueChange={(v) => setF("type", v)}>
            <SelectTrigger className="rounded-xl" data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All types</SelectItem>
              {options.hospital_types.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace(/[-_]/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.emergency} onValueChange={(v) => setF("emergency", v)}>
            <SelectTrigger className="rounded-xl" data-testid="filter-emergency"><SelectValue placeholder="Emergency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Emergency: any</SelectItem>
              <SelectItem value="yes">Emergency listed</SelectItem>
            </SelectContent>
          </Select>
          <Input value={filters.department} onChange={(e) => setF("department", e.target.value)} placeholder="Department / specialty" list="dept-options" data-testid="filter-department" className="rounded-xl" />
          <datalist id="dept-options">{options.departments.map((d) => <option key={d} value={d} />)}</datalist>
          <Select value={filters.distance} onValueChange={(v) => { if (!pos) locate(); setF("distance", v); }}>
            <SelectTrigger className="rounded-xl" data-testid="filter-distance"><SelectValue placeholder="Distance" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any distance</SelectItem>
              {[2, 5, 10, 20].map((k) => <SelectItem key={k} value={String(k)}>Within {k} km</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.sort} onValueChange={(v) => setF("sort", v)}>
            <SelectTrigger className="rounded-xl" data-testid="sort-select"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="area">Area</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <button onClick={locate} className="inline-flex items-center gap-1.5 text-sky-700 hover:text-sky-800 font-medium" data-testid="use-location-btn">
            <LocateFixed className="h-3.5 w-3.5" /> {pos ? "Location on — sorted by distance" : "Use my location to see distances"}
          </button>
          {locError && <span className="text-red-600" data-testid="location-error">{locError}</span>}
          {result && !loading && <span className="ml-auto" data-testid="result-count">{result.total} hospital{result.total === 1 ? "" : "s"} found</span>}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
      ) : result?.error ? (
        <EmptyState title="Live hospital data is temporarily unavailable." description="Please try again in a moment." testid="search-error" />
      ) : result?.hospitals?.length === 0 ? (
        <EmptyState title="No hospitals match your search" description="Try a different name, area or department." testid="no-hospitals" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="hospital-results">
            {result.hospitals.map((h) => <HospitalCard key={h.hospital_id} h={h} navigate={navigate} />)}
          </div>
          {result.pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-xl border border-slate-300 disabled:opacity-40 hover:border-sky-600" data-testid="prev-page"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm text-slate-600" data-testid="page-indicator">Page {result.page} of {result.pages}</span>
              <button disabled={page >= result.pages} onClick={() => setPage(page + 1)} className="p-2 rounded-xl border border-slate-300 disabled:opacity-40 hover:border-sky-600" data-testid="next-page"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
        </>
      )}
      {!loading && result?.total === 0 && !search && (
        <div className="text-center text-sm text-slate-400 mt-6 flex items-center justify-center gap-1.5"><Building2 className="h-4 w-4" /> Hospitals are imported and verified by the platform administrator.</div>
      )}
    </div>
  );
}

function HospitalCard({ h, navigate }) {
  const src = h.cover_image ? (h.cover_image.startsWith("/") ? `${process.env.REACT_APP_BACKEND_URL}${h.cover_image}` : h.cover_image) : null;
  const go = (path) => () => navigate(path);
  const departments = h.departments?.length ? h.departments : (h.specialties || []);
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sky-200 hover:shadow-[0_12px_28px_-6px_rgba(15,23,42,0.12)] transition-all duration-300 flex flex-col" data-testid={`hospital-card-${h.hospital_id}`}>
      <div className="relative h-36 bg-slate-100">
        {src ? <img src={src} alt={h.name} className="w-full h-full object-cover" /> : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1" data-testid={`no-image-${h.hospital_id}`}><ImageOff className="h-6 w-6" /> Hospital images are currently unavailable.</div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <VerificationBadge status={h.verification_status} className="bg-white/95" />
          {h.emergency_available && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/95 text-red-600 border border-red-100"><Siren className="h-3 w-3" /> Emergency</span>}
        </div>
        {h.distance_km !== undefined && <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-900/80 text-white" data-testid={`distance-${h.hospital_id}`}>{h.distance_km} km</span>}
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-lg font-semibold text-slate-900 leading-snug">{h.name}</h3>
        {h.area && <p className="text-xs font-medium text-teal-700 mt-0.5">{h.area}</p>}
        <p className="text-sm text-slate-500 flex items-start gap-1.5 mt-1"><MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /><span className="line-clamp-2">{[h.address, h.city].filter(Boolean).join(", ")}</span></p>
        {h.phone && <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1"><Phone className="h-3.5 w-3.5 flex-shrink-0" />{h.phone}</p>}
        <div className="flex flex-wrap gap-1.5 mt-3 min-h-[22px]">
          {departments.slice(0, 3).map((d) => <span key={d} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60 capitalize">{d}</span>)}
          {departments.length > 3 && <span className="text-xs text-slate-400 self-center">+{departments.length - 3} more</span>}
          {departments.length === 0 && <span className="text-xs text-slate-400">Departments not listed</span>}
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
          <span className="text-xs text-slate-500 flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" />{h.doctor_count} doctors</span>
          <span className="text-[11px] text-slate-400 capitalize">{(h.hospital_type || "").replace(/[-_]/g, " ")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={go(`/hospitals/${h.hospital_id}`)} className="bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3 py-2 rounded-xl transition-all active:scale-[0.98]" data-testid={`view-hospital-${h.hospital_id}`}>View Hospital</button>
          <button onClick={go(`/hospitals/${h.hospital_id}?tab=location`)} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-xs font-medium px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1" data-testid={`view-map-${h.hospital_id}`}><MapIcon className="h-3.5 w-3.5" /> View Map</button>
          <button onClick={go(`/hospitals/${h.hospital_id}?tab=doctors`)} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-xs font-medium px-3 py-2 rounded-xl transition-all" data-testid={`view-doctors-${h.hospital_id}`}>View Doctors</button>
          <button onClick={go(`/hospitals/${h.hospital_id}?tab=doctors`)} disabled={!h.booking_available} title={h.booking_available ? "" : "Online booking not available for this hospital yet"} className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-medium px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1" data-testid={`book-${h.hospital_id}`}><CalendarPlus className="h-3.5 w-3.5" /> Book</button>
        </div>
      </div>
    </div>
  );
}
