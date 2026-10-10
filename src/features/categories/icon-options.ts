/**
 * Pictogrammes proposés pour une catégorie de démarches.
 *
 * ⚠️ La `value` est un **contrat public** : elle est enregistrée dans
 * `categories.icon` et servie telle quelle en aval (`CategoryDto.icon`,
 * `PortalCategoryRefDto.icon`). Nora la retraduit en dessin avec son propre
 * registre (`categoryIcons.ts`, généré depuis les mêmes icônes Lucide) — un
 * test épingle la liste des deux côtés. On AJOUTE des valeurs, on n'en renomme
 * ni n'en retire jamais : une catégorie qui la porte retomberait sur le
 * pictogramme par défaut, ici comme au portail. Le `label`, lui, est libre
 * (infobulle du sélecteur), de même que le groupe.
 *
 * Les valeurs sont les noms Lucide en kebab-case — ce qui permet à un
 * consommateur qui utilise Lucide de les résoudre sans table.
 */
import {
  Accessibility,
  Armchair,
  Backpack,
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Calendar,
  Car,
  Castle,
  ClipboardList,
  Construction,
  CreditCard,
  Cross,
  Dog,
  Drama,
  Droplets,
  Dumbbell,
  Euro,
  FerrisWheel,
  FileText,
  Flower2,
  GraduationCap,
  HandHeart,
  Handshake,
  Heart,
  HeartHandshake,
  HeartPulse,
  Home,
  Hospital,
  IdCard,
  Landmark,
  Library,
  Lightbulb,
  Mail,
  MapPin,
  Megaphone,
  Monitor,
  Music,
  Palette,
  PartyPopper,
  PersonStanding,
  Pill,
  Receipt,
  Recycle,
  Scale,
  School,
  ShieldCheck,
  ShoppingBasket,
  Siren,
  Smile,
  SquareParking,
  Stamp,
  Stethoscope,
  Store,
  Sun,
  Tag,
  Tent,
  Ticket,
  ToyBrick,
  Trash2,
  TreePine,
  TriangleAlert,
  Trophy,
  Users,
  Utensils,
  Vote,
  Waves,
  type LucideIcon,
} from "lucide-react";

export interface IconOption {
  value: string;
  label: string;
  Icon: LucideIcon;
}

export interface IconGroup {
  label: string;
  options: IconOption[];
}

