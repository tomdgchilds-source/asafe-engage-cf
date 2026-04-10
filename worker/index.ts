import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";

// Route imports
import auth from "./routes/auth";
import users from "./routes/users";
import products from "./routes/products";
import orders from "./routes/orders";
import cart from "./routes/cart";
import quotes from "./routes/quotes";
import calculations from "./routes/calculations";
import pricing from "./routes/pricing";
import caseStudies from "./routes/caseStudies";
import resources from "./routes/resources";
import faqs from "./routes/faqs";
import layoutDrawings from "./routes/layoutDrawings";
import siteSurveys from "./routes/siteSurveys";
import chat from "./routes/chat";
import notifications from "./routes/notifications";
import companyLogo from "./routes/companyLogo";
import globalOffices from "./routes/globalOffices";
import solutionRequests from "./routes/solutionRequests";
import files from "./routes/files";
import safety from "./routes/safety";
import admin from "./routes/admin";
import analytics from "./routes/analytics";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS for API routes
app.use("/api/*", cors());

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ message: "Internal server error" }, 500);
});

// Mount all route groups under /api
app.route("/api", auth);
app.route("/api", users);
app.route("/api", products);
app.route("/api", orders);
app.route("/api", cart);
app.route("/api", quotes);
app.route("/api", calculations);
app.route("/api", pricing);
app.route("/api", caseStudies);
app.route("/api", resources);
app.route("/api", faqs);
app.route("/api", layoutDrawings);
app.route("/api", siteSurveys);
app.route("/api", chat);
app.route("/api", notifications);
app.route("/api", companyLogo);
app.route("/api", globalOffices);
app.route("/api", solutionRequests);
app.route("/api", files);
app.route("/api", safety);
app.route("/api", admin);
app.route("/api", analytics);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

export default app;
