import {
  Archive,
  ArrowLeftRight,
  Baby,
  Banknote,
  Bell,
  Calculator,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  CreditCard,
  Download,
  Fingerprint,
  Fuel,
  HeartPulse,
  House,
  ImagePlus,
  Landmark,
  List,
  Lock,
  Menu,
  PiggyBank,
  Plus,
  Receipt,
  Repeat,
  Settings,
  Shirt,
  Smartphone,
  Target,
  Trash2,
  Upload,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Archive,
  ArrowLeftRight,
  Baby,
  Banknote,
  Bell,
  Calculator,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  CreditCard,
  Download,
  Fingerprint,
  Fuel,
  HeartPulse,
  House,
  ImagePlus,
  Landmark,
  List,
  Lock,
  Menu,
  PiggyBank,
  Plus,
  Receipt,
  Repeat,
  Settings,
  Shirt,
  Smartphone,
  Target,
  Trash2,
  Upload,
  Utensils,
  Wallet,
};

export function AppIcon({ name, className = "size-5" }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? CircleDollarSign;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
      <path d="M9 12h14M9 16h10M9 20h12" stroke="var(--color-bg)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
