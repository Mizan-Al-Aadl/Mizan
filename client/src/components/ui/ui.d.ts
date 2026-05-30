declare module "@/components/ui/button" {
  import type { ButtonHTMLAttributes, DetailedHTMLProps, ForwardRefExoticComponent, RefAttributes } from "react";

  export interface ButtonProps extends DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> {
    variant?: string;
    size?: string;
    asChild?: boolean;
    className?: string;
  }

  export const Button: ForwardRefExoticComponent<ButtonProps & RefAttributes<HTMLButtonElement>>;
}

declare module "@/components/ui/input" {
  import type { InputHTMLAttributes, DetailedHTMLProps, ForwardRefExoticComponent, RefAttributes } from "react";
  export const Input: ForwardRefExoticComponent<DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & RefAttributes<HTMLInputElement>>;
}

declare module "@/components/ui/label" {
  import type { LabelHTMLAttributes, DetailedHTMLProps, ForwardRefExoticComponent, RefAttributes } from "react";
  export const Label: ForwardRefExoticComponent<DetailedHTMLProps<LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement> & RefAttributes<HTMLLabelElement>>;
}
