/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("cerebro drawer does not expose duplicated base templates", () => {
  const page = read("src/app/dashboard/assistant/[id]/page.tsx");
  const config = read("src/lib/ai/agent/dashboard-config.ts");
  const promptBuilder = read("src/lib/ai/agent/prompt-builder.ts");
  const css = read("src/app/dashboard/assistant/assistant.module.css");

  assert.equal(page.includes("Plantillas de Ayuda"), false);
  assert.equal(page.includes("DASHBOARD_CONFIG_PRESETS.map"), false);
  assert.equal(page.includes("applyPreset"), false);
  assert.equal(page.includes("activePreset"), false);
  assert.equal(config.includes("DASHBOARD_CONFIG_PRESETS"), false);
  assert.equal(config.includes("applyDashboardConfigPreset"), false);
  assert.equal(promptBuilder.includes("DASHBOARD_CONFIG_PRESETS"), false);
  assert.equal(promptBuilder.includes("applyDashboardConfigPreset"), false);
  assert.equal(css.includes("presetCard"), false);
  assert.equal(css.includes("presetOption"), false);
});

test("cerebro graph view does not inject demo graph data over real data", () => {
  const page = read("src/app/dashboard/assistant/[id]/page.tsx");

  assert.equal(page.includes("DEMO_GRAPH_DATA"), false);
  assert.equal(page.includes("setGraphData(DEMO_GRAPH_DATA)"), false);
  assert.equal(page.includes("Inject demo data"), false);
  assert.match(page, /setGraphData\(null\)/);
  assert.match(page, /setGraphData\(\{\s*nodes:\s*\[\],\s*edges:\s*\[\]\s*\}\)/);
});

test("dashboard cerebro page does not keep unused legacy graph renderers", () => {
  const page = read("src/app/dashboard/assistant/[id]/page.tsx");

  assert.equal(page.includes("function BrainBackground"), false);
  assert.equal(page.includes("function layoutGraph"), false);
  assert.equal(page.includes("useViewport"), false);
});

