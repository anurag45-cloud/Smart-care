import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../../lib/api";
import MapView from "../../components/MapView";
import { PageLoading, EmptyState } from "../../components/common";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { Dialog, DialogContent } from "../../components/ui/dialog";
import {
  MapPin, Phone, Mail, Globe, Clock, Siren, Navigation, Stethoscope,
  CheckCircle2, XCircle, Building2, IndianRupee,
} from "lucide-react";

const FALLBACK_IMG = "https://images.unsplash.com/photo-1580615631392-aeb060d526e4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBob3NwaXRhbCUyMGJ1aWxkaW5nJTIwZXh0ZXJpb3IlMjBkb2N0b3JzJTIwbWVkaWNhbCUyMHN0YWZmfGVufDB8fHx8MTc4OTEzNzQ0MXww&ixlib=rb-4.1.0&q=85";

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function HospitalProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [h, setH] = useState(null);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [imgFilter, setImgFilter] = useState("all");
  const [distance, setDistance] = useState(null);

  useEffect(() => {
    api.get(`/hospitals/${id}`).then((r) => setH(r.data)).catch((e) => setError(e.friendlyMessage));
  }, [id]);

  const locate = () => {
    if (!navigator.geolocation || !h) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setDistance(haversineKm(pos.coords.latitude, pos.coords.longitude, h.latitude, h.longitude)),
      () => setDistance(null)
    );
  };

  if (error) return <EmptyState title="Couldn't load hospital" description={error} testid="hospital-error" />;
  if (!h) return <PageLoading />;

  const images = h.images || [];
  const filteredImages = imgFilter === "all" ? images : images.filter((i) => i.image_type === imgFilter);
  const imageTypes = ["all", ...new Set(images.map((i) => i.image_type))];

  return (
    <div data-testid="hospital-profile">
      <div className="relative h-56 sm:h-72 rounded-2xl overflow-hidden mb-6 bg-slate-100">
        <img src={images[0]?.url || FALLBACK_IMG} alt={h.name} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-heading" data-testid="hospital-name">{h.name}</h1>
              <p className="flex items-center gap-1.5 text-slate-200 text-sm mt-1"><MapPin className="h-4 w-4" />{h.address}, {h.city}, {h.state}</p>
            </div>
            {h.emergency_available && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/90 text-sm font-medium"><Siren className="h-4 w-4" /> 24x7 Emergency</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { icon: Phone, label: "Phone", value: h.phone, testid: "hospital-phone" },
          { icon: Siren, label: "Emergency", value: h.emergency_phone, testid: "hospital-emergency-phone" },
          { icon: Mail, label: "Email", value: h.email, testid: "hospital-email" },
          { icon: Clock, label: "Hours", value: h.opening_hours, testid: "hospital-hours" },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-slate-200/80 rounded-2xl p-4" data-testid={c.testid}>
            <c.icon className="h-4 w-4 text-sky-600 mb-1.5" />
            <div className="text-xs text-slate-500">{c.label}</div>
            <div className="text-sm font-medium text-slate-800 truncate">{c.value || "—"}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6" data-testid="hospital-tabs">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="gallery" data-testid="tab-gallery">Photos ({images.length})</TabsTrigger>
          <TabsTrigger value="doctors" data-testid="tab-doctors">Doctors ({h.doctors?.length || 0})</TabsTrigger>
          <TabsTrigger value="location" data-testid="tab-location">Location</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid lg:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200/80 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">About</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{h.description || "No description available."}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 capitalize">{h.hospital_type}</span>
                {(h.specialties || []).map((s) => (
                  <span key={s} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200/60">{s}</span>
                ))}
              </div>
              {h.website && (
                <a href={h.website} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-700 font-medium" data-testid="hospital-website">
                  <Globe className="h-4 w-4" /> Visit website
                </a>
              )}
            </section>
            <section className="bg-white border border-slate-200/80 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Departments</h2>
              {h.departments?.length ? (
                <div className="flex flex-wrap gap-2" data-testid="departments-list">
                  {h.departments.map((d) => (
                    <button key={d.department_id} onClick={() => navigate(`/hospitals/${h.hospital_id}?dept=${d.department_id}#doctors`)} className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-sky-50 text-sky-700 border border-sky-200/60 hover:bg-sky-100 transition-colors" data-testid={`dept-${d.department_id}`}>
                      {d.name}
                    </button>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No departments listed yet.</p>}
              <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-3">Facilities</h2>
              {h.facilities?.length ? (
                <ul className="grid grid-cols-2 gap-2" data-testid="facilities-list">
                  {h.facilities.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      {f.available ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-slate-300" />}
                      {f.name}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-500">No facilities listed yet.</p>}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="gallery">
          {images.length === 0 ? (
            <EmptyState title="Verified photos unavailable" description="The hospital hasn't uploaded photos yet." testid="no-images" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-5">
                {imageTypes.map((t) => (
                  <button key={t} onClick={() => setImgFilter(t)} className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${imgFilter === t ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`} data-testid={`img-filter-${t}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="image-gallery">
                {filteredImages.map((img) => (
                  <button key={img.image_id} onClick={() => setLightbox(img)} className="relative group rounded-xl overflow-hidden h-40 bg-slate-100" data-testid={`gallery-img-${img.image_id}`}>
                    <img src={img.url} alt={img.caption || img.image_type} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-slate-900/70 text-white text-[10px] capitalize">{img.image_type}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="doctors">
          {h.doctors?.length === 0 ? (
            <EmptyState title="No doctors found" description="This hospital hasn't listed doctors yet." testid="no-doctors" />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="hospital-doctors">
              {h.doctors.map((d) => (
                <div key={d.doctor_id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:border-sky-200 transition-all" data-testid={`doctor-card-${d.doctor_id}`}>
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-sky-50 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {d.photo_url ? <img src={d.photo_url} alt={d.name} className="h-full w-full object-cover" /> : <Stethoscope className="h-7 w-7 text-sky-600" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">Dr. {d.name}</h3>
                      <p className="text-sm text-sky-700">{d.specialization}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{d.department_name} · {d.experience_years} yrs exp</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <span className="text-sm font-medium text-slate-700 flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" />{d.consultation_fee}</span>
                    <div className="flex gap-2">
                      <Link to={`/doctors/${d.doctor_id}`} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-3 py-1.5 rounded-xl transition-all" data-testid={`view-doctor-${d.doctor_id}`}>Profile</Link>
                      <Link to={`/doctors/${d.doctor_id}#book`} className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-3 py-1.5 rounded-xl transition-all" data-testid={`book-doctor-${d.doctor_id}`}>Book</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="location">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <MapView latitude={h.latitude} longitude={h.longitude} name={h.name} address={h.address} height={400} />
            </div>
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 h-fit">
              <h3 className="font-semibold text-slate-900 mb-2">Address</h3>
              <p className="text-sm text-slate-600">{h.address}, {h.city}, {h.state} {h.postal_code}</p>
              {distance !== null && <p className="text-sm text-sky-700 font-medium mt-3" data-testid="distance-text">Approximately {distance.toFixed(1)} km from your location</p>}
              <div className="flex flex-col gap-2 mt-5">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${h.latitude},${h.longitude}`} target="_blank" rel="noreferrer" className="bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2" data-testid="get-directions-btn">
                  <Navigation className="h-4 w-4" /> Get Directions
                </a>
                <button onClick={locate} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 text-sm font-medium px-5 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2" data-testid="calc-distance-btn">
                  <MapPin className="h-4 w-4" /> Distance from me
                </button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2 bg-slate-900 border-slate-800" data-testid="image-lightbox">
          {lightbox && <img src={lightbox.url} alt={lightbox.caption || ""} className="w-full max-h-[80vh] object-contain rounded-lg" />}
          {lightbox?.caption && <p className="text-center text-sm text-slate-300 pb-2">{lightbox.caption}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
