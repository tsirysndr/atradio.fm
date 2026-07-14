import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { SearchPage } from "@/routes/SearchPage";
import { ProfilePage } from "@/routes/ProfilePage";
import { OAuthCallback } from "@/routes/OAuthCallback";

const rootRoute = createRootRoute({
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: SearchPage,
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

const oauthCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/callback",
  component: OAuthCallback,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  profileRoute,
  actorProfileRoute,
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
