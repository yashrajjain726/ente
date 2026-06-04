import { Shield01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpaceButtonSpinner } from "components/SpaceButtonSpinner";
import React, { useEffect, useRef, useState } from "react";
import { spaceTouchTargetSize } from "styles/touchTargets";

export const verifyTwoFactorBackground = "#FAFAFA";

const green = "#08C225";
const activeFill = "rgba(8, 194, 37, 0.08)";
const emptyStroke = "#EDF0FF";
const textBase = "#000";
const textMuted = "#666";
const textLight = "#969696";
const warning = "#F63A3A";
const verifyTwoFactorFormID = "space-verify-two-factor-form";

interface VerifyTwoFactorScreenProps {
    errorMessage?: string;
    initialCode?: string;
    isSubmitting?: boolean;
    onBack: () => void;
    onVerify?: (code: string) => void;
}

const BackIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 24, width: 24 }}
    >
        <path
            d="M15 6L9 12L15 18"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
        />
    </Box>
);

interface OtpInputProps {
    active: boolean;
    index: number;
    inputRef: (node: HTMLInputElement | null) => void;
    onChange: (index: number, value: string) => void;
    onKeyDown: (
        index: number,
        event: React.KeyboardEvent<HTMLInputElement>,
    ) => void;
    onPaste: (
        index: number,
        event: React.ClipboardEvent<HTMLInputElement>,
    ) => void;
    value: string;
}

const OtpInput: React.FC<OtpInputProps> = ({
    active,
    index,
    inputRef,
    onChange,
    onKeyDown,
    onPaste,
    value,
}) => {
    const typed = value.length > 0;

    return (
        <Box
            sx={{
                alignItems: "center",
                bgcolor: typed ? "white" : active ? activeFill : "white",
                border:
                    typed || active
                        ? `2px solid ${green}`
                        : `1px solid ${emptyStroke}`,
                borderRadius: "20px",
                display: "flex",
                flex: "1 1 0",
                height: 52,
                justifyContent: "center",
                minWidth: 0,
            }}
        >
            <Box
                component="input"
                ref={inputRef}
                aria-label={`2FA code digit ${index + 1}`}
                autoComplete={index == 0 ? "one-time-code" : "off"}
                inputMode="numeric"
                maxLength={1}
                onChange={(event) => onChange(index, event.target.value)}
                onKeyDown={(event) => onKeyDown(index, event)}
                onPaste={(event) => onPaste(index, event)}
                pattern="[0-9]*"
                type="text"
                value={value}
                sx={{
                    bgcolor: "transparent",
                    border: 0,
                    color: green,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 20,
                    fontWeight: 700,
                    height: "100%",
                    lineHeight: "17px",
                    outline: 0,
                    p: 0,
                    textAlign: "center",
                    width: "100%",
                }}
            />
        </Box>
    );
};

