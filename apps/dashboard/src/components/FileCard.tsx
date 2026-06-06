import type { FileRecord } from "@/types";
import { formatBytes, formatRelativeTime, truncate } from "@/lib/format";
import ChainBadge from "./ChainBadge";
import { ArrowUpRight } from "lucide-react";

interface FileCardProps {
  file: FileRecord;
  selected?: boolean;
  onSelect?: (file: FileRecord) => void;
}

export default function FileCard({ file, selected = false, onSelect }: FileCardProps) {
  const openDetails = () => onSelect?.(file);

  return (
    <button
      type="button"
      onClick={openDetails}
      className={`group block w-full rounded-xl border bg-white p-5 text-left transition-all hover:border-slate-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 ${
        selected ? "border-slate-400 shadow-sm ring-2 ring-slate-900/10" : "border-gray-200"
      }`}
      aria-label={`Open details for ${file.filename ?? file.fileId}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ChainBadge chain={file.targetChain} />
            {file.source === "tatum-gateway" && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 ring-1 ring-inset ring-indigo-700/10">
                Tatum
              </span>
            )}
            <span className="text-xs text-slate-400">{file.mimeType ?? "application/octet-stream"}</span>
          </div>
          <h3 className="mt-2.5 truncate text-base font-semibold text-slate-900">
            {file.filename ?? `Upload ${truncate(file.fileId, 8)}`}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {formatRelativeTime(file.createdAtMs)}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Owner</p>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-700">
            {file.ownerAddress ?? "public"}
          </p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Size</p>
          <p className="mt-0.5 text-xs text-slate-700">{formatBytes(file.sizeBytes)}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">File ID</p>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-700">{file.fileId}</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Anchor</p>
          <p className="mt-0.5 truncate text-xs">
            {file.anchorTxId ? (
              <span className="font-mono text-slate-700">{file.anchorTxId}</span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                Pending
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5 font-medium text-slate-600">
          Open details <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
        <span className="font-mono text-slate-400">{truncate(file.fileId, 12)}</span>
      </div>
    </button>
  );
}
