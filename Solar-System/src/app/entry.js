import { init, cleanup } from "./application.js";
import { initLearningTools } from "../ui/learningTools.js";

await init();
const learningTools = initLearningTools();

window.addEventListener("beforeunload", () => {
  learningTools?.destroy();
  cleanup();
}, { once: true });
