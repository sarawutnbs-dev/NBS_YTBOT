import type { Metadata } from "next";
import "antd/dist/reset.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "NotebookSPEC Reply Assistant",
  description: "Curate, draft, and approve YouTube replies with affiliate recommendations."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
