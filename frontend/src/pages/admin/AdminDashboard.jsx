import { useEffect, useState } from "react";
import api from "../../lib/api";
import { PageLoading } from "../../components/common";
import { Users, Stethoscope, Building2, CalendarDays, CheckCircle2, XCircle, FlaskConical, Palmtree } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => setStats({}));
  }, []);

  if (!stats) return <PageLoading />;

  const cards = [
    { label: "Patients", value: stats.total_patients ?? 0, icon: Users, testid: "stat-patients" },
    { label: "Doctors", value: stats.total_doctors ?? 0, icon: Stethoscope, testid: "stat-doctors" },
    { label: "Hospitals", value: stats.total_hospitals ?? 0, icon: Building2, testid: "stat-hospitals" },
    { label: "Today's Appointments", value: stats.todays_appointments ?? 0, icon: CalendarDays, testid: "stat-today" },
    { label: "Completed", value: stats.completed_appointments ?? 0, icon: CheckCircle2, testid: "stat-completed" },
    { label: "Cancelled", value: stats.cancelled_appointments ?? 0, icon: XCircle, testid: "stat-cancelled" },
    { label: "Lab Reports", value: stats.total_reports ?? 0, icon: FlaskConical, testid: "stat-reports" },
    { label: "Pending Leave", value: stats.pending_leave ?? 0, icon: Palmtree, testid: "stat-leave" },
  ];

  const chartData = Object.entries(stats.appointments_by_status || {}).map(([status, count]) => ({ status, count }));

  return (
    <div data-testid="admin-dashboard">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-heading" data-testid="admin-title">Admin Dashboard</h1>
      <p className="text-sm text-slate-500 mt-1 mb-8">Platform overview and activity.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]" data-testid={c.testid}>
            <c.icon className="h-5 w-5 text-sky-600 mb-3" />
            <div className="text-2xl font-bold text-slate-900 font-heading">{c.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="appointments-chart">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Appointments by status</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No appointment data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#0284C7" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="recent-users">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent registrations</h2>
          {(stats.recent_users || []).length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No users yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recent_users.map((u) => (
                <li key={u.user_id} className="py-2.5 flex items-center justify-between" data-testid={`recent-user-${u.user_id}`}>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60 capitalize">{u.role}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
