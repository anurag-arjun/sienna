import { useState, useCallback, useRef, useEffect } from "react";
import {
  groupByProvider,
  findModel,
  type ModelInfo,
  type ProviderGroup,
} from "../lib/models";

interface ModelPickerProps {
  /** Currently active model ID */
  currentModelId: string;
  /** Called when a model is selected */
  onSelect: (model: ModelInfo) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
}

/**
 * Model picker — a subtle dropdown that appears above the footer.
 * Shows current model as a small clickable label. Opens a dropdown
 * grouped by provider.
 */
export function ModelPicker({
  currentModelId,
  onSelect,
  disabled,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const current = findModel(currentModelId);
  const groups = groupByProvider();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const handleToggle = useCallback(() => {
    if (!disabled) setOpen((prev) => !prev);
  }, [disabled]);

  const handleSelect = useCallback(
    (model: ModelInfo) => {
      onSelect(model);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <div ref={pickerRef} className="relative" data-testid="model-picker">
      {/* Current model label */}
      <button
        onClick={handleToggle}
        disabled={disabled}
        className="text-text-tertiary text-[10px] opacity-40 hover:opacity-70 transition-opacity cursor-pointer select-none disabled:cursor-default"
        data-testid="model-picker-trigger"
        title={`Model: ${current?.name ?? currentModelId}`}
      >
        {current?.shortName ?? currentModelId}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg border border-accent-muted/30 shadow-lg overflow-hidden z-50"
          style={{
            backgroundColor: "rgba(37, 37, 56, 0.95)",
            backdropFilter: "blur(12px)",
          }}
          data-testid="model-picker-dropdown"
        >
          {groups.map((group) => (
            <ProviderSection
              key={group.provider}
              group={group}
              currentModelId={currentModelId}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Provider Section ────────────────────────────────────────────────

interface ProviderSectionProps {
  group: ProviderGroup;
  currentModelId: string;
  onSelect: (model: ModelInfo) => void;
}

function ProviderSection({
  group,
  currentModelId,
  onSelect,
}: ProviderSectionProps) {
  return (
    <div data-testid={`model-group-${group.provider}`}>
      <div className="px-3 py-1.5 text-[9px] text-text-tertiary uppercase tracking-wider select-none">
        {group.label}
      </div>
      {group.models.map((model) => (
        <button
          key={model.id}
          onClick={() => onSelect(model)}
          className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
            model.id === currentModelId
              ? "text-accent-blue bg-accent-blue/10"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-3/50"
          }`}
          data-testid="model-option"
          data-model-id={model.id}
        >
          {model.name}
        </button>
      ))}
    </div>
  );
}
