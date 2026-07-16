import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { SearchPage } from "@/routes/SearchPage";
import { BrowsePage } from "@/routes/BrowsePage";
import { ProfilePage } from "@/routes/ProfilePage";
import { NotificationsPage } from "@/routes/NotificationsPage";
import { OAuthCallback } from "@/routes/OAuthCallback";

const rootRoute = createRootRoute({
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: SearchPage,
});

/** Infinite-scroll browse view for a genre/category. */
const browseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/browse/$category",
  component: BrowsePage,
});

/** The logged-in user's own profile. */
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: ProfilePage,
});

/** A public profile by DID or handle. */
const actorProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/$actor",
  component: ProfilePage,
});

/** Full-screen notifications view (used by the mobile bell). */
const notificationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notifications",
  component: NotificationsPage,
});

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: OAuthCallback,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  browseRoute,
  profileRoute,
  actorProfileRoute,
  notificationsRoute,
  oauthCallbackRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
