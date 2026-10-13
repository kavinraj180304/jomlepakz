import type { KeyboardEvent } from "react";

// Native modality blocks the page; keep Tab at either edge inside the dialog too.
export function keepDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
    'button, a[href], input, select, textarea, [tabindex]',
  )).filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
  const first = controls[0], last = controls.at(-1);
  if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
