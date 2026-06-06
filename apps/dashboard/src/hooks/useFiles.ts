import { useState, useEffect, useCallback } from "react";
import type { FileRecord, FeedResponse } from "@/types";
import { listFiles, normalizeFileRecord } from "@/lib/api";

function normalizeFeedResponse(json: FeedResponse): FeedResponse {
  return {
    ...json,
    data: (json.data ?? []).map(normalizeFileRecord),
  };
}

interface UseFilesOptions {
  owner?: string;
  chain?: string;
  limit?: number;
}

export function useFiles(options: UseFilesOptions = {}) {
  const [data, setData] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = normalizeFeedResponse(
        await listFiles({
          owner: options.owner,
          chain: options.chain,
          limit: options.limit ?? 24,
        })
      );
      setData(json.data.map(normalizeFileRecord));
      setNextCursor(json.nextCursor ?? null);
      setHasNextPage(json.hasNextPage ?? false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch";
      setError(message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [options.owner, options.chain, options.limit]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const refresh = useCallback(() => fetchFiles(), [fetchFiles]);

  return { data, loading, error, nextCursor, hasNextPage, refresh };
}

export function useSearchApi() {
  const [data, setData] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (owner?: string, chain?: string) => {
    setLoading(true);
    setError(null);
    try {
      const json = normalizeFeedResponse(
        await listFiles({
          owner,
          chain,
          limit: 24,
        })
      );
      setData(json.data.map(normalizeFileRecord));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch";
      setError(message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, search };
}
