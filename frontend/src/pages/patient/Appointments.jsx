import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState, StatusBadge, formatDate } from "../../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
import { Input } from "../../components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { toast } from "sonner";
import { CalendarDays, Building2, Loader2 } from "lucide-react";

export default function Appointments() {
  const [appointments, setAppointments] = useState(null);
  const [tab, setTab] = useState("upcoming");
  const [rescheduleFor, setRescheduleFor] = useState(null);
  const [rDate, setRDate] = useState("");
  const [rSlot, setRSlot] = useState(null);
  const [rSlots, setRSlots] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/appointments").then((r) => setAppointments(r.data.appointments)).catch(() => setAppointments([]));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!rescheduleFor || !rDate) return;
    setRSlot(null);
    api.get(`/doctors/${rescheduleFor.doctor_id}/availability`, { params: { date: rDate } })
      .then((r) => setRSlots(r.data))
      .catch(() => setRSlots({ slots: [] }));
  }, [rescheduleFor, rDate]);

  const cancel = async (id) => {
    try {
      await api.post(`/appointments/${id}/cancel`);
      toast.success("Appointment cancelled");
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  const reschedule = async () => {
    if (!rSlot) return;
    setBusy(true);
    try {
      await api.post(`/appointments/${rescheduleFor.appointment_id}/reschedule`, { date: rDate, time: rSlot });
      toast.success("Appointment rescheduled");
      setRescheduleFor(null);
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  if (!appointments) return <PageLoading />;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter((a) => ["scheduled", "confirmed"].includes(a.status) && a.date >= today);
  const past = appointments.filter((a) => !upcoming.includes(a));
  const shown = (tab === "upcoming" ? upcoming : past).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  if (tab === "upcoming") shown.reverse();

  return (
    <div data-testid="appointments-page">
      <PageHeader title="My Appointments" description="View, reschedule or cancel your appointments." testid="appointments-title"
        action={<Link to="/hospitals" className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all" data-testid="book-new-appointment">Book New</Link>} />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past" data-testid="tab-past">History ({past.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {shown.length === 0 ? (
        <EmptyState title="No appointments found" description={tab === "upcoming" ? "You have no upcoming appointments." : "No past appointments yet."} testid="no-appointments" />
      ) : (
        <div className="space-y-4" data-testid="appointments-list">
          {shown.map((a) => (
            <div key={a.appointment_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4" data-testid={`appointment-${a.appointment_id}`}>
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-12 w-12 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                  <CalendarDays className="h-6 w-6 text-sky-600" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">Dr. {a.doctor?.name} <span className="text-slate-400 font-normal">· {a.doctor?.specialization}</span></div>
                  <div className="text-sm text-slate-500 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{a.hospital?.name}, {a.hospital?.city}</div>
                  <div className="text-sm text-slate-600 font-medium mt-0.5">{formatDate(a.date)} at {a.time}</div>
                  {a.reason && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-md">Reason: {a.reason}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={a.status} />
                {["scheduled", "confirmed"].includes(a.status) && (
                  <>
                    <button onClick={() => { setRescheduleFor(a); setRDate(a.date); setRSlots(null); }} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-4 py-2 rounded-xl transition-all" data-testid={`reschedule-${a.appointment_id}`}>
                      Reschedule
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="bg-red-50 text-red-600 hover:bg-red-100 text-sm font-medium px-4 py-2 rounded-xl transition-colors" data-testid={`cancel-${a.appointment_id}`}>Cancel</button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
                          <AlertDialogDescription>Your appointment with Dr. {a.doctor?.name} on {formatDate(a.date)} at {a.time} will be cancelled.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="cancel-no">Keep it</AlertDialogCancel>
                          <AlertDialogAction onClick={() => cancel(a.appointment_id)} className="bg-red-600 hover:bg-red-700" data-testid="cancel-yes">Yes, cancel</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!rescheduleFor} onOpenChange={() => setRescheduleFor(null)}>
        <DialogContent data-testid="reschedule-dialog">
          <DialogHeader><DialogTitle>Reschedule appointment</DialogTitle></DialogHeader>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">New date</label>
          <Input type="date" value={rDate} min={new Date().toISOString().slice(0, 10)} max={new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)} onChange={(e) => setRDate(e.target.value)} className="rounded-xl" data-testid="reschedule-date" />
          <div className="mt-4">
            {!rSlots ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading slots...</div>
            ) : rSlots.on_leave ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">Doctor is on leave on this date.</p>
            ) : rSlots.slots.length === 0 ? (
              <p className="text-sm text-slate-500">No slots on this date.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" data-testid="reschedule-slots">
                {rSlots.slots.map((s) => (
                  <button key={s.time} disabled={s.booked} onClick={() => setRSlot(s.time)}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${s.booked ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through" : rSlot === s.time ? "bg-sky-600 text-white border-sky-600" : "bg-white text-slate-700 border-slate-200 hover:border-sky-400"}`}
                    data-testid={`rslot-${s.time.replace(":", "")}`}>
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={reschedule} disabled={!rSlot || busy} className="mt-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="confirm-reschedule">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm reschedule
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
