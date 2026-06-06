import { useState } from "react";
import { Check, Copy, Globe, Server, ExternalLink, RotateCcw, Save } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDualWallet } from "@/hooks/useDualWallet";
import { getApiBase, setApiBase } from "@/lib/api";

export default function Settings() {
  const [copied, setCopied] = useState(false);
  const [apiInput, setApiInput] = useState(getApiBase());
  const [isSaved, setIsSaved] = useState(false);
  const { evm, sui } = useDualWallet();

  const currentApiBase = getApiBase();

  const endpoints = [
    { label: "Search API", url: `${currentApiBase}/v1/search` },
    { label: "Health Check", url: `${currentApiBase}/healthz` },
    { label: "JSON Feed", url: `${currentApiBase}/v1/search?limit=24` },
  ];

  const copyApiUrl = () => {
    navigator.clipboard.writeText(currentApiBase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveApi = () => {
    setApiBase(apiInput);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
    // Force a reload to ensure all components use the new API base
    window.location.reload();
  };

  const handleResetApi = () => {
    setApiBase(null);
    setApiInput(getApiBase());
    window.location.reload();
  };

  return (
    <div>
      <TopBar title="Settings" />

      <div className="p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* API Configuration */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-slate-500" />
                <CardTitle className="text-base">API Configuration</CardTitle>
              </div>
              <CardDescription>
                Customize the Floe API endpoint the dashboard connects to.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label htmlFor="api-url">API Base URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="api-url"
                    value={apiInput}
                    onChange={(e) => setApiInput(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="http://localhost:3001"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyApiUrl}
                    title="Copy current URL"
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveApi}
                    className="flex-1 bg-slate-900 hover:bg-slate-800"
                    disabled={apiInput === currentApiBase && !isSaved}
                  >
                    {isSaved ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleResetApi}
                    className="flex-1"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset to Default
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <h4 className="mb-2 text-sm font-medium text-slate-700">Effective Endpoints</h4>
                <div className="space-y-2">
                  {endpoints.map((ep) => (
                    <div
                      key={ep.label}
                      className="flex items-center justify-between rounded-md bg-white p-2.5 shadow-sm border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-sm text-slate-700">{ep.label}</span>
                      </div>
                      <a
                        href={ep.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 font-mono text-[10px] text-blue-600 hover:underline"
                      >
                        {ep.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Wallet Status</CardTitle>
              <CardDescription>
                Active wallet providers available to the dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="font-semibold text-slate-800">EVM</p>
                <p className="mt-1">{evm.connected ? "Connected" : "Disconnected"}</p>
                <p className="mt-1 font-mono text-xs">{evm.address ?? "No EVM wallet connected"}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="font-semibold text-slate-800">Sui</p>
                <p className="mt-1">{sui.connected ? "Connected" : "Disconnected"}</p>
                <p className="mt-1 font-mono text-xs">{sui.address ?? "No Sui wallet connected"}</p>
              </div>
            </CardContent>
          </Card>

          {/* About */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About Floe Dashboard</CardTitle>
              <CardDescription>
                Cross-chain file storage dashboard for the hackathon
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  Floe is a decentralized file storage system that anchors file metadata across
                  multiple blockchains including Sui, Polygon, Base, Arbitrum, and others.
                </p>
                <p>
                  This dashboard provides a visual interface to browse uploads, inspect metadata,
                  trace anchor transactions, and analyze storage patterns.
                </p>
                <div className="mt-4 flex gap-4 text-xs text-slate-400">
                  <span>Dashboard v1.0</span>
                  <span>React + TypeScript</span>
                  <span>Tailwind CSS</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