export const VerifyTwoFactorScreen: React.FC<VerifyTwoFactorScreenProps> = ({
    errorMessage,
    initialCode = "",
    isSubmitting = false,
    onBack,
    onVerify,
}) => {
    const [otp, setOtp] = useState<string[]>(
        initialCode
            .replace(/\D/g, "")
            .slice(0, 6)
            .padEnd(6, " ")
            .split("")
            .map((digit) => (digit == " " ? "" : digit)),
    );
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const activeIndex = Math.max(
        0,
        otp.findIndex((digit) => digit.length == 0),
    );
    const otpComplete = otp.every((digit) => digit.length == 1);
    const canVerify = otpComplete && !isSubmitting;
    const isVerifyButtonActive = canVerify || isSubmitting;

    const focusInput = (index: number) => {
        inputRefs.current[index]?.focus();
        inputRefs.current[index]?.select();
    };

    useEffect(() => {
        const initialCodeLength = initialCode
            .replace(/\D/g, "")
            .slice(0, 6).length;
        const initialFocusIndex =
            initialCodeLength >= 6 ? 5 : Math.max(0, initialCodeLength);
        const animationFrame = window.requestAnimationFrame(() =>
            focusInput(initialFocusIndex),
        );

        return () => window.cancelAnimationFrame(animationFrame);
    }, [initialCode]);

    const setDigitsFrom = (startIndex: number, rawValue: string) => {
        const digits = rawValue.replace(/\D/g, "").slice(0, 6 - startIndex);
        if (!digits) {
            setOtp((current) =>
                current.map((digit, index) =>
                    index == startIndex ? "" : digit,
                ),
            );
            return;
        }

        setOtp((current) => {
            const next = [...current];
            digits.split("").forEach((digit, offset) => {
                next[startIndex + offset] = digit;
            });
            return next;
        });

        focusInput(Math.min(startIndex + digits.length, 5));
    };

    const handleKeyDown = (
        index: number,
        event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
        if (event.key == "Backspace" && !otp[index] && index > 0) {
            event.preventDefault();
            setOtp((current) =>
                current.map((digit, digitIndex) =>
                    digitIndex == index - 1 ? "" : digit,
                ),
            );
            focusInput(index - 1);
        } else if (event.key == "ArrowLeft" && index > 0) {
            event.preventDefault();
            focusInput(index - 1);
        } else if (event.key == "ArrowRight" && index < 5) {
            event.preventDefault();
            focusInput(index + 1);
        }
    };

    const handlePaste = (
        index: number,
        event: React.ClipboardEvent<HTMLInputElement>,
    ) => {
        event.preventDefault();
        setDigitsFrom(index, event.clipboardData.getData("text"));
    };

    const submitVerification = () => {
        if (canVerify) onVerify?.(otp.join(""));
    };

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        submitVerification();
    };

    return (
        <Box
            component="main"
            sx={{
                bgcolor: verifyTwoFactorBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflow: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: verifyTwoFactorBackground,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100svh",
                    mx: "auto",
                    pb: "120px",
                    px: 3,
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        display: "grid",
                        gridTemplateColumns: `${spaceTouchTargetSize}px 1fr ${spaceTouchTargetSize}px`,
                        height: spaceTouchTargetSize,
                        mt: "32px",
                        width: "100%",
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label="Back"
                        onClick={onBack}
                        sx={{
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: textBase,
                            cursor: "pointer",
                            display: "flex",
                            height: spaceTouchTargetSize,
                            justifyContent: "flex-start",
                            p: 0,
                            width: spaceTouchTargetSize,
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <BackIcon />
                    </Box>
                    <Box
                        component="h1"
                        sx={{
                            alignSelf: "center",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 20,
                            fontWeight: 600,
                            justifySelf: "center",
                            lineHeight: "28px",
                            m: 0,
                            whiteSpace: "nowrap",
                        }}
                    >
                        2FA verification
                    </Box>
                    <Box />
                </Box>

                <Box
                    component="form"
                    id={verifyTwoFactorFormID}
                    noValidate
                    onSubmit={handleSubmit}
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        gap: "40px",
                        mt: "40px",
                        width: "100%",
                    }}
                >
                    <Box
                        sx={{
                            alignItems: "center",
                            color: green,
                            display: "flex",
                            height: 82,
                            justifyContent: "center",
                            width: 101,
                        }}
                    >
                        <HugeiconsIcon
                            icon={Shield01Icon}
                            size={64}
                            strokeWidth={1.6}
                        />
                    </Box>

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "24px",
                            width: "100%",
                        }}
                    >
                        <Box
                            sx={{
                                color: textMuted,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 500,
                                lineHeight: "20px",
                                mx: "auto",
                                maxWidth: 298,
                                textAlign: "center",
                                width: "100%",
                            }}
                        >
                            Enter the 6-digit code from your authenticator app
                        </Box>

                        <Box sx={{ width: "100%" }}>
                            <Box
                                sx={{
                                    display: "flex",
                                    gap: "6px",
                                    justifyContent: "stretch",
                                    width: "100%",
                                }}
                            >
                                {otp.map((digit, index) => (
                                    <OtpInput
                                        key={index}
                                        active={
                                            !otpComplete && activeIndex == index
                                        }
                                        index={index}
                                        inputRef={(node) => {
                                            inputRefs.current[index] = node;
                                        }}
                                        onChange={setDigitsFrom}
                                        onKeyDown={handleKeyDown}
                                        onPaste={handlePaste}
                                        value={digit}
                                    />
                                ))}
                            </Box>
                            {errorMessage && (
                                <Box
                                    role="alert"
                                    sx={{
                                        color: warning,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        lineHeight: "18px",
                                        mt: "12px",
                                        textAlign: "center",
                                    }}
                                >
                                    {errorMessage}
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Box>

                <Box
                    sx={{
                        bgcolor: verifyTwoFactorBackground,
                        bottom: 0,
                        boxSizing: "border-box",
                        left: "50%",
                        maxWidth: 390,
                        p: 3,
                        position: "fixed",
                        transform: "translateX(-50%)",
                        width: "100%",
                    }}
                >
                    <Box
                        className={
                            isVerifyButtonActive ? "green-bg" : undefined
                        }
                        component="button"
                        form={verifyTwoFactorFormID}
                        type="submit"
                        disabled={!canVerify}
                        aria-label={isSubmitting ? "Verifying" : undefined}
                        aria-busy={isSubmitting ? true : undefined}
                        sx={{
                            alignItems: "center",
                            bgcolor: isVerifyButtonActive ? green : "#F5F5F5",
                            border: 0,
                            borderRadius: "20px",
                            color: isVerifyButtonActive ? "white" : textLight,
                            cursor: canVerify ? "pointer" : "default",
                            display: "flex",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            height: 48,
                            justifyContent: "center",
                            lineHeight: "20px",
                            p: "14px 24px",
                            width: "100%",
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 3,
                            },
                            "&:hover": canVerify
                                ? { bgcolor: "#07AE22" }
                                : undefined,
                        }}
                    >
                        {isSubmitting ? <SpaceButtonSpinner /> : "Verify"}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
