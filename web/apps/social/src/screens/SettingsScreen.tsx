import {
    ArrowLeft02Icon,
    ArrowRight01Icon as ChevronRightIcon,
    CustomerSupportIcon,
    HelpCircleIcon,
    Logout05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Box, Dialog } from "@mui/material";
import React from "react";

export const settingsBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const rowBackground = "#FFFFFF";
const dangerColor = "#F63A3A";
const iconMuted = "#8C8C8C";

interface SettingsScreenProps {
    onLogout: () => void;
    onBack?: () => void;
}

interface SettingsRowProps {
    danger?: boolean;
    icon: IconSvgElement;
    label: string;
    onClick?: () => void;
}

interface SocialIconProps {
    label: string;
    src: string;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
    danger,
    icon,
    label,
    onClick,
}) => (
    <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: rowBackground,
            border: 0,
            borderRadius: "20px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            minHeight: 56,
            p: "8px",
            textAlign: "left",
            transition: "background-color 120ms ease",
            width: "100%",
            "&:active": { bgcolor: "rgba(0, 0, 0, 0.025)" },
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 2,
            },
            "&:hover": { bgcolor: "rgba(0, 0, 0, 0.025)" },
        }}
    >
        <Box
            sx={{
                alignItems: "center",
                display: "flex",
                gap: "4px",
                minWidth: 0,
            }}
        >
            <Box
                sx={{
                    alignItems: "center",
                    borderRadius: "12px",
                    color: danger ? dangerColor : iconMuted,
                    display: "flex",
                    flexShrink: 0,
                    height: 40,
                    justifyContent: "center",
                    width: 40,
                }}
            >
                <HugeiconsIcon icon={icon} size={20} strokeWidth={1.6} />
            </Box>
            <Box
                sx={{
                    color: danger ? dangerColor : textBase,
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: "17px",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {label}
            </Box>
        </Box>
        <HugeiconsIcon
            aria-hidden
            icon={ChevronRightIcon}
            size={20}
            strokeWidth={1.8}
            style={{ color: textBase, flexShrink: 0 }}
        />
    </Box>
);

interface LogoutConfirmationSheetProps {
    open: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

const LogoutConfirmationSheet: React.FC<LogoutConfirmationSheetProps> = ({
    open,
    onCancel,
    onConfirm,
}) => (
    <Dialog
        open={open}
        onClose={onCancel}
        maxWidth={false}
        aria-labelledby="logout-confirmation-title"
        slotProps={{
            backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.48)" } },
            paper: {
                sx: {
                    bgcolor: settingsBackground,
                    borderRadius: "20px 20px 0 0",
                    bottom: 0,
                    boxShadow: "none",
                    boxSizing: "border-box",
                    left: "50%",
                    m: 0,
                    p: "26px 20px 24px",
                    position: "fixed",
                    transform: "translateX(-50%)",
                    width: "calc(100vw - 12px)",
                    maxWidth: 363,
                },
            },
        }}
    >
        <Box
            component="h2"
            id="logout-confirmation-title"
            sx={{
                color: textBase,
                fontFamily: '"Inter Variable", Inter, sans-serif',
                fontSize: 15,
                fontWeight: 600,
                lineHeight: "20px",
                m: 0,
                px: "20px",
                textAlign: "center",
            }}
        >
            Are you sure you want to logout?
        </Box>
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                mt: "28px",
            }}
        >
            <SheetButton
                label="Yes, logout"
                backgroundColor={dangerColor}
                color="#FFFFFF"
                onClick={onConfirm}
            />
            <SheetButton
                label="Cancel"
                backgroundColor="#F2F2F2"
                color="#666666"
                onClick={onCancel}
            />
        </Box>
    </Dialog>
);

interface SheetButtonProps {
    backgroundColor: string;
    color: string;
    label: string;
    onClick: () => void;
}

