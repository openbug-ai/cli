import axios from "axios";
import { config } from "./config.js";
import { checkVersionCompatibility } from "./utils/version-check.js";

const BASE_URL = config.api_base_url;

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Network error (no response received)
    if (!error.response) {
      const networkError = new Error(
        "Network error: No internet connection"
      ) as Error & { code: string };
      networkError.code = "NETWORK_ERROR";
      return Promise.reject(networkError);
    }

    if (error.response) {
      const isCompatible = await checkVersionCompatibility(true);
      if (!isCompatible) {
        return Promise.reject(
          new Error(
            "CLI version deprecated. Try updating to the latest version."
          )
        );
      }
    }
    return Promise.reject(error);
  }
);

//check for valid api key
export const isValidAuthKey = async (authKey: string) => {
  const isValid = await axios.post(`${BASE_URL}/auth/login`, { authKey });
  return isValid.data;
};

export const toolFunctionCall = async (
  tool_call_id,
  resultArgs,
  args,
  function_name
) => {
  const result = await axios.post(`${BASE_URL}/tool/toolFunctionCall`, {
    tool_call_id,
    resultArgs,
    args,
    function_name,
  });
  return result?.data;
};
