import { type ReactNode, useEffect, useState } from 'react';

/** Knopf mit Rückfrage direkt im Knopf („Wirklich löschen?") statt eines blockierenden confirm()-Dialogs. */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  className,
  disabled,
  title,
}: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className ?? ''} ${armed ? 'armed' : ''}`}
      disabled={disabled}
      title={title}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
