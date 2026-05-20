import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import {
    prepareSpaceAvatarImageFromCrop,
    spaceAvatarCropImageForFile,
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

interface AvatarCropImage {
    file: File;
    url: string;
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

interface AvatarCropPageProps {
    crop: Point;
    errorMessage?: string;
    imageURL: string;
    isDoneDisabled?: boolean;
    isSaving?: boolean;
    onBack: () => void;
    onChooseAnother: () => void;
    onCropChange: (crop: Point) => void;
    onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
    onDone: () => void;
    onZoomChange: (zoom: number) => void;
    zoom: number;
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

const AvatarCropPageButton: React.FC<{
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
}> = ({ children, disabled = false, onClick }) => (
    <Box
        className={!disabled ? "green-bg" : undefined}
        component="button"
        type="button"
        disabled={disabled}
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: disabled ? "#F5F5F5" : green,
            border: 0,
            borderRadius: "20px",
            color: disabled ? textLight : "white",
            cursor: disabled ? "default" : "pointer",
            display: "flex",
            flex: "0 0 auto",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 500,
            height: 44,
            justifyContent: "center",
            lineHeight: "20px",
            minWidth: 0,
            px: 2,
            width: "100%",
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 3,
            },
            "&:hover": !disabled ? { bgcolor: "#07AE22" } : undefined,
        }}
    >
        {children}
    </Box>
);

const AvatarCropPageLinkButton: React.FC<{
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
}> = ({ children, disabled = false, onClick }) => (
    <Box
        component="button"
        type="button"
        disabled={disabled}
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: "transparent",
            border: 0,
            color: "#666",
            cursor: disabled ? "default" : "pointer",
            display: "flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 500,
            justifyContent: "center",
            lineHeight: "20px",
            minWidth: 0,
            opacity: 0.8,
            p: 0,
            textAlign: "center",
            textDecoration: "underline",
            textDecorationSkipInk: "none",
            textUnderlineOffset: "2px",
            textUnderlinePosition: "from-font",
            width: "fit-content",
            alignSelf: "center",
            "&:focus-visible": {
                borderRadius: "4px",
                outline: `2px solid ${green}`,
                outlineOffset: 4,
            },
        }}
    >
        {children}
    </Box>
);