const SheetButton: React.FC<SheetButtonProps> = ({
    backgroundColor,
    color,
    label,
    onClick,
}) => (
    <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: backgroundColor,
            border: 0,
            borderRadius: "20px",
            color,
            cursor: "pointer",
            display: "flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            height: 48,
            justifyContent: "center",
            lineHeight: "20px",
            px: "24px",
            py: "14px",
            transition: "filter 120ms ease, opacity 120ms ease",
            width: "100%",
            "&:active": { filter: "brightness(0.96)" },
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 2,
            },
            "&:hover": { filter: "brightness(0.98)" },
        }}
    >
        {label}
    </Box>
);

const SocialIcon: React.FC<SocialIconProps> = ({ label, src }) => (
    <Box
        aria-label={label}
        component="button"
        type="button"
        sx={{
            alignItems: "center",
            bgcolor: "transparent",
            border: 0,
            borderRadius: "10px",
            cursor: "pointer",
            display: "flex",
            height: 32,
            justifyContent: "center",
            p: 0,
            transition: "background-color 120ms ease",
            width: 32,
            "&:active": { bgcolor: "rgba(0, 0, 0, 0.025)" },
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 2,
            },
            "&:hover": { bgcolor: "rgba(0, 0, 0, 0.025)" },
        }}
    >
        <Box
            component="img"
            aria-hidden
            alt=""
            src={src}
            sx={{ display: "block", maxHeight: 20, maxWidth: 20 }}
        />
    </Box>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
    onLogout,
    onBack,
}) => {
    const [logoutSheetOpen, setLogoutSheetOpen] = React.useState(false);

    const handleConfirmLogout = () => {
        setLogoutSheetOpen(false);
        onLogout();
    };

    return (
        <Box
            component="main"
            sx={{
                bgcolor: settingsBackground,
                color: textBase,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: settingsBackground,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "100svh",
                    mx: "auto",
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 375 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        display: "grid",
                        gridTemplateColumns: "24px 1fr 24px",
                        height: 56,
                        px: 2,
                        width: "100%",
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label="Back to profile"
                        onClick={onBack}
                        sx={{
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: textBase,
                            cursor: onBack ? "pointer" : "default",
                            display: "flex",
                            height: 24,
                            justifyContent: "flex-start",
                            p: 0,
                            width: 24,
                            "&:focus-visible": {
                                borderRadius: "50%",
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        <HugeiconsIcon
                            icon={ArrowLeft02Icon}
                            size={24}
                            strokeWidth={1.8}
                        />
                    </Box>
                    <Box
                        component="h1"
                        sx={{
                            color: textBase,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 18,
                            fontWeight: 700,
                            justifySelf: "center",
                            lineHeight: "24px",
                            m: 0,
                        }}
                    >
                        Settings
                    </Box>
                </Box>

                <Box
                    component="section"
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        mt: "24px",
                        px: "14px",
                        width: "100%",
                    }}
                >
                    <SettingsRow icon={HelpCircleIcon} label="Help" />
                    <SettingsRow icon={CustomerSupportIcon} label="Support" />
                    <SettingsRow
                        danger
                        icon={Logout05Icon}
                        label="Logout"
                        onClick={() => setLogoutSheetOpen(true)}
                    />
                </Box>

                <Box sx={{ flex: 1, minHeight: 72 }} />

                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "8px",
                        justifyContent: "center",
                        pb: "18px",
                    }}
                >
                    <SocialIcon label="Discord" src="/images/discord.svg" />
                    <SocialIcon label="YouTube" src="/images/youtube.svg" />
                    <SocialIcon label="GitHub" src="/images/github.svg" />
                    <SocialIcon label="X" src="/images/new-twitter.svg" />
                    <SocialIcon label="Mastodon" src="/images/mastodon.svg" />
                    <SocialIcon label="Reddit" src="/images/reddit.svg" />
                </Box>
            </Box>
            <LogoutConfirmationSheet
                open={logoutSheetOpen}
                onCancel={() => setLogoutSheetOpen(false)}
                onConfirm={handleConfirmLogout}
            />
        </Box>
    );
};
