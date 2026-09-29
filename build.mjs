import { cp, mkdir, rm } from "node:fs/promises";

const outputDirectory = "dist";
const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "ai-provider-adapter.js",
  "catalog-engine.js",
  "consent-manager.js",
  "conversation-utils.js",
  "dialogue-engine.js",
  "exercise-database.js",
  "food-plan-utils.js",
  "intent-engine.js",
  "knowledge-engine.js",
  "nutrition-engine.js",
  "periodization-engine.js",
  "quality-engine.js",
  "safety-engine.js",
  "message-renderer.js",
  "profile-manager.js",
];

async function prepareOutputDirectory() {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
}

async function copyPublicAssets() {
  await Promise.all(publicFiles.map((file) => cp(file, `${outputDirectory}/${file}`)));
  await Promise.all([
    cp("data", `${outputDirectory}/data`, { recursive: true }),
    cp("assets", `${outputDirectory}/assets`, { recursive: true }),
  ]);
}

await prepareOutputDirectory();
await copyPublicAssets();
console.log(`Built ${publicFiles.length} static assets in ${outputDirectory}/.`);
