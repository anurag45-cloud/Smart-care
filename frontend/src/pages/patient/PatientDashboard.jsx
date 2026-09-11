import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { PageLoading, EmptyState, StatusBadge, formatDate } from "../../components/common";
import { CalendarDays, FlaskConical, Bell, Search, Stethoscope, Upload, Sparkles, MapPin, Clock, Building2 } from "lucide-react";

export default function PatientDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/appointments").then((r) => r.data.appointments),
      api.get("/reports").then((r) => r.data.reports),
      api.get("/notifications").then((r) => r.data),
      api.get("/prescriptions").then((r) => r.data.prescriptions),
    ])
      .then(([appointments, reports, notifs, prescriptions]) => setData({ appointments, reports, notifs, prescriptions }))
      .catch(() => setError("We couldn't load your dashboard. Please try again."));
  }, []);

  if (error) return <EmptyState title="Something went wrong" description={error} testid="dashboard-error" />;
  if (!data) return <PageLoading />;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.appointments
    .filter((a) => ["scheduled", "confirmed"].includes(a.status) && a.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const next = upcoming[0];

  const cards = [
    { label: "Upcoming Appointments", value: upcoming.length, icon: CalendarDays, testid: "stat-upcoming" },
    { label: "Lab Reports", value: data.reports.length, icon: FlaskConical, testid: "stat-reports" },
    { label: "Prescriptions", value: data.prescriptions.length, icon: Stethoscope, testid: "stat-prescriptions" },
    { label: "Unread Notifications", value: data.notifs.unread, icon: Bell, testid: "stat-notifications" },
  ];

  const actions = [
    { label: "Search Hospital", icon: Search, to: "/hospitals", testid: "action-search-hospital" },
    { label: "Find Doctor", icon: Stethoscope, to: "/doctors", testid: "action-find-doctor" },
    { label: "Upload Report", icon: Upload, to: "/reports", testid: "action-upload-report" },
    { label: "Ask AI", icon: Sparkles, to: "/assistant", testid: "action-ask-ai" },
  ];

  return (
    <div data-testid="patient-dashboard">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-heading" data-testid="dashboard-greeting">
        Hello, {user?.name?.split(" ")[0]}
      </h1>
      <p className="text-sm text-slate-500 mt-1 mb-8">Here's your health overview.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]" data-testid={c.testid}>
            <c.icon className="h-5 w-5 text-sky-600 mb-3" />
            <div className="text-2xl font-bold text-slate-900 font-heading">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]" data-testid="next-appointment-card">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Next Appointment</h2>
            {next ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-sky-50 flex items-center justify-center">
                    <CalendarDays className="h-6 w-6 text-sky-600" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">Dr. {next.doctor?.name}</div>
                    <div className="text-sm text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{next.hospital?.name}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(next.date)} at {next.time}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={next.status} />
                  {next.hospital?.latitude && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${next.hospital.latitude},${next.hospital.longitude}`}
                      target="_blank" rel="noreferrer"
                      className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-1.5"
                      data-testid="next-appt-directions"
                    >
                      <MapPin className="h-4 w-4" /> Directions
                    </a>
                  )}
                  <Link to="/appointments" className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all" data-testid="next-appt-view">
                    View Details
                  </Link>
                </div>
              </div>
            ) : (
              <EmptyState title="No upcoming appointments" description="Search for a hospital and book your first appointment." testid="no-next-appointment"
                action={<Link to="/hospitals" className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl" data-testid="book-first-appt">Find a Hospital</Link>} />
            )}
          </section>

          <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]" data-testid="quick-actions">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {actions.map((a) => (
                <button key={a.label} onClick={() => navigate(a.to)} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 transition-all duration-200" data-testid={a.testid}>
                  <a.icon className="h-5 w-5 text-sky-600" />
                  <span className="text-sm font-medium text-slate-700">{a.label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]" data-testid="dashboard-notifications">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
            <Link to="/notifications" className="text-sm text-sky-600 hover:text-sky-700 font-medium" data-testid="view-all-notifications">View all</Link>
          </div>
          {data.notifs.notifications.length === 0 ? (
            <p className="text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.notifs.notifications.slice(0, 5).map((n) => (
                <li key={n.notification_id} className={`p-3 rounded-xl text-sm ${n.read ? "bg-slate-50" : "bg-sky-50 border border-sky-100"}`} data-testid={`notif-${n.notification_id}`}>
                  <div className="font-medium text-slate-800">{n.title}</div>
                  <div className="text-slate-500 mt-0.5 line-clamp-2">{n.message}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
