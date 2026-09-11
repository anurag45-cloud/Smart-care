import { useEffect, useState } from "react";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState, StatusBadge } from "../../components/common";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export default function AdminLeave() {
  const [leaves, setLeaves] = useState(null);

  const load = () => api.get("/leave").then((r) => setLeaves(r.data.leave_requests)).catch(() => setLeaves([]));
  useEffect(() => { load(); }, []);

  const review = async (id, status) => {
    try {
      await api.post(`/leave/${id}/review`, { status });
      toast.success(`Leave ${status}`);
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  if (!leaves) return <PageLoading />;

  return (
    <div data-testid="admin-leave-page">
      <PageHeader title="Leave Requests" description="Review staff leave. Approved leave blocks appointment booking for those dates." testid="admin-leave-title" />
      {leaves.length === 0 ? (
        <EmptyState title="No leave requests" description="Staff leave requests will appear here." testid="no-leave-requests" />
      ) : (
        <div className="space-y-3" data-testid="leave-requests-list">
          {leaves.map((l) => (
            <div key={l.leave_id} className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3" data-testid={`leave-row-${l.leave_id}`}>
              <div>
                <div className="font-semibold text-slate-900">{l.staff_name}</div>
                <div className="text-sm text-slate-500">{l.start_date} → {l.end_date} · <span className="capitalize">{l.leave_type}</span></div>
                {l.reason && <div className="text-xs text-slate-400 mt-0.5">{l.reason}</div>}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={l.status} />
                {l.status === "pending" && (
                  <>
                    <button onClick={() => review(l.leave_id, "approved")} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`approve-${l.leave_id}`}><Check className="h-3 w-3" /> Approve</button>
                    <button onClick={() => review(l.leave_id, "rejected")} className="bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`reject-${l.leave_id}`}><X className="h-3 w-3" /> Reject</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
