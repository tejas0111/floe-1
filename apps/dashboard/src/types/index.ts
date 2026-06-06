export interface FileRecord {
  fileId: string;
  blobId?: string | null;
  blobObjectId?: string | null;
  checksum?: string | null;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  owner?: string | null;
  ownerAddress: string | null;
  walrusEndEpoch?: number | null;
  targetChain: string | null;
  anchorTxId: string | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  source?: string;
  rpcProvider?: string;
}

export interface FeedResponse {
  data: FileRecord[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface ChainConfig {
  label: string;
  color: string;
  bgColor: string;
  explorer: string;
}

export interface ProvenanceRecord {
  fileId: string;
  filename: string | null;
  blobId: string | null;
  blobObjectId: string | null;
  ownerAddress: string | null;
  targetChain: string | null;
  anchorTxId: string | null;
  explorerUrl: string | null;
  metadataUrl: string;
  streamUrl: string;
  sizeBytes: number | null;
  mimeType: string | null;
  walrusEndEpoch: number | null;
  expiryStatus?: {
    currentEpoch: number;
    endEpoch: number;
    epochsRemaining: number;
    isExpired: boolean;
  } | null;
  createdAtMs: number | null;
}

export interface UploadCreateResponse {
  uploadId: string;
  totalChunks?: number;
  chunkSize?: number;
}

export interface UploadStatusResponse {
  uploadId: string;
  status: string;
  fileId?: string;
  blobId?: string;
  pollAfterMs?: number;
  error?: string;
  [key: string]: unknown;
}

export interface RenewFileResponse {
  success: boolean;
  fileId: string;
  walrusEndEpoch: number;
}

export interface WalletViewState {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  label?: string | null;
  chainName?: string | null;
}

export interface StatItem {
  label: string;
  value: string | number;
  change?: string;
  icon: string;
}
