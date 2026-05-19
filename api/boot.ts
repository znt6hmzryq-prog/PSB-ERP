import "dotenv/config";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "./router";
import { createContext } from "./context";
import { createOAuthCallbackHandler } from "./kimi/auth";

import { Paths } from "@contracts/constants";
import { registerUploadRoutes } from "./upload-handler";

const app = new Hono<{
  Bindings: HttpBindings;
}>();

// Body limit
app.use(
  bodyLimit({
    maxSize: 50 * 1024 * 1024,
  }),
);

// OAuth callback
app.get(
  Paths.oauthCallback,
  createOAuthCallbackHandler(),
);

// File upload & serving routes
registerUploadRoutes(app);

// tRPC API
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});

// Health check
app.get("/", (c) => {
  return c.text("PSB-ERP Backend Running");
});

// 404 API fallback
app.all("/api/*", (c) => {
  return c.json(
    {
      error: "Not Found",
    },
    404,
  );
});

export default app;

// Start backend server
const port = Number(process.env.PORT || 3000);

serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(
      `🚀 PSB-ERP Backend running at http://localhost:${port}`,
    );

    console.log(
      `✅ tRPC endpoint: http://localhost:${port}/api/trpc`,
    );
  },
);