import { Box, Text } from "ink";

type HorizontalLineProps = {
    width: number
    color?: string
}

const HorizontalLine = ({ width, color }: HorizontalLineProps) => {
    return <Box width="100%">
        <Text color={color}>{'─'.repeat(width - 2)}</Text>
    </Box>
};

export default HorizontalLine