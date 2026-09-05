import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import AuthProvider from "@/components/auth/AuthProvider";
import { SessionProvider } from "@/components/auth/SessionProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "netrichtechnologies | Microsoft 365 Control Panel",
  description:
    "Manage Microsoft 365, Dynamics 365, Azure, and more through the netrichtechnologies Microsoft 365 Control Panel.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://office365.cp.netrichtechnologies.com"
  ),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className={`${jakarta.className} antialiased`}>
        <AuthProvider>
          <SessionProvider>{children}</SessionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
