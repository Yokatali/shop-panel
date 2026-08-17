import {
  BatteryCharging, Cable, Gem, Headphones, Layers, Package, PlugZap, Shield, Smartphone,
  Speaker, Sparkles, Tag, Watch, Wrench, type LucideIcon,
} from "lucide-react";

/** Kategori simgeleri. Yeni ad eklemek için buraya bir satır eklemek yeterli. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  shield: Shield,
  layers: Layers,
  headphones: Headphones,
  "plug-zap": PlugZap,
  cable: Cable,
  "battery-charging": BatteryCharging,
  speaker: Speaker,
  sparkles: Sparkles,
  wrench: Wrench,
  watch: Watch,
  gem: Gem,
  tag: Tag,
  package: Package,
};

export const CATEGORY_COLORS = [
  "cyan", "violet", "green", "amber", "orange", "sky", "lime", "pink", "rose", "slate",
];

export const categoryIcon = (name: string): LucideIcon => CATEGORY_ICONS[name] ?? Package;

export function CategoryGlyph({ icon, size = 18 }: { icon: string; size?: number }) {
  const Icon = categoryIcon(icon);
  return <Icon size={size} />;
}
