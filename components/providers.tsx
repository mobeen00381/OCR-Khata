"use client";

import type { ReactNode } from "react";
import { StoreProvider } from "@/lib/store";
import { ToastProvider } from "./toast";
import { PwaRegister } from "./pwa-register";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <PwaRegister />
        {children}
      </ToastProvider>
    </StoreProvider>
  );
}
