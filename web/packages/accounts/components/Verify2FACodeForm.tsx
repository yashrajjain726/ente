import { Stack, styled, Typography } from "@mui/material";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import { isHTTP401Error } from "ente-base/http";
import log from "ente-base/log";
import { useFormik } from "formik";
import { t } from "i18next";
import React, { useEffect, useRef, useState } from "react";

const otpLength = 6;

interface OTPInputProps {
    onChange: (value: string) => void;
    shouldAutoFocus: boolean;
    value: string;
}

const OTPInput: React.FC<OTPInputProps> = ({
    onChange,
    shouldAutoFocus,
    value,
}) => {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const pendingFocusIndex = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (shouldAutoFocus) inputRefs.current[0]?.focus();
    }, [shouldAutoFocus]);

    const focusInput = (index: number) =>
        inputRefs.current[Math.max(0, Math.min(index, otpLength - 1))]?.focus();

    useEffect(() => {
        const index = pendingFocusIndex.current;
        if (index == undefined) return;

        pendingFocusIndex.current = undefined;
        inputRefs.current[Math.max(0, Math.min(index, otpLength - 1))]?.focus();
    }, [value]);

    const replaceDigits = (index: number, input: string) => {
        const digits = input.replace(/\D/g, "");
        if (!digits) return;

        const startIndex = Math.min(index, value.length);
        const nextValue =
            value.slice(0, startIndex) +
            digits +
            value.slice(startIndex + digits.length);
        const clampedValue = nextValue.slice(0, otpLength);
        const nextFocusIndex = startIndex + digits.length;
        if (clampedValue == value) {
            focusInput(nextFocusIndex);
        } else {
            pendingFocusIndex.current = nextFocusIndex;
            onChange(clampedValue);
        }
    };

    const removeDigit = (index: number) => {
        if (index < 0 || index >= value.length) return;
        pendingFocusIndex.current = index;
        onChange(value.slice(0, index) + value.slice(index + 1));
    };

    const handleChange = (
        index: number,
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const input = event.currentTarget.value;
        let digits = input.replace(/\D/g, "");
        if (
            digits.length === 2 &&
            value[index] &&
            digits.startsWith(value[index])
        ) {
            digits = digits[1]!;
        }

        if (digits) {
            replaceDigits(index, digits);
        } else if (!input) {
            removeDigit(index);
        }
    };

    const handleKeyDown = (
        index: number,
        event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;

        if (/^\d$/.test(event.key)) {
            event.preventDefault();
            replaceDigits(index, event.key);
            return;
        }

        switch (event.key) {
            case "Backspace":
                event.preventDefault();
                if (value[index]) {
                    removeDigit(index);
                } else {
                    removeDigit(index - 1);
                }
                break;
            case "Delete":
                event.preventDefault();
                removeDigit(index);
                break;
            case "ArrowLeft":
                event.preventDefault();
                focusInput(index - 1);
                break;
            case "ArrowRight":
                event.preventDefault();
                focusInput(index + 1);
                break;
        }
    };

    return (
        <Stack
            direction="row"
            role="group"
            aria-label={t("verification_code")}
            sx={{ alignItems: "center", justifyContent: "center" }}
        >
            {Array.from({ length: otpLength }, (_, index) => (
                <React.Fragment key={index}>
                    {index > 0 && <span>-</span>}
                    <IndividualInput
                        ref={(element) => {
                            inputRefs.current[index] = element;
                        }}
                        aria-label={`${t("verification_code")} ${index + 1}`}
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        inputMode="numeric"
                        maxLength={otpLength}
                        name={index === 0 ? "otp" : undefined}
                        onChange={(event) => handleChange(index, event)}
                        onFocus={(event) => {
                            if (index > value.length) {
                                focusInput(value.length);
                            } else {
                                event.currentTarget.select();
                            }
                        }}
                        onKeyDown={(event) => handleKeyDown(index, event)}
                        onPaste={(event) => {
                            event.preventDefault();
                            replaceDigits(
                                index,
                                event.clipboardData.getData("text"),
                            );
                        }}
                        pattern="[0-9]*"
                        type="tel"
                        value={value[index] ?? ""}
                    />
                </React.Fragment>
            ))}
        </Stack>
    );
};

interface Verify2FACodeFormProps {
    onSubmit: (otp: string) => Promise<void>;
    submitButtonText: string;
}

export const Verify2FACodeForm: React.FC<Verify2FACodeFormProps> = ({
    onSubmit,
    submitButtonText,
}) => {
    const [shouldAutoFocus, setShouldAutoFocus] = useState(true);

    const {
        values,
        errors,
        handleChange,
        handleSubmit,
        submitForm,
        isSubmitting,
    } = useFormik<{ otp: string }>({
        initialValues: { otp: "" },
        validateOnBlur: false,
        validateOnChange: false,
        onSubmit: async ({ otp }, { setFieldError, resetForm }) => {
            try {
                await onSubmit(otp);
                // Reset the form, otherwise the auto-submit effect below
                // resubmits.
                resetForm();
            } catch (e) {
                log.error("Failed to submit 2FA code", e);
                resetForm();
                setFieldError(
                    "otp",
                    isHTTP401Error(e)
                        ? t("incorrect_code")
                        : t("generic_error"),
                );
                // Reset focus back to the first input field in case of errors.
                setShouldAutoFocus(false);
                setTimeout(() => setShouldAutoFocus(true), 100);
            }
        },
    });

    useEffect(() => {
        if (values.otp.length == 6 && !isSubmitting) void submitForm();
    }, [values, isSubmitting, submitForm]);

    return (
        <form onSubmit={handleSubmit}>
            <Stack sx={{ gap: 3, textAlign: "center" }}>
                <Typography variant="small" sx={{ color: "text.muted" }}>
                    {t("enter_two_factor_otp")}
                </Typography>
                <OTPInput
                    shouldAutoFocus={shouldAutoFocus}
                    value={values.otp}
                    onChange={handleChange("otp")}
                />
                {errors.otp && (
                    <Typography variant="mini" sx={{ color: "critical.main" }}>
                        {errors.otp}
                    </Typography>
                )}
                <LoadingButton
                    type="submit"
                    color="accent"
                    fullWidth
                    loading={isSubmitting}
                    disabled={values.otp.length < 6}
                >
                    {submitButtonText}
                </LoadingButton>
            </Stack>
        </form>
    );
};

const IndividualInput = styled("input")(
    ({ theme }) => `
    appearance: none;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 1.5rem;
    line-height: normal;
    text-align: center;
    color: ${theme.vars.palette.text.base};
    background-color: ${theme.vars.palette.fill.faint};
    padding: 4px;
    width: 40px !important;
    aspect-ratio: 1;
    margin-inline: 6px;
    border: 1px solid ${theme.vars.palette.accent.main};
    border-radius: 1px;
    outline: none;
    transition: border-color 150ms ease, box-shadow 150ms ease;
    &:focus-visible {
        border-color: ${theme.vars.palette.accent.light};
        box-shadow: inset 0 0 0 1px ${theme.vars.palette.accent.light};
    }
    ${theme.breakpoints.down("sm")} {
        font-size: 1rem;
        padding: 4px;
        width: 32px !important;
    }
`,
);
