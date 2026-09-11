import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { PageLoading } from "../../components/common";
import { CalendarDays, Users, CheckCircle2, Clock, ArrowRight } from "lucide-react";

export default function DoctorDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/doctor/stats").then((r) => setStats(r.data)).catch((e) => setError(e.friendlyMessage));
  }, []);

  if (error) return <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-800 text-sm" data-testid="doctor-dashboard-error">{error}. An administrator may need to create your doctor profile first.</div>;
  if (!stats) return <PageLoading />;

  const cards = [
    { label: "Today's Appointments", value: stats.todays_appointments.length, icon: CalendarDays, testid: "stat-today" },
    { label: "Upcoming", value: stats.upcoming_count, icon: Clock, testid: "stat-upcoming" },
    { label: "Completed", value: stats.completed_count, icon: CheckCircle2, testid: "stat-completed" },
    { label: "My Patients", value: stats.patient_count, icon: Users, testid: "stat-patients" },
  ];

  return (
    <div data-testid="doctor-dashboard">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-heading" data-testid="doctor-greeting">
        Hello, Dr. {user?.name?.split(" ").slice(-1)[0]}
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-8">{stats.doctor.specialization} · {stats.doctor.hospital_name || ""}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]" data-testid={c.testid}>
            <c.icon className="h-5 w-5 text-sky-600 mb-3" />
            <div className="text-2xl font-bold text-slate-900 font-heading">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="todays-appointments">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Today's appointments</h2>
          <Link to="/doctor/appointments" className="text-sm text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1" data-testid="view-all-appointments">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {stats.todays_appointments.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No appointments scheduled for today.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {stats.todays_appointments.map((a) => (
              <div key={a.appointment_id} className="py-3 flex flex-wrap items-center justify-between gap-3" data-testid={`today-appt-${a.appointment_id}`}>
                <div>
                  <div className="font-medium text-slate-900">{a.patient?.name}</div>
                  <div className="text-xs text-slate-500">{a.reason || "General consultation"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-sky-700">{a.time}</span>
                  <Link to={`/doctor/patients/${a.patient_id}`} className="text-xs border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-600 font-medium px-3 py-1.5 rounded-xl transition-all" data-testid={`view-patient-${a.appointment_id}`}>
                    Patient
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
