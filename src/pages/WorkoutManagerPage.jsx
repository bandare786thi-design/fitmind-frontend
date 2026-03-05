import { useEffect, useMemo, useState } from "react";
import { createWorkout, deleteWorkout, getWorkouts, updateWorkout } from "../api";
import AlertBanner from "../components/AlertBanner";
import Modal from "../components/Modal";
import { useToast } from "../contexts/ToastContext";
import { intensitySortValue } from "../utils/format";

const categories = [
  "mobility","yoga","cardio","strength","hiit","core","recovery","balance",
  "breathing","walk","stretch","fullbody","upper","lower","general"
];
const difficulties = ["beginner", "intermediate", "advanced"];
const equipments = ["none","mat","dumbbells","kettlebell","resistance_band","bike","treadmill"];

const initialForm = {
  title: "",
  intensity: "low",
  duration_min: 20,
  description: "",
  category: "general",
  difficulty: "beginner",
  equipment: "none"
};

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
    sort: "id_asc"
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // modal states
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
        sort: filter.sort
      };

      const data = await getWorkouts(params);
      setWorkouts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    }
  }

  function clearAlerts() {
    setMessage("");
    setError("");
  }

  async function handleCreateWorkout(e) {
    e.preventDefault();
    clearAlerts();
    setLoading(true);
    try {
      await createWorkout({
        title: form.title.trim(),
        intensity: form.intensity,
        duration_min: Number(form.duration_min),
        description: form.description.trim() || null,
        category: form.category,
        difficulty: form.difficulty,
        equipment: form.equipment
      });
      setMessage("Workout created successfully.");
      toast.success("Workout created!");
      setForm(initialForm);
      await loadWorkouts();
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const localFiltered = useMemo(() => {
    let arr = [...workouts];
    if (filter.sort === "intensity") {
      arr.sort((a, b) => intensitySortValue(a.intensity) - intensitySortValue(b.intensity));
    }
    return arr;
  }, [workouts, filter.sort]);

  function openEdit(w) {
    setEditForm({
      id: w.id,
      title: w.title || "",
      intensity: w.intensity || "low",
      duration_min: w.duration_min || 20,
      description: w.description || "",
      category: w.category || "general",
      difficulty: w.difficulty || "beginner",
      equipment: w.equipment || "none"
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
        equipment: editForm.equipment
      });
      toast.success("Workout updated!");
      setEditOpen(false);
      setEditForm(null);
      await loadWorkouts();
    } catch (e) {
      toast.error(e.message || "Update failed. Add PUT /workouts/{id} in backend.");
    } finally {
      setLoading(false);
    }
  }

  function openDelete(w) {
    setDeleteTarget(w);
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
      toast.error(e.message || "Delete failed. Add DELETE /workouts/{id} in backend.");
    } finally {
      setLoading(false);
    }
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

      {/* Edit modal */}
      <Modal
        open={editOpen}
        title="Edit Workout"
        onClose={() => {
          setEditOpen(false);
          setEditForm(null);
        }}
        footer={
          <div className="modal-actions">
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
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
              />
            </label>

            <div className="two-col">
              <label>
                Intensity
                <select
                  value={editForm.intensity}
                  onChange={(e) => setEditForm((p) => ({ ...p, intensity: e.target.value }))}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>

              <label>
                Duration
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={editForm.duration_min}
                  onChange={(e) => setEditForm((p) => ({ ...p, duration_min: e.target.value }))}
                />
              </label>
            </div>

            <div className="two-col">
              <label>
                Category
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label>
                Difficulty
                <select
                  value={editForm.difficulty}
                  onChange={(e) => setEditForm((p) => ({ ...p, difficulty: e.target.value }))}
                >
                  {difficulties.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Equipment
              <select
                value={editForm.equipment}
                onChange={(e) => setEditForm((p) => ({ ...p, equipment: e.target.value }))}
              >
                {equipments.map((eq) => (
                  <option key={eq} value={eq}>{eq}</option>
                ))}
              </select>
            </label>

            <label>
              Description
              <textarea
                rows="4"
                value={editForm.description}
                onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteOpen}
        title="Delete Workout"
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
        footer={
          <div className="modal-actions">
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
          Are you sure you want to delete{" "}
          <strong>{deleteTarget?.title || "this workout"}</strong>?
          This cannot be undone.
        </p>
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
              <input
                type="text"
                value={form.title}
                placeholder="Morning Mobility Flow"
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
            </label>

            <div className="two-col">
              <label>
                Intensity
                <select
                  value={form.intensity}
                  onChange={(e) => setForm((p) => ({ ...p, intensity: e.target.value }))}
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>

              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={form.duration_min}
                  onChange={(e) => setForm((p) => ({ ...p, duration_min: e.target.value }))}
                  required
                />
              </label>
            </div>

            <div className="two-col">
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label>
                Difficulty
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}
                >
                  {difficulties.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Equipment
              <select
                value={form.equipment}
                onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))}
              >
                {equipments.map((eq) => (
                  <option key={eq} value={eq}>{eq}</option>
                ))}
              </select>
            </label>

            <label>
              Description
              <textarea
                rows="4"
                value={form.description}
                placeholder="Workout description..."
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>

            <button className="btn btn-primary" disabled={loading}>
              {loading ? "Creating..." : "Create Workout"}
            </button>

            <p className="helper">
              Edit/Delete will work after you add PUT/DELETE endpoints in backend.
            </p>
          </form>
        </div>

        <div className="card glass">
          <div className="card-header">
            <h2>Filter & Sort</h2>
            <button className="btn btn-ghost" onClick={loadWorkouts}>
              Refresh
            </button>
          </div>

          <div className="form">
            <label>
              Search
              <input
                type="text"
                placeholder="Search title or description..."
                value={filter.search}
                onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))}
              />
            </label>

            <div className="two-col">
              <label>
                Intensity
                <select
                  value={filter.intensity}
                  onChange={(e) => setFilter((p) => ({ ...p, intensity: e.target.value }))}
                >
                  <option value="all">all</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </label>

              <label>
                Category
                <select
                  value={filter.category}
                  onChange={(e) => setFilter((p) => ({ ...p, category: e.target.value }))}
                >
                  <option value="all">all</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="two-col">
              <label>
                Difficulty
                <select
                  value={filter.difficulty}
                  onChange={(e) => setFilter((p) => ({ ...p, difficulty: e.target.value }))}
                >
                  <option value="all">all</option>
                  {difficulties.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>

              <label>
                Equipment
                <select
                  value={filter.equipment}
                  onChange={(e) => setFilter((p) => ({ ...p, equipment: e.target.value }))}
                >
                  <option value="all">all</option>
                  {equipments.map((eq) => (
                    <option key={eq} value={eq}>{eq}</option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Sort
              <select
                value={filter.sort}
                onChange={(e) => setFilter((p) => ({ ...p, sort: e.target.value }))}
              >
                <option value="id_asc">ID (asc)</option>
                <option value="title_asc">Title (A-Z)</option>
                <option value="duration_asc">Duration (low-high)</option>
                <option value="duration_desc">Duration (high-low)</option>
                <option value="intensity">Intensity (low→high) (local)</option>
              </select>
            </label>

            <button className="btn btn-secondary" onClick={loadWorkouts}>
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      <div className="card glass">
        <div className="card-header">
          <h2>Catalog Results</h2>
          <span className="badge">{localFiltered.length} workouts</span>
        </div>

        {!localFiltered.length ? (
          <div className="empty-state">
            <p>No workouts match your filters</p>
            <span>Try changing search/filter settings.</span>
          </div>
        ) : (
          <div className="catalog-grid">
            {localFiltered.map((w) => (
              <div className="catalog-card" key={w.id}>
                <div className="catalog-top">
                  <h4 title={w.title}>{w.title}</h4>
                  <span className={`pill intensity-${w.intensity}`}>{w.intensity}</span>
                </div>

                <div className="tag-row">
                  <span className="tag">{w.category}</span>
                  <span className="tag">{w.difficulty}</span>
                  <span className="tag">{w.equipment}</span>
                </div>

                <p className="muted small">{w.description || "No description"}</p>

                <div className="catalog-actions">
                  <button className="btn btn-ghost" onClick={() => openEdit(w)}>Edit</button>
                  <button className="btn btn-danger" onClick={() => openDelete(w)}>Delete</button>
                </div>

                <div className="catalog-foot">
                  <span>#{w.id}</span>
                  <span>{w.duration_min} min</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}