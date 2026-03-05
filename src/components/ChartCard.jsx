export default function ChartCard({ title, children, actions }) {
  return (
    <div className="card glass">
      <div className="card-header">
        <h2>{title}</h2>
        {actions || null}
      </div>
      <div className="chart-wrap">{children}</div>
    </div>
  );
}