export const ICON_GROUPS: IconGroup[] = [
  {
    label: "Administratif",
    options: [
      { value: "clipboard-list", label: "Administratif", Icon: ClipboardList },
      { value: "landmark", label: "Institution", Icon: Landmark },
      { value: "file-text", label: "Documents", Icon: FileText },
      { value: "id-card", label: "Papiers d'identité", Icon: IdCard },
      { value: "stamp", label: "Formalités", Icon: Stamp },
      { value: "scale", label: "État civil / Justice", Icon: Scale },
      { value: "heart", label: "Mariage / PACS", Icon: Heart },
      { value: "cross", label: "Funéraire / Cimetière", Icon: Cross },
      { value: "vote", label: "Élections", Icon: Vote },
      { value: "users", label: "Population", Icon: Users },
      { value: "calendar", label: "Rendez-vous", Icon: Calendar },
      { value: "mail", label: "Courrier", Icon: Mail },
      { value: "credit-card", label: "Finances", Icon: CreditCard },
      { value: "receipt", label: "Factures / Paiements", Icon: Receipt },
      { value: "euro", label: "Aides / Subventions", Icon: Euro },
    ],
  },
  {
    label: "Enfance et jeunesse",
    options: [
      { value: "baby", label: "Petite enfance", Icon: Baby },
      { value: "toy-brick", label: "Crèche", Icon: ToyBrick },
      { value: "school", label: "Scolaire", Icon: School },
      { value: "backpack", label: "Accueil périscolaire", Icon: Backpack },
      { value: "utensils", label: "Restauration scolaire", Icon: Utensils },
      { value: "ferris-wheel", label: "Accueil de loisirs", Icon: FerrisWheel },
      { value: "tent", label: "Séjours", Icon: Tent },
      { value: "bus", label: "Transport scolaire", Icon: Bus },
      { value: "graduation-cap", label: "Éducation", Icon: GraduationCap },
      { value: "smile", label: "Enfant", Icon: Smile },
      { value: "person-standing", label: "Adulte", Icon: PersonStanding },
    ],
  },
  {
    label: "Santé et solidarité",
    options: [
      { value: "stethoscope", label: "Santé", Icon: Stethoscope },
      { value: "heart-pulse", label: "Médical", Icon: HeartPulse },
      { value: "hospital", label: "Centre de santé", Icon: Hospital },
      { value: "pill", label: "Pharmacie / Prévention", Icon: Pill },
      { value: "heart-handshake", label: "Affaires sociales", Icon: HeartHandshake },
      { value: "hand-heart", label: "Solidarité", Icon: HandHeart },
      { value: "accessibility", label: "Handicap", Icon: Accessibility },
      { value: "armchair", label: "Seniors", Icon: Armchair },
    ],
  },
  {
    label: "Cadre de vie",
    options: [
      { value: "sun", label: "Quotidien", Icon: Sun },
      { value: "home", label: "Logement", Icon: Home },
      { value: "building-2", label: "Urbanisme", Icon: Building2 },
      { value: "construction", label: "Travaux / Voirie", Icon: Construction },
      { value: "lightbulb", label: "Éclairage public", Icon: Lightbulb },
      { value: "triangle-alert", label: "Signalement", Icon: TriangleAlert },
      { value: "map-pin", label: "Lieux", Icon: MapPin },
      { value: "tree-pine", label: "Environnement", Icon: TreePine },
      { value: "flower-2", label: "Espaces verts", Icon: Flower2 },
      { value: "recycle", label: "Déchets", Icon: Recycle },
      { value: "trash-2", label: "Propreté / Encombrants", Icon: Trash2 },
      { value: "droplets", label: "Eau et assainissement", Icon: Droplets },
      { value: "dog", label: "Animaux", Icon: Dog },
    ],
  },
  {
    label: "Mobilité",
    options: [
      { value: "car", label: "Transports", Icon: Car },
      { value: "square-parking", label: "Stationnement", Icon: SquareParking },
      { value: "bike", label: "Vélo / Mobilité douce", Icon: Bike },
    ],
  },
  {
    label: "Sports, culture et loisirs",
    options: [
      { value: "dumbbell", label: "Sports", Icon: Dumbbell },
      { value: "trophy", label: "Compétitions / Clubs", Icon: Trophy },
      { value: "waves", label: "Piscine", Icon: Waves },
      { value: "drama", label: "Culture", Icon: Drama },
      { value: "library", label: "Médiathèque", Icon: Library },
      { value: "book-open", label: "Lecture", Icon: BookOpen },
      { value: "music", label: "Musique / Conservatoire", Icon: Music },
      { value: "palette", label: "Arts plastiques", Icon: Palette },
      { value: "castle", label: "Patrimoine", Icon: Castle },
      { value: "party-popper", label: "Fêtes et événements", Icon: PartyPopper },
      { value: "ticket", label: "Billetterie", Icon: Ticket },
    ],
  },
  {
    label: "Économie et sécurité",
    options: [
      { value: "briefcase", label: "Emploi", Icon: Briefcase },
      { value: "store", label: "Commerces / Entreprises", Icon: Store },
      { value: "shopping-basket", label: "Marchés", Icon: ShoppingBasket },
      { value: "handshake", label: "Associations", Icon: Handshake },
      { value: "monitor", label: "Numérique", Icon: Monitor },
      { value: "megaphone", label: "Communication", Icon: Megaphone },
      { value: "shield-check", label: "Sécurité", Icon: ShieldCheck },
      { value: "siren", label: "Police municipale", Icon: Siren },
    ],
  },
];

/** Toutes les options, à plat, dans l'ordre des groupes. */
export const ICON_OPTIONS: IconOption[] = ICON_GROUPS.flatMap((group) => group.options);

export const DEFAULT_ICON = Tag;

export function iconFor(value: string | null): LucideIcon {
  return ICON_OPTIONS.find((o) => o.value === value)?.Icon ?? DEFAULT_ICON;
}
