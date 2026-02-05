import { Box, Text, BoxProps } from "ink";
import React from "react";
import HorizontalLine from "./HorizontalLine.js";
import AsciiAnimation from "./AsciiAnimation.js";
import StepDots from "./StepDots.js";

type OnboardingLayoutProps = {
  width: number;
  stepIndex: number;
  totalSteps: number;
  title?: string;
  sideText: string | string[];
  footerLeft: string;
  alignItems?: BoxProps["alignItems"];
  children: React.ReactNode;
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
└─────────┘`,
];
const OnboardingLayout = ({
  width,
  stepIndex,
  totalSteps,
  title = "Setup",
  sideText,
  footerLeft,
  alignItems,
  children,
}: OnboardingLayoutProps) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      width={width}
    >
      {/* header */}
      <Box justifyContent="space-between" marginX={1}>
        <StepDots current={stepIndex} total={totalSteps} />
        <Text>{title}</Text>
      </Box>

      {/* horizontal line */}
      <HorizontalLine width={width} />

      {/* body */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginX={1}
        padding={1}
        // width="100%"
      >
        {children}
      </Box>

      <Box marginX={1} paddingY={1} columnGap={2} alignItems={alignItems}>
        <AsciiAnimation frames={catFrames} color="#0008FF" />
        <Text>&gt;</Text>
        {Array.isArray(sideText) ? (
          <Box flexDirection="column">
            {sideText.map((line, i) => {
              return (
                <Text key={i} wrap="wrap">
                  {line}
                </Text>
              );
            })}
          </Box>
        ) : (
          <Text wrap="wrap">{sideText}</Text>
        )}
      </Box>

      {/* horizontal line */}
      <HorizontalLine width={width} />

      {/* footer */}
      <Box justifyContent="space-between" marginX={1}>
        <Text color={"#707070"}>Enter: {footerLeft}</Text>
        <Text color={"#707070"}>Esc: quit</Text>
      </Box>
    </Box>
  );
};

export default OnboardingLayout;
