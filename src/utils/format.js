export function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function titleCase(text = "") {
  return text
    .toString()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function intensitySortValue(intensity) {
  if (intensity === "low") return 1;
  if (intensity === "medium") return 2;
  if (intensity === "high") return 3;
  return 99;
}