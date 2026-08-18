import express from "express";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import {
  getCourse,
  getCourses,
  getHome,
  getLesson,
  getLessons,
  getQuizByLesson,
  initializeLearningState,
  openLesson,
  submitQuiz,
  user,
} from "./data.js";
import { createProgressRepository } from "./persistence.js";
import {
  completeSimulation,
  configureSimulationRepository,
  createSimulation,
  getSimulationState,
  listScenarios,
  makeTrade,
  pauseSimulation,
  resumeSimulation,
} from "./simulation.js";
import { createSimulationRepository } from "./simulation-persistence.js";
import { getMarketAssetDetail, getMarketAssets } from "./market-data.js";
import { getMarketNews, listMarketNews } from "./market-news.js";
import { configureSecurityRepository, getSecurityCase, getSecurityProgress, getThreat, listSecurityCases, listThreats, submitSecurityCase } from "./security-data.js";
import { createSecurityRepository } from "./security-persistence.js";
import { getFullProfile } from "./profile-data.js";

try {
  loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // .env is optional; deployed environments provide variables directly.
}

const app = express();
const port = Number(process.env.PORT ?? 4100);
const webDistPath = fileURLToPath(new URL("../../web/dist", import.meta.url));
const webIndexPath = fileURLToPath(new URL("../../web/dist/index.html", import.meta.url));

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/api/v1/health", (_request, response) => {
  response.json({ status: "ok", service: "crypto-education-api" });
});

app.post("/api/v1/auth/max", (request, response) => {
  const initData = request.body?.initData;

  if (typeof initData !== "string" || initData.trim().length === 0) {
    response.status(401).json({ message: "Invalid MAX launch data" });
    return;
  }

  response.json({ accessToken: "local-development-token", user });
});

app.get("/api/v1/home", (_request, response) => response.json(getHome()));
app.get("/api/v1/courses", (_request, response) => response.json(getCourses()));
app.get("/api/v1/courses/:courseId/lessons", (request, response) => {
  const course = getCourse(request.params.courseId);
  if (!course) {
    response.status(404).json({ message: "Course not found" });
    return;
  }
  response.json(getLessons(course.id));
});
app.get("/api/v1/lessons/:lessonId", (request, response) => {
  const item = getLesson(request.params.lessonId);
  if (!item) {
    response.status(404).json({ message: "Lesson not found" });
    return;
  }
  response.json(item);
});
app.post("/api/v1/lessons/:lessonId/open", async (request, response) => {
  if (!await openLesson(request.params.lessonId)) {
    response.status(404).json({ message: "Lesson not found" });
    return;
  }
  response.status(204).send();
});
app.get("/api/v1/lessons/:lessonId/quiz", (request, response) => {
  const quiz = getQuizByLesson(request.params.lessonId);
  if (!quiz) {
    response.status(404).json({ message: "Quiz not found" });
    return;
  }
  response.json(quiz);
});
app.post("/api/v1/quizzes/:quizId/submit", async (request, response) => {
  const answers = request.body?.answers;
  if (!Array.isArray(answers)) {
    response.status(400).json({ message: "Answers are required" });
    return;
  }
  const result = await submitQuiz(request.params.quizId, answers);
  if (!result) {
    response.status(400).json({ message: "Answer every question before submitting" });
    return;
  }
  response.json(result);
});
app.get("/api/v1/market/assets", async (_request, response) => response.json(await getMarketAssets()));
app.get("/api/v1/market/assets/:symbol", async (request, response) => {
  const asset = await getMarketAssetDetail(request.params.symbol, String(request.query.period ?? "1W"));
  if (!asset) {
    response.status(404).json({ message: "Market asset not found" });
    return;
  }
  response.json(asset);
});
app.get("/api/v1/news", (_request, response) => response.json(listMarketNews()));
app.get("/api/v1/news/:newsId", (request, response) => {
  const article = getMarketNews(request.params.newsId);
  if (!article) {
    response.status(404).json({ message: "News article not found" });
    return;
  }
  response.json(article);
});
app.get("/api/v1/security/cases", async (_request, response) => response.json(await listSecurityCases(user.id)));
app.get("/api/v1/security/cases/:caseId", async (request, response) => {
  const item = await getSecurityCase(request.params.caseId, user.id);
  if (!item) {
    response.status(404).json({ message: "Security case not found" });
    return;
  }
  response.json(item);
});
app.post("/api/v1/security/cases/:caseId/submit", async (request, response) => {
  const optionId = request.body?.optionId;
  if (typeof optionId !== "string" || !optionId) {
    response.status(400).json({ message: "Option is required" });
    return;
  }
  const result = await submitSecurityCase(request.params.caseId, optionId, user.id);
  if (!result) {
    response.status(400).json({ message: "Security case or option not found" });
    return;
  }
  response.json(result);
});
app.get("/api/v1/security/threats", (_request, response) => response.json(listThreats()));
app.get("/api/v1/security/threats/:threatId", (request, response) => {
  const item = getThreat(request.params.threatId);
  if (!item) {
    response.status(404).json({ message: "Threat not found" });
    return;
  }
  response.json(item);
});
app.get("/api/v1/security/progress", async (_request, response) => response.json(await getSecurityProgress(user.id)));
app.get("/api/v1/profile", async (_request, response) => {
  response.json(await getFullProfile());
});

app.get("/api/v1/scenarios", (_request, response) => response.json(listScenarios()));
app.post("/api/v1/simulations", async (request, response) => {
  const state = await createSimulation(String(request.body?.scenarioId ?? ""));
  if (!state) {
    response.status(404).json({ message: "Scenario not found" });
    return;
  }
  response.status(201).json(state);
});
app.get("/api/v1/simulations/:sessionId/state", async (request, response) => {
  const state = await getSimulationState(request.params.sessionId);
  if (!state) {
    response.status(404).json({ message: "Simulation not found" });
    return;
  }
  response.json(state);
});
app.post("/api/v1/simulations/:sessionId/pause", async (request, response) => {
  const state = await pauseSimulation(request.params.sessionId);
  state ? response.json(state) : response.status(404).json({ message: "Simulation not found" });
});
app.post("/api/v1/simulations/:sessionId/resume", async (request, response) => {
  const state = await resumeSimulation(request.params.sessionId);
  state ? response.json(state) : response.status(404).json({ message: "Simulation not found" });
});
app.post("/api/v1/simulations/:sessionId/trades", async (request, response) => {
  const result = await makeTrade(request.params.sessionId, request.body ?? {}, request.header("Idempotency-Key"));
  if ("error" in result) {
    response.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  response.status(201).json(result.data);
});
app.post("/api/v1/simulations/:sessionId/complete", async (request, response) => {
  const result = await completeSimulation(request.params.sessionId);
  if ("error" in result) {
    response.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  response.json(result.data);
});

app.use(express.static(webDistPath));
app.get(/^(?!\/api\/).*/, (_request, response) => {
  response.sendFile(webIndexPath);
});

app.use((_request, response) => {
  response.status(404).json({ message: "Route not found" });
});

const progressRepository = await createProgressRepository();
await initializeLearningState(progressRepository);
const simulationRepository = await createSimulationRepository();
configureSimulationRepository(simulationRepository);
const securityRepository = await createSecurityRepository();
configureSecurityRepository(securityRepository);

app.listen(port, () => {
  console.log(`[api] listening on http://localhost:${port}`);
});
