import { useEffect, useState } from "react";
import { ArrowUpRight, FileJson, MoreHorizontal, Play, ScanSearch } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import type { FileRecord, ProvenanceRecord } from "@/types";
import {
  buildMetadataUrl,
  buildProvenanceUrl,
  buildStreamUrl,
  getProvenance,
} from "@/lib/api";
import { chainLabel, explorerUrl } from "@/lib/chains";
import { formatBytes, formatDate, truncateMiddle } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function LatestAssetPanel({ file }: { file: FileRecord | null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [provenance, setProvenance] = useState<ProvenanceRecord | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!file?.fileId) {
        setProvenance(null);
        return;
      }

      try {
        const next = await getProvenance(file.fileId);
        if (!cancelled) setProvenance(next);
      } catch {
        if (!cancelled) setProvenance(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [file?.fileId]);

  const metadataUrl = file?.fileId ? buildMetadataUrl(file.fileId) : null;
  const provenanceUrl = file?.fileId ? buildProvenanceUrl(file.fileId) : null;
  const streamUrl = file?.fileId ? buildStreamUrl(file.fileId) : null;
  const txUrl = file ? explorerUrl(file.targetChain, file.anchorTxId) : null;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Latest Minted Asset</CardTitle>
        <CardDescription>
          Main proof surface for explorer, provenance, metadata, and streamed file access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {file ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Detail label="File" value={file.filename ?? truncateMiddle(file.fileId, 8, 6)} />
              <Detail label="Owner" value={file.ownerAddress ? truncateMiddle(file.ownerAddress, 8, 6) : "public"} mono />
              <Detail label="Chain" value={chainLabel(file.targetChain)} />
              <Detail label="Size" value={formatBytes(file.sizeBytes)} />
              <Detail label="Created" value={formatDate(file.createdAtMs)} />
              <Detail label="Status" value={file.anchorTxId ? "Anchored" : "Pending"} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {file?.fileId ? (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() =>
                    navigate(`/uploads/${encodeURIComponent(file.fileId)}`, {
                      state: {
                        backgroundLocation: location,
                        returnTo: `${location.pathname}${location.search}`,
                        file,
                      },
                    })
                  }
                >
                  Inspect asset
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={!file?.fileId}>
                    <MoreHorizontal className="h-4 w-4" />
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Open as</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {metadataUrl ? (
                    <DropdownMenuItem onSelect={() => openExternal(metadataUrl)}>
                      <FileJson className="h-4 w-4" />
                      Metadata JSON
                    </DropdownMenuItem>
                  ) : null}
                  {streamUrl ? (
                    <DropdownMenuItem onSelect={() => openExternal(streamUrl)}>
                      <Play className="h-4 w-4" />
                      Stream
                    </DropdownMenuItem>
                  ) : null}
                  {provenanceUrl ? (
                    <DropdownMenuItem onSelect={() => openExternal(provenanceUrl)}>
                      <ScanSearch className="h-4 w-4" />
                      Provenance
                    </DropdownMenuItem>
                  ) : null}
                  {txUrl ? (
                    <DropdownMenuItem onSelect={() => openExternal(txUrl)}>
                      <ArrowUpRight className="h-4 w-4" />
                      Explorer
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {provenance ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Provenance snapshot</p>
                <p className="mt-1 font-mono text-xs break-all">
                  {provenance.anchorTxId ?? provenance.fileId}
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            Upload on Ethereum Sepolia or Sui wallet mode to focus the dashboard on the newest asset.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-sm text-slate-700 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
