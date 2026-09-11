import { useEffect, useState, useCallback } from "react";
import api from "../../../lib/api";
import { VerificationBadge } from "../../../components/common";
import { toast } from "sonner";
import { CheckCircle2, XCircle, RefreshCw, Trash2, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

function Actions({ h, onChange }) {
  const act = async (fn, msg) => {
    try { await fn(); toast.success(msg); onChange(); } catch (e) { toast.error(e.friendlyMessage); }
  };
  const id = h.hospital_id;
  return (
    <div className="flex flex-wrap gap-1.5">
      {h.pending_updates && (
        <>
          <button onClick={() => act(() => api.post(`/admin/hospitals/${id}/verify`, { status: h.verification_status, apply_pending: true }), "Updates applied")} className="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium px-3 py-1.5 rounded-xl" data-testid={`apply-pending-${id}`}>Apply updates</button>
          <button onClick={() => act(() => api.post(`/admin/hospitals/${id}/verify`, { status: h.verification_status, apply_pending: false }), "Updates discarded")} className="text-xs border border-slate-300 text-slate-600 font-medium px-3 py-1.5 rounded-xl" data-testid={`discard-pending-${id}`}>Discard</button>
        </>
      )}
      {h.verification_status !== "verified" && (
        <button onClick={() => act(() => api.post(`/admin/hospitals/${id}/verify`, { status: "verified" }), "Hospital approved")} className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium px-3 py-1.5 rounded-xl flex items-center gap-1" data-testid={`approve-${id}`}><CheckCircle2 className="h-3 w-3" /> Approve</button>
      )}
      {h.verification_status !== "rejected" && (
        <button onClick={() => act(() => api.post(`/admin/hospitals/${id}/verify`, { status: "rejected" }), "Hospital rejected")} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 font-medium px-3 py-1.5 rounded-xl flex items-center gap-1" data-testid={`reject-${id}`}><XCircle className="h-3 w-3" /> Reject</button>
      )}
      {h.external_provider_id && (
        <button onClick={() => act(() => api.post(`/admin/hospitals/${id}/sync`), "Re-synced from provider")} className="text-xs border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-600 font-medium px-3 py-1.5 rounded-xl flex items-center gap-1" data-testid={`sync-${id}`}><RefreshCw className="h-3 w-3" /> Re-sync</button>
      )}
      <button onClick={() => window.confirm(`Delete ${h.name}?`) && act(() => api.delete(`/admin/hospitals/${id}`), "Hospital deleted")} className="text-xs border border-slate-300 hover:border-red-500 hover:text-red-600 text-slate-600 font-medium px-3 py-1.5 rounded-xl flex items-center gap-1" data-testid={`delete-${id}`}><Trash2 className="h-3 w-3" /> Delete</button>
    </div>
  );
}

export default function ReviewQueue({ status, refreshKey, onChange }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const load = useCallback(() => api.get("/admin/hospitals/review", { params: { status, page, limit: 15 } }).then((r) => setData(r.data)).catch(() => setData({ hospitals: [], pages: 1 })), [status, page]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const changed = () => { load(); onChange(); };
  if (!data) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;
  if (!data.hospitals.length) return <p className="text-sm text-slate-500 py-8 text-center" data-testid={`empty-${status}`}>Nothing here right now.</p>;

  return (
    <div className="space-y-2 mt-4" data-testid={`review-list-${status}`}>
      {data.hospitals.map((h) => (
        <div key={h.hospital_id} className="bg-white border border-slate-200/80 rounded-2xl p-4" data-testid={`review-item-${h.hospital_id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <a href={`/hospitals/${h.hospital_id}`} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:text-sky-700 flex items-center gap-1">{h.name} <ExternalLink className="h-3 w-3 text-slate-400" /></a>
                <VerificationBadge status={h.verification_status} />
                <span className="text-[11px] text-slate-400 capitalize">{h.hospital_type} · {h.external_provider || h.data_source}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{[h.address, h.area, h.city, h.postal_code].filter(Boolean).join(", ")}</div>
              <div className="text-xs text-slate-500">{h.phone || "no phone"} · {h.website ? <a href={h.website} className="text-sky-600" target="_blank" rel="noreferrer">{h.website}</a> : "no website"} · {h.opening_hours || "hours unknown"}</div>
              {h.source_url && <a href={h.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-slate-400 hover:text-sky-600">Source record</a>}
              {h.pending_updates && (
                <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-xl p-2" data-testid={`pending-${h.hospital_id}`}>
                  <span className="font-medium text-amber-800">Provider changes awaiting review:</span>
                  <ul className="mt-1 space-y-0.5">
                    {Object.entries(h.pending_updates).map(([k, v]) => <li key={k}><span className="text-slate-500">{k}:</span> <span className="text-slate-700 line-through mr-1">{String(h[k] ?? "—")}</span> → <span className="text-slate-900">{String(v)}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
            <Actions h={h} onChange={changed} />
          </div>
        </div>
      ))}
      {data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 rounded-xl border border-slate-300 disabled:opacity-40" data-testid="review-prev"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm text-slate-600">Page {page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="p-2 rounded-xl border border-slate-300 disabled:opacity-40" data-testid="review-next"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
