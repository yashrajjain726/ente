import {
    ArrowLeft02Icon,
    ArrowRight01Icon as ChevronRightIcon,
    CustomerSupportIcon,
    HelpCircleIcon,
    Logout05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Box } from "@mui/material";
import { ConfirmationActionSheet } from "components/ConfirmationActionSheet";
import React from "react";

export const settingsBackground = "#FAFAFA";

const green = "#08C225";
const textBase = "#000";
const rowBackground = "#FFFFFF";
const dangerColor = "#F63A3A";
const iconMuted = "#8C8C8C";
const helpURL = "https://ente.com/help/photos/features/profile";
const supportMailURL = "mailto:support@ente.com";
const spaceLinks = [
    {
        label: "Discord",
        src: "/images/discord.svg",
        url: "https://ente.com/discord",
    },
    {
        label: "YouTube",
        src: "/images/youtube.svg",
        url: "https://www.youtube.com/@entestudio",
    },
    {
        label: "GitHub",
        src: "/images/github.svg",
        url: "https://github.com/ente-io/ente",
    },
    {
        label: "X",
        src: "/images/new-twitter.svg",
        url: "https://twitter.com/enteio",
    },
    {
        label: "Mastodon",
        src: "/images/mastodon.svg",
        url: "https://fosstodon.org/@ente",
    },
    {
        label: "Reddit",
        src: "/images/reddit.svg",
        url: "https://reddit.com/r/enteio",
    },
] as const;

interface SettingsScreenProps {
    onLogout: () => void;
    onBack?: () => void;
}

interface SettingsRowProps {
    danger?: boolean;
    href?: string;
    icon: IconSvgElement;
    label: string;
    onClick?: () => void;
}

interface SpaceIconProps {
    label: string;
    src: string;
    url: string;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
    danger,
    href,
    icon,
    label,
    onClick,
}) => (
    <Box
        component={href ? "a" : "button"}
        href={href}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
        target={href?.startsWith("http") ? "_blank" : undefined}
        type={href ? undefined : "button"}
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: rowBackground,
            border: 0,
            borderRadius: "20px",
            boxSizing: "border-box",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            minHeight: 56,
            p: "8px",
            textDecoration: "none",
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

const SpaceIcon: React.FC<SpaceIconProps> = ({ label, src, url }) => (
    <Box
        aria-label={label}
        component="a"
        href={url}
        rel="noopener noreferrer"
        target="_blank"
        sx={{
            alignItems: "center",
            bgcolor: "transparent",
            border: 0,
            borderRadius: "10px",
            cursor: "pointer",
            display: "flex",
            height: 36,
            justifyContent: "center",
            p: 0,
            textDecoration: "none",
            transition: "background-color 120ms ease",
            width: 36,
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
            sx={{ display: "block", maxHeight: 24, maxWidth: 24 }}
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
                    "@media (min-width: 600px)": { maxWidth: 390 },
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
                            ml: "-2px",
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
                    <SettingsRow
                        href={helpURL}
                        icon={HelpCircleIcon}
                        label="Help"
                    />
                    <SettingsRow
                        href={supportMailURL}
                        icon={CustomerSupportIcon}
                        label="Support"
                    />
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
                    {spaceLinks.map((link) => (
                        <SpaceIcon
                            key={link.label}
                            label={link.label}
                            src={link.src}
                            url={link.url}
                        />
                    ))}
                </Box>
            </Box>
            <ConfirmationActionSheet
                open={logoutSheetOpen}
                title="Are you sure you want to logout?"
                confirmLabel="Yes, logout"
                onCancel={() => setLogoutSheetOpen(false)}
                onConfirm={handleConfirmLogout}
            />
        </Box>
    );
};
