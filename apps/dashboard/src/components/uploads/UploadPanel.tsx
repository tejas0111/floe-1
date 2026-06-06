import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Settings, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { dashboardChainOptions, publicUploadLimitBytes, walletUploadLimitBytes } from "@/lib/upload";
import { formatBytes } from "@/lib/format";
import { useUploadController } from "@/hooks/useUploadController";

export default function UploadPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controller = useUploadController();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="h-4 w-4" />
          Upload And Anchor
        </CardTitle>
        <CardDescription>
          Primary demo flow for Ethereum Sepolia and Sui wallet-aware uploads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-600">Mode</span>
            <select
              value={controller.uploadMode}
              onChange={(event) =>
                controller.setUploadMode(event.target.value as "public" | "wallet")
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="public">Public upload</option>
              <option value="wallet">Wallet upload</option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-600">Target chain</span>
            <select
              value={controller.uploadChain}
              onChange={(event) => controller.setUploadChain(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {dashboardChainOptions
                .filter((option) => option.value)
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm xl:col-span-2">
            <span className="font-medium text-slate-600">Owner address</span>
            <Input
              value={controller.uploadOwner}
              onChange={(event) => controller.setUploadOwner(event.target.value)}
              placeholder="Wallet address for wallet mode"
              className="font-mono"
            />
          </label>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-slate-600">File</span>
          <Input
            ref={fileInputRef}
            type="file"
            onChange={() => controller.reset()}
          />
        </label>

        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {controller.uploadMode === "wallet" ? (
            controller.defaultWalletOwner ? (
              <span>Using connected wallet when the owner field is empty.</span>
            ) : (
              <span>Connect an EVM or Sui wallet, or paste an owner address for wallet mode.</span>
            )
          ) : (
            <div className="flex flex-col gap-1">
              <span>
                Public cap {formatBytes(publicUploadLimitBytes)} • Wallet cap{" "}
                {formatBytes(walletUploadLimitBytes)}
              </span>
              <div className="mt-1 flex items-center gap-2 border-t border-slate-200 pt-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                <span>Saving ~98% vs on-chain blob storage via Walrus.</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-slate-500 hover:text-slate-900"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            <Settings className="mr-2 h-3.5 w-3.5" />
            Advanced settings
            <ChevronDown
              className={`ml-2 h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
          </Button>

          {showAdvanced && (
            <div className="grid gap-4 rounded-lg border border-slate-100 bg-slate-50/50 p-4 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-600">Walrus Epochs</span>
                <Input
                  type="number"
                  min={1}
                  value={controller.uploadEpochs}
                  onChange={(e) => controller.setUploadEpochs(Number(e.target.value))}
                  placeholder="Storage duration in epochs"
                />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium text-slate-600">Chunk Size (KB)</span>
                <Input
                  type="number"
                  min={512}
                  max={10240}
                  value={controller.uploadChunkSize}
                  onChange={(e) => controller.setUploadChunkSize(Number(e.target.value))}
                  placeholder="Upload chunk size in KB"
                />
              </label>
              <label className="space-y-1.5 text-sm md:col-span-2">
                <span className="font-medium text-slate-600">Custom Checksum (SHA256 Hex)</span>
                <Input
                  value={controller.uploadChecksum}
                  onChange={(e) => controller.setUploadChecksum(e.target.value)}
                  placeholder="Optional 64-char hex string"
                  className="font-mono"
                />
              </label>
              <label className="space-y-1.5 text-sm md:col-span-2">
                <span className="font-medium text-slate-600">Floe Server Endpoint</span>
                <Input
                  value={controller.uploadApiBase}
                  onChange={(e) => controller.setUploadApiBase(e.target.value)}
                  placeholder="http://localhost:3001"
                  className="font-mono"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => controller.submit(fileInputRef.current?.files?.[0] ?? null)}
            disabled={controller.uploadBusy}
            className="bg-slate-900 hover:bg-slate-800"
          >
            {controller.uploadBusy ? "Uploading..." : "Upload and anchor"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              controller.reset();
              controller.setUploadOwner("");
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            disabled={controller.uploadBusy}
          >
            Reset
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{controller.uploadMessage}</span>
            <span className="font-mono">{controller.uploadMeta}</span>
          </div>
          <Progress value={controller.uploadProgress} />
        </div>

        {controller.uploadError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload failed</AlertTitle>
            <AlertDescription>{controller.uploadError}</AlertDescription>
          </Alert>
        ) : null}

        {controller.latestCompletedFileId ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <AlertTitle>Asset anchored for the live proof flow</AlertTitle>
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-mono text-xs break-all">{controller.latestCompletedFileId}</p>
                <div className="flex flex-wrap gap-2">
                  {controller.latestMetadataUrl ? (
                    <Button asChild size="sm" variant="secondary">
                      <a href={controller.latestMetadataUrl} target="_blank" rel="noreferrer">
                        Metadata JSON
                      </a>
                    </Button>
                  ) : null}
                  {controller.latestProvenanceUrl ? (
                    <Button asChild size="sm" variant="secondary">
                      <a href={controller.latestProvenanceUrl} target="_blank" rel="noreferrer">
                        Provenance JSON
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
