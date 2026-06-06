export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function formatDate(ms: number | null | undefined): string {
  if (!Number.isFinite(Number(ms))) return "unknown";
  return new Date(Number(ms)).toLocaleString();
}

export function shortAddress(value: string | null | undefined, left = 6, right = 4): string {
  if (!value) return "unknown";
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

export function shortId(value: string | null | undefined): string {
  if (!value) return "unknown";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
