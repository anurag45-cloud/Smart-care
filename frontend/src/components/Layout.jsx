import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import {
  LayoutDashboard, Building2, Stethoscope, CalendarDays, FileText, FlaskConical,
  Sparkles, Bell, User, Users, CalendarClock, ClipboardList, Menu, LogOut, HeartPulse, FolderOpen,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";

const NAV = {
  patient: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/hospitals", icon: Building2, label: "Search Hospitals" },
    { to: "/doctors", icon: Stethoscope, label: "Find Doctors" },
    { to: "/appointments", icon: CalendarDays, label: "Appointments" },
    { to: "/records", icon: FileText, label: "Medical Records" },
    { to: "/reports", icon: FlaskConical, label: "Lab Reports" },
    { to: "/documents", icon: FolderOpen, label: "My Documents" },
    { to: "/assistant", icon: Sparkles, label: "AI Assistant" },
    { to: "/notifications", icon: Bell, label: "Notifications" },
    { to: "/profile", icon: User, label: "Profile" },
  ],
  doctor: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/doctor/appointments", icon: CalendarDays, label: "Appointments" },
    { to: "/doctor/patients", icon: Users, label: "Patients" },
    { to: "/doctor/schedule", icon: CalendarClock, label: "Schedule & Leave" },
    { to: "/notifications", icon: Bell, label: "Notifications" },
    { to: "/profile", icon: User, label: "Profile" },
  ],
  admin: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/admin/hospitals", icon: Building2, label: "Hospitals" },
    { to: "/admin/doctors", icon: Stethoscope, label: "Doctors" },
    { to: "/admin/users", icon: Users, label: "Users" },
    { to: "/admin/leave", icon: ClipboardList, label: "Leave Requests" },
    { to: "/notifications", icon: Bell, label: "Notifications" },
  ],
};

function NavItems({ onNavigate }) {
  const { user } = useAuth();
  const items = NAV[user?.role] || NAV.patient;
  return (
    <nav className="flex flex-col gap-1 px-3" data-testid="sidebar-nav">
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/dashboard"}
          onClick={onNavigate}
          data-testid={`nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
              isActive ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
        >
          <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = () => api.get("/notifications").then((r) => mounted && setUnread(r.data.unread)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5" data-testid="brand">
      <div className="h-9 w-9 rounded-xl bg-sky-600 flex items-center justify-center">
        <HeartPulse className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="font-heading font-bold text-slate-900 leading-tight">SmartCare AI</div>
        <div className="text-[11px] text-slate-500 capitalize">{user?.role} portal</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex" data-testid="app-layout">
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col bg-white border-r border-slate-200 fixed inset-y-0 z-30">
        {brand}
        <div className="flex-1 overflow-y-auto pb-6"><NavItems /></div>
      </aside>

      <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button className="lg:hidden p-2 rounded-lg hover:bg-slate-100" data-testid="mobile-menu-btn" aria-label="Open menu">
                  <Menu className="h-5 w-5 text-slate-700" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                {brand}
                <NavItems onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="lg:hidden flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-sky-600" />
              <span className="font-heading font-bold text-slate-900">SmartCare AI</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/notifications")}
              className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors"
              data-testid="notifications-bell"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-slate-600" />
              {unread > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center bg-red-500 text-white text-[10px] border-0" data-testid="unread-badge">
                  {unread > 9 ? "9+" : unread}
                </Badge>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-slate-100 transition-colors" data-testid="user-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.picture} />
                    <AvatarFallback className="bg-sky-100 text-sky-700 text-sm font-semibold">{user?.name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium text-slate-700 max-w-[140px] truncate">{user?.name}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/profile")} data-testid="menu-profile">
                  <User className="h-4 w-4 mr-2" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                  <LogOut className="h-4 w-4 mr-2" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
