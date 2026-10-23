"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Notice, type NoticeTone } from "./notice";

type Push = (text: string, tone?: NoticeTone) => void;

const ToastContext = createContext<Push | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; tone: NoticeTone; text: string }[]>([]);
  const push = useCallback<Push>((text, tone = "info") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current.slice(-3), { id, tone, text }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(100%-2rem,22rem)] flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <Notice tone={item.tone}>{item.text}</Notice>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Push {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside ToastProvider");
  return push;
}
