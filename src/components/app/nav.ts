import { MessagesSquare, Images, Wallet, Settings2, type LucideIcon } from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

/**
 * The studio's four surfaces. Chat arrives first (wave 1), the Passes studio
 * is the flagship (wave 3), and usage and administration ride alongside so
 * the cost story is visible from day one.
 */
export const navItems: NavItem[] = [
  { title: "Chat", href: "/chat", icon: MessagesSquare },
  { title: "Studio", href: "/studio", icon: Images, badge: "Soon" },
  { title: "Usage", href: "/usage", icon: Wallet },
  { title: "Admin", href: "/admin", icon: Settings2 },
];
