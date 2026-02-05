import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { useManageState } from "../../context/context.js";
import OnboardingLayout from "../OnboardingLayout.js";
import { useTerminalColumns } from "../../hooks/useTerminalColumns.js";

const ApiKeySuccess: React.FC = () => {
  const { update } = useManageState();
  const width = useTerminalColumns();

  //handle next screen
  const handleNextScreen = () => {
    update({
      connectService: true,
    });
  };

  //keyboard navigation
  useInput((_, key: any) => {
    if (key.return) handleNextScreen();
    if (key.escape) process.exit();
  });

  return (
    <OnboardingLayout
      width={width}
      stepIndex={2}
      totalSteps={3}
      footerLeft="connect services & begin"
      alignItems="center"
      sideText={"Looks good.I’m ready when your services are."}
    >
      <Text bold color={"#249C00"}>
        ✓ SETUP COMPLETE
      </Text>
      <Box flexDirection="column" paddingY={1}>
        <Text wrap="wrap">Your API key was verified successfully.</Text>
      </Box>
      <Box flexDirection="column">
        <Text wrap="wrap">You can now connect services</Text>
        <Text wrap="wrap">and start debugging with OpenBug.</Text>
      </Box>
    </OnboardingLayout>
  );
};

export default ApiKeySuccess;
