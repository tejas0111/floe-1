import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}

export default function StatCard({ label, value, icon: Icon, iconColor, iconBg }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: iconBg }}
        >
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
        </div>
        <div>
          <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
