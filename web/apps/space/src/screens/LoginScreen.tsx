import { Box } from "@mui/material";
import React, { useState } from "react";

export const loginBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const textLight = "#969696";
const warning = "#F63A3A";
const loginFormID = "space-login-form";

export interface SpaceLoginCredentials {
    email: string;
    password: string;
}

interface LoginScreenProps {
    errorMessage?: string;
    isSubmitting?: boolean;
    onBack: () => void;
    onContinue?: (credentials: SpaceLoginCredentials) => Promise<void> | void;
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

export const LoginScreen: React.FC<LoginScreenProps> = ({
    errorMessage,
    isSubmitting = false,
    onBack,
    onContinue,
}) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const canContinue =
        !isSubmitting && email.trim().length > 0 && password.length > 0;

    const submitLogin = () => {
        if (canContinue) void onContinue?.({ email, password });
    };

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        submitLogin();
    };

    return (
        <Box
            component="main"
            sx={{
                bgcolor: loginBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflow: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: loginBackground,
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
                        Login to Ente
                    </Box>
                    <Box />
                </Box>

                <Box
                    component="form"
                    id={loginFormID}
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
                </Box>

                <Box
                    sx={{
                        bgcolor: loginBackground,
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
                        className={canContinue ? "green-bg" : undefined}
                        component="button"
                        form={loginFormID}
                        type="submit"
                        disabled={!canContinue}
                        sx={{
                            alignItems: "center",
                            bgcolor: canContinue ? green : "#F5F5F5",
                            border: 0,
                            borderRadius: "20px",
                            color: canContinue ? "white" : textLight,
                            cursor: canContinue ? "pointer" : "default",
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
                            "&:hover": canContinue
                                ? { bgcolor: "#07AE22" }
                                : undefined,
                        }}
                    >
                        {isSubmitting ? "Signing in..." : "Continue"}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
