import { useEffect, useState } from "react";
import { useStdout } from "ink";

/**
 * Returns the current terminal width (columns) and updates when the terminal is resized.
 * Use this so layout components redraw correctly on resize instead of staying fixed size.
 */
export function useTerminalColumns(): number {
  const { stdout } = useStdout();
  const [columns, setColumns] = useState<number>(stdout?.columns ?? 80);

  useEffect(() => {
    const handleResize = () => {
      const cols = stdout?.columns ?? process.stdout?.columns;
      if (typeof cols === "number" && cols > 0) {
        setColumns(cols);
      }
    };

    handleResize();
    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
    };
  }, [stdout]);

  return columns;
}
