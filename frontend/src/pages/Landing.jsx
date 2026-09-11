import { useAuth } from "../context/AuthContext";
import { startGoogleLogin } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import {
  HeartPulse, Search, Building2, CalendarCheck, FolderHeart, Stethoscope,
  FlaskConical, Sparkles, MapPin, Bell, ArrowRight, ShieldCheck,
} from "lucide-react";

const HERO_IMG = "https://images.unsplash.com/photo-1615770922480-0b9ae80afeba?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwyfHxtb2Rlcm4lMjBob3NwaXRhbCUyMGJ1aWxkaW5nJTIwZXh0ZXJpb3IlMjBkb2N0b3JzJTIwbWVkaWNhbCUyMHN0YWZmfGVufDB8fHx8MTc4OTEzNzQ0MXww&ixlib=rb-4.1.0&q=85";

const STEPS = [
  { icon: Search, title: "Search Hospital", text: "Search hospitals by name, city, department or specialty." },
  { icon: Building2, title: "Explore", text: "View hospital information, facilities, doctors and real location on the map." },
  { icon: CalendarCheck, title: "Book Appointment", text: "Select a doctor and an available time slot in seconds." },
  { icon: FolderHeart, title: "Manage Healthcare", text: "Access appointments, reports, prescriptions and AI assistance." },
];

const FEATURES = [
  { icon: Building2, title: "Hospital Discovery", text: "Find verified hospitals with complete profiles and facilities." },
  { icon: Stethoscope, title: "Doctor Search", text: "Browse specialists by department, experience and availability." },
  { icon: CalendarCheck, title: "Online Appointments", text: "Book, reschedule or cancel appointments with live slot availability." },
  { icon: FolderHeart, title: "Medical Records", text: "Your complete visit history in one secure timeline." },
  { icon: FlaskConical, title: "Lab Reports", text: "Upload and access your lab reports anytime, anywhere." },
  { icon: Sparkles, title: "AI Report Assistant", text: "Understand your reports in simple language with responsible AI." },
  { icon: MapPin, title: "Real Hospital Location", text: "Interactive maps with directions and distance from you." },
  { icon: Bell, title: "Smart Notifications", text: "Reminders for appointments, reports and prescriptions." },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const go = () => (user ? navigate("/dashboard") : startGoogleLogin());

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200">
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-sky-600 flex items-center justify-center">
              <HeartPulse className="h-5 w-5 text-white" />
            </div>
            <span className="font-heading font-bold text-lg text-slate-900">SmartCare AI</span>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <button onClick={() => navigate("/dashboard")} className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-5 py-2.5 rounded-xl shadow-sm transition-all duration-200 active:scale-[0.98]" data-testid="go-to-dashboard-btn">
                Go to Dashboard
              </button>
            ) : (
              <>
                <button onClick={startGoogleLogin} className="text-slate-700 hover:text-sky-600 font-medium px-4 py-2.5 transition-colors" data-testid="login-btn">
                  Login
                </button>
                <button onClick={startGoogleLogin} className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-5 py-2.5 rounded-xl shadow-sm transition-all duration-200 active:scale-[0.98]" data-testid="register-btn">
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center" data-testid="hero-section">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50 border border-sky-200/60 text-sky-700 text-xs font-semibold tracking-wide uppercase mb-6">
            <ShieldCheck className="h-3.5 w-3.5" /> Trusted healthcare platform
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight text-slate-900 font-heading">
            Find the Right Hospital and Doctor, <span className="text-sky-600">All in One Place</span>
          </h1>
          <p className="text-base md:text-lg text-slate-600 leading-relaxed mt-6 max-w-xl">
            Search hospitals, discover doctors, book appointments, manage medical records and understand your health reports with AI assistance.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <button onClick={go} className="bg-sky-600 hover:bg-sky-700 text-white font-medium px-6 py-3 rounded-xl shadow-sm hover:shadow transition-all duration-200 active:scale-[0.98] flex items-center gap-2" data-testid="search-hospital-btn">
              <Search className="h-4 w-4" /> Search Hospitals
            </button>
            <button onClick={go} className="border border-slate-300 hover:border-sky-600 hover:text-sky-600 text-slate-700 font-medium px-6 py-3 rounded-xl transition-all duration-200 flex items-center gap-2" data-testid="find-doctor-btn">
              <Stethoscope className="h-4 w-4" /> Find a Doctor
            </button>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 bg-sky-50 rounded-[2rem] -z-10 rotate-2" />
          <img src={HERO_IMG} alt="Modern hospital" className="rounded-[2rem] shadow-[0_12px_28px_-6px_rgba(15,23,42,0.12)] w-full h-[420px] object-cover" />
        </div>
      </section>

      <section className="bg-slate-50 border-y border-slate-200" data-testid="how-it-works">
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-16 lg:py-24">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 font-heading">How it works</h2>
          <p className="text-slate-500 mt-2">Four simple steps to better healthcare.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
            {STEPS.map((s, i) => (
              <div key={s.title} className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sky-200 transition-all duration-300" data-testid={`step-card-${i + 1}`}>
                <div className="h-11 w-11 rounded-xl bg-sky-50 flex items-center justify-center mb-4">
                  <s.icon className="h-5 w-5 text-sky-600" />
                </div>
                <div className="text-xs font-semibold tracking-wide uppercase text-sky-600 mb-1">Step {i + 1}</div>
                <h3 className="text-lg font-semibold text-slate-900">{s.title}</h3>
                <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-16 lg:py-24" data-testid="features-section">
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-slate-900 font-heading">Everything you need for your health</h2>
        <p className="text-slate-500 mt-2">One platform for discovery, booking, records and AI-powered understanding.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-10">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:border-sky-200 hover:shadow-[0_12px_28px_-6px_rgba(15,23,42,0.12)] transition-all duration-300" data-testid={`feature-${f.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <div className="h-11 w-11 rounded-xl bg-teal-50 flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5 text-teal-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-24">
        <div className="bg-sky-600 rounded-[2rem] px-8 py-14 text-center text-white">
          <h2 className="text-2xl sm:text-3xl font-semibold font-heading">Your health, organized and understood.</h2>
          <p className="text-sky-100 mt-3 max-w-xl mx-auto">Create your free account and take control of your healthcare journey today.</p>
          <button onClick={go} className="mt-8 bg-white text-sky-700 font-semibold px-8 py-3 rounded-xl hover:bg-sky-50 transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2" data-testid="cta-get-started-btn">
            Get Started <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <HeartPulse className="h-4 w-4 text-sky-600" /> SmartCare AI — responsible AI for healthcare.
        </div>
        <p className="text-xs text-slate-400">Not a substitute for professional medical advice, diagnosis or emergency care.</p>
      </footer>
    </div>
  );
}
