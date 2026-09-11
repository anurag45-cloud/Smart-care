import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import Layout from "./components/Layout";
import { PageLoading } from "./components/common";
import Landing from "./pages/Landing";
import AuthCallback from "./pages/AuthCallback";
import PatientDashboard from "./pages/patient/PatientDashboard";
import HospitalSearch from "./pages/patient/HospitalSearch";
import HospitalProfile from "./pages/patient/HospitalProfile";
import DoctorSearch from "./pages/patient/DoctorSearch";
import DoctorProfile from "./pages/patient/DoctorProfile";
import Appointments from "./pages/patient/Appointments";
import Records from "./pages/patient/Records";
import Reports from "./pages/patient/Reports";
import ReportDetail from "./pages/patient/ReportDetail";
import Assistant from "./pages/patient/Assistant";
import NotificationsPage from "./pages/NotificationsPage";
import Profile from "./pages/Profile";
import DoctorDashboard from "./pages/doctor/DoctorDashboard";
import DoctorAppointments from "./pages/doctor/DoctorAppointments";
import DoctorPatients from "./pages/doctor/DoctorPatients";
import DoctorPatientDetail from "./pages/doctor/DoctorPatientDetail";
import DoctorSchedule from "./pages/doctor/DoctorSchedule";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminHospitals from "./pages/admin/AdminHospitals";
import AdminDoctors from "./pages/admin/AdminDoctors";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminLeave from "./pages/admin/AdminLeave";

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-slate-50"><PageLoading /></div>;
  if (!user) return <Navigate to="/" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function DashboardRouter() {
  const { user } = useAuth();
  if (user.role === "admin") return <AdminDashboard />;
  if (user.role === "doctor") return <DoctorDashboard />;
  return <PatientDashboard />;
}

function AppRouter() {
  const location = useLocation();
  // OAuth callback: detect session_id synchronously during render (prevents race conditions)
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route path="/hospitals" element={<HospitalSearch />} />
        <Route path="/hospitals/:id" element={<HospitalProfile />} />
        <Route path="/doctors" element={<DoctorSearch />} />
        <Route path="/doctors/:id" element={<DoctorProfile />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/records" element={<Records />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:id" element={<ReportDetail />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/doctor/appointments" element={<Protected roles={["doctor"]}><DoctorAppointments /></Protected>} />
        <Route path="/doctor/patients" element={<Protected roles={["doctor"]}><DoctorPatients /></Protected>} />
        <Route path="/doctor/patients/:id" element={<Protected roles={["doctor"]}><DoctorPatientDetail /></Protected>} />
        <Route path="/doctor/schedule" element={<Protected roles={["doctor"]}><DoctorSchedule /></Protected>} />
        <Route path="/admin/hospitals" element={<Protected roles={["admin"]}><AdminHospitals /></Protected>} />
        <Route path="/admin/doctors" element={<Protected roles={["admin"]}><AdminDoctors /></Protected>} />
        <Route path="/admin/users" element={<Protected roles={["admin"]}><AdminUsers /></Protected>} />
        <Route path="/admin/leave" element={<Protected roles={["admin"]}><AdminLeave /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
