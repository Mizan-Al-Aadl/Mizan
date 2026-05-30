import { Label } from "@/components/ui/label";
import { ReactNode } from "react";

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export default function FormField({ id, label, error, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
