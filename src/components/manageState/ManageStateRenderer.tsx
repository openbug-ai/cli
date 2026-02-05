// wizard/Renderer.tsx
import React, { Suspense } from "react";
import { Text } from "ink";
import { resolveStep } from "./resolver.js";
import { screenMap } from "./map.js";
import { useManageState } from "../../context/context.js";

export const ManageStateRenderer: React.FC = () => {
  const { state } = useManageState();
  const step = resolveStep(state);
  const Screen = screenMap[step];

  return (
    <Suspense fallback={<Text>Loading…</Text>}>
      <Screen />
    </Suspense>
  );
};
