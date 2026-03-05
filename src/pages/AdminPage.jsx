import { useEffect, useState } from "react";
import { adminAudit, adminSetActive, adminSetAdmin, adminUsers, getMe } from "../api";

export default function AdminPage() {
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    const m = await getMe();
    setMe(m);
    if (!m?.is_admin) return;
    setUsers(await adminUsers());
    setAudit(await adminAudit(100));
  }

  useEffect(() => {
    load().catch((e) => setErr(e?.message || "Failed"));
  }, []);

  async function toggleActive(u) {
    await adminSetActive(u.id, !u.is_active);
    await load();
  }

  async function toggleAdmin(u) {
    await adminSetAdmin(u.id, !u.is_admin);
    await load();
  }

  if (!me) return <p className="muted">Loading...</p>;
  if (!me.is_admin) return <p style={{ color: "salmon" }}>Admin only.</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card glass" style={{ padding: 16 }}>
        <h2>Admin - Users</h2>
        {err ? <p style={{ color: "salmon" }}>{err}</p> : null}

        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Email</th><th>Verified</th><th>Admin</th><th>Active</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{String(u.email_verified)}</td>
                  <td>{String(u.is_admin)}</td>
                  <td>{String(u.is_active)}</td>
                  <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn" onClick={() => toggleAdmin(u)}>{u.is_admin ? "Remove admin" : "Make admin"}</button>
                    <button className="btn btn-danger" onClick={() => toggleActive(u)}>{u.is_active ? "Disable" : "Enable"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card glass" style={{ padding: 16 }}>
        <h2>Audit Logs</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>ID</th><th>Time</th><th>Actor</th><th>Target</th><th>Action</th><th>Meta</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.created_at}</td>
                  <td>{r.actor_user_id ?? "-"}</td>
                  <td>{r.target_user_id ?? "-"}</td>
                  <td>{r.action}</td>
                  <td><pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(r.meta, null, 2)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}