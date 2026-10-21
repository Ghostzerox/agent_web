import {
  coreModeRegistry,
  type CoreModeId,
} from "@/lib/agent/modeRegistry";

type ModeSelectorProps = {
  mode: CoreModeId;
  disabled?: boolean;
  onChange: (mode: CoreModeId) => void;
};

export function ModeSelector({
  mode,
  disabled = false,
  onChange,
}: ModeSelectorProps) {
  const modes = coreModeRegistry.list();
  const activeMode = coreModeRegistry.get(mode);

  return (
    <label className="inline-flex items-center gap-1.5" title={activeMode.purpose}>
      <span className="hidden text-xs text-[var(--workspace-muted)] sm:inline">模式</span>
      <select
        aria-label="对话模式"
        value={mode}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as CoreModeId)}
        className="max-w-24 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-active)] px-2 py-2 text-xs font-medium text-[var(--workspace-accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-none"
      >
        {modes.map((definition) => (
          <option key={definition.id} value={definition.id}>
            {definition.id === "entertainment" ? "娱乐（对话）" : definition.label}
          </option>
        ))}
      </select>
    </label>
  );
}
