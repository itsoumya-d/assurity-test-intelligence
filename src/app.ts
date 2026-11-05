import Fastify, { FastifyInstance } from "fastify";
import { dashboardPage } from "./dashboard.js";
import { TestIntelligenceService, TestResult } from "./intelligence.js";

export function buildApp(service: TestIntelligenceService): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/", async (_request, reply) => reply.type("text/html").send(dashboardPage()));

  app.post("/api/results", async (request, reply) => {
    try {
      service.record(request.body as TestResult);
      return reply.code(201).send({ accepted: true });
    } catch (error) {
      return reply.code(422).send({ error: (error as Error).message });
    }
  });

  app.get("/api/results", async () => service.list());
  app.get("/api/summary", async () => service.summary());

  return app;
}
