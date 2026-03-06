import { useEffect, useMemo, useState } from "react";
import {
  createWorkout,
  deleteWorkout,
  getWorkoutAlternatives,
  getWorkouts,
  updateWorkout,
} from "../api";
import AlertBanner from "../components/AlertBanner";
import Modal from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import { intensitySortValue } from "../utils/format";

const categories = [
  "general",
  "strength",
  "cardio",
  "hiit",
  "mobility",
  "yoga",
  "core",
  "recovery",
  "balance",
  "breathing",
  "walk",
  "stretch",
  "fullbody",
  "upper",
  "lower",
];

const difficulties = ["beginner", "intermediate", "advanced"];

const equipments = [
  "none",
  "mat",
  "dumbbells",
  "kettlebell",
  "resistance_band",
  "band",
  "barbell",
  "cable",
  "machine",
  "bike",
  "rower",
  "treadmill",
  "pullup_bar",
];

const muscleGroups = [
  "fullbody",
  "upper",
  "lower",
  "chest",
  "back",
  "legs",
  "glutes",
  "core",
  "arms",
  "shoulders",
];

const movementPatterns = [
  "general",
  "push",
  "pull",
  "squat",
  "hinge",
  "carry",
  "lunge",
  "rotation",
  "press",
  "curl",
  "raise",
  "conditioning",
  "stability",
  "flexion",
];

const sortOptions = [
  { value: "id_desc", label: "Newest" },
  { value: "id_asc", label: "Oldest" },
  { value: "title_asc", label: "Title A-Z" },
  { value: "title_desc", label: "Title Z-A" },
  { value: "duration_asc", label: "Duration Low-High" },
  { value: "duration_desc", label: "Duration High-Low" },
  { value: "intensity", label: "Intensity" },
];

const initialForm = {
  title: "",
  intensity: "low",
  duration_min: 20,
  description: "",
  category: "general",
  difficulty: "beginner",
  equipment: "none",
  muscle_group: "fullbody",
  movement_pattern: "general",
};

function pretty(v) {
  return String(v || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeIntensity(v) {
  const text = String(v || "medium").toLowerCase();
  return ["low", "medium", "high"].includes(text) ? text : "medium";
}

function formatAlternatives(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.alternatives)) return data.alternatives;
  if (Array.isArray(data?.workouts)) return data.workouts;
  return [];
}

function Tag({ children }) {
  return <span className="tag">{children}</span>;
}

function WorkoutRow({ workout, onEdit, onDelete, onOpenAlternatives }) {
  return (
    <div className="catalog-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="catalog-top">
        <div>
          <h4 title={workout.title} style={{ marginBottom: 6 }}>{workout.title}</h4>
          <div className="muted small">#{workout.id}</div>
        </div>
        <span className={`pill intensity-${normalizeIntensity(workout.intensity)}`}>{workout.intensity}</span>
      </div>

      <div className="tag-row">
        <Tag>{pretty(workout.category)}</Tag>
        <Tag>{pretty(workout.difficulty)}</Tag>
        <Tag>{pretty(workout.equipment)}</Tag>
        <Tag>{pretty(workout.muscle_group)}</Tag>
        <Tag>{pretty(workout.movement_pattern)}</Tag>
      </div>

      <div className="catalog-foot" style={{ marginTop: 0 }}>
        <span>{workout.duration_min} min</span>
        <span>{pretty(workout.muscle_group)}</span>
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        {workout.description || "No description"}
      </p>

      <div className="btn-row" style={{ marginTop: 2 }}>
        <button className="btn" type="button" onClick={() => onEdit(workout)}>
          Edit
        </button>
        <button className="btn" type="button" onClick={() => onOpenAlternatives(workout)}>
          View Alternatives
        </button>
        <button className="btn btn-danger" type="button" onClick={() => onDelete(workout)}>
          Delete
        </button>
      </div>
    </div>
  );
}

