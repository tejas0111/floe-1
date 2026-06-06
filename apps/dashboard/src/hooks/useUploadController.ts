import { useMemo, useState } from "react";
import {
  completeUpload,
  createUpload,
  getUploadStatus,
  uploadChunk,
  buildMetadataUrl,
  buildProvenanceUrl,
  getApiBase,
  setApiBase,
} from "@/lib/api";
import { delay, publicUploadLimitBytes, readChunkHash, walletUploadLimitBytes } from "@/lib/upload";
import { useDashboardState } from "@/providers/dashboard-state";
import { useDualWallet } from "@/hooks/useDualWallet";
import { formatBytes } from "@/lib/format";

export function useUploadController() {
  const { evm, sui } = useDualWallet();
  const { focusUpload } = useDashboardState();
  const [uploadMode, setUploadMode] = useState<"public" | "wallet">("public");
  const [uploadChain, setUploadChain] = useState<string>("eth_sepolia");
  const [uploadOwner, setUploadOwner] = useState<string>("");
  const [uploadEpochs, setUploadEpochs] = useState<number>(1);
  const [uploadChunkSize, setUploadChunkSize] = useState<number>(1024); // KB
  const [uploadChecksum, setUploadChecksum] = useState<string>("");
  const [uploadApiBase, setUploadApiBase] = useState<string>(getApiBase());
  const [uploadMessage, setUploadMessage] = useState<string>("Pick a file to upload.");
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadMeta, setUploadMeta] = useState<string>("0%");
  const [uploadBusy, setUploadBusy] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [latestCompletedFileId, setLatestCompletedFileId] = useState<string | null>(null);

  const defaultWalletOwner = useMemo(() => evm.address ?? sui.address ?? "", [evm.address, sui.address]);
  const uploadLimit = uploadMode === "wallet" ? walletUploadLimitBytes : publicUploadLimitBytes;

  async function submit(file: File | null) {
    const effectiveOwner = uploadOwner.trim() || defaultWalletOwner;
    const headers: Record<string, string> = {};

    setUploadError(null);
    setLatestCompletedFileId(null);

    if (uploadMode === "wallet") {
      if (!effectiveOwner) {
        const message = "Connect an EVM or Sui wallet, or paste an owner address first.";
        setUploadMessage(message);
        setUploadError("Wallet mode requires an owner address.");
        return;
      }
      headers["x-owner-address"] = effectiveOwner;
      headers["x-wallet-address"] = effectiveOwner;
    }

    if (!file) {
      setUploadMessage("Choose a file first.");
      setUploadError("Choose a file first.");
      return;
    }

    if (file.size > uploadLimit) {
      setUploadMessage("File exceeds the current demo cap.");
      setUploadError(`File exceeds the ${formatBytes(uploadLimit)} ${uploadMode} upload cap.`);
      return;
    }

    setUploadBusy(true);
    setUploadProgress(0);
    setUploadMeta("0%");
    setUploadMessage("Creating upload session...");

    // Persist custom API base if changed in advanced settings
    if (uploadApiBase !== getApiBase()) {
      setApiBase(uploadApiBase);
    }

    try {
      const chunkSize = uploadChunkSize * 1024;
      const created = await createUpload(
        {
          uploadMode,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          chunkSize,
          epochs: uploadEpochs,
          checksum: uploadChecksum.trim() || undefined,
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

        setUploadMessage(`Phase 1: Walrus Storage (${index + 1}/${totalChunks})`);
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

      setUploadMessage("Phase 2: Tatum Multi-chain Anchor...");
      let status = await completeUpload(created.uploadId, headers);
      let attempts = 0;

      while (status.status !== "completed" && attempts < 60) {
        attempts += 1;
        await delay(Number(status.pollAfterMs ?? 2000));
        status = await getUploadStatus(created.uploadId, headers);
        setUploadMessage(
          status.status === "finalizing"
            ? "Phase 2: Anchoring metadata on chain..."
            : `Phase 2: ${status.status}`
        );
      }

      if (status.status === "completed" && status.fileId) {
        setUploadProgress(100);
        setUploadMeta("100%");
        setUploadMessage("Upload finalized.");
        setLatestCompletedFileId(status.fileId);
        focusUpload(status.fileId, uploadMode === "wallet" ? effectiveOwner : "", uploadChain);
        return;
      }

      setUploadMessage(`Upload submitted. Current status: ${status.status || "finalizing"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setUploadMessage(message);
      setUploadError(message);
    } finally {
      setUploadBusy(false);
    }
  }

  function reset() {
    setUploadProgress(0);
    setUploadMeta("0%");
    setUploadEpochs(1);
    setUploadChunkSize(1024);
    setUploadChecksum("");
    setUploadApiBase(getApiBase());
    setUploadMessage("Pick a file to upload.");
    setUploadError(null);
    setLatestCompletedFileId(null);
  }

  return {
    uploadMode,
    setUploadMode,
    uploadChain,
    setUploadChain,
    uploadOwner,
    setUploadOwner,
    uploadEpochs,
    setUploadEpochs,
    uploadChunkSize,
    setUploadChunkSize,
    uploadChecksum,
    setUploadChecksum,
    uploadApiBase,
    setUploadApiBase,
    uploadMessage,
    uploadProgress,
    uploadMeta,
    uploadBusy,
    uploadError,
    latestCompletedFileId,
    latestMetadataUrl: latestCompletedFileId ? buildMetadataUrl(latestCompletedFileId) : null,
    latestProvenanceUrl: latestCompletedFileId ? buildProvenanceUrl(latestCompletedFileId) : null,
    defaultWalletOwner,
    uploadLimit,
    submit,
    reset,
  };
}
