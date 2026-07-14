import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderApp() {
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
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <AppProviders>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RouterProvider router={router as any} />
    </AppProviders>,
  );
}

afterEach(cleanup);

describe("modals open", () => {
  it("opens the Add station modal from the navbar", async () => {
    const user = userEvent.setup();
    renderApp();

    // Wait for the app to mount, then confirm the modal isn't shown yet.
    const addButton = await screen.findByRole("button", {
      name: /add station/i,
    });
    expect(screen.queryByText("Add your own station")).not.toBeInTheDocument();

    await user.click(addButton);

    await waitFor(() =>
      expect(screen.getByText("Add your own station")).toBeInTheDocument(),
    );
    // A field from the modal body is present -> the dialog actually rendered.
    expect(screen.getByText("Stream URL")).toBeInTheDocument();
  });
});
