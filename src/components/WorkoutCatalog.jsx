export default function WorkoutCatalog({ workouts }) {
  return (
    <div className="card glass">
      <div className="card-header">
        <h2>Workout Catalog</h2>
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
                <h4 title={w.title}>{w.title}</h4>
                <span className={`pill intensity-${w.intensity}`}>{w.intensity}</span>
              </div>

              <div className="tag-row">
                <span className="tag">{w.category || "general"}</span>
                <span className="tag">{w.difficulty || "beginner"}</span>
                <span className="tag">{w.equipment || "none"}</span>
              </div>

              <p className="muted small">{w.description || "No description"}</p>
              <div className="catalog-foot">
                <span>#{w.id}</span>
                <span>{w.duration_min} min</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}