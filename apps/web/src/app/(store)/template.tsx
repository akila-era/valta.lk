/** Re-created on every navigation between store pages, so each page change plays the page-in animation. */
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
