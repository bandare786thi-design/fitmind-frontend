import { useEffect, useState } from "react";
import { getNotifications, markNotificationRead, testWeeklyNotification } from "../api";

export default function NotificationsPage() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");

  async function refresh() {
    const data = await getNotifications();
    setRows(data || []);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function markRead(id) {
    await markNotificationRead(id);
    await refresh();
  }

  async function testWeekly() {
    setStatus("Creating test notification...");
    await testWeeklyNotification();
    setStatus("✅ Added test notification.");
    await refresh();
  }

  return (
    <div className="card glass" style={{ padding: 16 }}>
      <div className="card-header">
        <h2>Notifications</h2>
        <button className="btn btn-primary" onClick={testWeekly}>Test weekly</button>
      </div>

      {status ? <p>{status}</p> : null}

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {rows.map((n) => (
          <div key={n.id} className="mini-panel" style={{ padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <b>{n.title}</b>
                <div className="muted small">{n.created_at}</div>
              </div>
              {!n.read ? (
                <button className="btn" onClick={() => markRead(n.id)}>Mark read</button>
              ) : (
                <span className="badge">Read</span>
              )}
            </div>
            <div style={{ marginTop: 8 }}>{n.body}</div>
          </div>
        ))}
        {!rows.length ? <p className="muted">No notifications.</p> : null}
      </div>
    </div>
  );
}