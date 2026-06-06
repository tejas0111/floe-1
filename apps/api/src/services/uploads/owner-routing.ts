const SUI_ADDRESS_RE = /^(0x)?[0-9a-fA-F]{64}$/;
const EVM_ADDRESS_RE = /^(0x)?[0-9a-fA-F]{40}$/;
const DEFAULT_NATIVE_RECIPIENT = "0x49678aab11e001eb3cb2cbd9aa96b36dc2461a94";

function parseOptionalSuiAddressEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  if (!SUI_ADDRESS_RE.test(raw)) {
    throw new Error(`${name} must be a valid 32-byte Sui address`);
  }
  return `0x${raw.replace(/^0x/i, "").toLowerCase()}`;
}

export const DEFAULT_OWNER_ADDRESS = parseOptionalSuiAddressEnv("FLOE_DEFAULT_OWNER_ADDRESS");

export function normalizeSuiAddress(raw?: string | null): string | undefined {
  const value = raw?.trim();
  if (!value || !SUI_ADDRESS_RE.test(value)) return undefined;
  return `0x${value.replace(/^0x/i, "").toLowerCase()}`;
}

export function normalizeEvmAddress(raw?: string | null): string | undefined {
  const value = raw?.trim();
  if (!value || !EVM_ADDRESS_RE.test(value)) return undefined;
  return `0x${value.replace(/^0x/i, "").toLowerCase()}`;
}

export function resolveSuiFinalizeOwner(rawOwner?: string | null): string | undefined {
  return normalizeSuiAddress(rawOwner) ?? DEFAULT_OWNER_ADDRESS;
}

export function resolveNativeFinalizeRecipient(rawOwner?: string | null): string {
  return normalizeEvmAddress(rawOwner) ?? DEFAULT_NATIVE_RECIPIENT;
}
