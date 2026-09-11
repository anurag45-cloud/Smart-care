import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState } from "../../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../../components/ui/alert-dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";
import { Stethoscope, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

const EMPTY_DOCTOR = {
  name: "", email: "", hospital_id: "", department_id: "", specialization: "", qualification: "",
  experience_years: 0, languages: "", consultation_fee: 0, photo_url: "", bio: "", gender: "",
};

export default function AdminDoctors() {
  const [doctors, setDoctors] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DOCTOR);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/doctors").then((r) => setDoctors(r.data.doctors)).catch(() => setDoctors([]));
    api.get("/hospitals", { params: { limit: 100 } }).then((r) => setHospitals(r.data.hospitals)).catch(() => {});
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!form.hospital_id) { setDepartments([]); return; }
    api.get(`/hospitals/${form.hospital_id}`).then((r) => setDepartments(r.data.departments || [])).catch(() => setDepartments([]));
  }, [form.hospital_id]);

  const save = async () => {
    setBusy(true);
    const payload = {
      ...form,
      experience_years: Number(form.experience_years) || 0,
      consultation_fee: Number(form.consultation_fee) || 0,
      languages: form.languages ? form.languages.split(",").map((s) => s.trim()).filter(Boolean) : [],
      department_id: form.department_id || null,
    };
    try {
      if (editing === "new") {
        await api.post("/doctors", payload);
        toast.success("Doctor added. They can log in with this email via Google.");
      } else {
        await api.put(`/doctors/${editing.doctor_id}`, payload);
        toast.success("Doctor updated");
      }
      setEditing(null);
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/doctors/${id}`);
      toast.success("Doctor removed");
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  if (!doctors) return <PageLoading />;

  return (
    <div data-testid="admin-doctors-page">
      <PageHeader title="Doctors" description="Add doctors to hospitals. Doctors sign in with Google using the email you register here." testid="admin-doctors-title"
        action={<button onClick={() => { setForm(EMPTY_DOCTOR); setEditing("new"); }} disabled={hospitals.length === 0} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all flex items-center gap-1.5" data-testid="add-doctor-btn"><Plus className="h-4 w-4" /> Add Doctor</button>} />

      {doctors.length === 0 ? (
        <EmptyState title="No doctors yet" description={hospitals.length === 0 ? "Add a hospital first, then add doctors." : "Add your first doctor."} testid="no-doctors-admin" />
      ) : (
        <div className="space-y-3" data-testid="doctors-admin-list">
          {doctors.map((d) => (
            <div key={d.doctor_id} className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3" data-testid={`admin-doctor-${d.doctor_id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-sky-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {d.photo_url ? <img src={d.photo_url} alt="" className="h-full w-full object-cover" /> : <Stethoscope className="h-5 w-5 text-sky-600" />}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">Dr. {d.name} <span className="text-slate-400 font-normal">· {d.specialization}</span></div>
                  <div className="text-xs text-slate-500">{d.email} · {d.hospital_name} · {d.department_name}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setForm({ ...d, languages: (d.languages || []).join(", "), department_id: d.department_id || "" }); setEditing(d); }} className="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`edit-doctor-${d.doctor_id}`}><Pencil className="h-3 w-3" /> Edit</button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="text-xs bg-red-50 text-red-600 hover:bg-red-100 font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`remove-doctor-${d.doctor_id}`}><Trash2 className="h-3 w-3" /> Remove</button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Dr. {d.name}?</AlertDialogTitle>
                      <AlertDialogDescription>The doctor will be deactivated and no longer bookable.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction onClick={() => remove(d.doctor_id)} className="bg-red-600 hover:bg-red-700" data-testid={`confirm-remove-${d.doctor_id}`}>Remove</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="doctor-form-dialog">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add doctor" : `Edit Dr. ${editing?.name}`}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label>Full name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl mt-1.5" data-testid="doctor-name-input" /></div>
            <div><Label>Google email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={editing !== "new"} className="rounded-xl mt-1.5" data-testid="doctor-email-input" /></div>
            <div>
              <Label>Hospital *</Label>
              <Select value={form.hospital_id} onValueChange={(v) => setForm({ ...form, hospital_id: v, department_id: "" })}>
                <SelectTrigger className="rounded-xl mt-1.5" data-testid="doctor-hospital-select"><SelectValue placeholder="Select hospital" /></SelectTrigger>
                <SelectContent>{hospitals.map((h) => <SelectItem key={h.hospital_id} value={h.hospital_id}>{h.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Department</Label>
              <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                <SelectTrigger className="rounded-xl mt-1.5" data-testid="doctor-dept-select"><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>{departments.map((d) => <SelectItem key={d.department_id} value={d.department_id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Specialization *</Label><Input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} placeholder="Cardiologist" className="rounded-xl mt-1.5" data-testid="doctor-spec-input" /></div>
            <div><Label>Qualification</Label><Input value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="MBBS, MD" className="rounded-xl mt-1.5" data-testid="doctor-qual-input" /></div>
            <div><Label>Experience (years)</Label><Input type="number" min="0" value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} className="rounded-xl mt-1.5" data-testid="doctor-exp-input" /></div>
            <div><Label>Consultation fee</Label><Input type="number" min="0" value={form.consultation_fee} onChange={(e) => setForm({ ...form, consultation_fee: e.target.value })} className="rounded-xl mt-1.5" data-testid="doctor-fee-input" /></div>
            <div><Label>Languages (comma separated)</Label><Input value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} placeholder="English, Hindi" className="rounded-xl mt-1.5" data-testid="doctor-lang-input" /></div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger className="rounded-xl mt-1.5" data-testid="doctor-gender-select"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>Photo URL</Label><Input value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} className="rounded-xl mt-1.5" data-testid="doctor-photo-input" /></div>
            <div className="sm:col-span-2"><Label>Bio</Label><Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} className="rounded-xl mt-1.5" data-testid="doctor-bio-input" /></div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Default schedule: Mon–Sat, 09:00–17:00, 30-minute slots. The doctor can change this from their Schedule page.</p>
          <button onClick={save} disabled={busy || !form.name || !form.email || !form.hospital_id || !form.specialization} className="mt-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="save-doctor-btn">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save doctor
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
