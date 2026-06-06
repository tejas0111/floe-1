import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useFiles } from "@/hooks/useFiles";
import TopBar from "@/components/TopBar";
import FilterBar from "@/components/FilterBar";
import FileCard from "@/components/FileCard";
import FileTable from "@/components/FileTable";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Table2 } from "lucide-react";
import UploadPanel from "@/components/uploads/UploadPanel";
import { useDashboardState } from "@/providers/dashboard-state";

export default function Uploads() {
  const location = useLocation();
  const navigate = useNavigate();
  const { ownerFilter, chainFilter, setOwnerFilter, setChainFilter } = useDashboardState();
  const { data, loading, error, refresh } = useFiles({
    owner: ownerFilter || undefined,
    chain: chainFilter || undefined,
    limit: 24,
  });
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");

  const handleSearch = () => refresh();
  const handleClear = () => {
    setOwnerFilter("");
    setChainFilter("");
  };

  const openFile = (nextFileId: string) => {
    navigate(`/uploads/${nextFileId}`, {
      state: {
        backgroundLocation: location,
        returnTo: `${location.pathname}${location.search}`,
        file: data.find((file) => file.fileId === nextFileId) ?? null,
      },
    });
  };

  return (
    <div>
      <TopBar title="Uploads" onRefresh={handleSearch} refreshing={loading} />

      <div className="space-y-6 p-8">
        <UploadPanel />

        {/* Filters */}
        <FilterBar
          owner={ownerFilter}
          chain={chainFilter}
          onOwnerChange={setOwnerFilter}
          onChainChange={setChainFilter}
          onSearch={handleSearch}
          onClear={handleClear}
        />

        {/* Toolbar */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {loading ? "Loading..." : `${data.length} upload${data.length !== 1 ? "s" : ""} found`}
          </p>
          <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-0.5">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setViewMode("table")}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="mt-4">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={handleSearch} />
          ) : data.length === 0 ? (
            <EmptyState
              title="No uploads found"
              description="Try adjusting your filters, connect a wallet, or upload a new file."
              actionLabel="Clear Filters"
              onAction={handleClear}
            />
          ) : viewMode === "table" ? (
            <FileTable
              files={data}
              selectedFileId={null}
              onSelectFile={(file) => openFile(file.fileId)}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.map((file) => (
                <FileCard
                  key={file.fileId}
                  file={file}
                  selected={false}
                  onSelect={() => openFile(file.fileId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
