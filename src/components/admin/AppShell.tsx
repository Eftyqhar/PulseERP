import { type ReactNode, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Tags,
  Bookmark,
  Boxes,
  SlidersHorizontal,
  Truck,
  ClipboardList,
  History,
  ShoppingCart,
  Undo2,
  TrendingUp,
  Receipt,
  PiggyBank,
  LineChart,
  Calculator,
  BarChart3,
  FileText,
  Bell,
  ScrollText,
  Users,
  Settings,
  Wallet,
  Search,
  LogOut,
  Menu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Lightbulb,
  Landmark,
  HandCoins,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDbValue } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Inventory",
    items: [
      { to: "/inventory/products", label: "Products", icon: Package },
      { to: "/inventory/categories", label: "Categories", icon: Tags },
      { to: "/inventory/brands", label: "Brands", icon: Bookmark },
      { to: "/inventory/stock", label: "Stock", icon: Boxes },
      { to: "/inventory/stock-adjustment", label: "Stock Adjustment", icon: SlidersHorizontal },
      { to: "/wishlist", label: "Wishlist", icon: Lightbulb },
    ],
  },
  {
    label: "Purchases",
    items: [
      { to: "/purchases/suppliers", label: "Suppliers", icon: Truck },
      { to: "/purchases/orders", label: "Purchase Orders", icon: ClipboardList },
      { to: "/purchases/history", label: "Purchase History", icon: History },
    ],
  },
  {
    label: "Sales",
    items: [
      { to: "/orders", label: "Orders", icon: ShoppingCart },
      { to: "/orders/pre-orders", label: "Pre-Orders", icon: ClipboardList },
      { to: "/orders/deliveries", label: "Deliveries", icon: Truck },
      { to: "/orders/returns", label: "Returns", icon: Undo2 },
      { to: "/sellers", label: "Sellers", icon: Users },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/finance/revenue", label: "Revenue", icon: TrendingUp },
      { to: "/finance/expenses", label: "Expenses", icon: Receipt },
      { to: "/finance/expense-history", label: "Expense History", icon: History },
      { to: "/finance/investment", label: "Investment", icon: PiggyBank },
      { to: "/finance/funding-history", label: "Funding History", icon: History },
      { to: "/finance/loans", label: "Loans", icon: Landmark },
      { to: "/finance/loan-repayments", label: "Loan Repayments", icon: HandCoins },

      { to: "/finance/investors", label: "Investors", icon: Users },
      { to: "/finance/profit", label: "Profit", icon: LineChart },
      { to: "/finance/investor-profit", label: "Investors Profit", icon: TrendingUp },
      { to: "/finance/simulator", label: "Profit Simulator", icon: Calculator },
      { to: "/finance/remaining-funds", label: "Remaining Funds", icon: Wallet },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/notifications", label: "Notifications", icon: Bell },
      { to: "/audit-logs", label: "Audit Logs", icon: ScrollText },
      { to: "/admins", label: "Admins", icon: Users },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function useIsActive(path: string) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (path === "/dashboard") return pathname === "/dashboard";
  return pathname === path || pathname.startsWith(path + "/");
}

function SidebarNav({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <nav
      className={cn(
        "flex-1 overflow-y-auto scrollbar-thin py-4 space-y-6",
        collapsed ? "px-2" : "px-3",
      )}
    >
      {NAV.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <div className="px-3 mb-1.5 text-[11px] uppercase tracking-wider text-sidebar-foreground/55 font-medium">
              {group.label}
            </div>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <NavLink key={item.to} item={item} onNavigate={onNavigate} collapsed={collapsed} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavLink({
  item,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const active = useIsActive(item.to);
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={cn(
          "group flex items-center rounded-md transition-colors",
          collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2 text-sm",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        )}
      >
        <Icon
          className={cn(
            "size-[18px] shrink-0",
            active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/70",
          )}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </li>
  );
}

function Brand({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { value } = useDbValue<{ companyName?: string; logoUrl?: string }>("settings/company");
  const name = value?.companyName || "PulseERP";
  const logo = value?.logoUrl;
  return (
    <div
      className={cn(
        "flex items-center h-16 border-b border-sidebar-border shrink-0",
        collapsed ? "justify-center px-2" : "px-4 gap-2",
      )}
    >
      <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
        {logo ? (
          <img
            src={logo}
            alt={name}
            className="size-8 rounded-lg object-contain bg-muted shrink-0"
          />
        ) : (
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-semibold text-sm shrink-0">
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        {!collapsed && (
          <div className="leading-tight text-sidebar-foreground min-w-0">
            <div className="font-semibold text-sm tracking-tight truncate">{name}</div>
            <div className="text-[11px] text-sidebar-foreground/60">Internal admin</div>
          </div>
        )}
      </Link>
      {!collapsed && onToggle && (
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground shrink-0"
          onClick={onToggle}
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="size-4" />
        </Button>
      )}
      {collapsed && onToggle && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground shrink-0"
          onClick={onToggle}
          aria-label="Expand sidebar"
        >
          <ChevronRight className="size-4" />
        </Button>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  );
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
      }}
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials =
    (profile?.displayName || profile?.email || "A")
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "A";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-sidebar-border bg-sidebar">
        <Brand />
        <SidebarNav />
        <div className="p-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
          v1.0 · Production
        </div>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar">
          <Brand />
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 h-16 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="h-full px-4 md:px-6 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </Button>

            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search products, orders, suppliers…"
                className="pl-9 h-9 bg-muted/40 border-transparent focus-visible:bg-background"
              />
            </div>

            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" size="icon" asChild aria-label="Notifications">
                <Link to="/notifications">
                  <Bell className="size-4" />
                </Link>
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 pl-1.5 pr-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="hidden sm:flex flex-col items-start leading-tight">
                      <span className="text-xs font-medium">
                        {profile?.displayName || profile?.email}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {profile?.role === "super_admin" ? "Super Admin" : "Moderator"}
                      </span>
                    </span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col">
                    <span>{profile?.displayName || "Admin"}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {profile?.email}
                    </span>
                    <Badge variant="secondary" className="mt-1.5 w-fit text-[10px]">
                      {profile?.role === "super_admin" ? "Super Admin" : "Moderator"}
                    </Badge>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings className="size-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={useRouterState({ select: (s) => s.location.pathname })}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
