import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { PageHeader, PageLoading, EmptyState } from "../components/common";
import { Bell, CalendarDays, FlaskConical, Pill, FileText, CheckCheck } from "lucide-react";

const ICONS = { appointment: CalendarDays, report: FlaskConical, prescription: Pill, record: FileText, lab: FlaskConical, leave: CalendarDays, general: Bell };

export default function NotificationsPage() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  const load = () => api.get("/notifications").then((r) => setData(r.data)).catch(() => setData({ notifications: [], unread: 0 }));
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    await api.post("/notifications/read-all");
    load();
  };

  const open = async (n) => {
    if (!n.read) api.post(`/notifications/${n.notification_id}/read`).then(load);
    if (n.link) navigate(n.link);
  };

  if (!data) return <PageLoading />;

  return (
    <div data-testid="notifications-page">
      <PageHeader title="Notifications" description={`${data.unread} unread`} testid="notifications-title"
        action={data.unread > 0 && (
          <button onClick={markAll} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-1.5" data-testid="mark-all-read">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )} />
      {data.notifications.length === 0 ? (
        <EmptyState title="No notifications" description="Appointment updates, report alerts and more will appear here." testid="no-notifications" />
      ) : (
        <div className="space-y-2" data-testid="notifications-list">
          {data.notifications.map((n) => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <button key={n.notification_id} onClick={() => open(n)} className={`w-full text-left flex items-start gap-3 p-4 rounded-2xl border transition-all ${n.read ? "bg-white border-slate-200/80" : "bg-sky-50/60 border-sky-200/70"}`} data-testid={`notification-${n.notification_id}`}>
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${n.read ? "bg-slate-100" : "bg-sky-100"}`}>
                  <Icon className={`h-4 w-4 ${n.read ? "text-slate-500" : "text-sky-700"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${n.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</div>
                  <div className="text-sm text-slate-500">{n.message}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {!n.read && <span className="h-2 w-2 rounded-full bg-sky-600 mt-2 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
