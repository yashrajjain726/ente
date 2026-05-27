import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpaceButtonSpinner } from "components/SpaceButtonSpinner";
import React from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";

const green = "#08C225";
const textBase = "#000";
const textLight = "#969696";
const warning = "#F63A3A";

interface SpaceAvatarCropPageProps {
    aspect?: number;
    background: string;
    crop: Point;
    cropShape?: "rect" | "round";
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
    loading?: boolean;
    onClick?: () => void;
}> = ({ children, disabled = false, loading = false, onClick }) => (
    <Box
        className={!disabled || loading ? "green-bg" : undefined}
        component="button"
        type="button"
        disabled={disabled}
        aria-label={loading ? "Saving" : undefined}
        aria-busy={loading ? true : undefined}
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: disabled && !loading ? "#F5F5F5" : green,
            border: 0,
            borderRadius: "20px",
            color: disabled && !loading ? textLight : "white",
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
    aspect = 1,
    cropShape = "round",
}) => {
    const isAppHeader = headerVariant == "app";
    const isSquareCrop = aspect == 1;
    const isCoverCrop = cropShape == "rect" && !isSquareCrop;

    return (
        <Box
            component="main"
            sx={{
                "--avatar-crop-size": isAppHeader
                    ? "min(calc(100vw - 48px), calc(100dvh - 308px), 342px)"
                    : "min(calc(100vw - 48px), calc(100dvh - 294px), 342px)",
                "--profile-crop-width": isCoverCrop
                    ? "100%"
                    : "min(calc(100vw - 48px), 342px)",
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
                        ? "56px minmax(0, 1fr) auto auto"
                        : "42px minmax(0, 1fr) auto auto",
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
                        bgcolor: isSquareCrop ? "#111" : "#FFFFFF",
                        borderRadius: isSquareCrop
                            ? "50%"
                            : isCoverCrop
                              ? 0
                              : "8px",
                        height: isSquareCrop
                            ? "var(--avatar-crop-size)"
                            : undefined,
                        aspectRatio: `${aspect} / 1`,
                        justifySelf: isCoverCrop ? "stretch" : "center",
                        gridRow: 2,
                        mt: 0,
                        overflow: "hidden",
                        position: "relative",
                        width: isSquareCrop
                            ? "var(--avatar-crop-size)"
                            : "var(--profile-crop-width)",
                        "& .reactEasyCrop_CropArea": {
                            borderColor: "rgba(255, 255, 255, 0.54)",
                            boxShadow: "none",
                            color: "transparent",
                        },
                        "& .reactEasyCrop_CropAreaGrid::before, & .reactEasyCrop_CropAreaGrid::after":
                            { borderColor: "rgba(255, 255, 255, 0.42)" },
                    }}
                >
                    <Cropper
                        aspect={aspect}
                        crop={crop}
                        cropShape={cropShape}
                        disableAutomaticStylesInjection
                        image={imageURL}
                        maxZoom={3}
                        minZoom={1}
                        objectFit="cover"
                        onCropChange={onCropChange}
                        onCropComplete={onCropComplete}
                        onZoomChange={onZoomChange}
                        showGrid
                        zoom={zoom}
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
                            gridRow: 3,
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
                        gridRow: 4,
                        pt: 3,
                        px: isAppHeader ? 3 : 0,
                        width: "100%",
                    }}
                >
                    <SpaceAvatarCropPageButton
                        disabled={isSaving || isDoneDisabled}
                        loading={isSaving}
                        onClick={onDone}
                    >
                        {isSaving ? <SpaceButtonSpinner /> : "Done"}
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
