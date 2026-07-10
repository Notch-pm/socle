import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useCreateOrgUser } from "@/features/users/useOrgUsers";

const ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "consultant", label: "Consultant" },
] as const;

const schema = z.object({
  email: z.string().email("Email invalide"),
  first_name: z.string().min(1, "Prénom obligatoire"),
  last_name: z.string().min(1, "Nom obligatoire"),
  role: z.enum(["admin", "consultant"]),
});

type FormValues = z.infer<typeof schema>;

export function CreateUserDialog({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}) {
  const createUser = useCreateOrgUser(organizationId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", first_name: "", last_name: "", role: "consultant" },
  });

  function close() {
    reset();
    createUser.reset();
    onOpenChange(false);
  }

  function onSubmit(values: FormValues) {
    createUser.mutate(
      { ...values, organization_id: organizationId },
      { onSuccess: (result) => (result.email_sent || !result.is_new_user) && close() },
    );
  }

  const result = createUser.data;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvel utilisateur</DialogTitle>
          <DialogDescription>
            Un email d'invitation sera envoyé pour définir le mot de passe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="user-email" error={errors.email?.message}>
            <Input id="user-email" type="email" placeholder="nom@exemple.fr" {...register("email")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom" htmlFor="user-first-name" error={errors.first_name?.message}>
              <Input id="user-first-name" {...register("first_name")} />
            </Field>
            <Field label="Nom" htmlFor="user-last-name" error={errors.last_name?.message}>
              <Input id="user-last-name" {...register("last_name")} />
            </Field>
          </div>
          <Field label="Rôle" htmlFor="user-role">
            <select
              id="user-role"
              {...register("role")}
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          {createUser.isError ? (
            <p className="text-sm text-destructive">{(createUser.error as Error).message}</p>
          ) : null}
          {result && result.is_new_user && !result.email_sent ? (
            <p className="text-sm text-warning">
              Utilisateur créé, mais l'email d'invitation n'a pas pu être envoyé
              {result.email_error ? ` (${result.email_error})` : ""}. Configurez l'envoi
              d'emails ou renvoyez l'invitation plus tard.
            </p>
          ) : null}
          {result && !result.is_new_user ? (
            <p className="text-sm text-success">
              Utilisateur existant ajouté à l'organisation.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Annuler
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Envoi…" : "Créer et inviter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
