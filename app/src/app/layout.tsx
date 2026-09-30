import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Beggar Live — 16:9 Livestream Overlay",
  description: "Interactive fictional entertainment livestream character prototype for OBS Studio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="h-full w-full overflow-hidden bg-black text-white">
        {children}
      </body>
    </html>
  );
}
