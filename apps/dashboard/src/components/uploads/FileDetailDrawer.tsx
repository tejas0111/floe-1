import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  FileJson,
  Play,
  RotateCw,
  ScanSearch,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { FileRecord, ProvenanceRecord } from "@/types";
import { buildMetadataUrl, buildProvenanceUrl, buildStreamUrl, renewFile } from "@/lib/api";
import { formatBytes, formatDate, formatRelativeTime, truncateMiddle } from "@/lib/format";
import ChainBadge from "@/components/ChainBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWallet } from "@/hooks/useWallet";

interface FileDetailDrawerProps {
  open: boolean;
  fileId: string | null;
  file?: FileRecord | null;
  onOpenChange: (open: boolean) => void;
}

const RENEW_PRESETS = [1, 7, 30] as const;

export default function FileDetailDrawer({ open, fileId, file, onOpenChange }: FileDetailDrawerProps) {
  const { address } = useWallet();
  const [provenance, setProvenance] = useState<ProvenanceRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renewingEpoch, setRenewingEpoch] = useState<number | null>(null);
  const [customEpochs, setCustomEpochs] = useState("");
  const [renewedWalrusEndEpoch, setRenewedWalrusEndEpoch] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!fileId) {
        setProvenance(null);
        setError(null);
        setLoading(false);
        setRenewedWalrusEndEpoch(null);
        return;
      }

      setRenewedWalrusEndEpoch(null);
      setLoading(true);
      setError(null);

      try {
        const next = await fetchProvenance(fileId);
        if (!cancelled) {
          setProvenance(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load file details.");
          setProvenance(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (open) {
      void load();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [fileId, open]);

  const merged = useMemo(() => {
    const next = provenance ?? null;
    if (!file && !next) return null;

    return {
      fileId: fileId ?? file?.fileId ?? next?.fileId ?? null,
      filename: file?.filename ?? next?.filename ?? null,
      blobId: file?.blobId ?? next?.blobId ?? null,
      blobObjectId: file?.blobObjectId ?? next?.blobObjectId ?? null,
      ownerAddress: file?.ownerAddress ?? next?.ownerAddress ?? null,
      targetChain: file?.targetChain ?? next?.targetChain ?? null,
      anchorTxId: file?.anchorTxId ?? next?.anchorTxId ?? null,
      sizeBytes: file?.sizeBytes ?? next?.sizeBytes ?? null,
      mimeType: file?.mimeType ?? next?.mimeType ?? null,
      walrusEndEpoch: renewedWalrusEndEpoch ?? file?.walrusEndEpoch ?? next?.walrusEndEpoch ?? null,
      createdAtMs: file?.createdAtMs ?? next?.createdAtMs ?? null,
      updatedAtMs: file?.updatedAtMs ?? file?.createdAtMs ?? next?.createdAtMs ?? null,
      explorerUrl: next?.explorerUrl ?? null,
    };
  }, [file, fileId, provenance, renewedWalrusEndEpoch]);

  if (!fileId) return null;

  const statusLabel = merged?.anchorTxId ? "Anchored" : "Pending";
  const statusTone = merged?.anchorTxId ? "success" : "warning";
  const previewType = merged?.mimeType ?? "application/octet-stream";
  const streamUrl = buildStreamUrl(fileId);
  const metadataUrl = buildMetadataUrl(fileId);
  const provenanceUrl = buildProvenanceUrl(fileId);
  const explorerUrl = merged?.explorerUrl;
  const title = merged?.filename ?? `Upload ${truncateMiddle(fileId, 8, 6)}`;
  const owner = merged?.ownerAddress ?? "public";
  const isExpired = provenance?.expiryStatus?.isExpired;
  const canRenew = Boolean(merged?.blobObjectId);
  const renewHint = address
    ? `Renewal uses the connected wallet at ${truncateMiddle(address, 8, 6)}.`
    : "Connect the owner wallet to renew this asset.";
  const renewUnavailableReason = canRenew
    ? null
    : "Walrus renewal is unavailable because this file does not expose a blob object ID yet.";
  const renewStateLabel = renewingEpoch
    ? `Renewing for ${renewingEpoch} epoch${renewingEpoch === 1 ? "" : "s"}...`
    : renewedWalrusEndEpoch
      ? `Renewed to Epoch ${renewedWalrusEndEpoch}`
      : isExpired
        ? "Expired"
        : "Ready";

  const actions = [
    { label: "Metadata JSON", href: metadataUrl, icon: FileJson },
    { label: "Stream", href: streamUrl, icon: Play },
    { label: "Provenance", href: provenanceUrl, icon: ScanSearch },
    { label: "Explorer", href: explorerUrl, icon: ArrowUpRight },
  ] as const;

  async function handleRenew(epochs: number) {
    if (!fileId) return;

    setRenewingEpoch(epochs);
    try {
      const result = await renewFile({
        fileId,
        epochs,
        blobObjectId: merged?.blobObjectId ?? null,
        headers: address
          ? {
              "x-owner-address": address,
              "x-wallet-address": address,
            }
          : {},
      });

      toast.success(`Renewed for ${epochs} epoch${epochs === 1 ? "" : "s"}.`);
      setError(null);
      setRenewedWalrusEndEpoch(result.walrusEndEpoch);
      setProvenance((current) =>
        current
          ? {
              ...current,
              walrusEndEpoch: result.walrusEndEpoch,
              blobObjectId: current.blobObjectId ?? merged?.blobObjectId ?? null,
            }
          : current
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to renew file.";
      toast.error(message);
      setError(message);
    } finally {
      setRenewingEpoch(null);
    }
  }

  async function handleCustomRenew() {
    const epochs = Number(customEpochs);
    if (!Number.isInteger(epochs) || epochs <= 0) {
      toast.error("Enter a valid renewal length in epochs.");
      return;
    }

    await handleRenew(epochs);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-full w-full max-w-none overflow-hidden rounded-none border-0 p-0 sm:h-[calc(100vh-1rem)] sm:w-[min(96vw,112rem)] sm:max-w-none sm:rounded-2xl sm:border sm:shadow-2xl"
      >
        <div className="flex h-full min-h-0 flex-col bg-background">
          <header className="sticky top-0 z-10 border-b border-border/70 bg-background px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ChainBadge chain={merged?.targetChain ?? null} />
                  {file?.source === "tatum-gateway" && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 ring-1 ring-inset ring-indigo-700/10">
                      Tatum
                    </span>
                  )}
                  <Badge variant={statusTone === "success" ? "secondary" : "outline"}>
                    {statusLabel}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-[11px] uppercase tracking-wide">
                    {previewType}
                  </Badge>
                </div>

                <div className="min-w-0">
                  <DialogTitle className="truncate text-xl leading-tight font-semibold">
                    {title}
                  </DialogTitle>
                  <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-mono">{truncateMiddle(fileId, 10, 8)}</span>
                    <span>Owner {truncateMiddle(owner, 8, 6)}</span>
                  </DialogDescription>
                </div>
              </div>

              <DialogClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close details">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-5 p-5 sm:p-6 lg:p-8">
              {loading ? (
                <section className="rounded-2xl border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
                  Loading file details...
                </section>
              ) : null}

              {error ? (
                <section className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
                  {error}
                </section>
              ) : null}

              <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Details</h3>
                    <p className="text-xs text-muted-foreground">
                      Core file metadata and chain state.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(merged?.sizeBytes)}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="Created" value={formatDate(merged?.createdAtMs)} />
                  <InfoTile label="Updated" value={formatRelativeTime(merged?.updatedAtMs)} />
                  <InfoTile label="Anchor" value={merged?.anchorTxId ?? "Pending"} mono />
                  <InfoTile
                    label="Walrus"
                    value={
                      merged?.walrusEndEpoch !== null && merged?.walrusEndEpoch !== undefined
                        ? isExpired
                          ? `Epoch ${merged.walrusEndEpoch} (Expired)`
                          : `Epoch ${merged.walrusEndEpoch}`
                        : "—"
                    }
                  />
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(24rem,0.9fr)]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground">Provenance</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ownership, blob linkage, and the chain anchor for this asset.
                    </p>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <DetailRow label="File ID" value={fileId} mono />
                      <DetailRow label="Blob ID" value={merged?.blobId ?? "—"} mono />
                      <DetailRow label="Blob Object" value={merged?.blobObjectId ?? "—"} mono />
                      <DetailRow label="Owner" value={owner} mono />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Open the asset in external views.
                    </p>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {actions.map((action) => {
                        const Icon = action.icon;
                        const disabled = !action.href;
                        return (
                          <Button
                            key={action.label}
                            variant="outline"
                            size="sm"
                            className="justify-start gap-2"
                            disabled={disabled}
                            onClick={() => {
                              if (!action.href) return;
                              window.open(action.href, "_blank", "noopener,noreferrer");
                            }}
                          >
                            <Icon className="h-4 w-4" />
                            {action.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background p-5 shadow-sm lg:sticky lg:top-6 self-start">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Renewal</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Extend Walrus storage without leaving the inspector.
                      </p>
                    </div>

                    {!canRenew ? (
                      <Button variant="secondary" size="sm" className="gap-1.5" disabled>
                        <RotateCw className="h-4 w-4" />
                        Renew unavailable
                      </Button>
                    ) : null}
                  </div>

                  {canRenew ? (
                    <>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {RENEW_PRESETS.map((epochs) => (
                          <Button
                            key={epochs}
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            disabled={renewingEpoch !== null}
                            onClick={() => void handleRenew(epochs)}
                          >
                            <RotateCw className="h-4 w-4" />
                            {epochs} epoch{epochs === 1 ? "" : "s"}
                          </Button>
                        ))}
                      </div>

                      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Custom
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Enter a renewal length in epochs.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={53}
                              inputMode="numeric"
                              value={customEpochs}
                              onChange={(event) => setCustomEpochs(event.target.value)}
                              placeholder="Epochs"
                              className="w-28"
                            />
                            <Button
                              variant="default"
                              size="sm"
                              disabled={renewingEpoch !== null}
                              onClick={() => void handleCustomRenew()}
                            >
                              Renew
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <p>{renewHint}</p>
                    {renewUnavailableReason ? (
                      <p className="text-xs text-amber-600">{renewUnavailableReason}</p>
                    ) : null}
                    <DetailRow
                      label="Renew state"
                      value={renewStateLabel}
                    />
                    <DetailRow
                      label="Expires"
                      value={
                        merged?.walrusEndEpoch !== null && merged?.walrusEndEpoch !== undefined
                          ? isExpired
                            ? `Epoch ${merged.walrusEndEpoch} (Expired)`
                            : `Epoch ${merged.walrusEndEpoch}`
                          : "—"
                      }
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoTile({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-sm font-medium text-foreground ${mono ? "font-mono break-all" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className={`mt-1 text-sm text-foreground ${mono ? "font-mono break-all" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

async function fetchProvenance(fileId: string): Promise<ProvenanceRecord> {
  const response = await fetch(buildProvenanceUrl(fileId));
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Failed to load provenance (${response.status})`);
  }

  return (await response.json()) as ProvenanceRecord;
}
