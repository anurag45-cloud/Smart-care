import { useEffect, useState } from "react";
import api from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { PageHeader, PageLoading, EmptyState } from "../../components/common";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { toast } from "sonner";

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);

  const load = () => api.get("/admin/users").then((r) => setUsers(r.data.users)).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  const update = async (userId, payload) => {
    try {
      await api.put(`/admin/users/${userId}`, payload);
      toast.success("User updated");
      load();
    } catch (e) { toast.error(e.friendlyMessage); }
  };

  if (!users) return <PageLoading />;

  return (
    <div data-testid="admin-users-page">
      <PageHeader title="Users" description="Manage platform accounts, roles and access." testid="admin-users-title" />
      {users.length === 0 ? (
        <EmptyState title="No users yet" testid="no-users" />
      ) : (
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-x-auto" data-testid="users-table">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                <th className="p-4">User</th><th className="p-4">Role</th><th className="p-4">Status</th><th className="p-4">Joined</th><th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-slate-50" data-testid={`user-row-${u.user_id}`}>
                  <td className="p-4">
                    <div className="font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="p-4">
                    <Select value={u.role} onValueChange={(v) => update(u.user_id, { role: v })} disabled={u.user_id === me.user_id}>
                      <SelectTrigger className="w-32 h-9 rounded-xl" data-testid={`role-select-${u.user_id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="patient">Patient</SelectItem>
                        <SelectItem value="doctor">Doctor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${u.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}`} data-testid={`status-${u.user_id}`}>
                      {u.status || "active"}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                  <td className="p-4">
                    {u.user_id !== me.user_id && (
                      <button
                        onClick={() => update(u.user_id, { status: u.status === "deactivated" ? "active" : "deactivated" })}
                        className={`text-xs font-medium px-3 py-1.5 rounded-xl transition-colors ${u.status === "deactivated" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                        data-testid={`toggle-status-${u.user_id}`}
                      >
                        {u.status === "deactivated" ? "Activate" : "Deactivate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
