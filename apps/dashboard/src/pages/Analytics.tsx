import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useFiles } from "@/hooks/useFiles";
import { useWallet } from "@/hooks/useWallet";
import TopBar from "@/components/TopBar";
import StatCard from "@/components/StatCard";
import LoadingState from "@/components/LoadingState";
import ErrorState from "@/components/ErrorState";
import { Upload, HardDrive, Link2, CheckCircle } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { getChainConfig } from "@/lib/chains";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#0ea5e9", "#8b5cf6", "#2563eb", "#059669", "#ea580c", "#ca8a04", "#dc2626", "#4f46e5"];

export default function Analytics() {
  const { data, loading, error, refresh } = useFiles({ limit: 100 });
  const { address } = useWallet();
  const { data: myData } = useFiles(address ? { owner: address, limit: 100 } : { limit: 0 });

  const stats = useMemo(() => {
    const totalBytes = data.reduce((s, f) => s + (f.sizeBytes || 0), 0);
    const anchored = data.filter((f) => f.anchorTxId).length;
    const chains = new Set(data.map((f) => f.targetChain)).size;
    return { totalBytes, anchored, chains, total: data.length };
  }, [data]);

  const chainChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((f) => {
      const chain = f.targetChain ?? "unknown";
      counts[chain] = (counts[chain] || 0) + 1;
    });
    return Object.entries(counts).map(([chain, count]) => {
      const config = getChainConfig(chain);
      return { name: config.label, value: count };
    });
  }, [data]);

  const sizeChartData = useMemo(() => {
    const buckets: Record<string, number> = {
      "< 1 KB": 0,
      "1 KB - 1 MB": 0,
      "1 MB - 10 MB": 0,
      "10 MB+": 0,
    };
    data.forEach((f) => {
      const s = f.sizeBytes || 0;
      if (s < 1024) buckets["< 1 KB"]++;
      else if (s < 1024 * 1024) buckets["1 KB - 1 MB"]++;
      else if (s < 10 * 1024 * 1024) buckets["1 MB - 10 MB"]++;
      else buckets["10 MB+"]++;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [data]);

  return (
    <div>
      <TopBar title="Analytics" onRefresh={refresh} refreshing={loading} />

      <div className="p-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total" value={stats.total} icon={Upload} iconColor="#0ea5e9" iconBg="#e0f2fe" />
          <StatCard label="Data" value={formatBytes(stats.totalBytes)} icon={HardDrive} iconColor="#8b5cf6" iconBg="#ede9fe" />
          <StatCard label="Chains" value={stats.chains} icon={Link2} iconColor="#2563eb" iconBg="#dbeafe" />
          <StatCard label="Anchored" value={stats.anchored} icon={CheckCircle} iconColor="#059669" iconBg="#d1fae5" />
        </div>

        {loading ? (
          <div className="mt-6">
            <LoadingState />
          </div>
        ) : error ? (
          <div className="mt-6">
            <ErrorState message={error} onRetry={refresh} />
          </div>
        ) : data.length === 0 ? (
          <div className="mt-6 flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white text-sm text-slate-400">
            No data to analyze yet
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Chain Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Uploads by Chain</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={chainChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {chainChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap justify-center gap-3">
                  {chainChartData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      {entry.name} ({entry.value})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* File Size Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">File Size Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sizeChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Your Activity */}
            {address && myData.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Your Upload Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold text-slate-900">{myData.length}</p>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Uploads</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold text-slate-900">
                        {formatBytes(myData.reduce((s, f) => s + (f.sizeBytes || 0), 0))}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Size</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold text-slate-900">
                        {new Set(myData.map((f) => f.targetChain)).size}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Chains Used</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
