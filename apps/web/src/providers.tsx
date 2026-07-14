import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider as JotaiProvider } from "jotai";

// HeroUI v3 requires no Provider wrapper — theming is CSS-driven via the
// `.dark` / `data-theme="dark"` attributes on <html>.
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <JotaiProvider>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen overflow-x-hidden">{children}</div>
      </QueryClientProvider>
    </JotaiProvider>
  );
}
