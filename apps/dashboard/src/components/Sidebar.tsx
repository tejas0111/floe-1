import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Files,
  BarChart3,
  Settings,
  Wallet,
  Layers,
} from "lucide-react";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/uploads", label: "Uploads", icon: Files },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
          <Layers className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900">Floe</h1>
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Main
        </p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-gray-50 hover:text-slate-900"
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: Wallet hint */}
      <div className="border-t border-gray-100 p-4">
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2.5">
          <Wallet className="h-4 w-4 text-slate-400" />
          <span className="text-xs text-slate-500">Connect EVM or Sui to filter and upload</span>
        </div>
      </div>
    </aside>
  );
}
