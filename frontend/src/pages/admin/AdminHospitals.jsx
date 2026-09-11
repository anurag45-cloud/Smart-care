import { useEffect, useState, useCallback } from "react";
import api from "../../lib/api";
import { PageHeader, PageLoading, EmptyState } from "../../components/common";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";
import { toast } from "sonner";
import { Building2, Plus, Pencil, ImagePlus, Trash2, Loader2, Layers } from "lucide-react";

const IMAGE_TYPES = ["exterior", "entrance", "reception", "ward", "icu", "laboratory", "pharmacy", "emergency", "other"];
const EMPTY_HOSPITAL = {
  name: "", description: "", hospital_type: "multi-specialty", phone: "", email: "", website: "",
  emergency_phone: "", address: "", city: "", state: "", country: "India", postal_code: "",
  latitude: "", longitude: "", opening_hours: "Open 24 hours", emergency_available: true, specialties: "",
};

export default function AdminHospitals() {
  const [hospitals, setHospitals] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_HOSPITAL);
  const [managing, setManaging] = useState(null);
  const [detail, setDetail] = useState(null);
  const [newImage, setNewImage] = useState({ url: "", image_type: "exterior", caption: "" });
  const [imgFile, setImgFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [newDept, setNewDept] = useState({ name: "", description: "" });
  const [newFacility, setNewFacility] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/hospitals", { params: { limit: 100 } }).then((r) => setHospitals(r.data.hospitals)).catch(() => setHospitals([]));
  }, []);
  useEffect(load, [load]);

  const openManage = async (h) => {
    setManaging(h);
    const r = await api.get(`/hospitals/${h.hospital_id}`);
    setDetail(r.data);
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      ...form,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      specialties: form.specialties ? form.specialties.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };
    if (isNaN(payload.latitude) || isNaN(payload.longitude)) {
      toast.error("Latitude and longitude are required numbers");
      setBusy(false);
      return;
    }
    try {
      if (editing === "new") {
        await api.post("/hospitals", payload);
        toast.success("Hospital created");
      } else {
        await api.put(`/hospitals/${editing.hospital_id}`, payload);
        toast.success("Hospital updated");
      }
      setEditing(null);
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setBusy(false); }
  };

  const addImage = async () => {
    try {
      await api.post(`/hospitals/${managing.hospital_id}/images`, newImage);
      toast.success("Image added");
      setNewImage({ url: "", image_type: "exterior", caption: "" });
      openManage(managing);
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  const uploadImage = async () => {
    if (!imgFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", imgFile);
      const r = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.post(`/hospitals/${managing.hospital_id}/images`, {
        url: `${process.env.REACT_APP_BACKEND_URL}${r.data.url}`,
        image_type: newImage.image_type,
        caption: newImage.caption || imgFile.name,
      });
      toast.success("Image uploaded");
      setImgFile(null);
      setNewImage({ url: "", image_type: "exterior", caption: "" });
      openManage(managing);
    } catch (e) { toast.error(e.friendlyMessage); }
    finally { setUploading(false); }
  };

  const removeImage = async (imageId) => {
    await api.delete(`/hospitals/${managing.hospital_id}/images/${imageId}`);
    openManage(managing);
  };

  const addDept = async () => {
    try {
      await api.post(`/hospitals/${managing.hospital_id}/departments`, newDept);
      toast.success("Department added");
      setNewDept({ name: "", description: "" });
      openManage(managing);
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  const removeDept = async (deptId) => {
    await api.delete(`/departments/${deptId}`);
    openManage(managing);
  };

  const addFacility = async () => {
    const facilities = [...(detail.facilities || []), { name: newFacility.trim(), available: true, description: "" }];
    await api.put(`/hospitals/${managing.hospital_id}/facilities`, facilities);
    setNewFacility("");
    openManage(managing);
  };

  const removeFacility = async (idx) => {
    const facilities = detail.facilities.filter((_, i) => i !== idx);
    await api.put(`/hospitals/${managing.hospital_id}/facilities`, facilities);
    openManage(managing);
  };

  if (!hospitals) return <PageLoading />;

  return (
    <div data-testid="admin-hospitals-page">
      <PageHeader title="Hospitals" description="Create and manage hospital profiles, photos and departments." testid="admin-hospitals-title"
        action={<button onClick={() => { setForm(EMPTY_HOSPITAL); setEditing("new"); }} className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all flex items-center gap-1.5" data-testid="add-hospital-btn"><Plus className="h-4 w-4" /> Add Hospital</button>} />

      {hospitals.length === 0 ? (
        <EmptyState title="No hospitals yet" description="Add your first hospital to get the platform going." testid="no-hospitals-admin" />
      ) : (
        <div className="space-y-3" data-testid="hospitals-admin-list">
          {hospitals.map((h) => (
            <div key={h.hospital_id} className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3" data-testid={`admin-hospital-${h.hospital_id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0"><Building2 className="h-5 w-5 text-sky-600" /></div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.city} · {h.doctor_count} doctors · {(h.departments || []).length} departments</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openManage(h)} className="text-xs border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-600 font-medium px-3 py-1.5 rounded-xl transition-all flex items-center gap-1" data-testid={`manage-${h.hospital_id}`}><Layers className="h-3 w-3" /> Manage</button>
                <button onClick={() => { setForm({ ...h, specialties: (h.specialties || []).join(", "), latitude: String(h.latitude), longitude: String(h.longitude) }); setEditing(h); }} className="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1" data-testid={`edit-${h.hospital_id}`}><Pencil className="h-3 w-3" /> Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="hospital-form-dialog">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add hospital" : `Edit ${editing?.name}`}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-name-input" /></div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="rounded-xl mt-1.5" data-testid="hospital-desc-input" /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.hospital_type} onValueChange={(v) => setForm({ ...form, hospital_type: v })}>
                <SelectTrigger className="rounded-xl mt-1.5" data-testid="hospital-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="multi-specialty">Multi-specialty</SelectItem>
                  <SelectItem value="super-specialty">Super-specialty</SelectItem>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-phone-input" /></div>
            <div><Label>Emergency phone</Label><Input value={form.emergency_phone} onChange={(e) => setForm({ ...form, emergency_phone: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-emergency-input" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-email-input" /></div>
            <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-website-input" /></div>
            <div><Label>Opening hours</Label><Input value={form.opening_hours} onChange={(e) => setForm({ ...form, opening_hours: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-hours-input" /></div>
            <div className="sm:col-span-2"><Label>Address *</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-address-input" /></div>
            <div><Label>City *</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-city-input" /></div>
            <div><Label>State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="rounded-xl mt-1.5" data-testid="hospital-state-input" /></div>
            <div><Label>Latitude *</Label><Input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="28.6139" className="rounded-xl mt-1.5" data-testid="hospital-lat-input" /></div>
            <div><Label>Longitude *</Label><Input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="77.2090" className="rounded-xl mt-1.5" data-testid="hospital-lng-input" /></div>
            <div className="sm:col-span-2"><Label>Specialties (comma separated)</Label><Input value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} placeholder="Cardiology, Neurology" className="rounded-xl mt-1.5" data-testid="hospital-specialties-input" /></div>
            <label className="flex items-center gap-2 sm:col-span-2 text-sm text-slate-700">
              <Checkbox checked={form.emergency_available} onCheckedChange={(v) => setForm({ ...form, emergency_available: !!v })} data-testid="hospital-emergency-check" /> 24x7 emergency available
            </label>
          </div>
          <button onClick={save} disabled={busy || !form.name || !form.address || !form.city} className="mt-5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="save-hospital-btn">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save hospital
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managing} onOpenChange={() => { setManaging(null); setDetail(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="manage-hospital-dialog">
          <DialogHeader><DialogTitle>Manage — {managing?.name}</DialogTitle></DialogHeader>
          {!detail ? <PageLoading /> : (
            <div className="space-y-8">
              <section>
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><ImagePlus className="h-4 w-4 text-sky-600" /> Photos</h3>
                <div className="grid sm:grid-cols-[1fr_140px_1fr_auto] gap-2 mb-3">
                  <Input placeholder="Image URL" value={newImage.url} onChange={(e) => setNewImage({ ...newImage, url: e.target.value })} className="rounded-xl" data-testid="image-url-input" />
                  <Select value={newImage.image_type} onValueChange={(v) => setNewImage({ ...newImage, image_type: v })}>
                    <SelectTrigger className="rounded-xl" data-testid="image-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>{IMAGE_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input placeholder="Caption" value={newImage.caption} onChange={(e) => setNewImage({ ...newImage, caption: e.target.value })} className="rounded-xl" data-testid="image-caption-input" />
                  <button onClick={addImage} disabled={!newImage.url} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl" data-testid="add-image-btn">Add URL</button>
                </div>
                <div className="grid sm:grid-cols-[1fr_auto] gap-2 mb-3 items-center">
                  <Input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" onChange={(e) => setImgFile(e.target.files?.[0] || null)} className="rounded-xl" data-testid="image-file-input" />
                  <button onClick={uploadImage} disabled={!imgFile || uploading} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-1.5" data-testid="upload-image-btn">
                    {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Upload file
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {(detail.images || []).map((img) => (
                    <div key={img.image_id} className="relative group rounded-xl overflow-hidden h-24 bg-slate-100" data-testid={`admin-img-${img.image_id}`}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(img.image_id)} className="absolute top-1.5 right-1.5 bg-red-600 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`remove-img-${img.image_id}`} aria-label="Remove image"><Trash2 className="h-3 w-3" /></button>
                      <span className="absolute bottom-1.5 left-1.5 text-[10px] bg-slate-900/70 text-white px-1.5 py-0.5 rounded capitalize">{img.image_type}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-slate-900 mb-3">Departments</h3>
                <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mb-3">
                  <Input placeholder="Department name" value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} className="rounded-xl" data-testid="dept-name-input" />
                  <Input placeholder="Description" value={newDept.description} onChange={(e) => setNewDept({ ...newDept, description: e.target.value })} className="rounded-xl" data-testid="dept-desc-input" />
                  <button onClick={addDept} disabled={!newDept.name} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl" data-testid="add-dept-btn">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(detail.departments || []).map((d) => (
                    <span key={d.department_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-sky-50 text-sky-700 border border-sky-200/60" data-testid={`admin-dept-${d.department_id}`}>
                      {d.name}
                      <button onClick={() => removeDept(d.department_id)} className="text-sky-400 hover:text-red-500" data-testid={`remove-dept-${d.department_id}`} aria-label="Remove department"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-slate-900 mb-3">Facilities</h3>
                <div className="grid sm:grid-cols-[1fr_auto] gap-2 mb-3">
                  <Input placeholder="e.g. ICU, Pharmacy, Parking" value={newFacility} onChange={(e) => setNewFacility(e.target.value)} className="rounded-xl" data-testid="facility-input" />
                  <button onClick={addFacility} disabled={!newFacility.trim()} className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl" data-testid="add-facility-btn">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(detail.facilities || []).map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm bg-teal-50 text-teal-700 border border-teal-200/60">
                      {f.name}
                      <button onClick={() => removeFacility(i)} className="text-teal-400 hover:text-red-500" aria-label="Remove facility"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
