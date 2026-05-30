import { Button } from "@/components/ui/button";

interface AuthSubmitButtonProps {
  isSubmitting: boolean;
  submittingLabel: string;
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function AuthSubmitButton({
  isSubmitting,
  submittingLabel,
  label,
  disabled,
  className,
}: AuthSubmitButtonProps) {
  return (
    <Button type="submit" className={`w-full ${className ?? ""}`} disabled={isSubmitting || disabled}>
      {isSubmitting ? submittingLabel : label}
    </Button>
  );
}
