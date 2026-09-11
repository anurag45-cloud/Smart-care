import { useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState } from "../../components/common";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
import { toast } from "sonner";
import { Upload, FileText, Image as ImageIcon, Loader2, Trash2, Eye, FolderOpen } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CATEGORIES = ["prescription", "lab", "scan", "insurance", "id", "other"];

export default function Documents() {
  const [documents, setDocuments] = useState(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const load = () => api.get("/documents").then((r) => setDocuments(r.data.documents)).catch(() => setDocuments([]));
  useEffect(() => { load(); }, []);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    if (title) form.append("title", title);
    form.append("category", category);
    try {
      await api.post("/documents", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded");
      setFile(null);
      setTitle("");
      setCategory("other");
      if (inputRef.current) inputRef.current.value = "";
      load();
    } catch (e) {
      toast.error(e.friendlyMessage);
    } finally {
      setUploading(false);
    }
  };

  const del = async (id) => {
    try {
      await api.delete(`/documents/${id}`);
      toast.success("Document deleted");
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  if (!documents) return <PageLoading />;

  return (
    <div data-testid="documents-page">
      <PageHeader title="My Documents" description="Store prescriptions, scans, insurance cards and other medical files securely." testid="documents-title" />

      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm mb-8" data-testid="document-upload-section">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Upload className="h-4 w-4 text-sky-600" /> Upload a document</h2>
        <div className="grid sm:grid-cols-[1fr_160px_1fr_auto] gap-3 items-end">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Title (optional)</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Insurance card" className="rounded-xl" data-testid="document-title-input" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-xl" data-testid="document-category-select"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">File (PDF, images — max 10MB)</label>
            <Input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rounded-xl" data-testid="document-file-input" />
          </div>
          <button onClick={upload} disabled={!file || uploading} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 h-[42px]" data-testid="upload-document-btn">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
          </button>
        </div>
      </section>

      {documents.length === 0 ? (
        <EmptyState title="No documents yet" description="Upload your first medical document." testid="no-documents" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="documents-list">
          {documents.map((d) => (
            <div key={d.document_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-sky-200 transition-all" data-testid={`document-card-${d.document_id}`}>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                  {d.file_type === "pdf" ? <FileText className="h-5 w-5 text-teal-600" /> : <ImageIcon className="h-5 w-5 text-teal-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 truncate">{d.title}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span className="capitalize inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{d.category}</span>
                    {new Date(d.created_at).toLocaleDateString()} · {(d.size / 1024).toFixed(0)} KB
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <a href={`${API}/documents/${d.document_id}/file`} target="_blank" rel="noreferrer" className="flex-1 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5" data-testid={`view-document-${d.document_id}`}>
                  <Eye className="h-4 w-4" /> View
                </a>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium px-3 py-2 rounded-xl transition-colors" data-testid={`delete-document-${d.document_id}`} aria-label="Delete document"><Trash2 className="h-4 w-4" /></button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                      <AlertDialogDescription>"{d.title}" will be permanently removed.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del(d.document_id)} className="bg-red-600 hover:bg-red-700" data-testid="confirm-delete-document">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
      {documents.length === 0 && (
        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> Files are stored in secure cloud storage and only visible to you.</p>
      )}
    </div>
  );
}
