import { cp, mkdir, rm } from "node:fs/promises";
const files=["index.html","styles.css","app.js","ai-provider-adapter.js","catalog-engine.js","consent-manager.js","dialogue-engine.js","exercise-database.js","intent-engine.js","knowledge-engine.js","nutrition-engine.js","periodization-engine.js","quality-engine.js","safety-engine.js"];
await rm("dist",{recursive:true,force:true}); await mkdir("dist",{recursive:true});
for(const file of files) await cp(file,`dist/${file}`); await cp("data","dist/data",{recursive:true});
console.log(`Built ${files.length} static assets in dist/.`);
