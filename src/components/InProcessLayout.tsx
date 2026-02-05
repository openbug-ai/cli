import { Box, BoxProps, Text } from 'ink'
import React from 'react'
import AsciiAnimation from './AsciiAnimation.js'
import HorizontalLine from './HorizontalLine.js'
import QuestionTag from './QuestionTag.js'
import { useManageState } from "../context/context.js";

type InProcessLayout = {
  width: number;
  alignItems: BoxProps["alignItems"];
  sideText: string[];
  children: React.ReactNode;
  title?: string;
  subTitle: string;
  token: number;
  bgColor: string;
  isDisabled: boolean;
  handleSubmit?: (value: string) => void | Promise<void>;
  ctrlPressed: boolean;
};

//loader frames
//cat frames
const catFrames = [
    `┌─────────┐
│  /\\_/\\  │
│ ( ^‿^ ) │
└─────────┘`,

    `┌─────────┐
│  /\\_/\\  │
│ ( -‿- ) │
└─────────┘`
];

const InProcessLayout = ({
  width,
  alignItems,
  children,
  sideText,
  title = "OpenBug Inhouse AI (Patch)",
  subTitle,
  token,
  bgColor,
  isDisabled,
  handleSubmit,
  ctrlPressed,
}: InProcessLayout) => {
  const { setValue } = useManageState();

  return (
    <Box width={width} flexDirection="column">
      <Box justifyContent="space-between">
        <Text color={"#707070"}>Model: {title}</Text>
        {/* <Text color={"#707070"}>{token} tokens used</Text> */}
      </Box>

      {!(isDisabled && !subTitle) && (
        <QuestionTag
          question={subTitle}
          bgColor={bgColor}
          isDisabled={isDisabled}
          setValue={setValue}
          handleSubmit={handleSubmit}
          ctrlPressed={ctrlPressed}
        />
      )}

      <Box justifyContent="space-between" alignItems="flex-start" marginX={1}>
        {children}
        <Box columnGap={2} alignItems={alignItems}>
          <AsciiAnimation color="#0008FF" frames={catFrames} />
          <Box flexDirection="column">
            <Text color={"#707070"}>Tip:</Text>
            {sideText.map((line, i) => {
              return (
                <Text key={i} wrap="wrap" color={"#707070"}>
                  {line}
                </Text>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* Horizontal line */}
      <HorizontalLine width={width} color="#BFBFBF" />

      {/* footer */}
      <Box justifyContent="space-between">
        <Text color={"#707070"}>? for shortcuts</Text>
        <Text color={"#707070"}>Ctrl + c: exit</Text>
        <Text color={"#707070"}>Ctrl + r: reset chat</Text>
      </Box>
    </Box>
  );
};

export default InProcessLayout
