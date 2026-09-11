import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";
import { PageHeader } from "../../components/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Sparkles, Send, Loader2, ShieldAlert, Plus, User as UserIcon, Paperclip } from "lucide-react";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SUGGESTIONS = [
  "Summarize my latest report",
  "Which values are outside the reference range?",
  "Explain this report in simple language",
  "What should I ask my doctor?",
];

export default function Assistant() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportId, setReportId] = useState(params.get("report") || "all");
  const bottomRef = useRef(null);
  const attachRef = useRef(null);
  const [attaching, setAttaching] = useState(false);

  useEffect(() => {
    api.get("/ai/conversations").then((r) => setConversations(r.data.conversations)).catch(() => {});
    api.get("/reports").then((r) => setReports(r.data.reports.filter((x) => x.extraction_status === "ok"))).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openConversation = async (cid) => {
    setActiveConv(cid);
    const r = await api.get(`/ai/conversations/${cid}/messages`);
    setMessages(r.data.messages.map((m) => ({ role: m.role, content: m.content })));
  };

  const send = async (text, ctxReportId) => {
    const message = (text ?? input).trim();
    if (!message || streaming) return;
    const effectiveReportId = ctxReportId ?? (reportId === "all" ? null : reportId);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message, conversation_id: activeConv, report_id: effectiveReportId }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop();
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(part.slice(6));
            if (evt.conversation_id && !activeConv) setActiveConv(evt.conversation_id);
            if (evt.token) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + evt.token };
                return copy;
              });
            }
            if (evt.error) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: evt.error };
                return copy;
              });
            }
          } catch {}
        }
      }
      api.get("/ai/conversations").then((r) => setConversations(r.data.conversations)).catch(() => {});
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: "Something went wrong. Please try again." };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const attach = async (file) => {
    if (!file || attaching) return;
    setAttaching(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name);
    try {
      const r = await api.post("/reports/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
      setReports((prev) => [r.data, ...prev]);
      setReportId(r.data.report_id);
      toast.success("Report uploaded — set as chat context");
      send(`I've just uploaded a report titled "${r.data.title}". Please summarize it and highlight anything outside the reference range.`, r.data.report_id);
    } catch (e) {
      toast.error(e.friendlyMessage);
    } finally {
      setAttaching(false);
      if (attachRef.current) attachRef.current.value = "";
    }
  };

  return (
    <div data-testid="assistant-page">
      <PageHeader title="SmartCare AI Assistant" description="Ask questions about your own uploaded medical reports." testid="assistant-title" />

      <div className="grid lg:grid-cols-[260px_1fr] gap-6">
        <aside className="bg-white border border-slate-200/80 rounded-2xl p-4 h-fit hidden lg:block" data-testid="conversation-list">
          <button onClick={() => { setActiveConv(null); setMessages([]); }} className="w-full mb-3 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5" data-testid="new-chat-btn">
            <Plus className="h-4 w-4" /> New chat
          </button>
          <div className="space-y-1 max-h-[420px] overflow-y-auto">
            {conversations.map((c) => (
              <button key={c.conversation_id} onClick={() => openConversation(c.conversation_id)} className={`w-full text-left px-3 py-2 rounded-xl text-sm truncate transition-colors ${activeConv === c.conversation_id ? "bg-sky-50 text-sky-700 font-medium" : "text-slate-600 hover:bg-slate-100"}`} data-testid={`conv-${c.conversation_id}`}>
                {c.title}
              </button>
            ))}
            {conversations.length === 0 && <p className="text-xs text-slate-400 px-2">No conversations yet.</p>}
          </div>
        </aside>

        <section className="bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col h-[70vh]" data-testid="chat-panel">
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium text-slate-800 text-sm">
              <div className="h-7 w-7 rounded-lg bg-teal-50 flex items-center justify-center"><Sparkles className="h-4 w-4 text-teal-600" /></div>
              SmartCare AI Assistant
            </div>
            <Select value={reportId} onValueChange={setReportId}>
              <SelectTrigger className="w-56 h-9 rounded-xl text-xs" data-testid="report-context-select"><SelectValue placeholder="Context: all reports" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All my reports</SelectItem>
                {reports.map((r) => <SelectItem key={r.report_id} value={r.report_id}>{r.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4" data-testid="chat-messages">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4"><Sparkles className="h-7 w-7 text-teal-600" /></div>
                <h3 className="font-semibold text-slate-800">Ask me about your reports</h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm">I can explain values, flag results outside the reference range, and simplify medical terms — using only your uploaded reports.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 hover:bg-sky-50 hover:text-sky-700 border border-slate-200 transition-colors" data-testid={`suggestion-${s.slice(0, 12).replace(/[^a-z]+/gi, "-").toLowerCase()}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`} data-testid={`chat-message-${i}`}>
                {m.role === "assistant" && <div className="h-8 w-8 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0"><Sparkles className="h-4 w-4 text-teal-600" /></div>}
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-sky-600 text-white rounded-br-md" : "bg-slate-100 text-slate-800 rounded-bl-md"}`}>
                  {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : "")}
                </div>
                {m.role === "user" && <div className="h-8 w-8 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0"><UserIcon className="h-4 w-4 text-sky-700" /></div>}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-slate-100">
            <div className="flex gap-2">
              <input ref={attachRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => attach(e.target.files?.[0])} data-testid="chat-attach-input" />
              <button onClick={() => attachRef.current?.click()} disabled={attaching || streaming} className="h-11 w-11 rounded-xl border border-slate-200 hover:border-teal-500 hover:text-teal-600 disabled:opacity-50 text-slate-500 flex items-center justify-center transition-all" data-testid="chat-attach-btn" aria-label="Attach a report file" title="Attach a report (PDF/JPG/PNG)">
                {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask about your report..."
                className="flex-1 h-11 px-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500"
                data-testid="chat-input"
              />
              <button onClick={() => send()} disabled={!input.trim() || streaming} className="h-11 w-11 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white flex items-center justify-center transition-all active:scale-95" data-testid="chat-send-btn" aria-label="Send message">
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-2">
              <ShieldAlert className="h-3 w-3" /> Informational assistant only — not a doctor. For emergencies, contact local emergency services immediately.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
