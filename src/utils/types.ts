export type StatesStep =
  | "WELCOME"
  | "API_KEY_INPUT"
  | "API_KEY_SUCCESS"
  | "NO_SERVICE"
  // | "SERVICE_CONNECTED"
  | "RUNTIME_OUTPUT";

export type manageState = {
  hasStarted: boolean;
  apiKeyVerified: boolean;
  connectService: boolean;
  // serviceConnected: boolean;
  showRuntimeOutput: boolean;
};
