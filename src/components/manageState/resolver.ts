import { StatesStep, manageState } from "../../utils/types.js";

export const resolveStep = (state: manageState): StatesStep => {
  if (!state.hasStarted) return "WELCOME";
  if (!state.apiKeyVerified) return "API_KEY_INPUT";
  if (!state.connectService) return "API_KEY_SUCCESS";
  // if (!state.serviceConnected) return "NO_SERVICE";
  if (!state.showRuntimeOutput) return "NO_SERVICE";
  return "RUNTIME_OUTPUT";
};;
