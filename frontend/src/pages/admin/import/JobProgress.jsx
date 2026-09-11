import { Loader2 } from "lucide-react";

export default function JobProgress({ job }) {
  const c = job.counters || {};
  return (
    <div className="mt-6 bg-sky-50 border border-sky-200 rounded-2xl p-5" data-testid="job-progress">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sky-800 font-medium"><Loader2 className="h-4 w-4 animate-spin" /> Importing {job.city_name} hospitals via {job.provider}</div>
        <span className="text-sm text-sky-700" data-testid="job-step">{job.progress?.step} · {job.progress?.done}/{job.progress?.total}</span>
      </div>
      <div className="h-2 bg-white rounded-full mt-3 overflow-hidden">
        <div className="h-full bg-sky-600 transition-all duration-500" style={{ width: `${job.progress?.percent || 0}%` }} data-testid="job-progress-bar" />
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-sky-800">
        <span data-testid="job-discovered">Discovered: {c.discovered}</span>
        <span>Imported: {c.imported}</span>
        <span>Updated: {c.updated}</span>
        <span>Duplicates: {c.duplicates}</span>
        <span>Failed: {c.failed}</span>
      </div>
    </div>
  );
}
