import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { Upload, HardDrive, Link2, Clock, ArrowRight, CheckCircle2, Activity, ShieldCheck, Zap } from "lucide-react";
import { useFiles } from "@/hooks/useFiles";
import { useWallet } from "@/hooks/useWallet";
import TopBar from "@/components/TopBar";
import StatCard from "@/components/StatCard";
import FileCard from "@/components/FileCard";
import FileTable from "@/components/FileTable";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { formatBytes, truncate } from "@/lib/format";
import LatestAssetPanel from "@/components/uploads/LatestAssetPanel";
import { useDashboardState } from "@/providers/dashboard-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Overview() {
  const { ownerFilter, chainFilter, latestUploadFileId } = useDashboardState();
  const location = useLocation();
  const { data, loading, error, refresh } = useFiles({
    owner: ownerFilter || undefined,
    chain: chainFilter || undefined,
    limit: 24,
  });
  const { address } = useWallet();
  const navigate = useNavigate();

  // Auto-filter by wallet if connected
  const { data: myFiles, loading: myLoading } = useFiles(
    address ? { owner: address, limit: 5 } : { limit: 0 }
  );

  const stats = useMemo(() => {
    const totalBytes = data.reduce((s, f) => s + (f.sizeBytes || 0), 0);
    const chains = new Set(data.map((f) => f.targetChain)).size;
    return {
      uploads: data.length,
      bytes: formatBytes(totalBytes),
      chains,
      latest: data[0]?.filename ?? data[0]?.fileId ?? "—",
    };
  }, [data]);

  const latestAsset =
    data.find((file) => file.fileId === latestUploadFileId) ??
    data[0] ??
    null;

  const openFile = (fileId: string) => {
    navigate(`/uploads/${fileId}`, {
      state: {
        backgroundLocation: location,
        returnTo: `${location.pathname}${location.search}`,
        file: data.find((file) => file.fileId === fileId) ?? null,
      },
    });
  };

  return (
    <div>
      <TopBar title="Overview" onRefresh={refresh} refreshing={loading} />

      <div className="space-y-8 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Overview</h1>
            <p className="text-slate-500 text-sm mt-1">Real-time status of your decentralized storage nodes.</p>
          </div>
          <div className="hidden sm:flex gap-3">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-700">Walrus Mainnet-Beta Ready</span>
             </div>
          </div>
        </div>

        {/* Hero Stats */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-slate-200 shadow-sm overflow-hidden relative border border-slate-100">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <HardDrive className="h-12 w-12 text-slate-900" />
            </div>
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Storage Quota</CardDescription>
              <CardTitle className="text-3xl font-bold text-slate-900">25.0 GB</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-900 rounded-full w-[65%]" />
                </div>
                <p className="text-[10px] text-slate-400">Used 16.2 GB of 25 GB tier</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm overflow-hidden relative border border-slate-100">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Zap className="h-12 w-12 text-slate-900" />
            </div>
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Node Latency</CardDescription>
              <CardTitle className="text-3xl font-bold text-slate-900">42ms</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-emerald-500" />
                <span className="text-[10px] text-emerald-600 font-medium">Optimal performance (Global)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm overflow-hidden relative bg-slate-900 text-white border-none">
            <div className="absolute top-0 right-0 p-4 opacity-10 text-white">
              <ShieldCheck className="h-12 w-12" />
            </div>
            <CardHeader className="pb-2">
              <CardDescription className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Anchor Security</CardDescription>
              <CardTitle className="text-3xl font-bold italic">Tatum L1+</CardTitle>
            </CardHeader>
            <CardContent>
               <p className="text-[10px] text-slate-400">Metadata anchored via Multi-Chain Gateway</p>
            </CardContent>
          </Card>
        </div>

        <LatestAssetPanel file={latestAsset} />

        {/* Winning Proposition */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-indigo-900">Walrus + Tatum Advantage</h2>
            <p className="mt-2 text-sm leading-relaxed text-indigo-700/80">
              Floe combines <span className="font-semibold">Walrus Decentralized Storage</span> with{" "}
              <span className="font-semibold">Tatum Multi-chain Provisioning</span>. Store once on
              Walrus, anchor anywhere via Tatum.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/80 p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  Storage Cost
                </p>
                <p className="text-lg font-bold text-indigo-600">~98% Saved</p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  Chains Supported
                </p>
                <p className="text-lg font-bold text-indigo-600">10+ via Tatum</p>
              </div>
            </div>
          </div>

          <div className="flex items-center rounded-2xl border border-emerald-100 bg-emerald-50/50 p-6 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-emerald-900">Storage Efficiency</h2>
              <p className="mt-2 text-sm leading-relaxed text-emerald-700/80">
                Traditional on-chain storage is too expensive for large files. Walrus provides
                high-throughput storage with Sui-backed certification, while Tatum handles the
                multi-chain provenance.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                Live proof of storage on Walrus Testnet
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Uploads"
            value={stats.uploads}
            icon={Upload}
            iconColor="#0ea5e9"
            iconBg="#e0f2fe"
          />
          <StatCard
            label="Data Size"
            value={stats.bytes}
            icon={HardDrive}
            iconColor="#8b5cf6"
            iconBg="#ede9fe"
          />
          <StatCard
            label="Chains"
            value={stats.chains}
            icon={Link2}
            iconColor="#2563eb"
            iconBg="#dbeafe"
          />
          <StatCard
            label="Latest"
            value={truncate(stats.latest, 12)}
            icon={Clock}
            iconColor="#d97706"
            iconBg="#fef3c7"
          />
        </div>

        {/* My Uploads (if wallet connected) */}
        {address && (
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                My Uploads
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => navigate("/uploads")}
              >
                View All <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            {myLoading ? (
              <div className="mt-3 text-sm text-slate-400">Loading...</div>
            ) : myFiles.length > 0 ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {myFiles.slice(0, 3).map((file) => (
                  <FileCard key={file.fileId} file={file} onSelect={() => openFile(file.fileId)} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No uploads yet"
                description="You haven't uploaded any files with this wallet."
              />
            )}
          </div>
        )}

        {/* Recent Uploads */}
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Recent Uploads
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => navigate("/uploads")}
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="mt-3">
              <LoadingState />
            </div>
          ) : error ? (
            <div className="mt-3">
              <ErrorState message={error} onRetry={refresh} />
            </div>
          ) : data.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No uploads yet"
                description="Uploads will appear here once files are anchored."
              />
            </div>
          ) : (
            <div className="mt-3">
              {/* Desktop: Table */}
              <div className="hidden lg:block">
                <FileTable files={data.slice(0, 6)} onSelectFile={(file) => openFile(file.fileId)} />
              </div>
              {/* Mobile: Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
                {data.slice(0, 6).map((file) => (
                  <FileCard key={file.fileId} file={file} onSelect={() => openFile(file.fileId)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
