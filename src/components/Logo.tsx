import { Text } from "ink";
import HorizontalLine from "./HorizontalLine.js";
import pkg from "../../package.json" with { type: "json" };

const version = pkg?.version || "1.0.0";

const logo = `    

   ▗▄▖                ▗▄▄▖           
   █▀█                ▐▛▀▜▌          
  ▐▌ ▐▌▐▙█▙  ▟█▙ ▐▙██▖▐▌ ▐▌▐▌ ▐▌ ▟█▟▌
  ▐▌ ▐▌▐▛ ▜▌▐▙▄▟▌▐▛ ▐▌▐███ ▐▌ ▐▌▐▛ ▜▌
  ▐▌ ▐▌▐▌ ▐▌▐▛▀▀▘▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌
   █▄█ ▐█▄█▘▝█▄▄▌▐▌ ▐▌▐▙▄▟▌▐▙▄█▌▝█▄█▌
   ▝▀▘ ▐▌▀▘  ▝▀▀ ▝▘ ▝▘▝▀▀▀  ▀▀▝▘ ▞▀▐▌ v${version}
       ▐▌                        ▜█▛▘

`;
const Logo = ({ width }) => {
  return (
    <>
      <Text color={"#0008FF"}>{logo}</Text>
      <HorizontalLine width={width} color="#D1D1D1" />
    </>
  );
};

export default Logo;
