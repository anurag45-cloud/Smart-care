import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import { PageHeader } from "../components/common";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    date_of_birth: user?.date_of_birth || "",
    gender: user?.gender || "",
    address: user?.address || "",
    emergency_contact: user?.emergency_contact || "",
    blood_group: user?.blood_group || "",
    allergies: user?.allergies || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target ? e.target.value : e });

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/profile", form);
      setUser(r.data);
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e.friendlyMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="profile-page">
      <PageHeader title="My Profile" description="Keep your details up to date for better care." testid="profile-title" />
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-sm max-w-3xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-16 w-16 rounded-2xl bg-sky-100 overflow-hidden flex items-center justify-center text-sky-700 text-xl font-bold">
            {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" /> : user?.name?.[0]}
          </div>
          <div>
            <div className="font-semibold text-slate-900" data-testid="profile-name">{user?.name}</div>
            <div className="text-sm text-slate-500" data-testid="profile-email">{user?.email}</div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200/60 capitalize mt-1">{user?.role}</span>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="p-name">Full name</Label>
            <Input id="p-name" value={form.name} onChange={set("name")} className="rounded-xl mt-1.5" data-testid="profile-name-input" />
          </div>
          <div>
            <Label htmlFor="p-phone">Phone number</Label>
            <Input id="p-phone" value={form.phone} onChange={set("phone")} className="rounded-xl mt-1.5" data-testid="profile-phone-input" />
          </div>
          <div>
            <Label htmlFor="p-dob">Date of birth</Label>
            <Input id="p-dob" type="date" value={form.date_of_birth} onChange={set("date_of_birth")} className="rounded-xl mt-1.5" data-testid="profile-dob-input" />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={set("gender")}>
              <SelectTrigger className="rounded-xl mt-1.5" data-testid="profile-gender-select"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="p-blood">Blood group</Label>
            <Input id="p-blood" value={form.blood_group} onChange={set("blood_group")} placeholder="e.g. O+" className="rounded-xl mt-1.5" data-testid="profile-blood-input" />
          </div>
          <div>
            <Label htmlFor="p-emergency">Emergency contact</Label>
            <Input id="p-emergency" value={form.emergency_contact} onChange={set("emergency_contact")} placeholder="Name & phone" className="rounded-xl mt-1.5" data-testid="profile-emergency-input" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-address">Address</Label>
            <Textarea id="p-address" value={form.address} onChange={set("address")} rows={2} className="rounded-xl mt-1.5" data-testid="profile-address-input" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="p-allergies">Allergies</Label>
            <Input id="p-allergies" value={form.allergies} onChange={set("allergies")} placeholder="e.g. Penicillin, peanuts" className="rounded-xl mt-1.5" data-testid="profile-allergies-input" />
          </div>
        </div>
        <button onClick={save} disabled={saving} className="mt-8 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-medium px-8 py-2.5 rounded-xl transition-all flex items-center gap-2" data-testid="save-profile-btn">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </div>
    </div>
  );
}
