import { type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  icon,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="sm">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          {icon && (
            <div
              className={cn(
                "w-12 h-12 rounded-radius-md flex items-center justify-center",
                variant === "danger" ? "bg-red/10 text-red" : "bg-cyan/10 text-cyan"
              )}
            >
              {icon}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-body-lg text-primary font-semibold">
              {title}
            </h3>
            <p className="text-body text-secondary">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
