import { Text, Box } from "ink";
import React from "react";
import AsciiAnimation from "./AsciiAnimation.js";

//loader frames
//thinking frames
const thinkingFrames = [
  "▁▁▁▁▁▁▁▁",

  "▂▁▁▁▁▁▁▁",

  "▃▂▁▁▁▁▁▁",

  "▄▃▂▁▁▁▁▁",

  "▅▄▃▂▁▁▁▁",

  "▆▅▄▃▂▁▁▁",

  "▇▆▅▄▃▂▁▁",

  "█▇▆▅▄▃▂▁",

  "▇█▇▆▅▄▃▂",

  "▆▇█▇▆▅▄▃",

  "▅▆▇█▇▆▅▄",

  "▄▅▆▇█▇▆▅",

  "▃▄▅▆▇█▇▆",

  "▂▃▄▅▆▇█▇",

  "▁▂▃▄▅▆▇█",

  "▁▁▂▃▄▅▆▇",

  "▁▁▁▂▃▄▅▆",

  "▁▁▁▁▂▃▄▅",

  "▁▁▁▁▁▂▃▄",

  "▁▁▁▁▁▁▂▃",

  "▁▁▁▁▁▁▁▂",
];
const Loader: React.FC<{ showFullChat?: boolean }> = ({ showFullChat }) => {
  return (
    <>
      <Box paddingBottom={1} alignItems="center">
        <AsciiAnimation color="#0008FF" frames={thinkingFrames} interval={50} />
        <Text color={"#2F5BFF"}> Thinking...</Text>
        <Text>
          {" "}
          esc to interrupt | Ctrl + O to{" "}
          {!showFullChat ? "hide thinking" : "show thinking"}
        </Text>
      </Box>
    </>
  );
};

export default Loader;
