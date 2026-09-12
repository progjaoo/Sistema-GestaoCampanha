import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";

type ConfirmToastOptions = {
  title: string;
  description: string;
  actionLabel?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
};

export function confirmWithToast({
  title,
  description,
  actionLabel = "Confirmar",
  variant = "default",
  onConfirm,
}: ConfirmToastOptions) {
  toast({
    title,
    description,
    variant,
    action: (
      <ToastAction altText={actionLabel} onClick={() => void onConfirm()}>
        {actionLabel}
      </ToastAction>
    ),
  });
}