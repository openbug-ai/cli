import { useManageState } from "../context/context.js";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import React, { Dispatch, SetStateAction } from "react";

type QuestionTagProps = {
  bgColor: string;
  question: string;
  isDisabled?: boolean;
  setValue: Dispatch<SetStateAction<string>>;
  handleSubmit?: (value: string) => void | Promise<void>;
  ctrlPressed: boolean;
};

const QuestionTag: React.FC<QuestionTagProps> = ({
  bgColor = "#707070",
  question,
  isDisabled = true,
  setValue,
  handleSubmit,
  ctrlPressed,
}) => {
  const { value } = useManageState();

  return (
    <Box width={"100%"} backgroundColor={"#EDEDED"} marginY={1}>
      <Box backgroundColor={bgColor} width={1}></Box>
      <Box margin={1}>
        {isDisabled ? (
          <Text color="#0BAB00">{question.trim() || " "}</Text>
        ) : (
          <TextInput
            placeholder={question.trim()}
            value={value}
            onChange={(val) => {
              if (!ctrlPressed) {
                setValue(val);
              }
            }}
            onSubmit={handleSubmit}
          />
        )}
      </Box>
    </Box>
  );
};

export default QuestionTag;
