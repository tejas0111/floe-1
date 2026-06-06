import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ConnectButton as RainbowConnectButton } from "@rainbow-me/rainbowkit/components";
import { useAccount } from "wagmi";
import { ConnectButton as SuiConnectButton, useCurrentAccount } from "@mysten/dapp-kit";

import { completeUpload, createUpload, getProvenance, getUploadStatus, listFiles, uploadChunk, type FileRecord, type ProvenanceRecord } from "./lib/api";
import { chainLabel, explorerUrlFromRecord, isPrimaryDemoChain, normalizeChain } from "./lib/chains";
import { formatBytes, formatDate, shortAddress, shortId } from "./lib/format";

const publicUploadLimitBytes = 5 * 1024 * 1024;
const walletUploadLimitBytes = 10 * 1024 * 1024;
const chainOptions = [
  { value: "", label: "All chains" },
  { value: "sui", label: "Sui" },
  { value: "eth_sepolia", label: "Ethereum Sepolia" },
  { value: "polygon", label: "Polygon" },
  { value: "base", label: "Base" },
  { value: "arbitrum", label: "Arbitrum" },
  { value: "optimism", label: "Optimism" },
  { value: "celo", label: "Celo" },
  { value: "avax", label: "Avalanche" },
  { value: "bsc", label: "BSC" },
  { value: "fantom", label: "Fantom" },
] as const;

function isVideoMime(mimeType: string | null | undefined): boolean {
  return String(mimeType ?? "").toLowerCase().startsWith("video/");
}

function isImageMime(mimeType: string | null | undefined): boolean {
  return String(mimeType ?? "").toLowerCase().startsWith("image/");
}

