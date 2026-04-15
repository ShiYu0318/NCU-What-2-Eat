"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect } from "react";

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  /** 非捲動區域：放在標題列下方、列表上方 */
  header?: React.ReactNode;
  /** 非捲動區域：固定在底部 */
  footer?: React.ReactNode;
  /** 固定高度 90dvh（避免 filter 展開時 sheet 縮放） */
  fixedHeight?: boolean;
  children: React.ReactNode;
};

export function Sheet({ open, onOpenChange, title, header, footer, fixedHeight, children }: SheetProps) {
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-backdrop"
            aria-hidden
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            key="sheet-content"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[20px] border-t border-border bg-card ${fixedHeight ? "h-[90dvh]" : "max-h-[90dvh]"}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onOpenChange(false);
              }
            }}
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex cursor-grab touch-none justify-center pt-3 pb-2 active:cursor-grabbing"
            >
              <div aria-hidden className="h-1 w-10 rounded-full bg-border" />
            </div>

            {title && (
              <div className="relative flex items-center justify-center border-b border-border px-14 py-3">
                <h2 className="text-base font-semibold">{title}</h2>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-bg-elevated text-text-muted transition-transform active:scale-90"
                  aria-label="關閉"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M1 1L11 11M11 1L1 11"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            )}

            {header}

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>

            {footer}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
