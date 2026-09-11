import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader, EmptyState } from "../../components/common";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Search, Stethoscope, IndianRupee, Building2 } from "lucide-react";

export default function DoctorSearch() {
  const [search, setSearch] = useState("");
  const [doctors, setDoctors] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get("/doctors", { params: search ? { search } : {} })
        .then((r) => setDoctors(r.data.doctors))
        .catch(() => setDoctors([]));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div data-testid="doctor-search-page">
      <PageHeader title="Find Doctors" description="Search doctors by name or specialization." testid="doctor-search-title" />
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search doctor or specialization..." className="pl-12 h-12 text-base rounded-xl bg-white" data-testid="doctor-search-input" />
      </div>
      {!doctors ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
      ) : doctors.length === 0 ? (
        <EmptyState title="No doctors found" description="Try a different name or specialization." testid="no-doctors-found" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="doctor-results">
          {doctors.map((d) => (
            <div key={d.doctor_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-sky-200 transition-all" data-testid={`doctor-card-${d.doctor_id}`}>
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-2xl bg-sky-50 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {d.photo_url ? <img src={d.photo_url} alt={d.name} className="h-full w-full object-cover" /> : <Stethoscope className="h-7 w-7 text-sky-600" />}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">Dr. {d.name}</h3>
                  <p className="text-sm text-sky-700">{d.specialization}</p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Building2 className="h-3 w-3" />{d.hospital_name}</p>
                  <p className="text-xs text-slate-500">{d.experience_years} yrs experience</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                <span className="text-sm font-medium text-slate-700 flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" />{d.consultation_fee}</span>
                <div className="flex gap-2">
                  <Link to={`/doctors/${d.doctor_id}`} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-xl transition-all" data-testid={`view-doctor-${d.doctor_id}`}>Profile</Link>
                  <Link to={`/doctors/${d.doctor_id}#book`} className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-3 py-1.5 rounded-xl transition-all" data-testid={`book-doctor-${d.doctor_id}`}>Book</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
