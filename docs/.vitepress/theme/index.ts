import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import CompressionEstimator from "./components/CompressionEstimator.vue";
import RecallProfileExplorer from "./components/RecallProfileExplorer.vue";
import "./custom.css";

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp({ app }) {
    app.component("CompressionEstimator", CompressionEstimator);
    app.component("RecallProfileExplorer", RecallProfileExplorer);
  },
};

export default theme;
