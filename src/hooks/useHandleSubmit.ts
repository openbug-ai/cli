import type { CoreMessage } from "../../coreMessages.js";
import logsManager from "../../logsManager.js";
import {
  fetchProjectsFromCluster,
  loadProjectMetadata,
} from "../../helpers/cli-helpers.js";
import { fetchLogsFromCluster, generateArchitecture } from "../utils/utils.js";

type ProjectLike = {
  path?: string;
  description?: string;
  name?: string;
  window_id?: number;
  logs_available?: boolean;
  code_available?: boolean;
};

type Args = {
  activeProject: any;
  activeConnections: ProjectLike[];
  visibleChats: CoreMessage[];
  setVisibleChats: Function;
  setChatResponseMessages: Function;
  setTrimmedChats: Function;
  sendQuery: (messages: CoreMessage[], architecture: string, logs?: string, planningDoc?: string) => void;
  setValue: Function;
  isLoading: boolean;
};

function toProject(c: ProjectLike): {
  path: string;
  description: string;
  name?: string;
  window_id: number;
  logs_available: boolean;
  code_available: boolean;
} {
  return {
    path: c.path ?? process.cwd(),
    description: c.description ?? "",
    name: c.name,
    window_id: c.window_id ?? Date.now(),
    logs_available: c.logs_available !== false,
    code_available: c.code_available !== false,
  };
}

export function useChatSubmit({
  activeProject,
  activeConnections,
  visibleChats,
  setVisibleChats,
  setChatResponseMessages,
  setTrimmedChats,
  sendQuery,
  setValue,
  isLoading,
}: Args) {
  return async function handleSubmit(value: string) {
    if (isLoading || !value.trim() || !activeProject) return;

    const userMessage: CoreMessage = { role: "user", content: value.trim() };
    const updatedChats = [...visibleChats, userMessage];

    setVisibleChats(updatedChats);
    setChatResponseMessages((prev: CoreMessage[]) => [...prev, userMessage]);
    setTrimmedChats((prev: CoreMessage[]) => [...prev, userMessage]);
    setValue("");
    let logs = "";
    if (activeProject.logs_available && activeProject.window_id) {
      logs =
        logsManager.getLogs() ||
        (await fetchLogsFromCluster(activeProject.window_id)) ||
        "";
    }
    let architecture = "";
    if (activeConnections.length > 0) {
      architecture = generateArchitecture(
        activeConnections.map((c) => toProject(c))
      );
    }
    if (!architecture) {
      try {
        let metadata: any =
          activeProject.path && loadProjectMetadata(activeProject.path);
        if (!metadata) {
          metadata = { id: "openbug-service", path: activeProject.path };
        }
        const projects = await fetchProjectsFromCluster(metadata);
        if (projects?.projects?.length) {
          architecture = generateArchitecture(projects.projects);
        }
      } catch {}
    }

    if (!architecture) return;

    const initialAssistantContent =
      "I'm watching your app run locally. You can ask me about errors, logs, performance,or anything else related to this run.";

    const messagesToSend = updatedChats.filter((msg) => {
      if (msg.role === "assistant" && typeof msg.content === "string") {
        return msg.content !== initialAssistantContent;
      }
      return true;
    });

    sendQuery(messagesToSend, architecture, logs, "");
  };
}
