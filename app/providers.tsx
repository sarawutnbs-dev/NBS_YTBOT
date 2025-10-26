"use client";

import { ConfigProvider, theme } from "antd";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Lazily create the query client once per app shell.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ConfigProvider
          theme={{
            algorithm: theme.defaultAlgorithm,
            token: {
              colorPrimary: "#eb5757"
            }
          }}
        >
          {children}
        </ConfigProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