function buildFocusUrl(file: FileRecord): string {
  const url = new URL(window.location.href);
  if (file.ownerAddress) {
    url.searchParams.set("owner", file.ownerAddress);
  } else {
    url.searchParams.delete("owner");
  }
  if (file.targetChain) {
    url.searchParams.set("chain", file.targetChain);
  } else {
    url.searchParams.delete("chain");
  }
  return `${url.pathname}${url.search}`;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readChunkHash(blob: Blob): Promise<{ buffer: ArrayBuffer; sha256: string }> {
  const buffer = await blob.arrayBuffer();
  return { buffer, sha256: await sha256Hex(buffer) };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function initialFilters(): { owner: string; chain: string } {
  const searchParams = new URLSearchParams(window.location.search);
  return {
    owner: searchParams.get("owner") ?? "",
    chain: searchParams.get("chain") ?? "",
  };
}

function assetPreview(file: FileRecord | null, provenance: ProvenanceRecord | null) {
  const streamUrl = provenance?.streamUrl ?? (file ? `/api/files/${encodeURIComponent(file.fileId)}/stream` : "");
  if (!file) {
    return (
      <div className="hero-media hero-media-empty">
        <div>
          <p className="eyebrow">Latest Minted Asset</p>
          <h2 className="hero-empty-title">No minted asset yet</h2>
          <p className="hero-copy">
            Upload a file on Ethereum Sepolia to make this dashboard’s primary proof surface come alive.
          </p>
        </div>
      </div>
    );
  }

  if (isVideoMime(file.mimeType)) {
    return (
      <div className="hero-media hero-media-video">
        <video className="hero-video" controls preload="metadata" playsInline src={streamUrl}>
          Your browser does not support the video element.
        </video>
      </div>
    );
  }

  if (isImageMime(file.mimeType)) {
    return (
      <div className="hero-media hero-media-image">
        <img className="hero-image" src={streamUrl} alt={file.filename ?? file.fileId} />
      </div>
    );
  }

  return (
    <div className="hero-media hero-media-proof">
      <div className="hero-proof-surface">
        <p className="eyebrow">Proof Surface</p>
        <h2 className="hero-proof-title">{chainLabel(file.targetChain)} asset ready for provenance inspection.</h2>
        <p className="hero-copy">
          Use the action strip to open explorer, provenance, metadata, or the asset stream without leaving the page.
        </p>
      </div>
    </div>
  );
}

function EvmWalletCard({
  onUseAsFilter,
  onUseForUpload,
}: {
  onUseAsFilter: (address: string) => void;
  onUseForUpload: (address: string) => void;
}) {
  const { address, chain, isConnected } = useAccount();

  return (
    <section className="wallet-card">
      <div className="wallet-card-header">
        <div>
          <p className="eyebrow">EVM Wallet</p>
          <h3>RainbowKit + wagmi</h3>
        </div>
        <span className={`status-pill ${isConnected ? "status-pill-connected" : "status-pill-idle"}`}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="wallet-card-body">
        <RainbowConnectButton label="Connect EVM Wallet" />
        <div className="wallet-metadata">
          <div>
            <span className="wallet-label">Account</span>
            <span className="wallet-value">{isConnected ? shortAddress(address) : "No EVM wallet connected"}</span>
          </div>
          <div>
            <span className="wallet-label">Network</span>
            <span className="wallet-value">{chain?.name ?? "Ethereum Sepolia"}</span>
          </div>
        </div>
        {isConnected && address ? (
          <div className="wallet-actions">
            <button type="button" className="ghost-button" onClick={() => onUseAsFilter(address)}>
              Use as dashboard filter
            </button>
            <button type="button" className="ghost-button" onClick={() => onUseForUpload(address)}>
              Use in upload form
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SuiWalletCard({
  onUseAsFilter,
  onUseForUpload,
}: {
  onUseAsFilter: (address: string) => void;
  onUseForUpload: (address: string) => void;
}) {
  const currentAccount = useCurrentAccount();

  return (
    <section className="wallet-card">
      <div className="wallet-card-header">
        <div>
          <p className="eyebrow">Sui Wallet</p>
          <h3>@mysten/dapp-kit</h3>
        </div>
        <span className={`status-pill ${currentAccount ? "status-pill-connected" : "status-pill-idle"}`}>
          {currentAccount ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div className="wallet-card-body">
        <SuiConnectButton connectText="Connect Sui Wallet" />
        <div className="wallet-metadata">
          <div>
            <span className="wallet-label">Account</span>
            <span className="wallet-value">
              {currentAccount ? shortAddress(currentAccount.address) : "No Sui wallet connected"}
            </span>
          </div>
          <div>
            <span className="wallet-label">Label</span>
            <span className="wallet-value">{currentAccount?.label ?? "Sui account"}</span>
          </div>
        </div>
        {currentAccount?.address ? (
          <div className="wallet-actions">
            <button type="button" className="ghost-button" onClick={() => onUseAsFilter(currentAccount.address)}>
              Use as dashboard filter
            </button>
            <button type="button" className="ghost-button" onClick={() => onUseForUpload(currentAccount.address)}>
              Use in upload form
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HeroPanel({
  selectedFile,
  provenance,
  onInspect,
}: {
  selectedFile: FileRecord | null;
  provenance: ProvenanceRecord | null;
  onInspect: (fileId: string) => void;
}) {
  const explorerUrl = selectedFile ? explorerUrlFromRecord({ targetChain: selectedFile.targetChain, anchorTxId: selectedFile.anchorTxId }) : null;
  const metadataUrl = provenance?.metadataUrl ?? (selectedFile ? `/api/files/${encodeURIComponent(selectedFile.fileId)}/metadata.json` : null);
  const provenanceUrl = provenance?.fileId ? `/api/files/${encodeURIComponent(provenance.fileId)}/provenance` : null;
  const streamUrl = provenance?.streamUrl ?? (selectedFile ? `/api/files/${encodeURIComponent(selectedFile.fileId)}/stream` : null);
  const focusUrl = selectedFile ? buildFocusUrl(selectedFile) : "/";
  const isPrimary = isPrimaryDemoChain(selectedFile?.targetChain);

  return (
    <section className="panel hero-panel">
      <div className="hero-layout">
        <div className="hero-copy-column">
          <div className="badge-row">
            <span className="badge badge-accent">Latest Minted Asset</span>
            {isPrimary ? <span className="badge badge-success">Primary demo chain: Ethereum Sepolia</span> : null}
            <span className="badge badge-muted">{selectedFile ? chainLabel(selectedFile.targetChain) : "Waiting for mint"}</span>
          </div>

          <div className="hero-title-block">
            <p className="hero-eyebrow">Hackathon proof surface</p>
            <h1>{selectedFile?.filename ?? "No minted asset yet"}</h1>
            <p className="hero-copy">
              {selectedFile
                ? `Uploaded ${formatDate(selectedFile.createdAtMs)}. This asset is the primary proof object for explorer, provenance, metadata, and inline media playback.`
                : "Upload on Ethereum Sepolia to make the page focus on the latest asset, then use the portfolio and provenance surfaces to prove it."}
            </p>
          </div>

          {selectedFile ? (
            <div className="detail-grid">
              <div className="detail-tile">
                <span className="detail-label">Owner</span>
                <span className="detail-value mono">{selectedFile.ownerAddress ? shortAddress(selectedFile.ownerAddress, 8, 6) : "public"}</span>
              </div>
              <div className="detail-tile">
                <span className="detail-label">Size</span>
                <span className="detail-value">{formatBytes(selectedFile.sizeBytes)}</span>
              </div>
              <div className="detail-tile">
                <span className="detail-label">Status</span>
                <span className="detail-value">{selectedFile.anchorTxId ? "Anchored" : "Pending"}</span>
              </div>
              <div className="detail-tile">
                <span className="detail-label">Chain</span>
                <span className="detail-value">{chainLabel(selectedFile.targetChain)}</span>
              </div>
              <div className="detail-tile detail-tile-wide">
                <span className="detail-label">Anchor Tx</span>
                <span className="detail-value break-all">
                  {explorerUrl ? (
                    <a href={explorerUrl} target="_blank" rel="noreferrer">
                      {shortId(selectedFile.anchorTxId)}
                    </a>
                  ) : (
                    <span className="muted">Pending</span>
                  )}
                </span>
              </div>
              <div className="detail-tile">
                <span className="detail-label">Source</span>
                <span className="detail-value">{selectedFile.source ?? "Not surfaced"}</span>
              </div>
              <div className="detail-tile">
                <span className="detail-label">rpcProvider</span>
                <span className="detail-value">{selectedFile.rpcProvider ?? "Not surfaced"}</span>
              </div>
            </div>
          ) : null}

          <div className="action-row">
            {explorerUrl ? (
              <a className="primary-button" href={explorerUrl} target="_blank" rel="noreferrer">
                Open Explorer
              </a>
            ) : (
              <span className="primary-button primary-button-disabled">Explorer pending</span>
            )}
            {provenanceUrl ? (
              <a className="secondary-button" href={provenanceUrl} target="_blank" rel="noreferrer">
                Open Provenance
              </a>
            ) : null}
            {metadataUrl ? (
              <a className="secondary-button" href={metadataUrl} target="_blank" rel="noreferrer">
                View Metadata
              </a>
            ) : null}
            {selectedFile ? (
              <button type="button" className="secondary-button" onClick={() => onInspect(selectedFile.fileId)}>
                Inspect Provenance
              </button>
            ) : null}
            {focusUrl ? (
              <a className="secondary-button" href={focusUrl}>
                Search This Asset
              </a>
            ) : null}
            {streamUrl ? (
              <a className="secondary-button" href={streamUrl} target="_blank" rel="noreferrer">
                Open File
              </a>
            ) : null}
          </div>
        </div>

        <div className="hero-media-column">{assetPreview(selectedFile, provenance)}</div>
      </div>
    </section>
  );
}

function UploadPanel({
  dashboardOwner,
  dashboardChain,
  setDashboardOwner,
  setDashboardChain,
  onUploadComplete,
}: {
  dashboardOwner: string;
  dashboardChain: string;
  setDashboardOwner: (value: string) => void;
  setDashboardChain: (value: string) => void;
  onUploadComplete: (fileId: string, owner: string, chain: string) => void;
}) {
  const { address: evmAddress } = useAccount();
  const currentSuiAccount = useCurrentAccount();

  const [uploadMode, setUploadMode] = useState<"public" | "wallet">("public");
  const [uploadChain, setUploadChain] = useState<string>("eth_sepolia");
  const [uploadOwner, setUploadOwner] = useState<string>(dashboardOwner);
  const [uploadMessage, setUploadMessage] = useState<string>("Pick a file to upload.");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadMeta, setUploadMeta] = useState<string>("0%");
  const [uploadBusy, setUploadBusy] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<ReactNode>("No upload yet.");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUploadOwner((current) => (current ? current : dashboardOwner));
  }, [dashboardOwner]);

  const defaultWalletOwner = evmAddress ?? currentSuiAccount?.address ?? "";
  const uploadLimit = uploadMode === "wallet" ? walletUploadLimitBytes : publicUploadLimitBytes;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0] ?? null;
    const effectiveOwner = uploadOwner.trim() || defaultWalletOwner;
    const headers: Record<string, string> = {};

    if (uploadMode === "wallet") {
      if (!effectiveOwner) {
        setUploadMessage("Connect an EVM or Sui wallet, or paste an owner address first.");
        setUploadResult(<span className="error-text">Wallet mode requires an owner address.</span>);
        return;
      }
      headers["x-owner-address"] = effectiveOwner;
      headers["x-wallet-address"] = effectiveOwner;
    }

    if (!file) {
      setUploadMessage("Choose a file first.");
      setUploadResult(<span className="error-text">Choose a file first.</span>);
      return;
    }

    if (file.size > uploadLimit) {
      setUploadMessage("File exceeds the current demo cap.");
      setUploadResult(
        <span className="error-text">
          File exceeds the {formatBytes(uploadLimit)} {uploadMode} upload cap.
        </span>
      );
      return;
    }

    setUploadBusy(true);
    setUploadProgress(0);
    setUploadMeta("0%");
    setUploadMessage("Creating upload session...");
    setUploadResult(<span className="muted">Preparing upload...</span>);

    try {
      const chunkSize = Math.max(512 * 1024, Math.min(1024 * 1024, uploadLimit));
      const created = await createUpload(
        {
          uploadMode,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          chunkSize,
          epochs: 1,
          targetChain: uploadChain,
          ...(uploadMode === "wallet" && effectiveOwner ? { owner: effectiveOwner } : {}),
        },
        headers
      );

      const totalChunks = Math.max(1, Number(created.totalChunks ?? 1));
      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunkBlob = file.slice(start, end);
        const { buffer, sha256 } = await readChunkHash(chunkBlob);

        setUploadMessage(`Uploading chunk ${index + 1}/${totalChunks}...`);
        setUploadMeta(`${Math.round((index / totalChunks) * 100)}%`);
        await uploadChunk({
          uploadId: created.uploadId,
          index,
          chunk: new Blob([buffer], { type: file.type || "application/octet-stream" }),
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          headers,
          chunkSha256: sha256,
        });

        setUploadProgress(Math.round(((index + 1) / totalChunks) * 100));
        setUploadMeta(`${Math.round(((index + 1) / totalChunks) * 100)}%`);
      }

      setUploadMessage("Finalizing on chain...");
      let status = await completeUpload(created.uploadId, headers);
      let attempts = 0;
      while (status.status !== "completed" && attempts < 60) {
        attempts += 1;
        await delay(2000);
        status = await getUploadStatus(created.uploadId, headers);
        setUploadMessage(status.status === "finalizing" ? "Anchoring on chain..." : `Upload ${status.status}`);
      }

      if (status.status === "completed" && status.fileId) {
        setUploadProgress(100);
        setUploadMeta("100%");
        setUploadMessage("Upload finalized.");
        setUploadResult(
          <div className="upload-success">
            <div className="upload-success-title">Asset anchored for the live proof flow</div>
            <div className="upload-success-copy">The dashboard will refocus on the new asset now.</div>
            <div className="mono break-all">{status.fileId}</div>
            <div className="upload-success-links">
              <a className="pill-link" href={`/api/files/${encodeURIComponent(status.fileId)}/metadata.json`} target="_blank" rel="noreferrer">
                Metadata JSON
              </a>
              <a className="pill-link" href={`/api/files/${encodeURIComponent(status.fileId)}/provenance`} target="_blank" rel="noreferrer">
                Provenance JSON
              </a>
            </div>
          </div>
        );
        const focusedOwner = uploadMode === "wallet" ? effectiveOwner : "";
        setDashboardOwner(focusedOwner);
        setDashboardChain(uploadChain);
        onUploadComplete(status.fileId, focusedOwner, uploadChain);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      setUploadResult(
        <span className="muted">Upload submitted. Current status: {status.status || "finalizing"}</span>
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUploadMessage(message);
      setUploadResult(<span className="error-text">{message}</span>);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <section className="panel support-panel">
      <div className="support-stack">
        <div className="support-banner">
          <p className="eyebrow">Primary demo chain</p>
          <strong>Ethereum Sepolia</strong>
          <span>Default path for upload, proof, and judge demos.</span>
        </div>

        <div className="wallet-grid">
          <EvmWalletCard
            onUseAsFilter={(address) => {
              setDashboardOwner(address);
            }}
            onUseForUpload={(address) => setUploadOwner(address)}
          />
          <SuiWalletCard
            onUseAsFilter={(address) => {
              setDashboardOwner(address);
            }}
            onUseForUpload={(address) => setUploadOwner(address)}
          />
        </div>

        <section className="filter-card">
          <div className="filter-card-header">
            <div>
              <p className="eyebrow">Dashboard filters</p>
              <h3>Focus the portfolio</h3>
            </div>
            <button
              type="button"
              className="ghost-button ghost-button-tight"
              onClick={() => {
                setDashboardOwner("");
                setDashboardChain("");
              }}
            >
              Show all
            </button>
          </div>
          <div className="filter-grid">
            <label>
              <span>Owner</span>
              <input value={dashboardOwner} onChange={(event) => setDashboardOwner(event.target.value)} placeholder="0x owner address" className="text-input mono" />
            </label>
            <label>
              <span>Chain</span>
              <select value={dashboardChain} onChange={(event) => setDashboardChain(event.target.value)} className="text-input">
                {chainOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <form className="upload-card" onSubmit={handleSubmit}>
          <div className="upload-card-header">
            <div>
              <p className="eyebrow">Upload rail</p>
              <h3>Keep uploads obvious, but secondary to the hero</h3>
            </div>
          </div>

          <div className="upload-mode-banner">
            <span>Demo chain</span>
            <strong>Ethereum Sepolia</strong>
          </div>

          <div className="upload-grid">
            <label>
              <span>Mode</span>
              <select value={uploadMode} onChange={(event) => setUploadMode(event.target.value as "public" | "wallet")} className="text-input">
                <option value="public">Public upload</option>
                <option value="wallet">Wallet upload</option>
              </select>
            </label>
            <label>
              <span>Target chain</span>
              <select value={uploadChain} onChange={(event) => setUploadChain(event.target.value)} className="text-input">
                {chainOptions
                  .filter((option) => option.value)
                  .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="upload-file-label upload-file-label-wide">
              <span>File</span>
              <input id="tatum-upload-file" ref={(node) => {
                fileInputRef.current = node;
              }} type="file" className="file-input" />
            </label>
            <label className="upload-file-label upload-file-label-wide">
              <span>Owner</span>
              <input
                value={uploadOwner}
                onChange={(event) => setUploadOwner(event.target.value)}
                placeholder="Wallet address for wallet mode"
                className="text-input mono"
              />
            </label>
          </div>

          <div className="upload-help">
            <span>
              {uploadMode === "wallet"
                ? defaultWalletOwner
                  ? `Using connected ${evmAddress ? "EVM" : "Sui"} wallet when the owner field is empty.`
                  : "Paste an owner address or connect a wallet for wallet mode."
                : `Public cap ${formatBytes(publicUploadLimitBytes)} • Wallet cap ${formatBytes(walletUploadLimitBytes)}`}
            </span>
          </div>

          <div className="upload-actions">
            <button type="submit" className="primary-button" disabled={uploadBusy}>
              {uploadBusy ? "Uploading..." : "Upload and anchor"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={uploadBusy}
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
                setUploadMessage("Pick a file to upload.");
                setUploadProgress(0);
                setUploadMeta("0%");
                setUploadResult("No upload yet.");
              }}
            >
              Clear
            </button>
          </div>

          <div className="upload-progress-row">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
            <div className="upload-progress-meta">
              <span>{uploadMessage}</span>
              <span className="mono">{uploadMeta}</span>
            </div>
          </div>

          <div className="upload-result">{uploadResult}</div>
        </form>
      </div>
    </section>
  );
}

function PortfolioCard({
  file,
  selected,
  onSelect,
}: {
  file: FileRecord;
  selected: boolean;
  onSelect: (fileId: string) => void;
}) {
  const streamUrl = `/api/files/${encodeURIComponent(file.fileId)}/stream`;
  const explorerUrl = explorerUrlFromRecord({ targetChain: file.targetChain, anchorTxId: file.anchorTxId });
  const focusUrl = buildFocusUrl(file);

  return (
    <article className={`portfolio-card ${selected ? "portfolio-card-selected" : ""}`}>
      <button type="button" className="portfolio-card-select" onClick={() => onSelect(file.fileId)}>
        <div className="portfolio-card-top">
          <div>
            <div className="portfolio-card-badges">
              <span className="badge badge-accent">{chainLabel(file.targetChain)}</span>
              {isVideoMime(file.mimeType) ? <span className="badge badge-success">Video</span> : null}
            </div>
            <h3>{file.filename ?? shortId(file.fileId)}</h3>
            <p>{formatDate(file.createdAtMs)}</p>
          </div>
          <span className="inspect-chip">Inspect</span>
        </div>

        <div className="portfolio-preview">
          {isVideoMime(file.mimeType) ? (
            <video className="portfolio-preview-media" src={streamUrl} muted playsInline preload="metadata" />
          ) : isImageMime(file.mimeType) ? (
            <img className="portfolio-preview-media" src={streamUrl} alt={file.filename ?? file.fileId} />
          ) : (
            <div className="portfolio-preview-placeholder">
              <span>{shortId(file.fileId)}</span>
              <small>{file.mimeType}</small>
            </div>
          )}
        </div>

        <div className="portfolio-card-meta">
          <span className="mono">Owner: {file.ownerAddress ? shortAddress(file.ownerAddress) : "public"}</span>
          <span>Size: {formatBytes(file.sizeBytes)}</span>
          <span>{file.anchorTxId ? "Anchored" : "Pending"}</span>
        </div>
      </button>

      <div className="portfolio-card-actions">
        <a className="pill-link" href={focusUrl}>
          Focus
        </a>
        <a className="pill-link" href={streamUrl} target="_blank" rel="noreferrer">
          Open File
        </a>
        {explorerUrl ? (
          <a className="pill-link" href={explorerUrl} target="_blank" rel="noreferrer">
            Explorer
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ProvenanceInspector({
  selectedFile,
  provenance,
  loading,
  error,
  onSelect,
}: {
  selectedFile: FileRecord | null;
  provenance: ProvenanceRecord | null;
  loading: boolean;
  error: string | null;
  onSelect: (fileId: string) => void;
}) {
  const inspectorValue = provenance ? JSON.stringify(provenance, null, 2) : selectedFile ? "Loading provenance..." : "Click a provenance button to inspect a file.";
  const progression = useMemo(() => {
    if (!selectedFile) return [];
    return [
      { label: "Selected", active: true },
      { label: "Metadata JSON", active: Boolean(provenance?.metadataUrl) },
      { label: "Stream URL", active: Boolean(provenance?.streamUrl) },
      { label: "Explorer", active: Boolean(provenance?.explorerUrl) },
      { label: "Anchored", active: Boolean(selectedFile.anchorTxId) },
    ];
  }, [provenance, selectedFile]);

  return (
    <aside className="panel inspector-panel">
      <div className="inspector-header">
        <div>
          <p className="eyebrow">Provenance inspector</p>
          <h2>Selected asset proof</h2>
          <p className="muted">Inspect chain, blob, links, and raw provenance without leaving the dashboard.</p>
        </div>
        <span className="status-pill status-pill-connected">Live</span>
      </div>

      <div className="inspector-summary">
        <div className="detail-tile">
          <span className="detail-label">Selected</span>
          <span className="detail-value">{selectedFile ? selectedFile.filename ?? shortId(selectedFile.fileId) : "—"}</span>
        </div>
        <div className="detail-tile">
          <span className="detail-label">Chain</span>
          <span className="detail-value">{selectedFile ? chainLabel(selectedFile.targetChain) : "—"}</span>
        </div>
        <div className="detail-tile">
          <span className="detail-label">Owner</span>
          <span className="detail-value mono">{selectedFile?.ownerAddress ? shortAddress(selectedFile.ownerAddress, 8, 6) : "public"}</span>
        </div>
        <div className="detail-tile">
          <span className="detail-label">Status</span>
          <span className="detail-value">{selectedFile?.anchorTxId ? "Anchored" : "Pending"}</span>
        </div>
      </div>

      <div className="progression-row">
        {progression.map((step) => (
          <button
            key={step.label}
            type="button"
            className={`progression-chip ${step.active ? "progression-chip-active" : ""}`}
            onClick={() => selectedFile && onSelect(selectedFile.fileId)}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div className="provenance-shell">
        <pre className="provenance-panel">{loading && !provenance ? "Loading provenance..." : error ?? inspectorValue}</pre>
      </div>
    </aside>
  );
}

export default function App() {
  const [filters, setFilters] = useState(() => initialFilters());
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<ProvenanceRecord | null>(null);
  const [feedLoading, setFeedLoading] = useState<boolean>(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [provenanceLoading, setProvenanceLoading] = useState<boolean>(false);
  const [provenanceError, setProvenanceError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (filters.owner) {
      url.searchParams.set("owner", filters.owner);
    } else {
      url.searchParams.delete("owner");
    }
    if (filters.chain) {
      url.searchParams.set("chain", filters.chain);
    } else {
      url.searchParams.delete("chain");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [filters]);

  useEffect(() => {
    let active = true;
    setFeedLoading(true);
    setFeedError(null);
    listFiles({ owner: filters.owner, chain: filters.chain })
      .then((response) => {
        if (!active) return;
        setFiles(response.data ?? []);
        setSelectedFileId((current) => {
          if (current && response.data.some((file) => file.fileId === current)) {
            return current;
          }
          return response.data[0]?.fileId ?? null;
        });
      })
      .catch((error) => {
        if (!active) return;
        setFiles([]);
        setSelectedFileId(null);
        setFeedError(error instanceof Error ? error.message : "Failed to load feed.");
      })
      .finally(() => {
        if (active) {
          setFeedLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filters.owner, filters.chain, refreshTick]);

  useEffect(() => {
    let active = true;
    if (!selectedFileId) {
      setProvenance(null);
      setProvenanceError(null);
      return;
    }

    setProvenanceLoading(true);
    setProvenanceError(null);
    getProvenance(selectedFileId)
      .then((response) => {
        if (!active) return;
        setProvenance(response);
      })
      .catch((error) => {
        if (!active) return;
        setProvenance(null);
        setProvenanceError(error instanceof Error ? error.message : "Failed to load provenance.");
      })
      .finally(() => {
        if (active) {
          setProvenanceLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedFileId]);

  const selectedFile = useMemo(
    () => files.find((file) => file.fileId === selectedFileId) ?? files[0] ?? null,
    [files, selectedFileId]
  );
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + Number(file.sizeBytes || 0), 0), [files]);
  const chainCount = useMemo(() => new Set(files.map((file) => normalizeChain(file.targetChain))).size, [files]);
  const latestLabel = selectedFile ? selectedFile.filename ?? shortId(selectedFile.fileId) : "none";

  return (
    <div className="app-shell">
      <header className="panel app-header">
        <div className="header-copy">
          <p className="eyebrow">Tatum x Walrus proof dashboard</p>
          <h1>Hero asset first. Wallets and provenance stay visible.</h1>
          <p className="hero-copy">
            Replace the list-first surface with a dashboard that centers the latest minted asset, keeps EVM and Sui wallet connections separate, and preserves portfolio and provenance as supporting proof.
          </p>
        </div>
        <div className="header-stats">
          <div className="stat-card">
            <span>Assets</span>
            <strong>{files.length}</strong>
          </div>
          <div className="stat-card">
            <span>Portfolio Size</span>
            <strong>{formatBytes(totalBytes)}</strong>
          </div>
          <div className="stat-card">
            <span>Chains</span>
            <strong>{chainCount}</strong>
          </div>
          <div className="stat-card stat-card-accent">
            <span>Live Demo Chain</span>
            <strong>Ethereum Sepolia</strong>
          </div>
        </div>
      </header>

      <section className="top-grid">
        <HeroPanel
          selectedFile={selectedFile}
          provenance={provenance}
          onInspect={(fileId) => setSelectedFileId(fileId)}
        />

        <UploadPanel
          dashboardOwner={filters.owner}
          dashboardChain={filters.chain}
          setDashboardOwner={(owner) => setFilters((current) => ({ ...current, owner }))}
          setDashboardChain={(chain) => setFilters((current) => ({ ...current, chain }))}
          onUploadComplete={(fileId, owner, chain) => {
            setSelectedFileId(fileId);
            setFilters({ owner, chain });
            setRefreshTick((current) => current + 1);
          }}
        />
      </section>

      <main className="bottom-grid">
        <section className="panel portfolio-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Portfolio</p>
              <h2>Other minted and uploaded assets</h2>
              <p className="muted">
                Keep the broader portfolio visible, but lighter than the hero. This section proves the product has depth beyond a single transaction.
              </p>
            </div>
            <p className="latest-label">Latest: {latestLabel}</p>
          </div>

          {feedError ? <div className="error-banner">{feedError}</div> : null}
          {feedLoading ? <div className="loading-banner">Loading portfolio…</div> : null}

          <div className="portfolio-grid">
            {files.length > 0 ? (
              files.map((file) => (
                <PortfolioCard
                  key={file.fileId}
                  file={file}
                  selected={file.fileId === selectedFileId}
                  onSelect={(fileId) => setSelectedFileId(fileId)}
                />
              ))
            ) : (
              <div className="empty-state">
                No uploads yet. Connect a wallet or upload a file to populate the portfolio.
              </div>
            )}
          </div>
        </section>

        <ProvenanceInspector
          selectedFile={selectedFile}
          provenance={provenance}
          loading={provenanceLoading}
          error={provenanceError}
          onSelect={(fileId) => setSelectedFileId(fileId)}
        />
      </main>
    </div>
  );
}
