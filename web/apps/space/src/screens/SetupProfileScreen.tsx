import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import {
    prepareSpaceAvatarImage,
    spaceAvatarImageErrorMessage,
    spaceAvatarImageInputAccept,
} from "utils/spacePostImage";

export const setupProfileBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const textLight = "#969696";
const warning = "#F63A3A";
const paleGreen = "#E7F6E9";
const setupProfileFormID = "space-setup-profile-form";

export interface SetupProfile {
    avatarUrl: string | null;
    avatarObjectKey?: string;
    avatarUpdatedAt?: string;
    fullName: string;
    username: string;
    spaceId?: string;
    spaceSlug?: string;
}

export interface SetupProfileInput extends SetupProfile {
    avatarFile?: File | null;
}

interface SetupProfileScreenProps {
    ctaLabel?: string;
    errorMessage?: string;
    isSubmitting?: boolean;
    onBack: () => void;
    onContinue?: (profile: SetupProfileInput) => Promise<void> | void;
    onUsernameChange?: (username: string) => void;
    usernameStatus?: "available" | "unavailable";
}

interface TextInputProps {
    endAdornment?: React.ReactNode;
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
        sx={{ display: "block", height: 40, width: 40 }}
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

const CheckIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 20 20"
        aria-hidden
        sx={{ display: "block", height: 18, width: 18 }}
    >
        <path
            d="M4.5 10.25L8.25 14L15.75 6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
        />
    </Box>
);

const XIcon: React.FC = () => (
    <Box
        component="svg"
        viewBox="0 0 20 20"
        aria-hidden
        sx={{ display: "block", height: 18, width: 18 }}
    >
        <path
            d="M5.75 5.75L14.25 14.25M14.25 5.75L5.75 14.25"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
        />
    </Box>
);

const UsernameStatusIcon: React.FC<{
    status?: "available" | "unavailable";
}> = ({ status }) => {
    if (!status) return null;

    return (
        <Box
            component="span"
            role="img"
            aria-label={
                status == "available"
                    ? "Username available"
                    : "Username unavailable"
            }
            sx={{
                alignItems: "center",
                color: status == "available" ? green : warning,
                display: "flex",
                flexShrink: 0,
                justifyContent: "center",
                ml: 1,
            }}
        >
            {status == "available" ? <CheckIcon /> : <XIcon />}
        </Box>
    );
};

const TextInput: React.FC<TextInputProps> = ({
    endAdornment,
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
            {endAdornment}
        </Box>
    </Box>
);

export const SetupProfileScreen: React.FC<SetupProfileScreenProps> = ({
    ctaLabel = "Next",
    errorMessage,
    isSubmitting = false,
    onBack,
    onContinue,
    onUsernameChange,
    usernameStatus,
}) => {
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [avatarError, setAvatarError] = useState<string>();
    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const avatarUrlRef = useRef<string | null>(null);
    const avatarSelectionIDRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const canContinue =
        !isSubmitting &&
        usernameStatus != "unavailable" &&
        username.trim().length > 0 &&
        fullName.trim().length > 0;

    useEffect(
        () => () => {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        },
        [],
    );

    const prepareSelectedAvatar = async (file: File, selectionID: number) => {
        try {
            const avatar = await prepareSpaceAvatarImage(file);
            if (avatarSelectionIDRef.current != selectionID) return;

            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            const nextUrl = URL.createObjectURL(avatar.file);
            avatarUrlRef.current = nextUrl;
            setAvatarError(undefined);
            setAvatarFile(avatar.file);
            setAvatarUrl(nextUrl);
        } catch (error) {
            if (avatarSelectionIDRef.current != selectionID) return;
            console.error("Failed to prepare space avatar", error);
            setAvatarError(spaceAvatarImageErrorMessage(error));
        }
    };

    const handleAvatarChange: React.ChangeEventHandler<HTMLInputElement> = (
        event,
    ) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        const selectionID = avatarSelectionIDRef.current + 1;
        avatarSelectionIDRef.current = selectionID;
        setAvatarError(undefined);

        void prepareSelectedAvatar(file, selectionID);
    };

    const handleUsernameChange = (value: string) => {
        setUsername(value);
        onUsernameChange?.(value);
    };

    const submitProfile = () => {
        if (canContinue) {
            void onContinue?.({
                avatarFile,
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
                        accept={spaceAvatarImageInputAccept}
                        onChange={handleAvatarChange}
                        type="file"
                        sx={{ display: "none" }}
                    />

                    <Box sx={{ position: "relative" }}>
                        <Box
                            component="button"
                            type="button"
                            aria-label={
                                avatarUrl
                                    ? "Change profile picture"
                                    : "Upload profile picture"
                            }
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
                            ) : (
                                <UploadIcon />
                            )}
                        </Box>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Change profile picture"
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
                            endAdornment={
                                <UsernameStatusIcon status={usernameStatus} />
                            }
                            label="Username"
                            onChange={handleUsernameChange}
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
                        {(avatarError || errorMessage) && (
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
                                {errorMessage ?? avatarError}
                            </Box>
                        )}
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
                        {isSubmitting ? "Saving..." : ctaLabel}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
};
