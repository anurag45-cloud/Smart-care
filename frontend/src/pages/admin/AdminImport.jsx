import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { PageHeader, PageLoading } from "../../components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { toast } from "sonner";
import { DownloadCloud, Loader2, RefreshCw, Database } from "lucide-react";
import ImportStats from "./import/ImportStats";
import JobProgress from "./import/JobProgress";
import ReviewQueue from "./import/ReviewQueue";
import DuplicatesPanel from "./import/DuplicatesPanel";
import JobHistory from "./import/JobHistory";

export default function AdminImport() {
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(() => api.get("/admin/hospitals/import/status").then((r) => setStatus(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!status?.active_job) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [status?.active_job, load]);
  useEffect(() => { if (status && !status.active_job) setRefreshKey((k) => k + 1); }, [status?.active_job]); // eslint-disable-line react-hooks/exhaustive-deps

  const startImport = async (cityKey) => {
    setStarting(true);
    try {
      const r = await api.post(`/admin/hospitals/import/${cityKey}`, {});
      toast[r.data.created ? "success" : "info"](r.data.created ? "Import job started" : "An import is already running");
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setStarting(false); }
  };

  const resyncAll = async () => {
    try {
      const r = await api.post("/admin/hospitals/resync-all");
      toast.success(`Re-sync queued for ${r.data.queued} hospitals`);
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  if (!status) return <PageLoading />;
  const provider = status.providers.find((p) => p.name === status.active_provider);

  return (
    <div data-testid="admin-import-page">
      <PageHeader title="Hospital Import" description="Discover and import publicly listed hospitals from configured data providers." testid="admin-import-title"
        action={
          <div className="flex gap-2">
            <button onClick={resyncAll} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5" data-testid="resync-all-btn"><RefreshCw className="h-4 w-4" /> Re-sync all</button>
            {status.cities.map((c) => (
              <button key={c.key} onClick={() => startImport(c.key)} disabled={starting || !!status.active_job} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all flex items-center gap-1.5" data-testid={`import-${c.key}-btn`}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />} Import {c.name} Hospitals
              </button>
            ))}
          </div>
        } />

      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-4 text-sm" data-testid="provider-info">
        <span className="flex items-center gap-2 text-slate-700 font-medium"><Database className="h-4 w-4 text-sky-600" /> Active provider: <span className="capitalize" data-testid="active-provider">{status.active_provider.replace("_", " ")}</span></span>
        <span className="text-slate-500">{provider?.attribution}</span>
        <div className="flex gap-2 ml-auto">
          {status.providers.map((p) => (
            <span key={p.name} className={`px-2 py-0.5 rounded-full text-xs border ${p.configured ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200"}`} data-testid={`provider-${p.name}`}>
              {p.name.replace("_", " ")} · {p.configured ? "configured" : "needs API key"}
            </span>
          ))}
        </div>
      </div>

      <ImportStats counts={status.counts} />
      {status.active_job && <JobProgress job={status.active_job} />}

      <Tabs defaultValue="review" className="mt-8">
        <TabsList data-testid="import-tabs">
          <TabsTrigger value="review" data-testid="tab-review">Needs Review ({status.counts.needs_review})</TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">Pending Updates ({status.counts.pending_updates})</TabsTrigger>
          <TabsTrigger value="duplicates" data-testid="tab-duplicates">Duplicates ({status.counts.duplicates})</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">Public Data ({status.counts.public_data})</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Import Jobs</TabsTrigger>
        </TabsList>
        <TabsContent value="review"><ReviewQueue status="needs_review" refreshKey={refreshKey} onChange={load} /></TabsContent>
        <TabsContent value="pending"><ReviewQueue status="pending_updates" refreshKey={refreshKey} onChange={load} /></TabsContent>
        <TabsContent value="duplicates"><DuplicatesPanel refreshKey={refreshKey} onChange={load} /></TabsContent>
        <TabsContent value="all"><ReviewQueue status="public_data" refreshKey={refreshKey} onChange={load} /></TabsContent>
        <TabsContent value="jobs"><JobHistory jobs={status.jobs} /></TabsContent>
      </Tabs>
    </div>
  );
}
