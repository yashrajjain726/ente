import { Box } from "@mui/material";
import React, { useState } from "react";

export const createAccountBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const textLight = "#969696";
const warning = "#F63A3A";
const createAccountFormID = "space-create-account-form";

export interface CreateAccountInput {
    email: string;
    password: string;
    referralSource: string;
}

interface CreateAccountScreenProps {
    errorMessage?: string;
    isSubmitting?: boolean;
    onBack: () => void;
    onCreateAccount: (input: CreateAccountInput) => void;
}

interface TextInputProps {
    label: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    required?: boolean;
    type?: "email" | "password" | "text";
    value?: string;
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

const EyeIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 24, width: 24 }}
    >
        <path
            d="M2.75 12S6.25 6.75 12 6.75S21.25 12 21.25 12S17.75 17.25 12 17.25S2.75 12 2.75 12Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
        />
        <circle
            cx="12"
            cy="12"
            fill="none"
            r="2.75"
            stroke="currentColor"
            strokeWidth="1.8"
        />
    </Box>
);

const CheckIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 16 16"
        aria-hidden
        sx={{ display: "block", height: 12, width: 12 }}
    >
        <path
            d="M3.25 8.25L6.25 11.25L12.75 4.75"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
        />
    </Box>
);

const TextInput: React.FC<TextInputProps> = ({
    label,
    onChange,
    placeholder,
    required,
    type = "text",
    value,
}) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type == "password";

    return (
        <Box sx={{ width: "100%" }}>
            <Box
                component="label"
                sx={{
                    color: textBase,
                    display: "flex",
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    fontWeight: 500,
                    gap: "2px",
                    lineHeight: "20px",
                    mb: "9px",
                }}
            >
                {label}
                {required && <Box sx={{ color: warning }}>*</Box>}
            </Box>
            <Box
                sx={{
                    alignItems: "center",
                    bgcolor: "white",
                    borderRadius: "16px",
                    display: "flex",
                    height: 52,
                    px: 2,
                    width: "100%",
                    "&:focus-within": {
                        outline: `2px solid ${green}`,
                        outlineOffset: 1,
                    },
                }}
            >
                <Box
                    component="input"
                    onChange={(event) => onChange?.(event.target.value)}
                    placeholder={placeholder}
                    type={isPassword && showPassword ? "text" : type}
                    value={value}
                    sx={{
                        bgcolor: "transparent",
                        border: 0,
                        color: textBase,
                        flex: 1,
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        fontWeight: 500,
                        lineHeight: "20px",
                        minWidth: 0,
                        outline: 0,
                        p: 0,
                        "&::placeholder": { color: textLight, opacity: 1 },
                    }}
                />
                {isPassword && (
                    <Box
                        component="button"
                        type="button"
                        aria-label={
                            showPassword ? "Hide password" : "Show password"
                        }
                        onClick={() => setShowPassword((value) => !value)}
                        sx={{
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: textLight,
                            cursor: "pointer",
                            display: "flex",
                            flexShrink: 0,
                            height: 32,
                            justifyContent: "center",
                            mr: -0.5,
                            p: 0,
                            width: 32,
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 1,
                            },
                        }}
                    >
                        <EyeIcon />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export const CreateAccountScreen: React.FC<CreateAccountScreenProps> = ({
    errorMessage,
    isSubmitting = false,
    onBack,
    onCreateAccount,
}) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [referralSource, setReferralSource] = useState("");
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const canCreateAccount =
        !isSubmitting &&
        email.trim().length > 0 &&
        password.length > 0 &&
        confirmPassword.length > 0 &&
        password == confirmPassword &&
        acceptedTerms;

    const submitCreateAccount = () => {
        if (canCreateAccount) {
            onCreateAccount({ email: email.trim(), password, referralSource });
        }
    };

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        submitCreateAccount();
    };

    return (
        <Box
            component="main"
            sx={{
                bgcolor: createAccountBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflow: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: createAccountBackground,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100svh",
                    mx: "auto",
                    pb: "154px",
                    px: 3,
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        display: "grid",
                        gridTemplateColumns: "42px 1fr 42px",
                        height: 42,
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
                            height: 42,
                            justifyContent: "flex-start",
                            p: 0,
                            width: 42,
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
                        Create an account
                    </Box>
                    <Box />
                </Box>

                <Box
                    component="form"
                    id={createAccountFormID}
                    noValidate
                    onSubmit={handleSubmit}
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                        mt: "20px",
                        width: "100%",
                    }}
                >
                    <TextInput
                        label="Email"
                        onChange={setEmail}
                        placeholder="Enter your email"
                        required
                        type="email"
                        value={email}
                    />
                    <TextInput
                        label="Password"
                        onChange={setPassword}
                        placeholder="Enter your password"
                        required
                        type="password"
                        value={password}
                    />
                    <TextInput
                        label="Confirm Password"
                        onChange={setConfirmPassword}
                        placeholder="Re-enter your password"
                        required
                        type="password"
                        value={confirmPassword}
                    />
                    <TextInput
                        label="How did you hear about Ente?"
                        onChange={setReferralSource}
                        value={referralSource}
                    />
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
                                mt: "-8px",
                            }}
                        >
                            {errorMessage}
                        </Box>
                    )}
                    <Box
                        component="label"
                        sx={{
                            alignItems: "flex-start",
                            color: textLight,
                            cursor: "pointer",
                            display: "flex",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 500,
                            gap: "10px",
                            lineHeight: "17px",
                            width: "100%",
                        }}
                    >
                        <Box
                            className={acceptedTerms ? "green-bg" : undefined}
                            sx={{
                                alignItems: "center",
                                bgcolor: acceptedTerms ? green : "transparent",
                                border: `1px solid ${
                                    acceptedTerms ? green : textLight
                                }`,
                                borderRadius: "4px",
                                color: "white",
                                display: "flex",
                                flexShrink: 0,
                                height: 16,
                                justifyContent: "center",
                                mt: "1px",
                                position: "relative",
                                width: 16,
                            }}
                        >
                            <Box
                                component="input"
                                checked={acceptedTerms}
                                onChange={(event) =>
                                    setAcceptedTerms(event.target.checked)
                                }
                                type="checkbox"
                                sx={{
                                    appearance: "none",
                                    cursor: "pointer",
                                    height: 16,
                                    inset: 0,
                                    m: 0,
                                    opacity: 0,
                                    position: "absolute",
                                    width: 16,
                                    "&:focus-visible": {
                                        outline: `2px solid ${green}`,
                                        outlineOffset: 3,
                                    },
                                }}
                            />
                            {acceptedTerms && <CheckIcon />}
                        </Box>
                        <Box>
                            I accept the{" "}
                            <Box
                                component="a"
                                href="https://ente.io/terms"
                                sx={{
                                    color: "inherit",
                                    textDecoration: "underline",
                                }}
                            >
                                terms of service
                            </Box>{" "}
                            and{" "}
                            <Box
                                component="a"
                                href="https://ente.io/privacy"
                                sx={{
                                    color: "inherit",
                                    textDecoration: "underline",
                                }}
                            >
                                privacy policy
                            </Box>
                            .
                        </Box>
                    </Box>
                </Box>

                <Box
                    sx={{
                        bgcolor: createAccountBackground,
                        bottom: 0,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        left: "50%",
                        maxWidth: 390,
                        p: 3,
                        position: "fixed",
                        transform: "translateX(-50%)",
                        width: "100%",
                    }}
                >
                    <Box
                        className={canCreateAccount ? "green-bg" : undefined}
                        component="button"
                        form={createAccountFormID}
                        type="submit"
                        disabled={!canCreateAccount}
                        sx={{
                            alignItems: "center",
                            bgcolor: canCreateAccount ? green : "#F5F5F5",
                            border: 0,
                            borderRadius: "20px",
                            color: canCreateAccount ? "white" : textLight,
                            cursor: canCreateAccount ? "pointer" : "default",
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
                            "&:hover": canCreateAccount
                                ? { bgcolor: "#07AE22" }
                                : undefined,
                        }}
                    >
                        {isSubmitting
                            ? "Creating account..."
                            : "Create an account"}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
