import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState, StatusBadge, formatDate } from "../../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { toast } from "sonner";
import { FileText, Pill, FlaskConical, Plus, Trash2, Loader2 } from "lucide-react";

const EMPTY_MED = { name: "", dosage: "", frequency: "", duration: "", instructions: "" };

export default function DoctorAppointments() {
  const [appointments, setAppointments] = useState(null);
  const [tab, setTab] = useState("active");
  const [notesFor, setNotesFor] = useState(null);
  const [rxFor, setRxFor] = useState(null);
  const [labFor, setLabFor] = useState(null);
  const [noteForm, setNoteForm] = useState({ symptoms: "", diagnosis: "", notes: "", follow_up_date: "" });
  const [meds, setMeds] = useState([{ ...EMPTY_MED }]);
  const [rxNotes, setRxNotes] = useState("");
  const [labTest, setLabTest] = useState({ test_name: "", notes: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/appointments").then((r) => setAppointments(r.data.appointments)).catch(() => setAppointments([]));
  }, []);
  useEffect(load, [load]);

  const setStatus = async (id, status) => {
    try {
      await api.post(`/appointments/${id}/status`, { status });
      toast.success(`Appointment marked ${status}`);
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  const saveNotes = async () => {
    setBusy(true);
    try {
      await api.post("/medical-records", {
        patient_id: notesFor.patient_id,
        appointment_id: notesFor.appointment_id,
        visit_date: notesFor.date,
        record_type: "visit",
        ...noteForm,
        follow_up_date: noteForm.follow_up_date || null,
      });
      toast.success("Clinical notes saved to patient record");
      setNotesFor(null);
      setNoteForm({ symptoms: "", diagnosis: "", notes: "", follow_up_date: "" });
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  const saveRx = async () => {
    setBusy(true);
    try {
      await api.post("/prescriptions", {
        patient_id: rxFor.patient_id,
        appointment_id: rxFor.appointment_id,
        medicines: meds.filter((m) => m.name.trim()),
        notes: rxNotes,
      });
      toast.success("Prescription created");
      setRxFor(null);
      setMeds([{ ...EMPTY_MED }]);
      setRxNotes("");
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  const saveLab = async () => {
    setBusy(true);
    try {
      await api.post("/lab-tests", { patient_id: labFor.patient_id, ...labTest });
      toast.success("Lab test requested");
      setLabFor(null);
      setLabTest({ test_name: "", notes: "" });
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  if (!appointments) return <PageLoading />;

  const today = new Date().toISOString().slice(0, 10);
  const active = appointments.filter((a) => ["scheduled", "confirmed"].includes(a.status) && a.date >= today);
  const history = appointments.filter((a) => !active.includes(a));
  const shown = tab === "active" ? active : history;

  return (
    <div data-testid="doctor-appointments-page">
      <PageHeader title="Appointments" description="Manage your consultation schedule." testid="doctor-appointments-title" />
      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">History ({history.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {shown.length === 0 ? (
        <EmptyState title="No appointments" description="Patient appointments will appear here." testid="no-doctor-appointments" />
      ) : (
        <div className="space-y-4" data-testid="doctor-appointments-list">
          {shown.map((a) => (
            <div key={a.appointment_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm" data-testid={`appt-${a.appointment_id}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{a.patient?.name}</div>
                  <div className="text-sm text-slate-500">{formatDate(a.date)} at {a.time}{a.reason ? ` · ${a.reason}` : ""}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={a.status} />
                  <Link to={`/doctor/patients/${a.patient_id}`} className="text-xs border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-600 font-medium px-3 py-1.5 rounded-xl transition-all" data-testid={`patient-link-${a.appointment_id}`}>
                    Patient file
                  </Link>
                </div>
              </div>
              {["scheduled", "confirmed"].includes(a.status) && (
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
                  {a.status === "scheduled" && (
                    <button onClick={() => setStatus(a.appointment_id, "confirmed")} className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium px-3 py-1.5 rounded-xl transition-colors" data-testid={`confirm-${a.appointment_id}`}>Confirm</button>
                  )}
                  <button onClick={() => setStatus(a.appointment_id, "completed")} className="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium px-3 py-1.5 rounded-xl transition-colors" data-testid={`complete-${a.appointment_id}`}>Mark completed</button>
                  <button onClick={() => setStatus(a.appointment_id, "no-show")} className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 font-medium px-3 py-1.5 rounded-xl transition-colors" data-testid={`noshow-${a.appointment_id}`}>No-show</button>
                  <button onClick={() => setNotesFor(a)} className="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`notes-${a.appointment_id}`}><FileText className="h-3 w-3" /> Notes</button>
                  <button onClick={() => setRxFor(a)} className="text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`rx-${a.appointment_id}`}><Pill className="h-3 w-3" /> Prescription</button>
                  <button onClick={() => setLabFor(a)} className="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`lab-${a.appointment_id}`}><FlaskConical className="h-3 w-3" /> Lab test</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!notesFor} onOpenChange={() => setNotesFor(null)}>
        <DialogContent data-testid="notes-dialog">
          <DialogHeader><DialogTitle>Clinical notes — {notesFor?.patient?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Symptoms</Label><Textarea value={noteForm.symptoms} onChange={(e) => setNoteForm({ ...noteForm, symptoms: e.target.value })} className="rounded-xl mt-1.5" rows={2} data-testid="notes-symptoms" /></div>
            <div><Label>Diagnosis</Label><Input value={noteForm.diagnosis} onChange={(e) => setNoteForm({ ...noteForm, diagnosis: e.target.value })} className="rounded-xl mt-1.5" data-testid="notes-diagnosis" /></div>
            <div><Label>Clinical notes</Label><Textarea value={noteForm.notes} onChange={(e) => setNoteForm({ ...noteForm, notes: e.target.value })} className="rounded-xl mt-1.5" rows={3} data-testid="notes-notes" /></div>
            <div><Label>Follow-up date (optional)</Label><Input type="date" value={noteForm.follow_up_date} onChange={(e) => setNoteForm({ ...noteForm, follow_up_date: e.target.value })} className="rounded-xl mt-1.5" data-testid="notes-followup" /></div>
            <button onClick={saveNotes} disabled={busy} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="save-notes-btn">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save to record
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rxFor} onOpenChange={() => setRxFor(null)}>
        <DialogContent className="max-w-2xl" data-testid="prescription-dialog">
          <DialogHeader><DialogTitle>New prescription — {rxFor?.patient?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {meds.map((m, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border border-slate-200 rounded-xl p-3" data-testid={`med-row-${i}`}>
                <Input placeholder="Medicine" value={m.name} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="rounded-lg col-span-2 sm:col-span-1" data-testid={`med-name-${i}`} />
                <Input placeholder="Dosage (500mg)" value={m.dosage} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))} className="rounded-lg" data-testid={`med-dosage-${i}`} />
                <Input placeholder="Frequency (1-0-1)" value={m.frequency} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, frequency: e.target.value } : x))} className="rounded-lg" data-testid={`med-frequency-${i}`} />
                <Input placeholder="Duration (5 days)" value={m.duration} onChange={(e) => setMeds(meds.map((x, j) => j === i ? { ...x, duration: e.target.value } : x))} className="rounded-lg" data-testid={`med-duration-${i}`} />
                <button onClick={() => setMeds(meds.filter((_, j) => j !== i))} className="text-red-500 hover:bg-red-50 p-2 rounded-lg justify-self-end" data-testid={`med-remove-${i}`} aria-label="Remove medicine"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setMeds([...meds, { ...EMPTY_MED }])} className="text-sm text-sky-600 hover:text-sky-700 font-medium flex items-center gap-1" data-testid="add-medicine-btn"><Plus className="h-4 w-4" /> Add medicine</button>
            <Textarea placeholder="Notes for patient (optional)" value={rxNotes} onChange={(e) => setRxNotes(e.target.value)} rows={2} className="rounded-xl" data-testid="rx-notes" />
          </div>
          <button onClick={saveRx} disabled={busy || !meds.some((m) => m.name.trim())} className="mt-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="save-prescription-btn">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Issue prescription
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!labFor} onOpenChange={() => setLabFor(null)}>
        <DialogContent data-testid="lab-dialog">
          <DialogHeader><DialogTitle>Request lab test — {labFor?.patient?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Test name</Label><Input value={labTest.test_name} onChange={(e) => setLabTest({ ...labTest, test_name: e.target.value })} placeholder="e.g. Complete Blood Count" className="rounded-xl mt-1.5" data-testid="lab-test-name" /></div>
            <div><Label>Notes</Label><Textarea value={labTest.notes} onChange={(e) => setLabTest({ ...labTest, notes: e.target.value })} className="rounded-xl mt-1.5" rows={2} data-testid="lab-test-notes" /></div>
            <button onClick={saveLab} disabled={busy || !labTest.test_name.trim()} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="save-lab-btn">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request test
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
