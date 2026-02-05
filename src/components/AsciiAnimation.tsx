import React, { useEffect, useMemo, useState } from "react";
import { Text } from "ink";

type AsciiAnimationProps = {
  interval?: number;
  frames: string[];
  color: string;
};

const AsciiAnimation: React.FC<AsciiAnimationProps> = ({
  interval = 400,
  frames,
  color,
}) => {
  const [index, setIndex] = useState(0);

  const normalizedFrames = useMemo(() => {
    if (!frames?.length) return [""];
    const maxLen = frames.reduce(
      (max, f) => Math.max(max, f.length),
      frames[0].length,
    );
    return frames.map((f) => f.padEnd(maxLen, " "));
  }, [frames]);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % normalizedFrames.length);
    }, interval);

    return () => clearInterval(id);
  }, [interval, normalizedFrames.length]);

  return (
    <Text color={color}>
      {normalizedFrames[index]}
    </Text>
  );
};

export default AsciiAnimation;