const AvatarCropPage: React.FC<AvatarCropPageProps> = ({
    crop,
    errorMessage,
    imageURL,
    isDoneDisabled = false,
    isSaving = false,
    onBack,
    onChooseAnother,
    onCropChange,
    onCropComplete,
    onDone,
    onZoomChange,
    zoom,
}) => (
    <Box
        component="main"
        sx={{
            "--avatar-crop-size":
                "min(calc(100vw - 48px), calc(100dvh - 294px), 342px)",
            bgcolor: setupProfileBackground,
            color: textBase,
            display: "grid",
            height: "100dvh",
            inset: 0,
            overflow: "hidden",
            placeItems: { xs: "stretch", sm: "start center" },
            position: "fixed",
            width: "100%",
        }}
    >
        <Box
            sx={{
                bgcolor: setupProfileBackground,
                boxSizing: "border-box",
                display: "grid",
                gridTemplateRows: "42px auto auto minmax(0, 1fr) auto",
                height: "100%",
                minHeight: 0,
                mx: "auto",
                overflowX: "hidden",
                overflowY: "hidden",
                pb: "calc(24px + env(safe-area-inset-bottom))",
                pt: "32px",
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
                    width: "100%",
                }}
            >
                <Box
                    component="button"
                    type="button"
                    aria-label="Back"
                    disabled={isSaving}
                    onClick={onBack}
                    sx={{
                        alignItems: "center",
                        bgcolor: "transparent",
                        border: 0,
                        color: textBase,
                        cursor: isSaving ? "default" : "pointer",
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
                    Edit profile picture
                </Box>
                <Box />
            </Box>

            <Box
                sx={{
                    alignSelf: "center",
                    bgcolor: "#111",
                    borderRadius: "8px",
                    height: "var(--avatar-crop-size)",
                    aspectRatio: "1 / 1",
                    mt: { xs: "24px", sm: "32px" },
                    overflow: "hidden",
                    position: "relative",
                    width: "var(--avatar-crop-size)",
                }}
            >
                <Cropper
                    aspect={1}
                    crop={crop}
                    cropShape="round"
                    disableAutomaticStylesInjection
                    image={imageURL}
                    maxZoom={3}
                    minZoom={1}
                    objectFit="cover"
                    onCropChange={onCropChange}
                    onCropComplete={onCropComplete}
                    onZoomChange={onZoomChange}
                    showGrid={false}
                    zoom={zoom}
                />
            </Box>

            <Box sx={{ mt: "28px", width: "100%" }}>
                <Box
                    component="label"
                    htmlFor="space-avatar-zoom"
                    sx={{
                        border: 0,
                        clip: "rect(0 0 0 0)",
                        height: 1,
                        m: -1,
                        overflow: "hidden",
                        p: 0,
                        position: "absolute",
                        width: 1,
                    }}
                >
                    Zoom
                </Box>
                <Box
                    component="input"
                    id="space-avatar-zoom"
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={zoom}
                    onChange={(event) =>
                        onZoomChange(Number(event.target.value))
                    }
                    sx={{
                        accentColor: green,
                        display: "block",
                        m: 0,
                        maxWidth: "100%",
                        width: "100%",
                    }}
                />
            </Box>
            {errorMessage && (
                <Box
                    role="alert"
                    sx={{
                        color: warning,
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: "18px",
                        mt: 2,
                        textAlign: "center",
                    }}
                >
                    {errorMessage}
                </Box>
            )}

            <Box
                sx={{
                    bgcolor: setupProfileBackground,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    gridRow: 5,
                    pt: 3,
                    width: "100%",
                }}
            >
                <AvatarCropPageButton
                    disabled={isSaving || isDoneDisabled}
                    onClick={onDone}
                >
                    {isSaving ? "Saving..." : "Done"}
                </AvatarCropPageButton>
                <AvatarCropPageLinkButton
                    disabled={isSaving}
                    onClick={onChooseAnother}
                >
                    Change picture
                </AvatarCropPageLinkButton>
            </Box>
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
    const [avatarCropImage, setAvatarCropImage] =
        useState<AvatarCropImage | null>(null);
    const [avatarCrop, setAvatarCrop] = useState<Point>({ x: 0, y: 0 });
    const [avatarCropPixels, setAvatarCropPixels] = useState<Area | null>(null);
    const [avatarError, setAvatarError] = useState<string>();
    const [avatarZoom, setAvatarZoom] = useState(1);
    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const [isApplyingAvatarCrop, setIsApplyingAvatarCrop] = useState(false);
    const [isPreparingAvatar, setIsPreparingAvatar] = useState(false);
    const avatarCropUrlRef = useRef<string | null>(null);
    const avatarUrlRef = useRef<string | null>(null);
    const avatarSelectionIDRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const canContinue =
        !isSubmitting &&
        !avatarCropImage &&
        !isApplyingAvatarCrop &&
        !isPreparingAvatar &&
        usernameStatus != "unavailable" &&
        username.trim().length > 0 &&
        fullName.trim().length > 0;

    useEffect(
        () => () => {
            if (avatarCropUrlRef.current) {
                URL.revokeObjectURL(avatarCropUrlRef.current);
            }
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        },
        [],
    );

    const clearAvatarCropImage = () => {
        avatarSelectionIDRef.current += 1;
        if (avatarCropUrlRef.current) {
            URL.revokeObjectURL(avatarCropUrlRef.current);
            avatarCropUrlRef.current = null;
        }
        setAvatarCropImage(null);
        setAvatarCrop({ x: 0, y: 0 });
        setAvatarCropPixels(null);
        setAvatarZoom(1);
        setIsApplyingAvatarCrop(false);
        setIsPreparingAvatar(false);
    };

    const prepareSelectedAvatar = async (file: File, selectionID: number) => {
        setIsPreparingAvatar(true);
        if (avatarCropUrlRef.current) {
            URL.revokeObjectURL(avatarCropUrlRef.current);
            avatarCropUrlRef.current = null;
        }
        setAvatarCropImage(null);
        setAvatarCropPixels(null);
        try {
            const cropImage = await spaceAvatarCropImageForFile(file);
            if (avatarSelectionIDRef.current != selectionID) {
                URL.revokeObjectURL(cropImage.url);
                return;
            }

            avatarCropUrlRef.current = cropImage.url;
            setAvatarCrop({ x: 0, y: 0 });
            setAvatarCropImage({ file, url: cropImage.url });
            setAvatarCropPixels(null);
            setAvatarError(undefined);
            setAvatarZoom(1);
        } catch (error) {
            if (avatarSelectionIDRef.current != selectionID) return;
            console.error("Failed to prepare space avatar", error);
            setAvatarError(spaceAvatarImageErrorMessage(error));
        } finally {
            if (avatarSelectionIDRef.current == selectionID) {
                setIsPreparingAvatar(false);
            }
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

    const applyAvatarCrop = async () => {
        if (!avatarCropImage || !avatarCropPixels) return;

        setIsApplyingAvatarCrop(true);
        try {
            const avatar = await prepareSpaceAvatarImageFromCrop(
                avatarCropImage.file,
                avatarCropImage.url,
                avatarCropPixels,
            );

            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            const nextUrl = URL.createObjectURL(avatar.file);
            avatarUrlRef.current = nextUrl;
            setAvatarError(undefined);
            setAvatarFile(avatar.file);
            setAvatarUrl(nextUrl);
            clearAvatarCropImage();
        } catch (error) {
            console.error("Failed to crop space avatar", error);
            setAvatarError(spaceAvatarImageErrorMessage(error));
            setIsApplyingAvatarCrop(false);
        }
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

    const avatarFileInput = (
        <Box
            component="input"
            ref={fileInputRef}
            accept={spaceAvatarImageInputAccept}
            onChange={handleAvatarChange}
            type="file"
            sx={{ display: "none" }}
        />
    );

    if (avatarCropImage) {
        return (
            <>
                {avatarFileInput}
                <AvatarCropPage
                    crop={avatarCrop}
                    errorMessage={avatarError}
                    imageURL={avatarCropImage.url}
                    isDoneDisabled={!avatarCropPixels}
                    isSaving={isApplyingAvatarCrop}
                    onBack={clearAvatarCropImage}
                    onChooseAnother={() => fileInputRef.current?.click()}
                    onCropChange={setAvatarCrop}
                    onCropComplete={(_croppedArea, croppedAreaPixels) =>
                        setAvatarCropPixels(croppedAreaPixels)
                    }
                    onDone={() => void applyAvatarCrop()}
                    onZoomChange={setAvatarZoom}
                    zoom={avatarZoom}
                />
            </>
        );
    }

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
                    {avatarFileInput}

                    <Box sx={{ position: "relative" }}>
                        <Box
                            component="button"
                            type="button"
                            aria-label={
                                avatarUrl
                                    ? "Change profile picture"
                                    : "Upload profile picture"
                            }
                            disabled={isPreparingAvatar}
                            onClick={() => fileInputRef.current?.click()}
                            sx={{
                                alignItems: "center",
                                aspectRatio: "1 / 1",
                                bgcolor: avatarUrl ? "transparent" : paleGreen,
                                border: 0,
                                borderRadius: "50%",
                                color: green,
                                cursor: isPreparingAvatar
                                    ? "default"
                                    : "pointer",
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
                            {isPreparingAvatar ? (
                                <Box
                                    component="span"
                                    sx={{
                                        color: green,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        lineHeight: "18px",
                                    }}
                                >
                                    Preparing...
                                </Box>
                            ) : avatarUrl ? (
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
                            aria-label="Edit profile picture"
                            disabled={isPreparingAvatar}
                            onClick={() => fileInputRef.current?.click()}
                            sx={{
                                alignItems: "center",
                                bgcolor: "white",
                                border: 0,
                                borderRadius: "50%",
                                bottom: 6,
                                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
                                color: textBase,
                                cursor: isPreparingAvatar
                                    ? "default"
                                    : "pointer",
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
