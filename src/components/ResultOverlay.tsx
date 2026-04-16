"use client";

import { AnimatePresence, motion } from "motion/react";
import type { WheelRestaurant } from "./Wheel";

const PRICE_LABEL: Record<string, string> = {
  "$":   "$1–200",
  "$$":  "$200–400",
  "$$$": "$400–600",
};

type Props = {
  restaurant: WheelRestaurant | null;
  onClose: () => void;
};

export function ResultOverlay({ restaurant, onClose }: Props) {
  return (
    <AnimatePresence>
      {restaurant && (
        // Backdrop
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.72)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          {/* Card — spring slide-up + scale */}
          <motion.div
            className="w-full max-w-sm overflow-hidden rounded-t-[28px] bg-card pb-safe"
            initial={{ scale: 0.85, opacity: 0, y: 48 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 32 }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cover */}
            {restaurant.cover_image ? (
              <img
                src={restaurant.cover_image}
                alt={restaurant.name}
                className="h-52 w-full object-cover"
              />
            ) : (
              <div className="flex h-52 w-full items-center justify-center bg-bg-elevated text-5xl">
                🍽️
              </div>
            )}

            <div className="px-5 pb-5 pt-4">
              {/* Name */}
              <h2 className="mb-2 text-2xl font-bold tracking-tight">
                {restaurant.name}
              </h2>

              {/* Meta row */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text-muted">
                  {PRICE_LABEL[restaurant.price_range] ?? restaurant.price_range}
                </span>
                {restaurant.type.map((t) => (
                  <span
                    key={t}
                    className="rounded-chip bg-bg-elevated px-3 py-1 text-xs text-text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>

              {/* Navigate button */}
              {restaurant.google_maps ? (
                <a
                  href={restaurant.google_maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 w-full items-center justify-center rounded-button bg-accent text-base font-semibold text-white transition-transform active:scale-[0.98]"
                >
                  導航前往
                </a>
              ) : (
                <div className="h-12" />
              )}

              {/* Re-spin */}
              <button
                type="button"
                onClick={onClose}
                className="mt-3 h-11 w-full rounded-button border border-border text-sm text-text-muted transition-transform active:scale-[0.98]"
              >
                再轉一次
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}