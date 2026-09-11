import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState } from "../../components/common";
import { User, ArrowRight } from "lucide-react";

export default function DoctorPatients() {
  const [patients, setPatients] = useState(null);

  useEffect(() => {
    api.get("/patients").then((r) => setPatients(r.data.patients)).catch(() => setPatients([]));
  }, []);

  if (!patients) return <PageLoading />;

  return (
    <div data-testid="doctor-patients-page">
      <PageHeader title="My Patients" description="Patients who have booked appointments with you." testid="doctor-patients-title" />
      {patients.length === 0 ? (
        <EmptyState title="No patients yet" description="Patients appear here after their first appointment with you." testid="no-patients" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="patients-list">
          {patients.map((p) => (
            <Link key={p.user_id} to={`/doctor/patients/${p.user_id}`} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-sky-200 hover:shadow-md transition-all flex items-center justify-between" data-testid={`patient-card-${p.user_id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-xl bg-sky-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {p.picture ? <img src={p.picture} alt="" className="h-full w-full object-cover" /> : <User className="h-5 w-5 text-sky-600" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.visit_count} visit{p.visit_count === 1 ? "" : "s"} · last {p.last_visit}</div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
