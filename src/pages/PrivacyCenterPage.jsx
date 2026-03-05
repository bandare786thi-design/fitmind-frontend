import { useState } from "react";
import { deleteAccount, exportData } from "../api";

export default function PrivacyCenterPage() {
  const [status, setStatus] = useState("");

  async function doExport() {
    setStatus("Exporting...");
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fitmind_export.json";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("✅ Export downloaded.");
    } catch (e) {
      setStatus(e?.message || "Export failed.");
    }
  }

  async function doDelete() {
    if (!confirm("Are you sure? This will disable your account (soft delete).")) return;
    setStatus("Deleting...");
    try {
      const res = await deleteAccount();
      setStatus(res?.message || "Deleted.");
    } catch (e) {
      setStatus(e?.message || "Delete failed.");
    }
  }

  return (
    <div className="card glass" style={{ padding: 16 }}>
      <h2>Privacy Center</h2>
      <p className="muted">Export your data or delete your account.</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={doExport}>Export my data</button>
        <button className="btn btn-danger" onClick={doDelete}>Delete my account</button>
      </div>

      {status ? <p style={{ marginTop: 12 }}>{status}</p> : null}
    </div>
  );
}