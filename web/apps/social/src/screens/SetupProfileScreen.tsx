import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";

export const setupProfileBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const textLight = "#969696";
const warning = "#F63A3A";
const paleGreen = "#E7F6E9";
const setupProfileFormID = "social-setup-profile-form";

const mockSetupProfileData = {
    avatarUrl: "/images/sample-avatar.jpg",
    username: "anandbaburajan",
    fullName: "Anand Baburajan",
};

export interface SetupProfile {
    avatarUrl: string | null;
    fullName: string;
    username: string;
}

interface SetupProfileScreenProps {
    ctaLabel?: string;
    onBack: () => void;
    onContinue?: (profile: SetupProfile) => void;
}

interface TextInputProps {
    label: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    required?: boolean;
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

const UploadIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 20, width: 20 }}
    >
        <path
            d="M8.5 7.5L9.75 5.75H14.25L15.5 7.5H18C19.1 7.5 20 8.4 20 9.5V17C20 18.1 19.1 19 18 19H6C4.9 19 4 18.1 4 17V9.5C4 8.4 4.9 7.5 6 7.5H8.5Z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.8"
        />
        <circle
            cx="12"
            cy="13"
            fill="none"
            r="3"
            stroke="currentColor"
            strokeWidth="1.8"
        />
    </Box>
);

const PencilIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 24 24"
        aria-hidden
        sx={{ display: "block", height: 14, width: 14 }}
    >
        <path
            d="M14.25 5.25L18.75 9.75M4.75 19.25L8.9 18.45L19.35 8C20.25 7.1 20.25 5.65 19.35 4.75C18.45 3.85 17 3.85 16.1 4.75L5.65 15.2L4.75 19.25Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
        />
    </Box>
);

const TextInput: React.FC<TextInputProps> = ({
    label,
    onChange,
    placeholder,
    required,
    value,
}) => (
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
                type="text"
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
        </Box>
    </Box>
);

export const SetupProfileScreen: React.FC<SetupProfileScreenProps> = ({
    ctaLabel = "Next",
    onBack,
    onContinue,
}) => {
    const [avatarUrl, setAvatarUrl] = useState<string | null>(
        mockSetupProfileData.avatarUrl,
    );
    const [username, setUsername] = useState(mockSetupProfileData.username);
    const [fullName, setFullName] = useState(mockSetupProfileData.fullName);
    const avatarUrlRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const canContinue =
        Boolean(avatarUrl) &&
        username.trim().length > 0 &&
        fullName.trim().length > 0;
    const initialsSource = fullName.trim() || username.trim();
    const initials = initialsSource
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");

    useEffect(
        () => () => {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        },
        [],
    );

    const handleAvatarChange: React.ChangeEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        const nextUrl = URL.createObjectURL(file);
        avatarUrlRef.current = nextUrl;
        setAvatarUrl(nextUrl);
        event.target.value = "";
    };

    const submitProfile = () => {
        if (canContinue) {
            onContinue?.({
                avatarUrl,
                fullName: fullName.trim(),
                username: username.trim(),
            });
        }
    };

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        submitProfile();
    };

    return (
        <Box
            component="main"
            sx={{
                bgcolor: setupProfileBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflow: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: setupProfileBackground,
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
                        Setup your profile
                    </Box>
                    <Box />
                </Box>

                <Box
                    component="form"
                    id={setupProfileFormID}
                    noValidate
                    onSubmit={handleSubmit}
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        mt: "32px",
                        width: "100%",
                    }}
                >
                    <Box
                        component="input"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleAvatarChange}
                        type="file"
                        sx={{ display: "none" }}
                    />

                    <Box sx={{ position: "relative" }}>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Upload profile picture"
                            onClick={() => fileInputRef.current?.click()}
                            sx={{
                                alignItems: "center",
                                aspectRatio: "1 / 1",
                                bgcolor: avatarUrl ? "transparent" : paleGreen,
                                border: 0,
                                borderRadius: "50%",
                                color: green,
                                cursor: "pointer",
                                display: "flex",
                                height: 112,
                                justifyContent: "center",
                                overflow: "hidden",
                                p: 0,
                                position: "relative",
                                width: 112,
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 3,
                                },
                            }}
                        >
                            {avatarUrl ? (
                                <Box
                                    component="img"
                                    alt=""
                                    src={avatarUrl}
                                    sx={{
                                        display: "block",
                                        height: "100%",
                                        objectFit: "cover",
                                        objectPosition: "center",
                                        width: "100%",
                                    }}
                                />
                            ) : initials ? (
                                <Box
                                    sx={{
                                        color: green,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 32,
                                        fontWeight: 700,
                                        lineHeight: 1,
                                    }}
                                >
                                    {initials}
                                </Box>
                            ) : (
                                <UploadIcon />
                            )}
                        </Box>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Edit profile picture"
                            onClick={() => fileInputRef.current?.click()}
                            sx={{
                                alignItems: "center",
                                bgcolor: "white",
                                border: "1px solid #E6E6E6",
                                borderRadius: "50%",
                                bottom: 6,
                                boxShadow: "0 4px 10px rgba(0, 0, 0, 0.12)",
                                color: textBase,
                                cursor: "pointer",
                                display: "flex",
                                height: 30,
                                justifyContent: "center",
                                position: "absolute",
                                right: -2,
                                width: 30,
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 3,
                                },
                            }}
                        >
                            <PencilIcon />
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "24px",
                            mt: "52px",
                            width: "100%",
                        }}
                    >
                        <TextInput
                            label="Username"
                            onChange={setUsername}
                            placeholder="Choose a username"
                            required
                            value={username}
                        />
                        <TextInput
                            label="Full name"
                            onChange={setFullName}
                            placeholder="Enter your full name"
                            required
                            value={fullName}
                        />
                    </Box>
                </Box>

                <Box
                    sx={{
                        bgcolor: setupProfileBackground,
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
                        className={canContinue ? "green-bg" : undefined}
                        component="button"
                        form={setupProfileFormID}
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
                        {ctaLabel}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
