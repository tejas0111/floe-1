export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(Number(ms));
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "—";
  const now = Date.now();
  const diff = now - ms;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(ms);
}

export function truncate(str: string | null | undefined, maxLen = 16): string {
  if (!str) return "—";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

export function truncateMiddle(str: string | null | undefined, start = 6, end = 4): string {
  if (!str) return "—";
  if (str.length <= start + end + 3) return str;
  return str.slice(0, start) + "…" + str.slice(-end);
}
