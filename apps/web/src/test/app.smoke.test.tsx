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
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, profileRoute]),
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
  it("renders the search page without crashing", async () => {
    renderApp("/");
    await waitFor(() =>
      expect(
        screen.getByText("Social radio, made yours."),
      ).toBeInTheDocument(),
    );
    // Brand + the search launcher button (search now lives in the palette).
    expect(screen.getByText("atradio.fm")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /search stations/i }),
    ).toBeInTheDocument();
  });

  it("renders the profile page with empty states", async () => {
    renderApp("/profile");
    await waitFor(() =>
      expect(screen.getByText("Your dial")).toBeInTheDocument(),
    );
    expect(screen.getByText(/no favorites yet/i)).toBeInTheDocument();
  });
});
