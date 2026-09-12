import {
  Landmark,
  Building2,
  HeartHandshake,
  GraduationCap,
  Car,
  Baby,
  Home,
  MapPin,
  FileText,
  Users,
  Stethoscope,
  TreePine,
  CreditCard,
  ShieldCheck,
  School,
  Scale,
  Briefcase,
  Calendar,
  Vote,
  Recycle,
  Droplets,
  Tag,
  type LucideIcon,
} from "lucide-react";

export interface IconOption {
  value: string;
  label: string;
  Icon: LucideIcon;
}

export const ICON_OPTIONS: IconOption[] = [
  { value: "landmark", label: "Institution", Icon: Landmark },
  { value: "building-2", label: "Urbanisme", Icon: Building2 },
  { value: "heart-handshake", label: "Affaires sociales", Icon: HeartHandshake },
  { value: "graduation-cap", label: "Éducation", Icon: GraduationCap },
  { value: "car", label: "Transports", Icon: Car },
  { value: "baby", label: "Petite enfance", Icon: Baby },
  { value: "home", label: "Logement", Icon: Home },
  { value: "map-pin", label: "Lieux", Icon: MapPin },
  { value: "file-text", label: "Documents", Icon: FileText },
  { value: "users", label: "Population", Icon: Users },
  { value: "stethoscope", label: "Santé", Icon: Stethoscope },
  { value: "tree-pine", label: "Environnement", Icon: TreePine },
  { value: "credit-card", label: "Finances", Icon: CreditCard },
  { value: "shield-check", label: "Sécurité", Icon: ShieldCheck },
  { value: "school", label: "Scolaire", Icon: School },
  { value: "scale", label: "État civil / Justice", Icon: Scale },
  { value: "briefcase", label: "Emploi", Icon: Briefcase },
  { value: "calendar", label: "Rendez-vous", Icon: Calendar },
  { value: "vote", label: "Élections", Icon: Vote },
  { value: "recycle", label: "Déchets", Icon: Recycle },
  { value: "droplets", label: "Eau et assainissement", Icon: Droplets },
];

export const DEFAULT_ICON = Tag;

export function iconFor(value: string | null): LucideIcon {
  return ICON_OPTIONS.find((o) => o.value === value)?.Icon ?? DEFAULT_ICON;
}
