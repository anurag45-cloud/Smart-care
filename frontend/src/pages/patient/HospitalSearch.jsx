import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader, EmptyState } from "../../components/common";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { Search, MapPin, Phone, Stethoscope, Building2, ChevronLeft, ChevronRight, Siren } from "lucide-react";

const FALLBACK_IMG = "https://images.unsplash.com/photo-1580615631392-aeb060d526e4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBob3NwaXRhbCUyMGJ1aWxkaW5nJTIwZXh0ZXJpb3IlMjBkb2N0b3JzJTIwbWVkaWNhbCUyMHN0YWZmfGVufDB8fHx8MTc4OTEzNzQ0MXww&ixlib=rb-4.1.0&q=85";

export default function HospitalSearch() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState("all");
  const [emergency, setEmergency] = useState("all");
  const [department, setDepartment] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, limit: 9, sort };
    if (search) params.search = search;
    if (city) params.city = city;
    if (type !== "all") params.hospital_type = type;
    if (emergency !== "all") params.emergency = emergency === "yes";
    if (department) params.department = department;
    api.get("/hospitals", { params })
      .then((r) => setResult(r.data))
      .catch(() => setResult({ hospitals: [], total: 0, pages: 1 }))
      .finally(() => setLoading(false));
  }, [search, city, type, emergency, department, sort, page]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div data-testid="hospital-search-page">
      <PageHeader title="Search Hospitals" description="Find hospitals by name, city, department or specialty." testid="hospital-search-title" />

      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-sm mb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search hospital by name..."
            className="pl-12 h-12 text-base rounded-xl"
            data-testid="hospital-search-input"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Input value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} placeholder="City" data-testid="filter-city" className="rounded-xl" />
          <Input value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} placeholder="Department" data-testid="filter-department" className="rounded-xl" />
          <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
            <SelectTrigger className="rounded-xl" data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="multi-specialty">Multi-specialty</SelectItem>
              <SelectItem value="super-specialty">Super-specialty</SelectItem>
              <SelectItem value="clinic">Clinic</SelectItem>
              <SelectItem value="government">Government</SelectItem>
            </SelectContent>
          </Select>
          <Select value={emergency} onValueChange={(v) => { setEmergency(v); setPage(1); }}>
            <SelectTrigger className="rounded-xl" data-testid="filter-emergency"><SelectValue placeholder="Emergency" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Emergency: any</SelectItem>
              <SelectItem value="yes">24x7 Emergency</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="rounded-xl" data-testid="sort-select"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name A-Z</SelectItem>
              <SelectItem value="city">City</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : result?.hospitals?.length === 0 ? (
        <EmptyState title="No hospitals match your search" description="Try a different name, city or department." testid="no-hospitals" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="hospital-results">
            {result.hospitals.map((h) => (
              <div key={h.hospital_id} className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sky-200 hover:shadow-[0_12px_28px_-6px_rgba(15,23,42,0.12)] transition-all duration-300 flex flex-col" data-testid={`hospital-card-${h.hospital_id}`}>
                <div className="relative h-40 bg-slate-100">
                  <img src={h.cover_image || FALLBACK_IMG} alt={h.name} className="w-full h-full object-cover" />
                  {h.emergency_available && (
                    <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/95 text-red-600 border border-red-100">
                      <Siren className="h-3 w-3" /> 24x7 Emergency
                    </span>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-lg font-semibold text-slate-900">{h.name}</h3>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1"><MapPin className="h-3.5 w-3.5 flex-shrink-0" />{h.address}, {h.city}</p>
                  {h.phone && <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1"><Phone className="h-3.5 w-3.5 flex-shrink-0" />{h.phone}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {h.departments?.slice(0, 3).map((d) => (
                      <span key={d} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60">{d}</span>
                    ))}
                    {h.departments?.length > 3 && <span className="text-xs text-slate-400 self-center">+{h.departments.length - 3} more</span>}
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5" />{h.doctor_count} doctors</span>
                    <button onClick={() => navigate(`/hospitals/${h.hospital_id}`)} className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all active:scale-[0.98]" data-testid={`view-hospital-${h.hospital_id}`}>
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
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
      {!loading && result?.total === 0 && (
        <div className="text-center text-sm text-slate-400 mt-6 flex items-center justify-center gap-1.5">
          <Building2 className="h-4 w-4" /> Hospitals are added by the platform administrator.
        </div>
      )}
    </div>
  );
}
