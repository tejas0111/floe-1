import { ArrowUpRight } from "lucide-react";
import type { FileRecord } from "@/types";
import { formatBytes, formatRelativeTime, truncateMiddle } from "@/lib/format";
import ChainBadge from "./ChainBadge";

interface FileTableProps {
  files: FileRecord[];
  selectedFileId?: string | null;
  onSelectFile?: (file: FileRecord) => void;
}

export default function FileTable({ files, selectedFileId = null, onSelectFile }: FileTableProps) {
  if (files.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">File</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Chain</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Owner</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Size</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Anchor</th>
            <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">When</th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {files.map((file) => (
            <FileRow
              key={file.fileId}
              file={file}
              selected={selectedFileId === file.fileId}
              onSelectFile={onSelectFile}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileRow({
  file,
  selected = false,
  onSelectFile,
}: {
  file: FileRecord;
  selected?: boolean;
  onSelectFile?: (file: FileRecord) => void;
}) {
  const openDetails = () => onSelectFile?.(file);

  return (
    <tr
      className={`transition-colors hover:bg-gray-50/50 ${selected ? "bg-gray-50/80" : ""}`}
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetails();
        }
      }}
    >
      <td className="px-5 py-3">
        <div>
          <p className="font-medium text-slate-900">
            {file.filename ?? `Upload ${truncateMiddle(file.fileId, 6, 4)}`}
          </p>
          <p className="font-mono text-xs text-slate-400">{truncateMiddle(file.fileId, 10, 6)}</p>
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <ChainBadge chain={file.targetChain} />
          {file.source === "tatum-gateway" && (
            <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 ring-1 ring-inset ring-indigo-700/10" title="Source: Tatum Gateway">
              T
            </span>
          )}
        </div>
      </td>
      <td className="px-5 py-3 font-mono text-xs text-slate-600">
        {file.ownerAddress ? truncateMiddle(file.ownerAddress, 6, 4) : "public"}
      </td>
      <td className="px-5 py-3 text-xs text-slate-600">{formatBytes(file.sizeBytes)}</td>
      <td className="px-5 py-3">
        {file.anchorTxId ? (
          <span className="font-mono text-xs text-slate-600">{truncateMiddle(file.anchorTxId, 6, 4)}</span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            Pending
          </span>
        )}
      </td>
      <td className="px-5 py-3 text-xs text-slate-500">
        {formatRelativeTime(file.createdAtMs)}
      </td>
      <td className="px-5 py-3">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
          Open <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </td>
    </tr>
  );
}
