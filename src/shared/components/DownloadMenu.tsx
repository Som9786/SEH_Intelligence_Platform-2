import { ChevronDown, ImageDown, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export interface DownloadOption {
  label: string;
  hint: string;
  onSelect: () => void | Promise<void>;
}

/**
 * The "Download" button every diagram shows in its card header: one button that opens a short menu
 * of formats (PNG image, SVG vector). Same look and behaviour wherever a diagram can be saved.
 */
export function DownloadMenu({
  options,
  disabled = false,
  label = 'Download',
  icon: Icon = ImageDown,
}: {
  options: DownloadOption[];
  disabled?: boolean;
  label?: string;
  icon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false);
        return;
      }
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const choose = async (option: DownloadOption) => {
    setOpen(false);
    setBusy(true);
    try {
      await option.onSelect();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="download-menu" ref={root}>
      <button
        type="button"
        className="td-action"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled || busy}
        onClick={() => setOpen(!open)}
      >
        <Icon size={16} aria-hidden="true" />
        {label}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <ul className="download-menu-list" role="menu" id={menuId}>
          {options.map((option) => (
            <li key={option.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void choose(option);
                }}
              >
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
