import { StatusBadge } from "../../../components/common";

export default function JobHistory({ jobs }) {
  if (!jobs?.length) return <p className="text-sm text-slate-500 py-8 text-center" data-testid="no-jobs">No import jobs yet.</p>;
  return (
    <div className="space-y-2 mt-4" data-testid="job-history">
      {jobs.map((j) => (
        <div key={j.job_id} className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-wrap items-center gap-3 justify-between" data-testid={`job-${j.job_id}`}>
          <div>
            <div className="font-medium text-slate-900">{j.city_name} · {j.provider}</div>
            <div className="text-xs text-slate-500">{new Date(j.created_at).toLocaleString()} {j.message && `· ${j.message}`}</div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span>Found {j.counters?.discovered}</span>
            <span>New {j.counters?.imported}</span>
            <span>Updated {j.counters?.updated}</span>
            <span>Dup {j.counters?.duplicates}</span>
            <span>Failed {j.counters?.failed}</span>
            <StatusBadge status={j.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