test("graph endpoint does not load integration credentials for visualization", () => {
  const route = read("src/app/api/assistant/config/[id]/graph/route.ts");
  const accountQueryStart = route.indexOf("prisma.integrationAccount.findMany");
  assert.notEqual(accountQueryStart, -1);

  const accountQuery = route.slice(accountQueryStart, route.indexOf("])", accountQueryStart));

  assert.match(accountQuery, /select:\s*\{/);
  assert.equal(accountQuery.includes("credentials"), false);
});

test("graph endpoint caps visual graph volume", () => {
  const route = read("src/app/api/assistant/config/[id]/graph/route.ts");

  assert.match(route, /MAX_GRAPH_MEMORIES/);
  assert.match(route, /MAX_GRAPH_DOCUMENTS/);
  assert.match(route, /MAX_GRAPH_TOOLS/);
  assert.match(route, /take:\s*MAX_GRAPH_MEMORIES/);
  assert.match(route, /take:\s*MAX_GRAPH_DOCUMENTS/);
  assert.match(route, /take:\s*MAX_GRAPH_TOOLS/);
});

test("graph endpoint exposes relationship type expected by the graph UI", () => {
  const route = read("src/app/api/assistant/config/[id]/graph/route.ts");

  assert.match(route, /type:\s*"TIENE_CONOCIMIENTO"/);
  assert.match(route, /type:\s*"DOCUMENTO"/);
  assert.match(route, /type:\s*"USA_HERRAMIENTAS"/);
  assert.match(route, /type:\s*"HERRAMIENTA_ACTIVA"/);
  assert.match(route, /type:\s*"INTERACT/);
  assert.match(route, /type:\s*"RECUERDA"/);
});

test("agent memories are scoped by assistant config", () => {
  const schema = read("prisma/schema.prisma");
  const memory = read("src/lib/agent-memory/index.ts");
  const pipeline = read("src/lib/ai/agent/agent-pipeline.ts");
  const graphRoute = read("src/app/api/assistant/config/[id]/graph/route.ts");

  assert.match(schema, /assistantConfigId\s+String\?/);
  assert.match(schema, /assistantConfig\s+AssistantConfig\?/);
  assert.match(schema, /memories\s+AgentMemory\[\]/);
  assert.match(memory, /assistantConfigId\?:\s*string/);
  assert.match(memory, /assistantConfigId:\s*opts\.assistantConfigId\s*\?\?\s*null/);
  assert.match(pipeline, /getMemories\(\{\s*userId,\s*assistantConfigId:\s*config\.id/);
  assert.match(pipeline, /saveMemory\(\{\s*userId,\s*assistantConfigId/);
  assert.match(pipeline, /decayMemories\(userId,\s*assistantConfigId/);
  assert.match(graphRoute, /assistantConfigId:\s*profileId/);
});

test("graph endpoint scopes knowledge documents to the authenticated user", () => {
  const route = read("src/app/api/assistant/config/[id]/graph/route.ts");
  const documentQueryStart = route.indexOf("prisma.knowledgeDocument.findMany");
  assert.notEqual(documentQueryStart, -1);

  const documentQuery = route.slice(documentQueryStart, route.indexOf("}),", documentQueryStart));

  assert.match(documentQuery, /assistantConfigId:\s*profileId/);
  assert.match(documentQuery, /userId:\s*session\.user\.id/);
});

test("graph endpoint merges LightRAG knowledge graph when RAG is enabled", () => {
  const route = read("src/app/api/assistant/config/[id]/graph/route.ts");
  const client = read("src/lib/ai/rag/lightrag-client.ts");

  assert.match(route, /import \{ LightRAGClient \}/);
  assert.match(route, /getGraph\(profileId/);
  assert.match(route, /RAG_ENTIDAD/);
  assert.match(route, /RELACION_RAG/);
  assert.match(client, /export interface LightRAGGraph/);
  assert.equal(client.includes("any[]"), false);
});

test("graph endpoint includes simple dashboard knowledge as graph knowledge", () => {
  const route = read("src/app/api/assistant/config/[id]/graph/route.ts");

  assert.match(route, /hasConfiguredSimpleKnowledge/);
  assert.match(route, /existingProfile\.simpleInfo/);
  assert.match(route, /simple_knowledge_/);
  assert.match(route, /CONOCIMIENTO_CONFIGURADO/);
  assert.match(route, /Informacion configurada en el dashboard/);
});

test("visual brain renders functional chambers for the agent graph", () => {
  const graph = read("src/app/dashboard/assistant/[id]/Brain3DGraph.tsx");

  assert.match(graph, /BRAIN_CHAMBERS/);
  assert.match(graph, /Identidad/);
  assert.match(graph, /Conocimiento indexado/);
  assert.match(graph, /Herramientas/);
  assert.match(graph, /Memoria viva/);
  assert.match(graph, /getChamberStats/);
  assert.match(graph, /memoryLoad/);
  assert.match(graph, /computeForceLayout/);
  assert.match(graph, /core-/);
  assert.match(graph, /extendedEdges/);
});

test("visual brain uses React Three Fiber and keeps graph nodes inside chambers", () => {
  const graph = read("src/app/dashboard/assistant/[id]/Brain3DGraph.tsx");
  const pkg = JSON.parse(read("package.json"));

  assert.match(graph, /import \* as THREE from 'three'/);
  assert.match(graph, /from '@react-three\/fiber'/);
  assert.match(graph, /from '@react-three\/drei'/);
  assert.match(graph, /<Canvas/);
  assert.match(graph, /OrbitControls/);
  assert.match(graph, /computeForceLayout/);
  assert.match(graph, /corePosition/);
  assert.match(graph, /extendedEdges/);
  assert.match(graph, /visibleNodes/);
  assert.ok(pkg.dependencies.three || pkg.devDependencies.three);
  assert.ok(pkg.dependencies["@react-three/fiber"] || pkg.devDependencies["@react-three/fiber"]);
  assert.ok(pkg.dependencies["@react-three/drei"] || pkg.devDependencies["@react-three/drei"]);
});

test("visual graph renders Obsidian-like nodes and highlighted links", () => {
  const graph = read("src/app/dashboard/assistant/[id]/Brain3DGraph.tsx");

  assert.match(graph, /ObsidianGraphNode/);
  assert.match(graph, /obsidian-graph-edges/);
  assert.match(graph, /LineSegments/);
  assert.match(graph, /LineBasicMaterial/);
  assert.match(graph, /connectedNodeIds/);
  assert.match(graph, /isConnected/);
  assert.match(graph, /hitRadius/);
  assert.match(graph, /obsidian-node-hit-area/);
  assert.match(graph, /buildSynapseEdges/);
  assert.equal(graph.includes("TubeGeometry"), true);
  assert.equal(graph.includes("createNeuronBranchesGeometry"), false);
});

test("visual graph keeps direct edges inside their assigned brain chambers", () => {
  const graph = read("src/app/dashboard/assistant/[id]/Brain3DGraph.tsx");

  assert.match(graph, /function isSameChamberEdge/);
  assert.match(graph, /buildSynapseEdges\(\s*[\s\S]*nodeById:\s*Map<string,\s*GraphNode>/);
  assert.match(graph, /if \(!isSameChamberEdge\(edge,\s*nodeById\)\) continue/);
  assert.match(graph, /if \(!isSameChamberEdge\(edge,\s*nodeById\)\) return/);
  assert.match(graph, /computeForceLayout\([\s\S]*if \(!isSameChamberEdge\(edge,\s*nodeById\)\) continue/);
});
