import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terminal Chatroom',
  description: 'A terminal-style encrypted chatroom',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
