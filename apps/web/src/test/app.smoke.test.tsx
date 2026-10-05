import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { AppProviders } from "@/providers";
import { Layout } from "@/components/Layout";
import { SearchPage } from "@/routes/SearchPage";
import { PrivacyPage } from "@/routes/PrivacyPage";
import { ProfilePage } from "@/routes/ProfilePage";

function renderApp(initialPath: string) {
  const rootRoute = createRootRoute({ component: Layout });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: SearchPage,
  });
  const profileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/profile",
    component: ProfilePage,
  });
  const privacyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/privacy",
    component: PrivacyPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, profileRoute, privacyRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return render(
    <AppProviders>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RouterProvider router={router as any} />
    </AppProviders>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("app smoke", () => {
  it("opens the privacy policy without authentication and links it in the footer", async () => {
    renderApp("/privacy");
    expect(await screen.findByRole("heading", { name: "Privacy Policy", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("heading", { name: "Retention and deletion" })).toBeInTheDocument();
  });

  it("renders the search page without crashing", async () => {
    renderApp("/");
    await waitFor(() =>
      expect(
        screen.getByText("Social radio, made yours."),
      ).toBeInTheDocument(),
    );
    // Brand + the search launcher button (search now lives in the palette).
    expect(
      screen.getByRole("link", { name: /^atradio\s*\.fm$/ }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("button", { name: /search stations/i }),
    ).toBeInTheDocument();
  });

  it("renders the profile page with empty states", async () => {
    renderApp("/profile");
    // Logged out, the profile page shows a sign-in call to action.
    await waitFor(() =>
      expect(
        screen.getByText(/sign in to see your dial/i),
      ).toBeInTheDocument(),
    );
  });
});
