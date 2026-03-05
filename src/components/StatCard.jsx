export default function StatCard({ label, value, icon }) {
  return (
    <div className="stat-box glass">
      <p className="muted">{icon ? `${icon} ${label}` : label}</p>
      <h3>{value}</h3>
    </div>
  );
}