import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import React from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";

const green = "#08C225";
const textBase = "#000";
const textLight = "#969696";
const warning = "#F63A3A";

interface SpaceAvatarCropPageProps {
    background: string;
    crop: Point;
    errorMessage?: string;
    headerVariant?: "app" | "setup";
    imageURL: string;
    isDoneDisabled?: boolean;
    isSaving?: boolean;
    onBack: () => void;
    onChooseAnother: () => void;
    onCropChange: (crop: Point) => void;
    onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
    onDone: () => void;
    onZoomChange: (zoom: number) => void;
    title?: string;
    zoom: number;
}

const SetupBackIcon: React.FC = () => (
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

const SpaceAvatarCropPageButton: React.FC<{
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

const SpaceAvatarCropPageLinkButton: React.FC<{
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

export const SpaceAvatarCropPage: React.FC<SpaceAvatarCropPageProps> = ({
    background,
    crop,
    errorMessage,
    headerVariant = "setup",
    imageURL,
    isDoneDisabled = false,
    isSaving = false,
    onBack,
    onChooseAnother,
    onCropChange,
    onCropComplete,
    onDone,
    onZoomChange,
    title = "Edit profile picture",
    zoom,
}) => {
    const isAppHeader = headerVariant == "app";

    return (
        <Box
            component="main"
            sx={{
                "--avatar-crop-size": isAppHeader
                    ? "min(calc(100vw - 48px), calc(100dvh - 308px), 342px)"
                    : "min(calc(100vw - 48px), calc(100dvh - 294px), 342px)",
                bgcolor: background,
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
                    bgcolor: background,
                    boxSizing: "border-box",
                    display: "grid",
                    gridTemplateRows: isAppHeader
                        ? "56px auto auto minmax(0, 1fr) auto"
                        : "42px auto auto minmax(0, 1fr) auto",
                    height: "100%",
                    minHeight: 0,
                    mx: "auto",
                    overflowX: "hidden",
                    overflowY: "hidden",
                    pb: "calc(24px + env(safe-area-inset-bottom))",
                    pt: isAppHeader ? 0 : "32px",
                    px: isAppHeader ? 0 : 3,
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <Box
                    component="header"
                    sx={
                        isAppHeader
                            ? {
                                  alignItems: "center",
                                  display: "grid",
                                  gridTemplateColumns: "24px 1fr 24px",
                                  height: 56,
                                  px: 2,
                                  width: "100%",
                              }
                            : {
                                  display: "grid",
                                  gridTemplateColumns: "42px 1fr 42px",
                                  height: 42,
                                  width: "100%",
                              }
                    }
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label="Back"
                        disabled={isSaving}
                        onClick={onBack}
                        sx={
                            isAppHeader
                                ? {
                                      alignItems: "center",
                                      bgcolor: "transparent",
                                      border: 0,
                                      color: textBase,
                                      cursor: isSaving ? "default" : "pointer",
                                      display: "flex",
                                      height: 24,
                                      justifyContent: "flex-start",
                                      ml: "-2px",
                                      p: 0,
                                      width: 24,
                                      "&:focus-visible": {
                                          borderRadius: "50%",
                                          outline: `2px solid ${green}`,
                                          outlineOffset: 2,
                                      },
                                  }
                                : {
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
                                  }
                        }
                    >
                        {isAppHeader ? (
                            <HugeiconsIcon
                                icon={ArrowLeft02Icon}
                                size={24}
                                strokeWidth={1.8}
                            />
                        ) : (
                            <SetupBackIcon />
                        )}
                    </Box>
                    <Box
                        component="h1"
                        sx={{
                            alignSelf: "center",
                            color: textBase,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: isAppHeader ? 18 : 20,
                            fontWeight: isAppHeader ? 700 : 600,
                            justifySelf: "center",
                            lineHeight: isAppHeader ? "24px" : "28px",
                            m: 0,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {title}
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
                        justifySelf: "center",
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

                <Box
                    sx={{
                        boxSizing: "border-box",
                        mt: "28px",
                        px: isAppHeader ? 3 : 0,
                        width: "100%",
                    }}
                >
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
                            px: isAppHeader ? 3 : 0,
                            textAlign: "center",
                        }}
                    >
                        {errorMessage}
                    </Box>
                )}

                <Box
                    sx={{
                        bgcolor: background,
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        gridRow: 5,
                        pt: 3,
                        px: isAppHeader ? 3 : 0,
                        width: "100%",
                    }}
                >
                    <SpaceAvatarCropPageButton
                        disabled={isSaving || isDoneDisabled}
                        onClick={onDone}
                    >
                        {isSaving ? "Saving..." : "Done"}
                    </SpaceAvatarCropPageButton>
                    <SpaceAvatarCropPageLinkButton
                        disabled={isSaving}
                        onClick={onChooseAnother}
                    >
                        Change picture
                    </SpaceAvatarCropPageLinkButton>
                </Box>
            </Box>
        </Box>
    );
};
