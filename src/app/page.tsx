"use client";

import { useState, useEffect, useRef } from "react";
import { Sheet } from "@/components/Sheet";
import { ShopSheet } from "@/components/ShopSheet";
import { Wheel, type WheelRestaurant, type WheelHandle } from "@/components/Wheel";
import { ResultOverlay } from "@/components/ResultOverlay";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [shopOpen, setShopOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<Set<string>>(new Set());
  const [selectedRestaurants, setSelectedRestaurants] = useState<WheelRestaurant[]>([]);
  const [result, setResult] = useState<WheelRestaurant | null>(null);

  const wheelRef = useRef<WheelHandle>(null);

  // 始終透過 Promise 回調更新以避免同步 setState 操作生效
  useEffect(() => {
    const ids = [...selectedRestaurantIds];
    let cancelled = false;

    const fetch =
      ids.length === 0
        ? Promise.resolve([] as WheelRestaurant[])
        : supabase
            .from("restaurants")
            .select("id, name, google_maps, type, price_range, cover_image")
            .in("id", ids)
            .then(({ data }) => (data ?? []) as WheelRestaurant[]);

    fetch.then((restaurants) => {
      if (!cancelled) setSelectedRestaurants(restaurants);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedRestaurantIds]);

  function handleResultClose() {
    setResult(null);
    wheelRef.current?.reset();
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-text select-none">
      <Header />
      <WheelStage restaurants={selectedRestaurants} onResult={setResult} wheelRef={wheelRef} />
      <BottomActions
        onSelectShops={() => setShopOpen(true)}
        onCreateRoom={() => setCreateOpen(true)}
        onJoinRoom={() => setJoinOpen(true)}
      />

      <ShopSheet
        open={shopOpen}
        onOpenChange={setShopOpen}
        selectedIds={selectedRestaurantIds}
        onConfirm={setSelectedRestaurantIds}
      />
      <Sheet open={createOpen} onOpenChange={setCreateOpen} title="創建房間">
        <Placeholder>房號與 QR Code</Placeholder>
      </Sheet>
      <Sheet open={joinOpen} onOpenChange={setJoinOpen} title="加入房間">
        <Placeholder>房號輸入</Placeholder>
      </Sheet>
      <ResultOverlay restaurant={result} onClose={handleResultClose} />
    </div>
  );
}

function Header() {
  return (
    <header
      className="flex h-14 shrink-0 items-center justify-center border-b border-border px-5"
      style={{ paddingTop: "env(safe-area-inset-top, 0)" }}
    >
      <h1 className="text-lg font-semibold tracking-tight">NCU What 2 Eat</h1>
    </header>
  );
}

function WheelStage({
  restaurants,
  onResult,
  wheelRef,
}: {
  restaurants: WheelRestaurant[];
  onResult: (r: WheelRestaurant) => void;
  wheelRef: React.RefObject<WheelHandle | null>;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="relative aspect-square w-full max-w-[22rem]">
        {/* Fixed pointer triangle at left-center */}
        <div
          aria-hidden
          className="absolute -left-5 top-1/2 z-10 h-4 w-6 -translate-y-1/2 bg-accent"
          style={{ clipPath: "polygon(100% 50%, 0 0, 0 100%)" }}
        />
        <Wheel ref={wheelRef} restaurants={restaurants} onResult={onResult} />
      </div>
    </main>
  );
}

function BottomActions({
  onSelectShops,
  onCreateRoom,
  onJoinRoom,
}: {
  onSelectShops: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}) {
  return (
    <footer
      className="flex shrink-0 flex-col gap-3 border-t border-border px-5 pt-3"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
    >
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCreateRoom}
          className="h-11 flex-1 rounded-button border border-border bg-card text-sm font-medium transition-transform active:scale-[0.97]"
        >
          創建房間
        </button>
        <button
          type="button"
          onClick={onJoinRoom}
          className="h-11 flex-1 rounded-button border border-border bg-card text-sm font-medium transition-transform active:scale-[0.97]"
        >
          加入房間
        </button>
      </div>
      <button
        type="button"
        onClick={onSelectShops}
        className="h-12 w-full rounded-button bg-accent text-base font-semibold text-white transition-transform active:scale-[0.98]"
      >
        選擇商家
      </button>
    </footer>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return <div className="p-6 text-sm text-text-muted">{children}</div>;
}
