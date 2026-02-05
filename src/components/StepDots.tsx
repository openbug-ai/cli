import { Text } from "ink";

const StepDots = ({
    current,
    total
}: {
    current: number;
    total: number;
}) => (
    <Text>
        {Array.from({ length: total }).map((_, i) => (
            <Text
                key={i}
                bold={i === current || i < current}
                dimColor={i !== current || i > current}
            >
                {i === current || i < current ? ' ● ' : ' ○ '}
            </Text>
        ))}
    </Text>
);

export default StepDots