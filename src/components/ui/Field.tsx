import { cloneElement, type InputHTMLAttributes, type ReactElement, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type FieldControlProps = {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
};

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactElement<FieldControlProps>;
}

export const fieldControlClassName =
  "min-h-10 w-full rounded-control border border-border-control bg-surface px-3 text-sm text-text outline-none transition-colors duration-fast placeholder:text-text-tertiary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-disabled aria-[invalid=true]:border-status-danger";

export function Field({ id, label, hint, error, required = false, className = "", children }: FieldProps) {
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const existingDescription = children.props["aria-describedby"];
  const describedBy = [existingDescription, descriptionId].filter(Boolean).join(" ") || undefined;
  const isRequired = required || children.props.required;

  return (
    <div className={["grid gap-1.5", className].join(" ")}>
      <label htmlFor={id} className="text-label font-medium text-text">
        {label}
        {isRequired ? <span aria-hidden="true" className="text-status-danger"> *</span> : null}
      </label>
      {cloneElement(children, {
        id,
        required: isRequired,
        "aria-describedby": describedBy,
        "aria-invalid": error ? "true" : children.props["aria-invalid"],
      })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-status-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FieldInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={[fieldControlClassName, "h-10", className].join(" ")} {...props} />;
}

export function FieldSelect({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={[fieldControlClassName, "h-10", className].join(" ")} {...props} />;
}

export function FieldTextarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={[fieldControlClassName, "min-h-24 py-2", className].join(" ")} {...props} />;
}
