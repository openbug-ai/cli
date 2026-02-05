import React, { useLayoutEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useManageState } from "../../context/context.js";
import OnboardingLayout from "../OnboardingLayout.js";
import { checkApiKey, validateAndSaveApiKey } from "../../utils/utils.js";
import { useTerminalColumns } from "../../hooks/useTerminalColumns.js";

//list type of Openbug home page
// ListItems component props
interface stepListProps {
  step: string;
  stepId: number;
}
interface ListItemsProps {
  listItems: stepListProps[];
  bullet?: string;
}

//steps to connect OpenBug
const stepList = [
  { step: "Set up your OpenBug API key", stepId: 1 },
  { step: "Connect a local service", stepId: 2 },
  { step: "Try the debugger in chat", stepId: 3 },
];

const Welcome: React.FC = () => {
  const width = useTerminalColumns();
  const { update } = useManageState();

  //check whether the current user type is existing or new user
  const checkForTheUserType = async () => {
    let API_KEY = await checkApiKey();
    if (API_KEY === "" || !API_KEY) {
      return;
    }
    const validation = await validateAndSaveApiKey(API_KEY);
    if (validation.valid) {
      update({
        hasStarted: true,
        apiKeyVerified: true,
        connectService: true,
      });
    } else {
      update({
        hasStarted: true,
      });
    }
  };

  useLayoutEffect(() => {
    checkForTheUserType();
  }, []);

  //handle next screen
  const handleNextScreen = async () => {
    let API_KEY = await checkApiKey();
    if (!API_KEY) {
      update({
        hasStarted: true,
      });
    } else {
      const validation = await validateAndSaveApiKey(API_KEY);
      if (validation.valid) {
        update({
          hasStarted: true,
          apiKeyVerified: true,
          connectService: true,
        });
      } else {
        update({
          hasStarted: true,
        });
      }
    }
  };

  useInput((_, key: any) => {
    if (key.return) handleNextScreen();
    if (key.escape) process.exit();
  });

  //component for adding bullet points to the lists to be rendered
  const ListItems: React.FC<ListItemsProps> = ({ listItems, bullet = "•" }) => {
    return listItems.map((listItem: stepListProps) => {
      return (
        <Text key={listItem.stepId}>
          {bullet} {listItem.step}
        </Text>
      );
    });
  };
  return (
    <OnboardingLayout
      width={width}
      stepIndex={0}
      totalSteps={3}
      footerLeft="next"
      alignItems="flex-start"
      sideText={[
        "hey, I'm Patch.",
        "I sit quietly and watch what your app is doing.",
        "when something breaks, I surface the bits.",
      ]}
    >
      <Text bold>WELCOME TO OPENBUG</Text>
      <Box flexDirection="column" paddingY={1}>
        <Text wrap="wrap">OpenBug helps you debug running services </Text>
        <Text wrap="wrap">using real runtime signals.</Text>
      </Box>
      <Text>In the next few steps, you will:</Text>
      <Box paddingY={1} flexDirection="column">
        <ListItems listItems={stepList} />
      </Box>
      <Text wrap="wrap">This should take less than a minute.</Text>
    </OnboardingLayout>
  );
};;

export default Welcome;

// {
//   upArrow: false,
//   downArrow: false,
//   leftArrow: false,
//   rightArrow: false,
//   pageDown: false,
//   pageUp: false,
//   home: false,
//   end: false,
//   return: false,
//   escape: false,
//   ctrl: false,
//   shift: false,
//   tab: false,
//   backspace: false,
//   delete: false,
//   meta: false
// }

// let startOnCallWebSocketServer;
// try {
//   ({ startOnCallWebSocketServer } =
//     await import("../dist/websocket-server.js"));
// } catch (err) {
//   console.error("\nFailed to load the WebSocket server bundle.", err);
//   process.exit(1);
// }

// try {
//   const server = await startOnCallWebSocketServer({
//     port: 4466,
//   });
//   const address = server.address;
//   const host = address?.address ?? "127.0.0.1";
//   const port = address?.port ?? 4466;

//   console.log(`OnCall server is running at ws://${host}:${port}\n`);

//   let shuttingDown = false;
//   const shutdown = async (signal) => {
//     if (shuttingDown) return;
//     shuttingDown = true;
//     try {
//       await server.stop();
//     } catch (error) {
//       console.error("Error while stopping the WebSocket server:", error);
//     } finally {
//       process.exit(0);
//     }
//   };

//   ["SIGINT", "SIGTERM"].forEach((signal) => {
//     process.once(signal, () => shutdown(signal));
//   });

//   try {
//     global.oncallClusterServer = server;
//     await import("../dist/OpenBug.js");
//   } catch (err) {
//     console.error("Failed to load start UI:", err);
//     await server.stop();
//     process.exit(1);
//   }
// } catch (error) {
//   if (
//     error.code === "EADDRINUSE" ||
//     (typeof error === "string" && error.includes("already in use"))
//   ) {
//     console.log(
//       `Port 4466 is already in use. Assuming cluster server is running.\n`,
//     );
//     try {
//       await import("../dist/OpenBug.js");
//     } catch (err) {
//       console.error("Failed to load start UI:", err);
//       process.exit(1);
//     }
//   } else {
//     console.error("\nFailed to start the WebSocket server:", error);
//     process.exit(1);
//   }
// }
