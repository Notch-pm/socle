import * as React from "react";
import {
  Building2,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Settings,
  Phone,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MAX_ORG_DEPTH, type OrgNode } from "@/features/superadmin/organizations/useOrganizationsAdmin";

export interface OrganizationTreeHandlers {
  onAddChild: (node: OrgNode) => void;
  onEdit: (node: OrgNode) => void;
  onToggleStatus: (node: OrgNode) => void;
  onDelete: (node: OrgNode) => void;
  /** Provided only where an org-settings area exists (super admin). */
  onConfigure?: (node: OrgNode) => void;
  /** Whether the current user may delete sub-organizations (super admin only). */
  canDelete: boolean;
}

function collectAllIds(nodes: OrgNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: OrgNode[]) => {
    for (const n of list) {
      ids.push(n.id);
      walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

export function OrganizationTree({
  nodes,
  handlers,
}: {
  nodes: OrgNode[];
  handlers: OrganizationTreeHandlers;
}) {
  // Expanded by default so the whole hierarchy is visible at a glance.
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(collectAllIds(nodes)),
  );

  const toggle = React.useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <ul className="flex flex-col gap-1">
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          expanded={expanded}
          onToggleExpand={toggle}
          handlers={handlers}
        />
      ))}
    </ul>
  );
}

function TreeRow({
  node,
  expanded,
  onToggleExpand,
  handlers,
}: {
  node: OrgNode;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  handlers: OrganizationTreeHandlers;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isObsolete = node.status === "obsolete";
  const isSubOrg = node.parent_id != null;
  const canAddChild = node.depth < MAX_ORG_DEPTH;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg border border-border px-2 py-2",
          isObsolete && "opacity-60",
        )}
      >
        <button
          type="button"
          aria-label={hasChildren ? (isOpen ? "Réduire" : "Développer") : undefined}
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground",
            hasChildren ? "hover:bg-muted" : "invisible",
          )}
        >
          <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
        </button>

        {node.logo_url ? (
          <img
            src={node.logo_url}
            alt=""
            className="size-6 shrink-0 rounded object-contain"
          />
        ) : (
          <Building2 className="size-5 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate font-medium", isObsolete && "line-through")}>
              {node.name}
            </span>
            {isObsolete ? (
              <Badge variant="muted" className="shrink-0">
                Obsolète
              </Badge>
            ) : null}
            {node.is_internal_service ? (
              // L'organigramme est ce qu'on lit ici : le réglage doit s'y voir
              // sans ouvrir chaque fiche.
              <Badge
                variant="muted"
                className="shrink-0"
                title="N'apparaît pas sur le site de démarches : ses démarches y sont présentées au nom de l'organisme parent."
              >
                Service interne
              </Badge>
            ) : null}
          </div>
          {(node.phone || node.email || node.address) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {node.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" />
                  {node.phone}
                </span>
              ) : null}
              {node.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="size-3" />
                  {node.email}
                </span>
              ) : null}
              {node.address ? (
                <span className="truncate">{node.address.split("\n")[0]}</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            title={canAddChild ? "Ajouter une sous-organisation" : `Profondeur maximale (${MAX_ORG_DEPTH}) atteinte`}
            disabled={!canAddChild}
            onClick={() => handlers.onAddChild(node)}
          >
            <Plus className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Modifier" onClick={() => handlers.onEdit(node)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={isObsolete ? "Réactiver" : "Rendre obsolète"}
            onClick={() => handlers.onToggleStatus(node)}
          >
            {isObsolete ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          </Button>
          {handlers.onConfigure ? (
            <Button
              variant="ghost"
              size="icon"
              title="Paramétrer"
              onClick={() => handlers.onConfigure!(node)}
            >
              <Settings className="size-4" />
            </Button>
          ) : null}
          {handlers.canDelete && isSubOrg ? (
            <Button
              variant="ghost"
              size="icon"
              title="Supprimer"
              onClick={() => handlers.onDelete(node)}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      </div>

      {hasChildren && isOpen ? (
        <ul className="mt-1 flex flex-col gap-1 border-l border-border pl-4 ml-[1.4rem]">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              handlers={handlers}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
