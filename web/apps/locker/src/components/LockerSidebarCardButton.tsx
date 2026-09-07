import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Stack, Typography } from "@mui/material";
import React from "react";

interface LockerSidebarCardButtonProps {
    icon?: React.ComponentProps<typeof HugeiconsIcon>["icon"];
    iconNode?: React.ReactNode;
    label: React.ReactNode;
    onClick: () => void;
    caption?: string;
    endIcon?: React.ReactNode;
    selected?: boolean;
    color?: string;
}

export const LockerSidebarCardButton: React.FC<
    LockerSidebarCardButtonProps
> = ({
    icon,
    iconNode,
    label,
    onClick,
    caption,
    endIcon,
    selected = false,
    color,
}) => (
    <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
            width: "100%",
            p: 0,
            m: 0,
            border: 0,
            background: "transparent",
            textAlign: "inherit",
            cursor: "pointer",
            borderRadius: "20px",
        }}
    >
        <Stack
            direction="row"
            sx={(theme) => ({
                minHeight: 54,
                px: 1.5,
                gap: 1.5,
                alignItems: "center",
                borderRadius: "20px",
                backgroundColor: "#ffffff",
                color: color ?? "text.base",
                transition: theme.transitions.create(
                    ["background-color", "border-color", "color"],
                    { duration: theme.transitions.duration.shorter },
                ),
                border: "1px solid transparent",
                ...(selected && {
                    backgroundColor: "rgba(16, 113, 255, 0.12)",
                    boxShadow: `inset 0 0 0 1px ${theme.vars.palette.accent.main}`,
                    color: "accent.main",
                }),
                "&:hover": {
                    backgroundColor: selected
                        ? "rgba(16, 113, 255, 0.16)"
                        : "#eaeaea",
                },
                "&:active": {
                    backgroundColor: selected
                        ? "rgba(16, 113, 255, 0.18)"
                        : "#dedede",
                },
                ...theme.applyStyles("dark", {
                    backgroundColor: "#212121",
                    ...(selected && {
                        backgroundColor: "rgba(16, 113, 255, 0.12)",
                    }),
                    "&:hover": {
                        backgroundColor: selected
                            ? "rgba(16, 113, 255, 0.16)"
                            : "#1b1b1b",
                    },
                    "&:active": {
                        backgroundColor: selected
                            ? "rgba(16, 113, 255, 0.18)"
                            : "#141414",
                    },
                }),
            })}
        >
            {iconNode || icon ? (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "inherit",
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                    }}
                >
                    {iconNode ?? (
                        <HugeiconsIcon
                            icon={icon!}
                            size={18}
                            color="currentColor"
                            strokeWidth={1.6}
                        />
                    )}
                </Box>
            ) : null}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                {typeof label === "string" ? (
                    <Typography
                        variant="small"
                        sx={{
                            color: "inherit",
                            fontSize: 14,
                            lineHeight: "20px",
                            fontWeight: selected ? 600 : 500,
                        }}
                    >
                        {label}
                    </Typography>
                ) : (
                    label
                )}
            </Box>
            {caption && (
                <Box
                    sx={{
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    <Typography
                        variant="mini"
                        sx={{
                            color: selected ? "accent.main" : "text.muted",
                            fontSize: 14,
                            lineHeight: "20px",
                        }}
                    >
                        {caption}
                    </Typography>
                </Box>
            )}
            {endIcon && (
                <Box
                    sx={{
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: selected ? "accent.main" : "text.muted",
                        flexShrink: 0,
                    }}
                >
                    {endIcon}
                </Box>
            )}
        </Stack>
    </Box>
);
