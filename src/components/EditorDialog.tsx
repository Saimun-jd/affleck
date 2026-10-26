import { useEffect, useRef, type ReactNode } from "react";

export function EditorDialog({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    // React's autoFocus runs before the dialog enters the top layer. Focus the
    // editable field after showModal, rather than leaving focus on Close.
    element.querySelector<HTMLElement>('textarea:not([disabled]), input:not([type="checkbox"]):not([disabled]), select:not([disabled])')?.focus();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className="editor-dialog" aria-label={title}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      {children}
    </dialog>
  );
}
