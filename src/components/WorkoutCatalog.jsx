function pretty(v) {
  return String(v || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeIntensity(v) {
  const text = String(v || "medium").toLowerCase();
  return ["low", "medium", "high"].includes(text) ? text : "medium";
}

export default function WorkoutCatalog({ workouts, onSelectAlternative = null }) {
  return (
    <div className="card glass">
      <div className="card-header">
        <h2>Workout Catalog</h2>
        <span className="badge">{workouts?.length || 0} items</span>
      </div>

      {!workouts?.length ? (
        <div className="empty-state">
          <p>No workouts found</p>
          <span>Seed workouts or add them from Workout Manager.</span>
        </div>
      ) : (
        <div className="catalog-grid">
          {workouts.map((w) => (
            <div className="catalog-card" key={w.id}>
              <div className="catalog-top">
                <div>
                  <h4 title={w.title}>{w.title}</h4>
                  <div className="muted small" style={{ marginTop: 4 }}>#{w.id}</div>
                </div>
                <span className={`pill intensity-${normalizeIntensity(w.intensity)}`}>{w.intensity}</span>
              </div>

              <div className="tag-row">
                <span className="tag">{pretty(w.category || "general")}</span>
                <span className="tag">{pretty(w.difficulty || "beginner")}</span>
                <span className="tag">{pretty(w.equipment || "none")}</span>
                <span className="tag">{pretty(w.muscle_group || "fullbody")}</span>
                <span className="tag">{pretty(w.movement_pattern || "general")}</span>
              </div>

              <p className="muted small">{w.description || "No description"}</p>
              {w.why ? <p className="muted small" style={{ marginTop: 8 }}>{w.why}</p> : null}

              <div className="catalog-foot">
                <span>{w.duration_min} min</span>
                <span>{pretty(w.muscle_group || "fullbody")}</span>
              </div>

              {onSelectAlternative ? (
                <div className="catalog-actions">
                  <button className="btn btn-primary" type="button" onClick={() => onSelectAlternative(w)}>
                    Use This Workout
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
