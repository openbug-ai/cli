import React from "react";
import { StatesStep } from "../../utils/types.js";

export const screenMap: Record<StatesStep, React.LazyExoticComponent<React.FC>> = {
  WELCOME: React.lazy(() => import("../screens/Welcome.js")),
  API_KEY_INPUT: React.lazy(() => import("../screens/ApiKeyInput.js")),
  API_KEY_SUCCESS: React.lazy(() => import("../screens/ApiKeySuccess.js")),
  NO_SERVICE: React.lazy(() => import("../screens/NoServiceConnected.js")),
  // SERVICE_CONNECTED: React.lazy(() => import("../screens/ServiceConnected.js")),
  RUNTIME_OUTPUT: React.lazy(() => import("../screens/RuntimeOutput.js")),
};
