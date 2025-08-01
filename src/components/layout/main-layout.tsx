import * as React from "react"
import { Header } from "./header"
import { Footer } from "./footer"
import { BottomNav } from "@/components/navigation/bottom-nav"

interface MainLayoutProps {
  children: React.ReactNode
  user?: {
    id: string
    email: string
    name?: string
    avatar?: string
  }
}

export function MainLayout({ children, user }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      <Footer />
      {user && <BottomNav />}
    </div>
  )
}