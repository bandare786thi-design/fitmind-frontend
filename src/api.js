// frontend/src/api.js
import { CONFIG } from "./config";

const TOKEN_KEY = "fitmind_token";

/* ---------------- Token helpers ---------------- */
export function saveToken(token) {
  if (!token) return;
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function hasToken() {
  return !!getToken();
}

/* ---------------- Request utils ---------------- */
function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toQueryString(params) {
  if (!params) return "";
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    qs.append(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function parseBody(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  return await res.text();
}

function normalizeErrorMessage(data, status) {
  if (typeof data === "string" && data.trim()) return data;
  if (data?.detail) {
    return Array.isArray(data.detail) ? data.detail.map((x) => x.msg).join(", ") : String(data.detail);
  }
  if (data?.message) return String(data.message);
  return `Request failed (HTTP ${status})`;
}

/**
 * Robust request helper:
 * - Adds Authorization header when token exists
 * - Auto JSON encode/decode
 * - Timeout support
 * - Clears token on 401
 */
async function request(path, opts = {}) {
  const base = (CONFIG.API_BASE || "").replace(/\/+$/, "");
  const url = `${base}${path}`;

  const {
    method = "GET",
    json,
    body,
    headers: extraHeaders = {},
    timeoutMs = CONFIG.REQUEST_TIMEOUT_MS || 30000,
  } = opts;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { ...authHeaders(), ...extraHeaders };
    if (json !== undefined) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal: controller.signal,
    });

    const data = await parseBody(res);

    if (!res.ok) {
      if (res.status === 401) clearToken();
      throw new Error(normalizeErrorMessage(data, res.status));
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

/* ---------- helpers for AI JSON base64 endpoints ---------- */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result; // "data:...;base64,XXXX"
      const base64 = String(dataUrl).split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ---------------- AUTH ---------------- */
export async function register(payload) {
  return request("/auth/register", { method: "POST", json: payload });
}
export async function login(payload) {
  const data = await request("/auth/login", { method: "POST", json: payload });
  if (data?.access_token) saveToken(data.access_token);
  return data;
}
export async function registerUser(payload) {
  return register(payload);
}
export async function loginUser(payload) {
  return login(payload);
}

export async function authStatus() {
  return request("/auth/status", { method: "GET" });
}

export async function requestVerify() {
  return request("/auth/request-verify", { method: "POST" });
}
export async function verifyEmail(token) {
  return request("/auth/verify-email", { method: "POST", json: { token } });
}
export async function forgotPassword(email) {
  return request(`/auth/forgot-password${toQueryString({ email })}`, { method: "POST" });
}
export async function resetPassword(token, new_password) {
  return request("/auth/reset-password", { method: "POST", json: { token, new_password } });
}
export async function changePassword(old_password, new_password) {
  return request("/auth/change-password", { method: "POST", json: { old_password, new_password } });
}
export async function logoutAll() {
  return request("/auth/logout-all", { method: "POST" });
}

/* ---------------- 2FA ---------------- */
export async function setup2FA() {
  return request("/auth/2fa/setup", { method: "POST" });
}
export async function enable2FA(code) {
  return request("/auth/2fa/enable", { method: "POST", json: { code } });
}
export async function disable2FA(code) {
  return request("/auth/2fa/disable", { method: "POST", json: { code } });
}
export async function verify2FALogin(email, password, code) {
  const data = await request("/auth/2fa/verify", { method: "POST", json: { email, password, code } });
  if (data?.access_token) saveToken(data.access_token);
  return data;
}

/* ---------------- USERS ---------------- */
export async function getMe() {
  return request("/users/me", { method: "GET" });
}
export async function updateMe(payload) {
  return request("/users/me", { method: "PUT", json: payload });
}
export async function getProfile() {
  return getMe();
}
export async function updateProfile(payload) {
  return updateMe(payload);
}

/* ---------------- MOODS ---------------- */
export async function createMood(payload) {
  return request("/moods", { method: "POST", json: payload });
}
export async function getMoods(params) {
  return request(`/moods${toQueryString(params)}`, { method: "GET" });
}
export async function getMoodHistory(params) {
  return getMoods(params);
}

/* ---------------- RECOMMENDATIONS ---------------- */
export async function getRecommendation() {
  return request("/recommendations/workout", { method: "GET" });
}
export async function getWorkoutRecommendation() {
  return getRecommendation();
}

/** ✅ NEW: recommendations list by mood/energy/stress (used by Voice + Face screens) */
export async function getWorkoutsByState({ mood, energy, stress, limit = 8 }) {
  return request("/recommendations/by-state", {
    method: "POST",
    json: { mood, energy, stress, limit },
    timeoutMs: 90000,
  });
}

/** Optional: Unified AI -> workout list endpoint (if you enabled it in backend) */
export async function recommendFromAI(payload) {
  return request("/recommendations/from-ai", { method: "POST", json: payload, timeoutMs: 120000 });
}

/* ---------------- WORKOUTS ---------------- */
export async function getWorkouts(params) {
  return request(`/workouts${toQueryString(params)}`, { method: "GET" });
}
export async function createWorkout(payload) {
  return request("/workouts", { method: "POST", json: payload });
}
export async function updateWorkout(id, payload) {
  return request(`/workouts/${id}`, { method: "PUT", json: payload });
}
export async function deleteWorkout(id) {
  return request(`/workouts/${id}`, { method: "DELETE" });
}
export async function getWorkoutAlternatives(workoutId, limit = 5) {
  return request(`/workouts/${workoutId}/alternatives${toQueryString({ limit })}`, { method: "GET" });
}

/* ---------------- WORKOUT LOGS ---------------- */
export async function getWorkoutLogs(params) {
  return request(`/workout-logs${toQueryString(params)}`, { method: "GET" });
}
export async function createWorkoutLog(payload) {
  return request("/workout-logs", { method: "POST", json: payload });
}
export async function updateWorkoutLog(id, payload) {
  return request(`/workout-logs/${id}`, { method: "PATCH", json: payload });
}
export async function getLogs(params) {
  return getWorkoutLogs(params);
}

/* ---------------- PLANS ---------------- */
export async function createPlan(payload) {
  return request("/plans", { method: "POST", json: payload });
}
export async function getWeekPlan(startDateISO) {
  return request(`/plans/week?start_date=${encodeURIComponent(startDateISO)}`, { method: "GET" });
}
export async function updatePlan(planId, payload) {
  return request(`/plans/${planId}`, { method: "PATCH", json: payload });
}
export async function completePlan(planId) {
  return request(`/plans/${planId}/complete`, { method: "POST" });
}
export async function generatePlan() {
  return request("/plans/generate", { method: "POST" });
}

/* ---------------- AI ---------------- */
export async function analyzeTextMood(text) {
  return request("/ai/text", { method: "POST", json: { text }, timeoutMs: 90000 });
}

/**
 * Backend expects JSON body with base64 keys like audio_b64 / image_b64.
 */
export async function analyzeVoiceMood(wavBlob) {
  const audio_b64 = await blobToBase64(wavBlob);
  return request("/ai/voice", { method: "POST", json: { audio_b64 }, timeoutMs: 90000 });
}

/** Advanced voice insights (transcript + top3 + energy/stress + summary) */
export async function analyzeVoiceInsights(wavBlob) {
  const audio_b64 = await blobToBase64(wavBlob);
  return request("/ai/voice/insights", { method: "POST", json: { audio_b64 }, timeoutMs: 120000 });
}

export async function analyzeFaceMood(imageBlob) {
  const image_b64 = await blobToBase64(imageBlob);
  return request("/ai/face", { method: "POST", json: { image_b64 }, timeoutMs: 90000 });
}

export async function analyzeFusion(payload) {
  return request("/ai/fusion", { method: "POST", json: payload, timeoutMs: 90000 });
}

/* ---------------- PROGRESS / REPORTS ---------------- */
export async function getProgressSummary(range = "30d") {
  return request(`/progress/summary${toQueryString({ range })}`, { method: "GET" });
}
export async function getProgressStreak() {
  return request("/progress/streak", { method: "GET" });
}
export async function getPopularWorkouts(range = "30d", limit = 10) {
  return request(`/reports/popular-workouts${toQueryString({ range, limit })}`, { method: "GET" });
}
export async function getPopularWorkoutsReport(range = "30d", limit = 10) {
  return getPopularWorkouts(range, limit);
}

/* ---------------- PRIVACY ---------------- */
export async function exportData() {
  return request("/privacy/export", { method: "GET" });
}
export async function deleteAccount() {
  return request("/privacy/delete", { method: "POST" });
}

/* ---------------- ADMIN ---------------- */
export async function adminUsers() {
  return request("/admin/users", { method: "GET" });
}
export async function adminSetActive(userId, active) {
  return request(`/admin/users/${userId}/set-active`, { method: "POST", json: { active } });
}
export async function adminSetAdmin(userId, is_admin) {
  return request(`/admin/users/${userId}/set-admin`, { method: "POST", json: { is_admin } });
}
export async function adminAudit(limit = 200) {
  return request(`/admin/audit${toQueryString({ limit })}`, { method: "GET" });
}

/* ---------------- ANALYTICS ---------------- */
export async function getInsights(range = "30d") {
  return request(`/analytics/insights${toQueryString({ range })}`, { method: "GET" });
}

/* ---------------- NOTIFICATIONS ---------------- */
export async function getNotifications() {
  return request("/notifications", { method: "GET" });
}
export async function markNotificationRead(id) {
  return request(`/notifications/${id}/read`, { method: "POST" });
}
export async function testWeeklyNotification() {
  return request("/notifications/test-weekly", { method: "POST" });
}

/* Export helpers (optional for debugging) */
export { request, blobToBase64 };