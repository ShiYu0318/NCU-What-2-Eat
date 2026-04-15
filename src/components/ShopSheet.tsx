"use client";

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { Sheet } from "./Sheet";
import { supabase } from "@/lib/supabase";

type BusinessHour = {
  id: string;
  restaurant_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
};

export type Restaurant = {
  id: string;
  name: string;
  area: string;
  type: string[];
  price_range: string;
  address: string | null;
  google_maps: string | null;
  cover_image: string | null;
  images: string[];
  rating: number | null;
  review_count: number;
  is_active: boolean;
  business_hours: BusinessHour[];
};

const AREAS = ["全部", "後門", "宵夜街", "松苑餐廳", "松果餐廳"] as const;
const PRICES = ["$", "$$", "$$$"] as const;

const DAY_ITEMS = [
  { value: 0, label: "週日" },
  { value: 1, label: "週一" },
  { value: 2, label: "週二" },
  { value: 3, label: "週三" },
  { value: 4, label: "週四" },
  { value: 5, label: "週五" },
  { value: 6, label: "週六" },
] as const;

const HOUR_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: String(i).padStart(2, "0"),
}));

const MINUTE_ITEMS = Array.from({ length: 12 }, (_, i) => ({
  value: i * 5,
  label: String(i * 5).padStart(2, "0"),
}));

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function checkIsOpen(hours: BusinessHour[], day: number, time: string) {
  const h = hours.find((r) => r.day_of_week === day);
  if (!h || h.is_closed || !h.open_time || !h.close_time) return false;
  const now = toMin(time);
  return now >= toMin(h.open_time) && now < toMin(h.close_time);
}

