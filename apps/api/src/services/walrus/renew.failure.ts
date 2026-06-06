export type WalrusRenewFailure = {
  statusCode: 404 | 503;
  code: "FILE_BLOB_UNAVAILABLE" | "DEPENDENCY_UNAVAILABLE" | "RENEWAL_FAILED";
  message: string;
  retryable: boolean;
};

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

export function classifyWalrusRenewFailure(detail: string): WalrusRenewFailure | null {
  const cleaned = stripAnsi(String(detail ?? ""));
  const lower = cleaned.toLowerCase();

  if (lower.includes("older than 30 days") || lower.includes("please update to the latest version")) {
    return {
      statusCode: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Walrus CLI is outdated. Update the Walrus client and retry.",
      retryable: true,
    };
  }

  if (
    lower.includes("error checking transaction input objects") ||
    lower.includes("input objects are invalid") ||
    lower.includes('"code":"notexists"')
  ) {
    return {
      statusCode: 404,
      code: "FILE_BLOB_UNAVAILABLE",
      message: "Walrus blob object is no longer available. Renew cannot proceed until the asset is re-certified.",
      retryable: false,
    };
  }

  return null;
}
