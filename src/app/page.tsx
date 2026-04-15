"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { ShopSheet } from "@/components/ShopSheet";

export default function Home() {
  const [shopOpen, setShopOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<Set<string>>(new Set());

  return (
    <div className="flex h-dvh flex-col bg-bg text-text select-none">
      <Header />
      <WheelStage selectedCount={selectedRestaurantIds.size} />
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

function WheelStage({ selectedCount }: { selectedCount: number }) {
  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <div className="relative aspect-square w-full max-w-[22rem]">
        <div
          aria-hidden
          className="absolute left-1/2 -top-5 z-10 h-6 w-4 -translate-x-1/2 bg-accent"
          style={{ clipPath: "polygon(50% 100%, 0 0, 100% 0)" }}
        />
        <div className="flex size-full items-center justify-center rounded-full border border-border bg-card">
          <p className="text-sm text-text-muted">
            {selectedCount > 0 ? `已選 ${selectedCount} 間餐廳` : "選擇商家後開始"}
          </p>
        </div>
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
