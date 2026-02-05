import { Text } from "ink";
import HorizontalLine from "./HorizontalLine.js";

const logo = `    

   ▗▄▖                ▗▄▄▖           
   █▀█                ▐▛▀▜▌          
  ▐▌ ▐▌▐▙█▙  ▟█▙ ▐▙██▖▐▌ ▐▌▐▌ ▐▌ ▟█▟▌
  ▐▌ ▐▌▐▛ ▜▌▐▙▄▟▌▐▛ ▐▌▐███ ▐▌ ▐▌▐▛ ▜▌
  ▐▌ ▐▌▐▌ ▐▌▐▛▀▀▘▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌
   █▄█ ▐█▄█▘▝█▄▄▌▐▌ ▐▌▐▙▄▟▌▐▙▄█▌▝█▄█▌
   ▝▀▘ ▐▌▀▘  ▝▀▀ ▝▘ ▝▘▝▀▀▀  ▀▀▝▘ ▞▀▐▌ v1.0.0
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
