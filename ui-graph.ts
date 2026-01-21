// import * as fs from 'fs';
// import {
//   StateGraph,
//   START,
//   END,
//   Annotation,
// 	messagesStateReducer,
// 	AnnotationRoot,
// 	Command,
// } from "@langchain/langgraph";
// import { createReactAgent } from "@langchain/langgraph/prebuilt";
// import { ChatOpenAI } from "@langchain/openai";
// import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
// import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
// import { tool } from "@langchain/core/tools";
// import { z } from "zod";

// import * as dotenv from "dotenv";
// dotenv.config();

// const llm = new ChatOpenAI({
// 	model: "gpt-4o",
// 	temperature: 0,
// 	openAIApiKey: process.env.OPENAI_API_KEY,
// });

// function getContextLines(
//   fileName: string,
//   lineNumber: number,
//   before: number = 3,
//   after: number = 3
// ): string {
//   const lines = fs.readFileSync(fileName, 'utf-8').split('\n');
//   const start = Math.max(0, lineNumber - before - 1);
//   const end = Math.min(lines.length, lineNumber + after);
//   return lines.slice(start, end).join('\n');
// }

// const getContextLinesTool = tool(
//   async ({ fileName, lineNumber, before = 3, after = 3 }) => {
//     console.log("Reading files:", fileName, lineNumber);
    
//     return getContextLines(`${fileName}`, lineNumber, before, after);
//   },
//   {
//     name: "get_context_lines",
//     description: "Get a few lines before and after a line number in a file.",
//     schema: z.object({
//       fileName: z.string().describe("Path to the file"),
//       lineNumber: z.number().describe("Line number (1-based)"),
//       before: z.number().optional().describe("Lines before"),
//       after: z.number().optional().describe("Lines after")
//     })
//   }
// );

// const agent = createReactAgent({
//   llm: llm,
//   tools: [getContextLinesTool]
// })

// const webSearchTool = new TavilySearchResults({
// 	maxResults: 4,
// 	apiKey: process.env.TAVILY_API_KEY,
// });

// const tools = [webSearchTool];

// const GraphState = Annotation.Root({
// 	messages: Annotation<BaseMessage[]>({
//     reducer: messagesStateReducer,
//     default: () => [],
//   }),
//   userInput: Annotation<string>,
// 	logs: Annotation<string>
// });

// type GS = {
// 	logs: string,
// 	messages: BaseMessage[],
//   userInput: string
// }

// const primaryNode = async (state: GS) => {
// 	const systemMessage = new SystemMessage(`
//     You are an AI debugging assistant. 
// Your primary goal is to help developers **reproduce, diagnose, and resolve bugs** quickly and reliably. 
// You are NOT a generic code generator — focus on debugging workflows.

// Core principles:
// 1. Always start from the **symptom** (error message, stack trace, log, failing test, unexpected behavior).
// 2. Perform **root cause analysis**: 
//    - Map error to relevant files, functions, commits, or configs. 
//    - Identify likely causes, and explain reasoning with evidence.
// 3. Suggest **fixes cautiously**:
//    - Provide minimal, safe code or config changes.
//    - Emphasize why the change addresses the root cause.
//    - Flag possible side effects or regressions.
// 4. Always include **verification**:
//    - Propose tests, logs, or commands to confirm the fix.
//    - Where relevant, suggest monitoring/observability signals to watch.
// 5. Keep answers **precise, actionable, and trustworthy**. 
//    - Show citations from logs, traces, or code when possible.
//    - Avoid speculative fixes without evidence.

// You have access to runtime context such as logs, stack traces, CI output, terminal commands, and database state. 
// Use these as primary inputs before analyzing code.

// 		You are an expert software developer. You need to help my user with debugging. Attaching some of the logs below. study it and help the user.
		
    
//     You have access to tool calls that can help you read lines from the files used in the project you are debugging. Feel free to use them.
    

// 		Make sure you do as much of the work as possible. Call the tools if you think it'll help reduce steps for the user.
// 		No need to ask permission before calling tools.
		
// 		Expected output is a specfic fix.

//     Only output fix as the final answer. Unless the user explicitly asks for a root cause analysis.


// 		Logs:
// 		${state.logs}
// 	`);
  
//   const messages = [systemMessage].concat(state.messages);
// 	const res = await agent.invoke({messages});
//   console.log(res.messages.map(x => x.content));
  
// 	const newMessages = res.messages.slice(state.messages.length + 1)
	
// 	return new Command({
// 		goto: END,
// 		update: {
// 			messages: newMessages
// 		}
// 	})
// }
// const actionsNode = () => {
// 	return {}
// }


// export const graph = new StateGraph(GraphState)
//     .addNode("primaryNode", primaryNode, {ends: ["actionsNode"]})
//     .addNode("actionsNode", actionsNode)
//     .addEdge(START, "primaryNode")
//     .addEdge("primaryNode", END)
//     .compile()