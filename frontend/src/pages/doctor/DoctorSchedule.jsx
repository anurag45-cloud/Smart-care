import { useEffect, useState } from "react";
import api from "../../lib/api";
import { PageHeader, PageLoading, StatusBadge } from "../../components/common";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";
import { Loader2, CalendarClock, Palmtree } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function DoctorSchedule() {
  const [doctor, setDoctor] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [form, setForm] = useState({ working_days: [], start_time: "09:00", end_time: "17:00", slot_minutes: 30 });
  const [leave, setLeave] = useState({ start_date: "", end_date: "", leave_type: "casual", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get("/doctors/me/profile").then((r) => {
      setDoctor(r.data);
      setForm({
        working_days: r.data.working_days || [0, 1, 2, 3, 4, 5],
        start_time: r.data.start_time || "09:00",
        end_time: r.data.end_time || "17:00",
        slot_minutes: r.data.slot_minutes || 30,
      });
    }).catch(() => {});
    api.get("/leave").then((r) => setLeaves(r.data.leave_requests)).catch(() => {});
  };
  useEffect(load, []);

  const toggleDay = (i) => setForm((f) => ({ ...f, working_days: f.working_days.includes(i) ? f.working_days.filter((d) => d !== i) : [...f.working_days, i].sort() }));

  const saveSchedule = async () => {
    setBusy(true);
    try {
      await api.put("/doctors/me/schedule", { ...form, slot_minutes: Number(form.slot_minutes) });
      toast.success("Schedule updated");
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  const applyLeave = async () => {
    setBusy(true);
    try {
      await api.post("/leave", leave);
      toast.success("Leave request submitted");
      setLeave({ start_date: "", end_date: "", leave_type: "casual", reason: "" });
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  if (!doctor) return <PageLoading />;

  return (
    <div data-testid="doctor-schedule-page">
      <PageHeader title="Schedule & Leave" description="Manage your availability and time off." testid="schedule-title" />
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="schedule-section">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-sky-600" /> Working schedule</h2>
          <Label className="mb-2 block">Working days</Label>
          <div className="flex flex-wrap gap-2 mb-5">
            {DAYS.map((d, i) => (
              <button key={d} onClick={() => toggleDay(i)} className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${form.working_days.includes(i) ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-600 border-slate-200 hover:border-sky-400"}`} data-testid={`day-${d.toLowerCase()}`}>
                {d}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="rounded-xl mt-1.5" data-testid="schedule-start" /></div>
            <div><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="rounded-xl mt-1.5" data-testid="schedule-end" /></div>
            <div><Label>Slot (min)</Label><Input type="number" min="10" max="120" value={form.slot_minutes} onChange={(e) => setForm({ ...form, slot_minutes: e.target.value })} className="rounded-xl mt-1.5" data-testid="schedule-slot" /></div>
          </div>
          <button onClick={saveSchedule} disabled={busy || form.working_days.length === 0} className="mt-5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="save-schedule-btn">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save schedule
          </button>
        </section>

        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="leave-section">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Palmtree className="h-4 w-4 text-teal-600" /> Apply for leave</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>From</Label><Input type="date" value={leave.start_date} onChange={(e) => setLeave({ ...leave, start_date: e.target.value })} className="rounded-xl mt-1.5" data-testid="leave-start" /></div>
            <div><Label>To</Label><Input type="date" value={leave.end_date} onChange={(e) => setLeave({ ...leave, end_date: e.target.value })} className="rounded-xl mt-1.5" data-testid="leave-end" /></div>
          </div>
          <div className="mt-3">
            <Label>Type</Label>
            <Select value={leave.leave_type} onValueChange={(v) => setLeave({ ...leave, leave_type: v })}>
              <SelectTrigger className="rounded-xl mt-1.5" data-testid="leave-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="sick">Sick</SelectItem>
                <SelectItem value="emergency">Emergency</SelectItem>
                <SelectItem value="vacation">Vacation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3"><Label>Reason</Label><Textarea value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} rows={2} className="rounded-xl mt-1.5" data-testid="leave-reason" /></div>
          <button onClick={applyLeave} disabled={busy || !leave.start_date || !leave.end_date} className="mt-4 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="apply-leave-btn">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit request
          </button>

          <h3 className="font-semibold text-slate-900 mt-8 mb-3">My leave requests</h3>
          {leaves.length === 0 ? <p className="text-sm text-slate-500">No leave requests yet.</p> : (
            <div className="space-y-2" data-testid="leave-list">
              {leaves.map((l) => (
                <div key={l.leave_id} className="flex items-center justify-between border border-slate-200 rounded-xl p-3" data-testid={`leave-${l.leave_id}`}>
                  <div className="text-sm">
                    <span className="font-medium text-slate-800">{l.start_date} → {l.end_date}</span>
                    <span className="text-slate-500 capitalize"> · {l.leave_type}</span>
                  </div>
                  <StatusBadge status={l.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
