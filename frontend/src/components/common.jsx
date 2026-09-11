import { Loader2, Inbox } from "lucide-react";
import { Badge } from "./ui/badge";

export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]" data-testid="page-loading">
      <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
    </div>
  );
}

export function PageHeader({ title, description, action, testid }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-heading" data-testid={testid || "page-title"}>{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_STYLES = {
  scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-red-50 text-red-600 border-red-200",
  "no-show": "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
  requested: "bg-sky-50 text-sky-700 border-sky-200",
};

export function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={`capitalize ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600 border-slate-200"}`} data-testid={`status-${status}`}>
      {status}
    </Badge>
  );
}

export function EmptyState({ title, description, action, testid }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-dashed border-slate-200 rounded-2xl" data-testid={testid || "empty-state"}>
      <div className="h-12 w-12 rounded-full bg-sky-50 flex items-center justify-center mb-4">
        <Inbox className="h-6 w-6 text-sky-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function formatDate(d) {
  if (!d) return "";
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
