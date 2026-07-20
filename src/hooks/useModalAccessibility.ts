import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const activeModalStack: symbol[] = [];
let bodyScrollLockCount = 0;
let bodyOverflowBeforeLock = "";

interface ModalAccessibilityOptions {
  active?: boolean;
  closeDisabled?: boolean;
  onClose: () => void;
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}

export function useModalAccessibility<T extends HTMLElement>({
  active = true,
  closeDisabled = false,
  onClose,
}: ModalAccessibilityOptions): RefObject<T> {
  const containerRef = useRef<T>(null);
  const modalIdRef = useRef(Symbol("modal"));
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  onCloseRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!active) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const modalId = modalIdRef.current;

    activeModalStack.push(modalId);
    if (bodyScrollLockCount === 0) bodyOverflowBeforeLock = document.body.style.overflow;
    bodyScrollLockCount += 1;
    document.body.style.overflow = "hidden";
    const initialFocus = container?.querySelector<HTMLElement>("[data-dialog-initial-focus]")
      ?? (container ? focusableElements(container)[0] : null)
      ?? container;
    initialFocus?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (activeModalStack.at(-1) !== modalId) return;
      const currentContainer = containerRef.current;
      if (!currentContainer) return;
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(currentContainer);
      if (!elements.length) {
        event.preventDefault();
        currentContainer.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      const stackIndex = activeModalStack.lastIndexOf(modalId);
      if (stackIndex >= 0) activeModalStack.splice(stackIndex, 1);
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0) document.body.style.overflow = bodyOverflowBeforeLock;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [active]);

  return containerRef;
}
