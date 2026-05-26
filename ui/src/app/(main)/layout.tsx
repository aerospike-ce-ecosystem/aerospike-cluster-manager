export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Padding is handled by `.acm-main` in globals.css to match the Huginn
  // shell layout (sidebar + topbar + statusbar grid). No extra padding here.
  return <div className="relative">{children}</div>
}
