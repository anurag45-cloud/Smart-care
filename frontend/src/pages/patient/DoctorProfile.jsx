import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";
import { PageLoading, EmptyState } from "../../components/common";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "sonner";
import { Stethoscope, MapPin, IndianRupee, Languages, GraduationCap, Building2, CalendarDays, Loader2 } from "lucide-react";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function DoctorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [availability, setAvailability] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    api.get(`/doctors/${id}`).then((r) => setD(r.data)).catch((e) => setError(e.friendlyMessage));
  }, [id]);

  const loadSlots = useCallback((forDate) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    api.get(`/doctors/${id}/availability`, { params: { date: forDate } })
      .then((r) => setAvailability(r.data))
      .catch(() => setAvailability({ slots: [], on_leave: false }))
      .finally(() => setSlotsLoading(false));
  }, [id]);

  useEffect(() => { loadSlots(date); }, [date, loadSlots]);

  const book = async () => {
    if (!selectedSlot) return;
    setBooking(true);
    try {
      await api.post("/appointments", {
        hospital_id: d.hospital_id,
        doctor_id: d.doctor_id,
        department_id: d.department_id,
        date,
        time: selectedSlot,
        reason,
      });
      toast.success("Appointment booked successfully");
      navigate("/appointments");
    } catch (e) {
      toast.error(e.friendlyMessage);
      loadSlots(date);
    } finally {
      setBooking(false);
    }
  };

  if (error) return <EmptyState title="Couldn't load doctor" description={error} testid="doctor-error" />;
  if (!d) return <PageLoading />;

  const maxDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="grid lg:grid-cols-3 gap-6" data-testid="doctor-profile">
      <div className="space-y-6">
        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 rounded-2xl bg-sky-50 overflow-hidden flex-shrink-0 flex items-center justify-center">
              {d.photo_url ? <img src={d.photo_url} alt={d.name} className="h-full w-full object-cover" /> : <Stethoscope className="h-8 w-8 text-sky-600" />}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 font-heading" data-testid="doctor-name">Dr. {d.name}</h1>
              <p className="text-sky-700 font-medium">{d.specialization}</p>
              <p className="text-sm text-slate-500">{d.department_name}</p>
            </div>
          </div>
          <div className="mt-5 space-y-2.5 text-sm text-slate-600">
            <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-slate-400" />{d.hospital?.name}</p>
            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />{d.hospital?.city}</p>
            <p className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-slate-400" />{d.qualification || "—"}</p>
            <p className="flex items-center gap-2"><Languages className="h-4 w-4 text-slate-400" />{(d.languages || []).join(", ") || "—"}</p>
            <p className="flex items-center gap-2"><IndianRupee className="h-4 w-4 text-slate-400" /><span className="font-semibold text-slate-800">{d.consultation_fee}</span>&nbsp;consultation fee</p>
          </div>
        </section>
        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-2">About</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{d.bio || `${d.experience_years} years of experience in ${d.specialization}.`}</p>
          <h2 className="font-semibold text-slate-900 mt-5 mb-2 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-sky-600" /> Working hours</h2>
          <p className="text-sm text-slate-600">{(d.working_days || []).map((x) => DAY_NAMES[x]).join(", ") || "—"}</p>
          <p className="text-sm text-slate-600">{d.start_time} – {d.end_time}</p>
        </section>
      </div>

      <div className="lg:col-span-2">
        <section id="book" className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" data-testid="booking-panel">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Book an Appointment</h2>
          <p className="text-sm text-slate-500 mb-5">Select a date to see available time slots.</p>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">Date</label>
          <Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} max={maxDate} onChange={(e) => setDate(e.target.value)} className="rounded-xl max-w-xs" data-testid="booking-date" />

          <div className="mt-5">
            <label className="text-sm font-medium text-slate-700 block mb-2">Available slots</label>
            {slotsLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading slots...</div>
            ) : availability?.on_leave ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3" data-testid="doctor-on-leave">Dr. {d.name} is on leave on this date. Please pick another day.</p>
            ) : availability?.slots?.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3" data-testid="no-slots">No slots available on this date (doctor may not work on this weekday).</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2" data-testid="slot-grid">
                {availability.slots.map((s) => (
                  <button
                    key={s.time}
                    disabled={s.booked}
                    onClick={() => setSelectedSlot(s.time)}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${
                      s.booked
                        ? "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through"
                        : selectedSlot === s.time
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white text-slate-700 border-slate-200 hover:border-sky-400 hover:text-sky-700"
                    }`}
                    data-testid={`slot-${s.time.replace(":", "")}`}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Reason for visit</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly describe your symptoms or reason for consultation" className="rounded-xl" rows={3} data-testid="booking-reason" />
          </div>

          <button
            onClick={book}
            disabled={!selectedSlot || booking}
            className="mt-5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-8 py-3 rounded-xl shadow-sm transition-all active:scale-[0.98] flex items-center gap-2"
            data-testid="confirm-booking-btn"
          >
            {booking && <Loader2 className="h-4 w-4 animate-spin" />}
            {selectedSlot ? `Confirm — ${date} at ${selectedSlot}` : "Select a time slot"}
          </button>
        </section>
      </div>
    </div>
  );
}
