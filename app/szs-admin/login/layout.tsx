// Separates Layout für die SZS-Login-Seite - kein SZS-Layout mit Sidebar
export default function SzsLoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
