import { useEffect, useRef, type PointerEvent, type MouseEvent, type KeyboardEvent } from "react";

export function useLongPress(onOpen: () => void, onHold?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => {
    window.addEventListener("scroll", cancel, true);
    window.addEventListener("blur", cancel);
    return () => { cancel(); window.removeEventListener("scroll", cancel, true); window.removeEventListener("blur", cancel); };
  }, []);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      cancel();
      held.current = false;
      if (!onHold || event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { held.current = true; onHold(); }, 550);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onBlur: cancel,
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      // Restored focus after closing the picker must still allow keyboard activation.
      if (event.key === "Enter" || event.key === " ") held.current = false;
    },
    onContextMenu(event: MouseEvent<HTMLElement>) {
      if (!onHold) return;
      event.preventDefault();
      cancel();
      if (!held.current) { held.current = true; onHold(); }
    },
    onClick(event: MouseEvent<HTMLElement>) {
      if (held.current) { event.preventDefault(); event.stopPropagation(); return; }
      onOpen();
    },
  };
}
