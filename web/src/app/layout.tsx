import type { Metadata } from "next";
import { SessionProvider } from "@/store/SessionProvider";
import { VaultProvider } from "@/store/VaultProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secret Manager",
  description: "Zero-knowledge secret manager — web client",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <VaultProvider>
            <main>{children}</main>
          </VaultProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
