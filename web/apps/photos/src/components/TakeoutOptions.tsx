import { FileZipIcon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import {
    Box,
    CircularProgress,
    IconButton,
    Link,
    Stack,
    Typography,
} from "@mui/material";
import { isDesktop } from "ente-base/app";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import {
    uploadSheetMediaQuery,
    useIsUploadSheet,
} from "ente-gallery/components/upload-progress/bottom-sheet";
import { t } from "i18next";
import React from "react";

/**
 * Title style for the takeout options surface.
 *
 * Per the mobile design, this second-level sheet uses the app's base font for
 * its title (unlike the top-level options titles, which keep the display
 * font); the desktop dialog keeps the display font.
 */
const optionsTitleSx = {
    fontFamily: "'Outfit Variable', sans-serif",
    fontSize: "24px",
    fontWeight: 600,
    lineHeight: "32px",
    [uploadSheetMediaQuery]: { fontFamily: '"Inter Variable", sans-serif' },
};

interface TakeoutOptionsProps {
    isFolderSelectionPending?: boolean;
    onBack: () => void;
    onClose: () => void;
    onSelectFolder: () => void;
    onSelectZips: () => void;
}

export function TakeoutOptions({
    isFolderSelectionPending,
    onBack,
    onClose,
    onSelectFolder,
    onSelectZips,
}: TakeoutOptionsProps): React.JSX.Element {
    const isSheet = useIsUploadSheet();

    return (
        <Stack
            data-takeout-options
            sx={{
                gap: "36px",
                p: "20px",
                [uploadSheetMediaQuery]: {
                    p: "12px 16px",
                    pb: "calc(20px + env(safe-area-inset-bottom, 0px))",
                    overflowY: "auto",
                },
            }}
        >
            <Stack
                direction="row"
                sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <IconButton
                        aria-label={t("go_back")}
                        onClick={onBack}
                        sx={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "12px",
                        }}
                    >
                        <ArrowBackIcon sx={{ fontSize: "24px" }} />
                    </IconButton>
                    <Typography sx={optionsTitleSx}>
                        {t(
                            isSheet
                                ? "google_takeout"
                                : "import_from_google_photos",
                        )}
                    </Typography>
                </Stack>
                <IconButton
                    aria-label={t("close")}
                    onClick={onClose}
                    sx={(theme) => ({
                        width: "38px",
                        height: "38px",
                        backgroundColor: "background.paper",
                        "&:hover": { backgroundColor: "secondary.hover" },
                        ...theme.applyStyles("dark", {
                            backgroundColor: "secondary.main",
                        }),
                    })}
                >
                    <CloseIcon sx={{ fontSize: "18px" }} />
                </IconButton>
            </Stack>

            <Stack sx={{ gap: "20px" }}>
                <Stack sx={{ gap: 1 }}>
                    <TakeoutOptionButton
                        icon={<HugeiconsIcon icon={Folder01Icon} size={18} />}
                        label={t("unzipped_folder")}
                        description={t("unzipped_folder_hint")}
                        pending={isFolderSelectionPending}
                        onClick={onSelectFolder}
                    />
                    <TakeoutOptionButton
                        icon={<HugeiconsIcon icon={FileZipIcon} size={18} />}
                        label={t("zip_files")}
                        description={
                            isDesktop ? t("zip_files_hint") : t("desktop_only")
                        }
                        disabled={!isDesktop}
                        onClick={onSelectZips}
                    />
                </Stack>
                <Typography
                    sx={{
                        alignSelf: "center",
                        color: "text.faint",
                        fontSize: "14px",
                        fontWeight: 500,
                        lineHeight: "20px",
                    }}
                >
                    <span style={{ opacity: 0.7 }}>
                        {t("takeout_help_prompt")}{" "}
                    </span>
                    <Link
                        href="https://ente.com/help/photos/migration/from-google-photos/"
                        target="_blank"
                        rel="noopener"
                        sx={{
                            color: "accent.main",
                            fontWeight: 500,
                            textDecoration: "underline",
                        }}
                    >
                        {t("takeout_help_action")}
                    </Link>
                </Typography>
            </Stack>
        </Stack>
    );
}

interface TakeoutOptionButtonProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    disabled?: boolean;
    pending?: boolean;
    onClick: () => void;
}

function TakeoutOptionButton({
    icon,
    label,
    description,
    disabled,
    pending,
    onClick,
}: TakeoutOptionButtonProps): React.JSX.Element {
    return (
        <FocusVisibleButton
            fullWidth
            disabled={disabled}
            onClick={onClick}
            sx={(theme) => ({
                minHeight: "60px",
                p: "12px",
                borderRadius: "20px",
                backgroundColor: "background.paper",
                color: "text.base",
                "&:hover": { backgroundColor: "secondary.hover" },
                ...theme.applyStyles("dark", {
                    backgroundColor: "secondary.main",
                }),
                "&.Mui-disabled": {
                    backgroundColor: "secondary.main",
                    color: "text.faint",
                    opacity: 0.55,
                },
            })}
        >
            <Stack
                direction="row"
                sx={{ width: "100%", alignItems: "center", gap: "12px" }}
            >
                <Box
                    sx={{
                        display: "flex",
                        width: "36px",
                        height: "36px",
                        flexShrink: 0,
                        alignItems: "center",
                        justifyContent: "center",
                        color: "text.muted",
                    }}
                >
                    {pending ? (
                        <CircularProgress
                            size={18}
                            sx={{ color: "stroke.muted" }}
                        />
                    ) : (
                        icon
                    )}
                </Box>
                <Stack
                    sx={{ flex: 1, minWidth: 0, textAlign: "left", gap: "4px" }}
                >
                    <Typography
                        sx={{
                            fontSize: "14px",
                            fontWeight: 500,
                            lineHeight: "20px",
                        }}
                    >
                        {label}
                    </Typography>
                    <Typography
                        sx={{
                            color: "text.muted",
                            fontSize: "12px",
                            fontWeight: 500,
                            lineHeight: "16px",
                        }}
                    >
                        {description}
                    </Typography>
                </Stack>
                {!disabled && (
                    <Box
                        sx={{
                            display: "flex",
                            width: "48px",
                            height: "36px",
                            flexShrink: 0,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <ChevronRightIcon sx={{ fontSize: "18px" }} />
                    </Box>
                )}
            </Stack>
        </FocusVisibleButton>
    );
}
