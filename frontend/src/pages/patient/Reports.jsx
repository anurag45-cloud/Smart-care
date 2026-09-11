import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState } from "../../components/common";
import { Input } from "../../components/ui/input";
import { toast } from "sonner";
import { Upload, FileText, Image as ImageIcon, Sparkles, Loader2, Trash2, Eye } from "lucide-react";

export default function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const load = () => api.get("/reports").then((r) => setReports(r.data.reports)).catch(() => setReports([]));
  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    try {
      const r = await api.post("/reports/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(r.data.ai_summary ? "Report uploaded and analyzed by AI" : "Report uploaded");
      setFile(null);
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
      load();
    } catch (e) {
      toast.error(e.friendlyMessage);
    } finally {
      setUploading(false);
    }
  };

  if (!reports) return <PageLoading />;

  return (
    <div data-testid="reports-page">
      <PageHeader title="Lab Reports" description="Upload reports and get AI-powered simple explanations." testid="reports-title" />

      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm mb-8" data-testid="upload-section">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Upload className="h-4 w-4 text-sky-600" /> Upload a report</h2>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Report title (optional)</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Blood Test — June 2026" className="rounded-xl" data-testid="report-title-input" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">File (PDF, JPG, PNG — max 10MB)</label>
            <Input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rounded-xl" data-testid="report-file-input" />
          </div>
          <button onClick={upload} disabled={!file || uploading} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 h-[42px]" data-testid="upload-report-btn">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Analyzing..." : "Upload"}
          </button>
        </div>
        {uploading && <p className="text-xs text-slate-500 mt-2">Extracting text and generating AI summary — this can take up to a minute.</p>}
      </section>

      {reports.length === 0 ? (
        <EmptyState title="No reports uploaded yet" description="Upload your first lab report to get an AI summary." testid="no-reports" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="reports-list">
          {reports.map((r) => (
            <div key={r.report_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-sky-200 transition-all" data-testid={`report-card-${r.report_id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                    {r.file_type === "pdf" ? <FileText className="h-5 w-5 text-sky-600" /> : <ImageIcon className="h-5 w-5 text-sky-600" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{r.title}</div>
                    <div className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()} · {r.file_type.toUpperCase()}</div>
                  </div>
                </div>
                {r.ai_summary && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-50 text-teal-700 border border-teal-200/60 flex-shrink-0">
                    <Sparkles className="h-3 w-3" /> AI
                  </span>
                )}
              </div>
              {r.extraction_status === "failed" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-3">Could not reliably extract text from this file.</p>
              )}
              {r.ai_summary && <p className="text-sm text-slate-600 mt-3 line-clamp-2">{r.ai_summary}</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={() => navigate(`/reports/${r.report_id}`)} className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5" data-testid={`view-report-${r.report_id}`}>
                  <Eye className="h-4 w-4" /> View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
