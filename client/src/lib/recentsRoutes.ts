// Title + icon resolver for the RECENTS feature.
//
// Two layers:
//   1. Static map for known routes (e.g. /calculator → "Impact Calculator").
//   2. Pattern matcher for dynamic routes (/products/:id, /order-form/:id, ...).
//
// Skip-list paths are intentionally never tracked — onboarding / auth / share
// surfaces don't belong in a "where was I working" history.
import {
  Activity,
  BarChart3,
  Briefcase,
  Calculator,
  ClipboardCheck,
  Compass,
  FileCheck,
  FileText,
  Home,
  Info,
  Lightbulb,
  MessageCircle,
  Package,
  Phone,
  Settings,
  Shield,
  ShoppingCart,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type RecentEntry = {
  path: string;
  title: string;
  iconName: string;
  visitedAt: number;
};

export type RouteMeta = { title: string; icon: LucideIcon };

const STATIC_ROUTES: Record<string, RouteMeta> = {
  "/dashboard": { title: "Dashboard", icon: Home },
  "/profile": { title: "Profile", icon: User },
  "/cart": { title: "Project Cart", icon: ShoppingCart },
  "/projects": { title: "Projects", icon: Briefcase },
  "/start-new-project": { title: "Start New Project", icon: Lightbulb },
  "/site-survey": { title: "Site Survey", icon: ClipboardCheck },
  "/calculator": { title: "Impact Calculator", icon: Calculator },
  "/calculations-history": { title: "Calculations History", icon: Activity },
  "/pas13-compliance": { title: "PAS 13 Alignment", icon: Shield },
  "/communication-plan": { title: "Communication Plan", icon: MessageCircle },
  "/installation-timeline": { title: "Installation Timeline", icon: TrendingUp },
  "/install-teams": { title: "Install Teams", icon: Users },
  "/layout-drawing": { title: "Layout Drawing", icon: FileCheck },
  "/layout-drawings": { title: "Layout Drawings", icon: FileCheck },
  "/solution-finder": { title: "Solution Finder", icon: Compass },
  "/products": { title: "Products", icon: Package },
  "/case-studies": { title: "Case Studies", icon: FileText },
  "/resources": { title: "Resources", icon: FileText },
  "/about": { title: "About", icon: Info },
  "/contact": { title: "Contact", icon: Phone },
  "/help": { title: "Help Center", icon: Info },
  "/faqs": { title: "FAQs", icon: Info },
  "/analytics": { title: "Analytics", icon: BarChart3 },
  "/admin": { title: "Admin", icon: Shield },
  "/admin/dashboard": { title: "Admin Dashboard", icon: Shield },
  "/admin/orders": { title: "Admin: Orders", icon: ShoppingCart },
  "/admin/pas13-rules": { title: "Admin: PAS 13 Rules", icon: Settings },
  "/admin/email-log": { title: "Admin: Email Log", icon: Settings },
  "/admin/image-review": { title: "Admin: Image Review", icon: Settings },
};

// Paths the tracker silently skips — auth / onboarding / share / token
// landing pages are not useful as history entries.
const SKIP_PREFIXES = [
  "/reset-password",
  "/verify",
  "/complete-profile",
  "/admin/login",
  "/approve/",
  "/share/",
];

const DYNAMIC_ROUTES: Array<{
  match: (path: string) => boolean;
  meta: (path: string) => RouteMeta;
}> = [
  {
    match: (p) => /^\/products\/[^/]+/.test(p),
    meta: () => ({ title: "Product details", icon: Package }),
  },
  {
    match: (p) => /^\/order-form\/[^/]+/.test(p),
    meta: () => ({ title: "Order form", icon: ShoppingCart }),
  },
  {
    match: (p) => /^\/industry-case-studies\/[^/]+/.test(p),
    meta: (p) => {
      const slug = p.split("/").pop() || "";
      const pretty = slug
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return { title: `Case studies — ${pretty}`, icon: FileText };
    },
  },
];

const ICON_REGISTRY: Record<string, LucideIcon> = {
  Activity,
  BarChart3,
  Briefcase,
  Calculator,
  ClipboardCheck,
  Compass,
  FileCheck,
  FileText,
  Home,
  Info,
  Lightbulb,
  MessageCircle,
  Package,
  Phone,
  Settings,
  Shield,
  ShoppingCart,
  TrendingUp,
  User,
  Users,
};

export function shouldSkipRecents(path: string): boolean {
  if (!path || path === "/") return true;
  if (path.includes("?auth=")) return true;
  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function resolveRouteMeta(path: string): RouteMeta {
  const cleanPath = path.split("?")[0].split("#")[0];

  const staticHit = STATIC_ROUTES[cleanPath];
  if (staticHit) return staticHit;

  for (const dyn of DYNAMIC_ROUTES) {
    if (dyn.match(cleanPath)) return dyn.meta(cleanPath);
  }

  // Last-resort fallback: humanise the path. Keeps RECENTS useful even for
  // routes added after this map (no silent breakage).
  const segments = cleanPath.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "Page";
  const title = last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { title, icon: Info };
}

export function iconFor(name: string): LucideIcon {
  return ICON_REGISTRY[name] || Info;
}

export function iconNameFor(icon: LucideIcon): string {
  // Lucide attaches displayName to its components — fall back to a string
  // search of the registry if a build target strips that field.
  const display = (icon as any)?.displayName || (icon as any)?.name;
  if (typeof display === "string" && ICON_REGISTRY[display]) return display;
  for (const [name, Icon] of Object.entries(ICON_REGISTRY)) {
    if (Icon === icon) return name;
  }
  return "Info";
}
