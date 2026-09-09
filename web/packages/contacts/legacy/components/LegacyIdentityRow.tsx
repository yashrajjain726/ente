import CheckIcon from "@mui/icons-material/Check";
import {
    Avatar,
    Box,
    IconButton,
    Stack,
    Typography,
    type SxProps,
    type Theme,
} from "@mui/material";
import { isSxArray } from "ente-base/components/utils/sx";
import React from "react";
import {
    useResolvedContactAvatar,
    useResolvedContactDisplay,
} from "../../index";

interface LegacyIdentityRowProps {
    email: string;
    userID?: number;
    subtitle?: string;
    statusIndicator?: React.ReactNode;
    primaryColor?: string;
    selected?: boolean;
    onClick?: () => void;
    action?: React.ReactNode;
    sx?: SxProps<Theme>;
}

export const LegacyIdentityRow: React.FC<LegacyIdentityRowProps> = ({
    email,
    userID,
    subtitle,
    statusIndicator,
    primaryColor,
    selected,
    onClick,
    action,
    sx,
}) => {
    const lookup = userID === undefined ? { email } : { email, userID };
    const resolvedDisplay = useResolvedContactDisplay(lookup);
    const resolvedAvatar = useResolvedContactAvatar(lookup);
    const label = resolvedDisplay.primaryLabel || email;
    const secondaryLabel =
        label.toLowerCase() === email.toLowerCase() ? subtitle : email;
    const subtext =
        subtitle && secondaryLabel !== subtitle
            ? `${secondaryLabel} • ${subtitle}`
            : secondaryLabel || subtitle;

    return (
        <Stack
            direction="row"
            onClick={onClick}
            sx={[
                {
                    alignItems: "center",
                    minHeight: 54,
                    gap: 1.5,
                    p: "9px 12px",
                    bgcolor: "fill.faint",
                    borderRadius: "20px",
                    transition: "background-color 160ms ease",
                    cursor: onClick ? "pointer" : "default",
                    "&:hover": onClick
                        ? { backgroundColor: "fill.faintHover" }
                        : undefined,
                },
                ...(sx ? (isSxArray(sx) ? sx : [sx]) : []),
            ]}
        >
            <Avatar
                src={resolvedAvatar.avatarURL}
                sx={{
                    width: 28,
                    height: 28,
                    fontSize: 14,
                    bgcolor: "fill.faintHover",
                    color: "text.base",
                }}
            >
                {resolvedAvatar.initial}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack
                    direction="row"
                    sx={{ alignItems: "center", gap: 0.75, minWidth: 0 }}
                >
                    <Typography
                        variant="body"
                        sx={{ fontWeight: 500, color: primaryColor }}
                        noWrap
                    >
                        {label}
                    </Typography>
                    {statusIndicator}
                </Stack>
                {subtext && (
                    <Typography
                        variant="mini"
                        sx={{ color: "text.muted", mt: 0.25 }}
                        noWrap
                    >
                        {subtext}
                    </Typography>
                )}
            </Box>
            {selected ? (
                <IconButton
                    size="small"
                    disableRipple
                    sx={{
                        color: "accent.main",
                        "&:hover": { backgroundColor: "transparent" },
                    }}
                >
                    <CheckIcon fontSize="small" />
                </IconButton>
            ) : action ? (
                <Box
                    sx={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "text.muted",
                    }}
                >
                    {action}
                </Box>
            ) : undefined}
        </Stack>
    );
};