function currentDayTime() {
  const d = new Date();
  return {
    day: d.getDay(),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

function toggleSet<T>(prev: Set<T>, value: T): Set<T> {
  const next = new Set(prev);
  if (next.has(value)) { next.delete(value); } else { next.add(value); }
  return next;
}

function initMinute() {
  return Math.round(new Date().getMinutes() / 5) * 5 % 60;
}

// ScrollWheel

const ITEM_H = 40;
const VISIBLE = 5;
const PAD = Math.floor(VISIBLE / 2) * ITEM_H;
const WHEEL_H = VISIBLE * ITEM_H;
const BG = "#0a0a0a";

function ScrollWheel({
  items,
  selected,
  onChange,
  width,
}: {
  items: readonly { value: number; label: string }[];
  selected: number;
  onChange: (v: number) => void;
  width: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    const idx = items.findIndex((i) => i.value === selected);
    if (idx >= 0 && scrollRef.current) scrollRef.current.scrollTop = idx * ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const idx = Math.round(scrollRef.current.scrollTop / ITEM_H);
      onChange(items[Math.max(0, Math.min(idx, items.length - 1))].value);
    }, 120);
  }, [items, onChange]);

  return (
    <div className="relative overflow-hidden" style={{ width, height: WHEEL_H }}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{ height: PAD, background: `linear-gradient(to bottom, ${BG}, transparent)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ height: PAD, background: `linear-gradient(to top, ${BG}, transparent)` }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-2 z-10"
        style={{ top: PAD, height: ITEM_H, borderTop: "0.5px solid rgba(255,255,255,0.15)", borderBottom: "0.5px solid rgba(255,255,255,0.15)" }} />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-scroll overscroll-contain"
        style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none", paddingTop: PAD, paddingBottom: PAD, WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {items.map((item, idx) => (
          <div
            key={idx}
            className="flex items-center justify-center select-none text-[15px] font-medium"
            style={{ height: ITEM_H, scrollSnapAlign: "center" }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Sub-components

function Chip({ active, onClick, children, dimmed }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dimmed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-chip px-3 h-7 text-xs font-medium transition-colors ${
        active ? "bg-accent text-white" : dimmed ? "bg-bg-elevated text-text-muted/40" : "bg-bg-elevated text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

type CheckState = "none" | "some" | "all";

function TriCheckbox({ state, onClick }: { state: CheckState; onClick: () => void }) {
  const filled = state !== "none";
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 size-4.5 rounded flex items-center justify-center transition-colors"
      style={{ background: filled ? "#0A84FF" : "transparent", border: filled ? "none" : "1.5px solid rgba(255,255,255,0.25)" }}
    >
      {state === "all" && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === "some" && (
        <svg width="8" height="2" viewBox="0 0 8 2" fill="none" aria-hidden>
          <line x1="1" y1="1" x2="7" y2="1" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function FilterRow({ label, dimmed, children }: {
  label: string;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-0 min-h-8">
      <span className={`shrink-0 w-9 text-xs font-medium transition-colors ${dimmed ? "text-text-muted/40" : "text-text-muted"}`}>
        {label}
      </span>
      <div className="w-px h-3 bg-border shrink-0 mr-2.5" />
      <div className="flex gap-1.5 overflow-x-auto flex-1" style={{ scrollbarWidth: "none" }}>
        {children}
      </div>
    </div>
  );
}

function RestaurantRow({ restaurant, isOpen, checked, onToggle }: {
  restaurant: Restaurant;
  isOpen: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-bg-elevated"
    >
      <div className="size-14 shrink-0 overflow-hidden rounded-card bg-bg-elevated">
        {restaurant.cover_image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={restaurant.cover_image} alt={restaurant.name} className="size-full object-cover" />
          : <div className="size-full flex items-center justify-center text-xl">🍜</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-medium">{restaurant.name}</span>
          <span className={`shrink-0 text-[10px] font-medium ${isOpen ? "text-green-400" : "text-text-muted"}`}>
            {isOpen ? "營業中" : "未營業"}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span className="text-xs text-text-muted">{restaurant.area}</span>
          <span className="text-xs text-text-muted">·</span>
          <span className="text-xs text-text-muted">{restaurant.price_range}</span>
          {restaurant.type.map((t) => (
            <span key={t} className="rounded-chip bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted">{t}</span>
          ))}
        </div>
        {restaurant.rating != null && (
          <p className="mt-0.5 text-[11px] text-text-muted">★ {restaurant.rating} ({restaurant.review_count})</p>
        )}
      </div>
      <div className={`size-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${checked ? "border-accent bg-accent" : "border-border"}`}>
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </button>
  );
}

// ShopSheet

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: Set<string>;
  onConfirm: (ids: Set<string>) => void;
};

export function ShopSheet({ open, onOpenChange, selectedIds, onConfirm }: Props) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [area, setArea] = useState<string>("全部");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [priceFilter, setPriceFilter] = useState<Set<string>>(new Set());
  const [timeMode, setTimeMode] = useState<"now" | "custom">("now");
  const [showClosed, setShowClosed] = useState(false);

  // 已確認的時間（用於過濾）
  const [customDay, setCustomDay] = useState(new Date().getDay());
  const [customHour, setCustomHour] = useState(new Date().getHours());
  const [customMinute, setCustomMinute] = useState(initMinute);

  // 選時器內暫存的時間（按確認才寫入上面）
  const [pendingDay, setPendingDay] = useState(new Date().getDay());
  const [pendingHour, setPendingHour] = useState(new Date().getHours());
  const [pendingMinute, setPendingMinute] = useState(initMinute);

  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedPartial, setSavedPartial] = useState<Set<string> | null>(null);
  const [viewMode, setViewMode] = useState<"filtered" | "selected">("filtered");

  const isSearching = search.trim().length > 0;
  const hasActiveFilters =
    area !== "全部" || typeFilter.size > 0 || priceFilter.size > 0 ||
    timeMode !== "now" || showClosed;

  const { checkDay, checkTime } = useMemo(() => {
    if (timeMode === "now") {
      const { day, time } = currentDayTime();
      return { checkDay: day, checkTime: time };
    }
    return {
      checkDay: customDay,
      checkTime: `${String(customHour).padStart(2, "0")}:${String(customMinute).padStart(2, "0")}`,
    };
  }, [timeMode, customDay, customHour, customMinute]);

  const allTypes = useMemo(() => {
    const set = new Set<string>();
    restaurants.forEach((r) => r.type.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [restaurants]);

  const filtered = useMemo(
    () =>
      restaurants.filter((r) => {
        if (isSearching) return r.name.toLowerCase().includes(search.toLowerCase());
        if (area !== "全部" && r.area !== area) return false;
        if (typeFilter.size > 0 && !r.type.some((t) => typeFilter.has(t))) return false;
        if (priceFilter.size > 0 && !priceFilter.has(r.price_range)) return false;
        if (!showClosed && !checkIsOpen(r.business_hours, checkDay, checkTime)) return false;
        return true;
      }),
    [restaurants, isSearching, search, area, typeFilter, priceFilter, showClosed, checkDay, checkTime],
  );

  const selectedList = useMemo(
    () =>
      restaurants.filter(
        (r) =>
          selected.has(r.id) &&
          (!isSearching || r.name.toLowerCase().includes(search.toLowerCase())),
      ),
    [restaurants, selected, isSearching, search],
  );

  const displayList = viewMode === "selected" ? selectedList : filtered;

  const filteredSelectedCount = useMemo(
    () => filtered.filter((r) => selected.has(r.id)).length,
    [filtered, selected],
  );

  useEffect(() => {
    if (open) {
      setSelected(new Set(selectedIds));
      setSavedPartial(null);
      setViewMode("filtered");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || restaurants.length > 0) return;
    setLoading(true);
    supabase
      .from("restaurants")
      .select("*, business_hours(*)")
      .eq("is_active", true)
      .order("name")
      .then(({ data, error }) => {
        if (!error && data) setRestaurants(data as Restaurant[]);
        setLoading(false);
      });
  }, [open, restaurants.length]);

  function openTimePicker() {
    setTimeMode("custom");
    setPendingDay(customDay);
    setPendingHour(customHour);
    setPendingMinute(customMinute);
    setPickerKey((k) => k + 1);
    setCustomPickerOpen(true);
  }

  function confirmTimePicker() {
    setCustomDay(pendingDay);
    setCustomHour(pendingHour);
    setCustomMinute(pendingMinute);
    setCustomPickerOpen(false);
  }

  function resetFilters() {
    setArea("全部");
    setTypeFilter(new Set());
    setPriceFilter(new Set());
    setTimeMode("now");
    setShowClosed(false);
    setCustomPickerOpen(false);
  }

  const checkState: CheckState =
    viewMode === "selected"
      ? "all"
      : filteredSelectedCount === 0
      ? "none"
      : filteredSelectedCount === filtered.length
      ? "all"
      : "some";

  const handleCheckboxClick = useCallback(() => {
    if (viewMode === "selected") {
      setSelected(new Set());
      setViewMode("filtered");
      setSavedPartial(null);
      return;
    }
    const filteredIds = filtered.map((r) => r.id);
    if (checkState === "all") {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else if (checkState === "some") {
      setSavedPartial(new Set(selected));
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      if (savedPartial !== null) {
        setSelected(savedPartial);
        setSavedPartial(null);
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          filteredIds.forEach((id) => next.add(id));
          return next;
        });
      }
    }
  }, [viewMode, checkState, filtered, selected, savedPartial]);

  const customTimeLabel = `${DAY_ITEMS[customDay].label} ${String(customHour).padStart(2, "0")}:${String(customMinute).padStart(2, "0")}`;

  const sheetHeader = (
    <div className="border-b border-border bg-card">
      <div className="px-4 pt-3 pb-2.5 flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-button bg-bg-elevated px-3">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <circle cx="6" cy="6" r="4.5" stroke="#8e8e93" strokeWidth="1.5" />
            <path d="M9.5 9.5L12 12" stroke="#8e8e93" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="搜尋商家"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-muted outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="清除"
              className="flex size-4 items-center justify-center rounded-full bg-text-muted/40">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                <path d="M1 1L7 7M7 1L1 7" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        {hasActiveFilters && !isSearching && (
          <button type="button" onClick={resetFilters}
            className="shrink-0 text-xs text-accent active:opacity-60">
            重置
          </button>
        )}
      </div>

      <div className="px-4 pb-2.5 flex flex-col gap-2">
        <FilterRow label="區域" dimmed={isSearching}>
          {AREAS.map((a) => (
            <Chip key={a} active={area === a} dimmed={isSearching} onClick={() => setArea(a)}>{a}</Chip>
          ))}
        </FilterRow>

        {allTypes.length > 0 && (
          <FilterRow label="種類" dimmed={isSearching}>
            {allTypes.map((t) => (
              <Chip key={t} active={typeFilter.has(t)} dimmed={isSearching}
                onClick={() => setTypeFilter((p) => toggleSet(p, t))}>
                {t}
              </Chip>
            ))}
          </FilterRow>
        )}

        <FilterRow label="價位" dimmed={isSearching}>
          {PRICES.map((price) => (
            <Chip key={price} active={priceFilter.has(price)} dimmed={isSearching}
              onClick={() => setPriceFilter((p) => toggleSet(p, price))}>
              {price}
            </Chip>
          ))}
          <div className="w-px h-4 bg-border shrink-0 self-center mx-0.5" />
          <Chip active={showClosed} dimmed={isSearching} onClick={() => setShowClosed((v) => !v)}>
            未營業
          </Chip>
        </FilterRow>

        <FilterRow label="時段" dimmed={isSearching}>
          <Chip active={timeMode === "now"} dimmed={isSearching}
            onClick={() => { setTimeMode("now"); setCustomPickerOpen(false); }}>
            現在
          </Chip>
          <Chip active={timeMode === "custom"} dimmed={isSearching} onClick={openTimePicker}>
            {timeMode === "custom" ? customTimeLabel : "自訂時間"}
          </Chip>
        </FilterRow>

        {customPickerOpen && (
          <div className="rounded-card bg-bg-elevated overflow-hidden">
            <div key={pickerKey} className="flex items-center justify-center">
              <ScrollWheel items={DAY_ITEMS} selected={pendingDay} onChange={setPendingDay} width={80} />
              <ScrollWheel items={HOUR_ITEMS} selected={pendingHour} onChange={setPendingHour} width={56} />
              <span className="select-none text-base font-medium text-text-muted pb-0.5">:</span>
              <ScrollWheel items={MINUTE_ITEMS} selected={pendingMinute} onChange={setPendingMinute} width={56} />
            </div>
            <button type="button" onClick={confirmTimePicker}
              className="flex w-full items-center justify-center py-2.5 border-t border-border text-accent active:opacity-60">
              <svg width="16" height="13" viewBox="0 0 16 13" fill="none" aria-hidden>
                <path d="M1.5 6.5L5.5 10.5L14.5 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={() => setViewMode((v) => v === "filtered" ? "selected" : "filtered")}
          className={`text-xs transition-colors ${viewMode === "selected" ? "text-accent font-medium" : "text-text-muted"}`}
        >
          全部 {selected.size}/{restaurants.length}
        </button>
        <div className="flex-1" />
        <span className="text-xs text-text-muted">篩選 {filteredSelectedCount}/{filtered.length}</span>
        <TriCheckbox state={checkState} onClick={handleCheckboxClick} />
      </div>
    </div>
  );

  const sheetFooter = (
    <div
      className="border-t border-border bg-card px-4 pt-3"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 0.75rem)" }}
    >
      <button
        type="button"
        onClick={() => { onConfirm(selected); onOpenChange(false); }}
        className="h-12 w-full rounded-button bg-accent text-base font-semibold text-white transition-transform active:scale-[0.98]"
      >
        確認（ {selected.size} ）
      </button>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="選擇商家" fixedHeight header={sheetHeader} footer={sheetFooter}>
      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-text-muted">載入中...</div>
      ) : displayList.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-text-muted">
          {viewMode === "selected" ? "尚未選擇任何商家" : "沒有符合條件的商家"}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {displayList.map((r) => (
            <RestaurantRow
              key={r.id}
              restaurant={r}
              isOpen={checkIsOpen(r.business_hours, checkDay, checkTime)}
              checked={selected.has(r.id)}
              onToggle={() => setSelected((prev) => toggleSet(prev, r.id))}
            />
          ))}
        </div>
      )}
    </Sheet>
  );
}