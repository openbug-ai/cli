import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useManageState } from "../../context/context.js";
import TextInput from "ink-text-input";
import OnboardingLayout from "../OnboardingLayout.js";
import { validateAndSaveApiKey } from "../../utils/utils.js";
import { useTerminalColumns } from "../../hooks/useTerminalColumns.js";

const ApiKeyInput: React.FC = () => {
  const { update } = useManageState();
  const [chatInputValue, setChatInputValue] = useState("");
  const [chatInputValueError, setChatInputValueError] = useState("");
  const width = useTerminalColumns();

  //submit api key
  const handleSubmit = async () => {
    if (!chatInputValue || !chatInputValue.trim()) {
      setChatInputValueError(
        "API key cannot be empty. Please add a valid API key.",
      );
      return;
    }

    const validation = await validateAndSaveApiKey(chatInputValue);
    if (validation.valid) {
      const API_KEY = chatInputValue.trim();
      update({
        apiKeyVerified: true,
      });
    } else {
      setChatInputValueError(validation.error);
    }
  };

  //keyboard navigation
  useInput((_, key: any) => {
    if (key.enter) handleSubmit();
    if (key.escape) process.exit();
  });

  //setting value for input text
  const setInputTextValue = (inputValue: string) => {
    setChatInputValue(inputValue);
  };

  return (
    <OnboardingLayout
      width={width}
      stepIndex={1}
      totalSteps={3}
      footerLeft="verify API key"
      alignItems="center"
      sideText={"Other cats feed on whiskas, I feed on tokens."}
    >
      <Text bold>ENABLE OPENBUG</Text>
      <Box flexDirection="column" paddingY={1}>
        <Text wrap="wrap">Before OpenBug can run or monitor anything,</Text>
        <Text wrap="wrap">it needs an API key.</Text>
      </Box>
      <Box
        backgroundColor={"#EDEDED"}
        alignItems="center"
        padding={1}
        width={"100%"}
      >
        <TextInput
          value={chatInputValue}
          onChange={setInputTextValue}
          onSubmit={handleSubmit}
          placeholder="Enter API Key"
        />
      </Box>
      {chatInputValueError && (
        <Text backgroundColor={"#FFE3E3"} color={"#FF0000"}>
          {chatInputValueError}
        </Text>
      )}
      <Box paddingY={1} flexDirection="column">
        <Text>If you don’t have a key yet:</Text>
        <Text color={"#2F5BFF"}>https://openbug.dev/dashboard</Text>
      </Box>
      <Box flexDirection="column">
        <Text>How to run OpenBug locally:</Text>
        <Text color={"#2F5BFF"}>https://docs.openbug.dev/local-setup</Text>
      </Box>
    </OnboardingLayout>
  );
};

export default ApiKeyInput;
