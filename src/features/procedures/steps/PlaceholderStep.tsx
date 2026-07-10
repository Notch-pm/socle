import { Wrench } from "lucide-react";

export function PlaceholderStep({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Wrench className="size-5" />
      </div>
      <h3 className="text-lg font-semibold">{label}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Cette étape sera disponible prochainement.
      </p>
    </div>
  );
}