export default function WorkoutManagerPage() {
  const toast = useToast();

  const [workouts, setWorkouts] = useState([]);
  const [form, setForm] = useState(initialForm);

  const [filter, setFilter] = useState({
    search: "",
    intensity: "all",
    category: "all",
    difficulty: "all",
    equipment: "all",
    muscle_group: "all",
    movement_pattern: "all",
    min_duration: "",
    max_duration: "",
    sort: "id_desc",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [altOpen, setAltOpen] = useState(false);
  const [altWorkout, setAltWorkout] = useState(null);
  const [altItems, setAltItems] = useState([]);
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState("");

  useEffect(() => {
    loadWorkouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadWorkouts() {
    setError("");
    try {
      const params = {
        search: filter.search || undefined,
        intensity: filter.intensity !== "all" ? filter.intensity : undefined,
        category: filter.category !== "all" ? filter.category : undefined,
        difficulty: filter.difficulty !== "all" ? filter.difficulty : undefined,
        equipment: filter.equipment !== "all" ? filter.equipment : undefined,
        muscle_group: filter.muscle_group !== "all" ? filter.muscle_group : undefined,
        movement_pattern: filter.movement_pattern !== "all" ? filter.movement_pattern : undefined,
        min_duration: filter.min_duration || undefined,
        max_duration: filter.max_duration || undefined,
        sort: filter.sort,
        limit: 300,
      };

      const data = await getWorkouts(params);
      setWorkouts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load workouts.");
      toast.error(e.message || "Failed to load workouts.");
    }
  }

  function clearAlerts() {
    setMessage("");
    setError("");
  }

  function setField(setter, key, value) {
    setter((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreateWorkout(e) {
    e.preventDefault();
    clearAlerts();

    if (!form.title.trim()) {
      setError("Workout title is required.");
      return;
    }

    setLoading(true);
    try {
      await createWorkout({
        title: form.title.trim(),
        intensity: form.intensity,
        duration_min: Number(form.duration_min),
        description: form.description.trim() || null,
        category: form.category,
        difficulty: form.difficulty,
        equipment: form.equipment,
        muscle_group: form.muscle_group,
        movement_pattern: form.movement_pattern,
      });
      setMessage("Workout created successfully.");
      toast.success("Workout created!");
      setForm(initialForm);
      await loadWorkouts();
    } catch (e) {
      setError(e.message || "Failed to create workout.");
      toast.error(e.message || "Failed to create workout.");
    } finally {
      setLoading(false);
    }
  }

  const localFiltered = useMemo(() => {
    const arr = [...workouts];
    if (filter.sort === "intensity") {
      arr.sort((a, b) => intensitySortValue(a.intensity) - intensitySortValue(b.intensity));
      return arr;
    }
    return arr;
  }, [workouts, filter.sort]);

  function openEdit(workout) {
    setEditForm({
      id: workout.id,
      title: workout.title || "",
      intensity: workout.intensity || "low",
      duration_min: workout.duration_min || 20,
      description: workout.description || "",
      category: workout.category || "general",
      difficulty: workout.difficulty || "beginner",
      equipment: workout.equipment || "none",
      muscle_group: workout.muscle_group || "fullbody",
      movement_pattern: workout.movement_pattern || "general",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editForm?.id) return;
    setLoading(true);
    try {
      await updateWorkout(editForm.id, {
        title: editForm.title.trim(),
        intensity: editForm.intensity,
        duration_min: Number(editForm.duration_min),
        description: editForm.description.trim() || null,
        category: editForm.category,
        difficulty: editForm.difficulty,
        equipment: editForm.equipment,
        muscle_group: editForm.muscle_group,
        movement_pattern: editForm.movement_pattern,
      });
      toast.success("Workout updated!");
      setEditOpen(false);
      setEditForm(null);
      await loadWorkouts();
    } catch (e) {
      toast.error(e.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  }

  function openDelete(workout) {
    setDeleteTarget(workout);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget?.id) return;
    setLoading(true);
    try {
      await deleteWorkout(deleteTarget.id);
      toast.success("Workout deleted!");
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadWorkouts();
    } catch (e) {
      toast.error(e.message || "Delete failed.");
    } finally {
      setLoading(false);
    }
  }

  async function openAlternatives(workout) {
    setAltWorkout(workout);
    setAltOpen(true);
    setAltLoading(true);
    setAltError("");
    setAltItems([]);
    try {
      const data = await getWorkoutAlternatives(workout.id, 6);
      setAltItems(formatAlternatives(data));
    } catch (e) {
      setAltError(e.message || "Failed to load alternatives.");
    } finally {
      setAltLoading(false);
    }
  }

  function SelectRow({ label, value, onChange, options, allLabel = null }) {
    return (
      <label>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {allLabel ? <option value="all">{allLabel}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {pretty(option)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="page-stack">
      <AlertBanner
        message={message}
        error={error}
        onClose={() => {
          setMessage("");
          setError("");
        }}
      />

      <Modal
        open={editOpen}
        title="Edit Workout"
        onClose={() => {
          setEditOpen(false);
          setEditForm(null);
        }}
        footer={
          <div className="modal-actions btn-row">
            <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        {editForm ? (
          <div className="form">
            <label>
              Title
              <input value={editForm.title} onChange={(e) => setField(setEditForm, "title", e.target.value)} />
            </label>

            <div className="two-col">
              <SelectRow
                label="Intensity"
                value={editForm.intensity}
                onChange={(v) => setField(setEditForm, "intensity", v)}
                options={["low", "medium", "high"]}
              />
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={editForm.duration_min}
                  onChange={(e) => setField(setEditForm, "duration_min", e.target.value)}
                />
              </label>
            </div>

            <div className="two-col">
              <SelectRow
                label="Category"
                value={editForm.category}
                onChange={(v) => setField(setEditForm, "category", v)}
                options={categories}
              />
              <SelectRow
                label="Difficulty"
                value={editForm.difficulty}
                onChange={(v) => setField(setEditForm, "difficulty", v)}
                options={difficulties}
              />
            </div>

            <div className="two-col">
              <SelectRow
                label="Equipment"
                value={editForm.equipment}
                onChange={(v) => setField(setEditForm, "equipment", v)}
                options={equipments}
              />
              <SelectRow
                label="Muscle Group"
                value={editForm.muscle_group}
                onChange={(v) => setField(setEditForm, "muscle_group", v)}
                options={muscleGroups}
              />
            </div>

            <SelectRow
              label="Movement Pattern"
              value={editForm.movement_pattern}
              onChange={(v) => setField(setEditForm, "movement_pattern", v)}
              options={movementPatterns}
            />

            <label>
              Description
              <textarea rows="4" value={editForm.description} onChange={(e) => setField(setEditForm, "description", e.target.value)} />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete Workout"
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        footer={
          <div className="modal-actions btn-row">
            <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirmDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete"}
            </button>
          </div>
        }
      >
        <p className="muted">
          Are you sure you want to delete <strong>{deleteTarget?.title || "this workout"}</strong>? This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={altOpen}
        title={altWorkout ? `Alternatives for ${altWorkout.title}` : "Workout Alternatives"}
        onClose={() => {
          setAltOpen(false);
          setAltWorkout(null);
          setAltItems([]);
          setAltError("");
        }}
        footer={
          <div className="modal-actions btn-row">
            <button className="btn" onClick={() => setAltOpen(false)}>
              Close
            </button>
          </div>
        }
      >
        {altLoading ? <p className="muted">Loading alternatives...</p> : null}
        {altError ? <p className="muted">{altError}</p> : null}
        {!altLoading && !altError && !altItems.length ? <p className="muted">No alternatives found.</p> : null}

        <div className="list">
          {altItems.map((item) => (
            <div key={item.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <strong>{item.title}</strong>
                <span className="timestamp">{item.duration_min} min</span>
              </div>
              <div className="tag-row">
                <Tag>{pretty(item.category)}</Tag>
                <Tag>{pretty(item.difficulty)}</Tag>
                <Tag>{pretty(item.equipment)}</Tag>
                <Tag>{pretty(item.muscle_group)}</Tag>
                <Tag>{pretty(item.movement_pattern)}</Tag>
              </div>
              {item.why ? <span className="muted small">{item.why}</span> : null}
            </div>
          ))}
        </div>
      </Modal>

      <div className="page-grid-2">
        <div className="card glass">
          <div className="card-header">
            <h2>Create Workout</h2>
            <span className="badge">Admin UI</span>
          </div>

          <form className="form" onSubmit={handleCreateWorkout}>
            <label>
              Title
              <input value={form.title} onChange={(e) => setField(setForm, "title", e.target.value)} placeholder="Workout title" />
            </label>

            <div className="two-col">
              <SelectRow label="Intensity" value={form.intensity} onChange={(v) => setField(setForm, "intensity", v)} options={["low", "medium", "high"]} />
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={form.duration_min}
                  onChange={(e) => setField(setForm, "duration_min", e.target.value)}
                />
              </label>
            </div>

            <div className="two-col">
              <SelectRow label="Category" value={form.category} onChange={(v) => setField(setForm, "category", v)} options={categories} />
              <SelectRow label="Difficulty" value={form.difficulty} onChange={(v) => setField(setForm, "difficulty", v)} options={difficulties} />
            </div>

            <div className="two-col">
              <SelectRow label="Equipment" value={form.equipment} onChange={(v) => setField(setForm, "equipment", v)} options={equipments} />
              <SelectRow label="Muscle Group" value={form.muscle_group} onChange={(v) => setField(setForm, "muscle_group", v)} options={muscleGroups} />
            </div>

            <SelectRow label="Movement Pattern" value={form.movement_pattern} onChange={(v) => setField(setForm, "movement_pattern", v)} options={movementPatterns} />

            <label>
              Description
              <textarea rows="4" value={form.description} onChange={(e) => setField(setForm, "description", e.target.value)} placeholder="Workout description" />
            </label>

            <div className="btn-row">
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Create Workout"}
              </button>
              <button className="btn" type="button" onClick={() => setForm(initialForm)} disabled={loading}>
                Reset
              </button>
            </div>
          </form>
        </div>

        <div className="card glass">
          <div className="card-header">
            <h2>Filters</h2>
            <span className="badge">{localFiltered.length} workouts</span>
          </div>

          <div className="form">
            <label>
              Search
              <input value={filter.search} onChange={(e) => setField(setFilter, "search", e.target.value)} placeholder="Search by title or tags" />
            </label>

            <div className="two-col">
              <SelectRow label="Intensity" value={filter.intensity} onChange={(v) => setField(setFilter, "intensity", v)} options={["low", "medium", "high"]} allLabel="All intensities" />
              <SelectRow label="Category" value={filter.category} onChange={(v) => setField(setFilter, "category", v)} options={categories} allLabel="All categories" />
            </div>

            <div className="two-col">
              <SelectRow label="Difficulty" value={filter.difficulty} onChange={(v) => setField(setFilter, "difficulty", v)} options={difficulties} allLabel="All difficulties" />
              <SelectRow label="Equipment" value={filter.equipment} onChange={(v) => setField(setFilter, "equipment", v)} options={equipments} allLabel="All equipment" />
            </div>

            <div className="two-col">
              <SelectRow label="Muscle Group" value={filter.muscle_group} onChange={(v) => setField(setFilter, "muscle_group", v)} options={muscleGroups} allLabel="All muscle groups" />
              <SelectRow label="Movement Pattern" value={filter.movement_pattern} onChange={(v) => setField(setFilter, "movement_pattern", v)} options={movementPatterns} allLabel="All movement patterns" />
            </div>

            <div className="two-col">
              <label>
                Min Duration
                <input type="number" min="1" max="180" value={filter.min_duration} onChange={(e) => setField(setFilter, "min_duration", e.target.value)} placeholder="e.g. 10" />
              </label>
              <label>
                Max Duration
                <input type="number" min="1" max="180" value={filter.max_duration} onChange={(e) => setField(setFilter, "max_duration", e.target.value)} placeholder="e.g. 45" />
              </label>
            </div>

            <label>
              Sort
              <select value={filter.sort} onChange={(e) => setField(setFilter, "sort", e.target.value)}>
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="btn-row">
              <button className="btn btn-primary" type="button" onClick={loadWorkouts}>
                Apply Filters
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setFilter({
                    search: "",
                    intensity: "all",
                    category: "all",
                    difficulty: "all",
                    equipment: "all",
                    muscle_group: "all",
                    movement_pattern: "all",
                    min_duration: "",
                    max_duration: "",
                    sort: "id_desc",
                  });
                }}
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card glass">
        <div className="card-header">
          <h2>Workout Library</h2>
          <span className="badge">Manage 100+ workouts</span>
        </div>

        {!localFiltered.length ? (
          <div className="empty-state">
            <p>No workouts found.</p>
            <span>Seed workouts first or change your filters.</span>
          </div>
        ) : (
          <div className="catalog-grid">
            {localFiltered.map((workout) => (
              <WorkoutRow
                key={workout.id}
                workout={workout}
                onEdit={openEdit}
                onDelete={openDelete}
                onOpenAlternatives={openAlternatives}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
