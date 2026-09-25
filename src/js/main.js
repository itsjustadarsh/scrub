/* Entry point. In development the browser loads this as an ES module;
   `npm run build` inlines the whole graph into a single index.html. */
import { init } from "./ui/index.js";

init();
