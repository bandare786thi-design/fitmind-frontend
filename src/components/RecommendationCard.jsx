export default function RecommendationCard({
  recommendation,
  loading,
  onLogWorkout,
  onReplaceWorkout
}) {
  if (loading) {
    return (
      <div className="card glass">
        <div className="card-header">
          <h2>Recommendation</h2>
          <span className="badge">Loading…</span>
        </div>
        <p className="muted">Generating your personalized workout…</p>
      </div>
    );
  }

  if (!recommendation?.workout) {
    return (
      <div className="card glass">
        <div className="card-header">
          <h2>Recommendation</h2>
          <span className="badge">Not ready</span>
        </div>
        <p className="muted">
          Create a mood check-in to get a personalized recommendation.
        </p>
      </div>
    );
  }

  const w = recommendation.workout;

  return (
    <div className="card glass">
      <div className="card-header">
        <h2>Today’s Recommendation</h2>
        <span className="badge accent">AI + Rules</span>
      </div>

      <h3 style={{ marginTop: 6 }}>{w.title}</h3>

      <div className="recommendation-meta">
        <span>Intensity: <b>{w.intensity}</b></span>
        <span>Duration: <b>{w.duration_min} min</b></span>
        {w.category ? <span>Category: <b>{w.category}</b></span> : null}
        {w.difficulty ? <span>Level: <b>{w.difficulty}</b></span> : null}
      </div>

      {w.description ? <p style={{ marginTop: 10 }}>{w.description}</p> : null}

      {recommendation.reason ? (
        <div className="reason-box">
          <div className="muted"><b>Reason:</b> {recommendation.reason}</div>
          {recommendation.explanation ? (
            <div className="muted" style={{ marginTop: 6 }}>
              <b>Explanation:</b> {recommendation.explanation}
            </div>
          ) : null}
          {Array.isArray(recommendation.factors) && recommendation.factors.length ? (
            <ul className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
              {recommendation.factors.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="action-row">
        <button className="btn btn-primary" onClick={() => onLogWorkout?.(w)}>
          Log this workout
        </button>
      </div>

      {Array.isArray(recommendation.alternatives) && recommendation.alternatives.length ? (
        <div className="mini-panel">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <h2>Alternatives</h2>
            <span className="badge">Replace</span>
          </div>

          <div className="catalog-actions">
            {recommendation.alternatives.map((a) => (
              <button
                key={a.id}
                className="btn"
                onClick={() => onReplaceWorkout?.(a)}
                title={a.description || ""}
              >
                Replace with: {a.title}
              </button>
            ))}
          </div>

          <div className="muted small">
            Tip: replacing helps FitMind learn your preferences.
          </div>
        </div>
      ) : null}
    </div>
  );
}