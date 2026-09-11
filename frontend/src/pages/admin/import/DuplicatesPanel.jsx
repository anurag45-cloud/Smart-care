import { useEffect, useState, useCallback } from "react";
import api from "../../../lib/api";
import { VerificationBadge } from "../../../components/common";
import { toast } from "sonner";
import { GitMerge, Split } from "lucide-react";

function Side({ h, label }) {
  return (
    <div className="flex-1 min-w-[220px] bg-slate-50 rounded-xl p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">{h.name} <VerificationBadge status={h.verification_status} /></div>
      <div className="text-xs text-slate-500 mt-1">{[h.address, h.area].filter(Boolean).join(", ")}</div>
      <div className="text-xs text-slate-500">{h.phone || "no phone"} · {h.external_provider || h.data_source} · {h.external_provider_id || ""}</div>
    </div>
  );
}

export default function DuplicatesPanel({ refreshKey, onChange }) {
  const [items, setItems] = useState(null);
  const load = useCallback(() => api.get("/admin/hospitals/duplicates").then((r) => setItems(r.data.candidates)).catch(() => setItems([])), []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const resolve = async (id, action) => {
    try {
      await api.post(`/admin/hospitals/duplicates/${id}/resolve`, { action });
      toast.success(action === "merge" ? "Hospitals merged" : "Kept as separate hospitals");
      load(); onChange();
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  if (!items) return <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>;
  if (!items.length) return <p className="text-sm text-slate-500 py-8 text-center" data-testid="no-duplicates">No duplicate candidates awaiting review.</p>;

  return (
    <div className="space-y-3 mt-4" data-testid="duplicates-list">
      {items.map((c) => (
        <div key={c.candidate_id} className="bg-white border border-slate-200/80 rounded-2xl p-4" data-testid={`dup-${c.candidate_id}`}>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <span className="text-xs text-slate-500">Possible duplicate · confidence <span className="font-medium capitalize">{c.confidence}</span> · {c.distance_m} m apart</span>
            <div className="flex gap-2">
              <button onClick={() => resolve(c.candidate_id, "merge")} className="text-xs bg-sky-600 hover:bg-sky-700 text-white font-medium px-3 py-1.5 rounded-xl flex items-center gap-1" data-testid={`merge-${c.candidate_id}`}><GitMerge className="h-3 w-3" /> Merge into existing</button>
              <button onClick={() => resolve(c.candidate_id, "keep_both")} className="text-xs border border-slate-300 hover:border-sky-600 text-slate-600 font-medium px-3 py-1.5 rounded-xl flex items-center gap-1" data-testid={`keep-${c.candidate_id}`}><Split className="h-3 w-3" /> Keep both</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Side h={c.matched} label="Existing" />
            <Side h={c.hospital} label="Newly imported" />
          </div>
        </div>
      ))}
    </div>
  );
}
