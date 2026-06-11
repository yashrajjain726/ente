import { Box } from "@mui/material";
import React from "react";
import { sanitizeSpaceOTP, spaceOTPCodeLength } from "utils/spaceOtp";

const green = "#08C225";
const activeFill = "rgba(8, 194, 37, 0.08)";
const emptyStroke = "#EDF0FF";

interface SpaceOtpInputProps {
    ariaLabel: string;
    onChange: (value: string) => void;
    value: string;
}

export const SpaceOtpInput = React.forwardRef<
    HTMLInputElement,
    SpaceOtpInputProps
>(({ ariaLabel, onChange, value }, ref) => {
    const digits = value
        .padEnd(spaceOTPCodeLength, " ")
        .slice(0, spaceOTPCodeLength)
        .split("")
        .map((digit) => (digit == " " ? "" : digit));
    const activeIndex =
        value.length < spaceOTPCodeLength ? value.length : undefined;
    const moveCaretToEnd = (input: HTMLInputElement) => {
        const caretPosition = input.value.length;
        input.setSelectionRange(caretPosition, caretPosition);
    };
    const selectCell = (input: HTMLInputElement, clientX: number) => {
        const { left, width } = input.getBoundingClientRect();
        const cellIndex = Math.max(
            0,
            Math.min(
                spaceOTPCodeLength - 1,
                Math.floor(((clientX - left) / width) * spaceOTPCodeLength),
            ),
        );
        const selectionStart = Math.min(cellIndex, input.value.length);
        const selectionEnd = Math.min(selectionStart + 1, input.value.length);

        input.setSelectionRange(selectionStart, selectionEnd);
    };

    return (
        <Box sx={{ height: 52, position: "relative", width: "100%" }}>
            <Box
                component="input"
                ref={ref}
                aria-label={ariaLabel}
                autoComplete="one-time-code"
                inputMode="numeric"
                onChange={(event) =>
                    onChange(sanitizeSpaceOTP(event.target.value))
                }
                onClick={(event) =>
                    selectCell(event.currentTarget, event.clientX)
                }
                onFocus={(event) => moveCaretToEnd(event.currentTarget)}
                onPaste={(event) => {
                    event.preventDefault();
                    onChange(
                        sanitizeSpaceOTP(event.clipboardData.getData("text")),
                    );
                }}
                pattern="[0-9]*"
                type="text"
                value={value}
                sx={{
                    WebkitTextFillColor: "transparent",
                    bgcolor: "transparent",
                    border: 0,
                    caretColor: "transparent",
                    color: "transparent",
                    fontSize: 16,
                    height: "100%",
                    inset: 0,
                    outline: 0,
                    p: 0,
                    position: "absolute",
                    width: "100%",
                    zIndex: 1,
                }}
            />
            <Box
                aria-hidden
                sx={{
                    display: "flex",
                    gap: "6px",
                    height: "100%",
                    justifyContent: "stretch",
                    width: "100%",
                }}
            >
                {digits.map((digit, index) => {
                    const typed = digit.length > 0;
                    const active = activeIndex == index;

                    return (
                        <Box
                            key={index}
                            sx={{
                                alignItems: "center",
                                bgcolor: typed
                                    ? "white"
                                    : active
                                      ? activeFill
                                      : "white",
                                border:
                                    typed || active
                                        ? `2px solid ${green}`
                                        : `1px solid ${emptyStroke}`,
                                borderRadius: "20px",
                                color: green,
                                display: "flex",
                                flex: "1 1 0",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 20,
                                fontWeight: 700,
                                height: 52,
                                justifyContent: "center",
                                lineHeight: "17px",
                                minWidth: 0,
                                userSelect: "none",
                            }}
                        >
                            {digit}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
});
