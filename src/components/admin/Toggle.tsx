"use client";

import clsx from "clsx";

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, description, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
        checked
          ? "border-nt-purple/25 bg-nt-purple-soft/60"
          : "border-nt-border bg-nt-surface-muted/50 hover:bg-nt-surface-muted",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span
        className={clsx(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition",
          checked ? "bg-nt-purple" : "bg-nt-border-strong"
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition",
            checked && "translate-x-4"
          )}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-nt-text">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-nt-text-muted">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
