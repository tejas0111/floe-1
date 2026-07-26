import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { WalrusUploadLimits } from "../../../config/walrus.config.js";
import type { WalrusUploadParams, WalrusUploadResult } from "./types.js";

const execFileAsync = promisify(execFile);
const FETCH_TIMEOUT_MS = WalrusUploadLimits.timeoutMs;

const WALRUS_CLI_BIN = (process.env.FLOE_WALRUS_CLI_BIN ?? "walrus").trim();
const WALRUS_CLI_CONFIG = process.env.FLOE_WALRUS_CLI_CONFIG?.trim() || undefined;
const WALRUS_CLI_CONTEXT = process.env.FLOE_WALRUS_CLI_CONTEXT?.trim() || undefined;
const WALRUS_CLI_WALLET = process.env.FLOE_WALRUS_CLI_WALLET?.trim() || undefined;
const WALRUS_CLI_UPLOAD_RELAY = process.env.FLOE_WALRUS_CLI_UPLOAD_RELAY?.trim() || undefined;

export const MAX_WALRUS_BLOB_BYTES = 14_600_000_000;

export function resolveWalrusCliBin(): string {
  const binaryName = WALRUS_CLI_BIN;
  try {
    const resolved = execFileSync("which", [binaryName], { encoding: "utf8", timeout: 5000 }).trim();
    if (!resolved) throw new Error("empty");
    return resolved;
  } catch {
    throw new Error(`WALRUS_CLI_NOT_FOUND:${binaryName}`);
  }
}

export const resolvedCliBin = resolveWalrusCliBin();

function defaultWalrusCliConfigPath(): string | undefined {
  if (WALRUS_CLI_CONFIG) return WALRUS_CLI_CONFIG;

  if (process.env.FLOE_NETWORK === "testnet") {
    return path.join(os.homedir(), ".walrus", "client_config.yaml");
  }

  return undefined;
}

export function describeWalrusCliBackend() {
  return {
    cliBin: resolvedCliBin,
    cliConfig: defaultWalrusCliConfigPath() ?? null,
    cliContext: WALRUS_CLI_CONTEXT ?? null,
    cliWallet: WALRUS_CLI_WALLET ?? null,
    uploadRelay: WALRUS_CLI_UPLOAD_RELAY ?? null,
  };
}

export async function uploadToWalrusViaCli(
  params: WalrusUploadParams,
): Promise<WalrusUploadResult> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "floe-walrus-"), { mode: 0o700 });
  const tmpFile = path.join(tmpDir, `blob_${Date.now()}_${Math.random().toString(16).slice(2)}.bin`);

  try {
    const rs = params.streamFactory();
    const ws = createWriteStream(tmpFile);

    let bytesWritten = 0;
    // Readable streams don't expose content-length, so a Transform-based
    // approach is used to count bytes inline and enforce the size limit.
    const sizeCheck = new Transform({
      transform(chunk, _encoding, callback) {
        bytesWritten += chunk.length;
        if (bytesWritten > MAX_WALRUS_BLOB_BYTES) {
          callback(new Error(`WALRUS_BLOB_TOO_LARGE:exceeded ${MAX_WALRUS_BLOB_BYTES} bytes`));
          return;
        }
        callback(null, chunk);
      },
    });

    await pipeline(rs, sizeCheck, ws);

    const args = ["store", tmpFile, "--epochs", String(params.epochs)];
    const walrusConfig = defaultWalrusCliConfigPath();
    if (walrusConfig) args.push("--config", walrusConfig);
    if (WALRUS_CLI_CONTEXT) args.push("--context", WALRUS_CLI_CONTEXT);
    if (WALRUS_CLI_WALLET) args.push("--wallet", WALRUS_CLI_WALLET);
    if (WALRUS_CLI_UPLOAD_RELAY) args.push("--upload-relay", WALRUS_CLI_UPLOAD_RELAY);

    try {
      const { stdout, stderr } = await execFileAsync(resolvedCliBin, args, {
        timeout: FETCH_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });
      const out = `${stdout ?? ""}\n${stderr ?? ""}`;

      const blobId = out.match(/Blob ID:\s*([A-Za-z0-9_-]+)/)?.[1];
      const objectId =
        out.match(/Sui object ID:\s*(0x[0-9a-fA-F]+)/)?.[1] ??
        out.match(/Owned Blob registration object ID:\s*(0x[0-9a-fA-F]+)/)?.[1];
      const endEpochRaw = out.match(/Expiry epoch \(exclusive\):\s*(\d+)/)?.[1];
      const costRaw = out.match(/Cost \(excluding gas\):\s*([0-9]*\.?[0-9]+)/)?.[1];

      if (!blobId) {
        throw new Error(`WALRUS_CLI_PARSE_FAILED:${out.slice(0, 500)}`);
      }

      const source = /already available and certified within Walrus/i.test(out)
        ? "already_certified"
        : /\(\s*1\s+newly certified\s*\)/i.test(out)
          ? "newly_created"
          : "unknown";

      return {
        blobId,
        objectId,
        endEpoch: endEpochRaw ? Number(endEpochRaw) : undefined,
        cost: costRaw ? Number(costRaw) : undefined,
        source,
      };
    } catch (err: unknown) {
      const e = err as Record<string, unknown> | undefined;
      const msg = e?.stderr || e?.stdout || (err instanceof Error ? err.message : null) || "WALRUS_CLI_FAILED";
      throw new Error(`WALRUS_CLI_FAILED:${String(msg).slice(0, 1000)}`);
    }
  } finally {
    await fs.rm(tmpDir, { force: true, recursive: true }).catch(() => {});
  }
}
