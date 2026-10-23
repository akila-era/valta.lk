import { StoreShell } from "@/components/layout/store-shell";

export const dynamic = "force-dynamic";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return <StoreShell contained={false}>{children}</StoreShell>;
}
