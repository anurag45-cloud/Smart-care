import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { PageLoading, EmptyState } from "../../components/common";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, Trash2, Sparkles, MessageCircle, AlertTriangle, ArrowUp, ArrowDown, Minus, RefreshCw, ShieldAlert } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FLAG_UI = {
  high: { icon: ArrowUp, cls: "text-red-600 bg-red-50 border-red-200", label: "Above range" },
  low: { icon: ArrowDown, cls: "text-amber-700 bg-amber-50 border-amber-200", label: "Below range" },
  normal: { icon: Minus, cls: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "In range" },
  unknown: { icon: Minus, cls: "text-slate-500 bg-slate-50 border-slate-200", label: "No range" },
};

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  const load = () => api.get(`/reports/${id}`).then((res) => setR(res.data)).catch((e) => setError(e.friendlyMessage));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const del = async () => {
    try {
      await api.delete(`/reports/${id}`);
      toast.success("Report deleted");
      navigate("/reports");
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      await api.post(`/reports/${id}/summarize`);
      toast.success("AI summary regenerated");
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setRegenerating(false); }
  };

  if (error) return <EmptyState title="Couldn't load report" description={error} testid="report-error" />;
  if (!r) return <PageLoading />;

  const fileUrl = `${API}/reports/${id}/file`;

  return (
    <div data-testid="report-detail">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 font-heading" data-testid="report-title">{r.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{r.filename} · Uploaded {new Date(r.created_at).toLocaleString()}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={fileUrl} target="_blank" rel="noreferrer" className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-1.5" data-testid="download-report">
            <Download className="h-4 w-4" /> Download
          </a>
          <button onClick={() => navigate(`/assistant?report=${r.report_id}`)} className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-1.5" data-testid="ask-ai-about-report">
            <MessageCircle className="h-4 w-4" /> Ask AI about this
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium px-4 py-2 rounded-xl transition-colors flex items-center gap-1.5" data-testid="delete-report"><Trash2 className="h-4 w-4" /> Delete</button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently remove the report and its AI analysis.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep</AlertDialogCancel>
                <AlertDialogAction onClick={del} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-report">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm" data-testid="report-preview">
          <div className="px-5 py-3 border-b border-slate-100 font-medium text-slate-800 text-sm">Original report</div>
          {r.file_type === "pdf" ? (
            <iframe src={fileUrl} title="Report" className="w-full h-[560px]" data-testid="report-pdf-frame" />
          ) : (
            <img src={fileUrl} alt={r.title} className="w-full max-h-[560px] object-contain bg-slate-50" data-testid="report-image" />
          )}
        </section>

        <div className="space-y-6">
          <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="ai-summary-section">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Sparkles className="h-4 w-4 text-teal-600" /> AI Summary</h2>
              {r.extraction_status === "ok" && (
                <button onClick={regenerate} disabled={regenerating} className="text-xs text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1" data-testid="regenerate-summary">
                  <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} /> Regenerate
                </button>
              )}
            </div>
            {r.extraction_status === "failed" ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2" data-testid="extraction-failed">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> I could not reliably extract this information from the uploaded report. Try a clearer scan or a text-based PDF.
              </p>
            ) : r.ai_summary ? (
              <>
                <p className="text-sm text-slate-700 leading-relaxed" data-testid="ai-summary-text">{r.ai_summary}</p>
                {r.ai_explanation && <p className="text-sm text-slate-600 leading-relaxed mt-3 pt-3 border-t border-slate-100">{r.ai_explanation}</p>}
                {r.ai_model && <p className="text-[11px] text-slate-400 mt-3">Generated by {r.ai_model} · {r.ai_summarized_at ? new Date(r.ai_summarized_at).toLocaleString() : ""}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-500">AI summary is being generated or is temporarily unavailable. Try Regenerate.</p>
            )}
          </section>

          {r.ai_extracted_values?.length > 0 && (
            <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="extracted-values">
              <h2 className="font-semibold text-slate-900 mb-3">Extracted values</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                      <th className="pb-2 pr-3">Test</th><th className="pb-2 pr-3">Value</th><th className="pb-2 pr-3">Reference</th><th className="pb-2">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.ai_extracted_values.map((v, i) => {
                      const f = FLAG_UI[v.flag] || FLAG_UI.unknown;
                      return (
                        <tr key={i} className="border-t border-slate-100" data-testid={`extracted-value-${i}`}>
                          <td className="py-2 pr-3 font-medium text-slate-800">{v.test}</td>
                          <td className="py-2 pr-3 text-slate-700">{v.value} {v.unit}</td>
                          <td className="py-2 pr-3 text-slate-500">{v.reference_range || "—"}</td>
                          <td className="py-2"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${f.cls}`}><f.icon className="h-3 w-3" />{f.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {r.ai_questions?.length > 0 && (
            <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="questions-for-doctor">
              <h2 className="font-semibold text-slate-900 mb-3">Questions to ask your doctor</h2>
              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1.5">
                {r.ai_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </section>
          )}

          <div className="bg-sky-50 border border-sky-200/70 rounded-2xl p-4 flex items-start gap-3" data-testid="medical-disclaimer">
            <ShieldAlert className="h-5 w-5 text-sky-700 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-sky-900 leading-relaxed">
              The AI explanation is informational only and is not a medical diagnosis. Values are compared only against reference ranges shown in the report.
              Please consult a qualified healthcare professional for clinical interpretation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
