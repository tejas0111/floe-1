import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message = "Failed to load data", onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/30 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-100">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-red-800">Error loading data</h3>
      <p className="mt-1 max-w-xs text-sm text-red-600/70">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          Try Again
        </Button>
      )}
    </div>
  );
}
