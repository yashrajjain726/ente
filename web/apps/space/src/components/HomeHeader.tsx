import { BubbleChatIcon, Menu01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { alpha, Box } from "@mui/material";
import React from "react";
import {
    spaceAppBackgroundColor,
    spaceSurface,
    spaceText,
} from "styles/colors";
import { spaceTouchTargetSize } from "styles/touch-targets";

const green = "#08C225";
const dangerColor = "#F63A3A";
const headerActionSize = spaceTouchTargetSize;
const headerChatCircleSize = 36;
const headerIconSize = 25;
const headerSideWidth = 36;

export const spaceHomeHeaderHeight = 64;

interface SpaceHomeHeaderProps {
    children?: React.ReactNode;
    onOpenMessages?: () => void;
    onOpenSettings?: () => void;
    showUnreadIndicator?: boolean;
}

export const SpaceHomeHeader: React.FC<SpaceHomeHeaderProps> = ({
    children,
    onOpenMessages,
    onOpenSettings,
    showUnreadIndicator = false,
}) => (
    <Box
        component="header"
        sx={{
            alignItems: "center",
            background: "transparent",
            boxSizing: "border-box",
            color: spaceText,
            display: "grid",
            gap: "12px",
            gridTemplateColumns: `${headerSideWidth}px minmax(0, 1fr) ${headerSideWidth}px`,
            height: spaceHomeHeaderHeight,
            maxWidth: "100%",
            pb: 2,
            position: "relative",
            pt: 1.5,
            px: 2,
            width: "100%",
            zIndex: 4,
            "&::after": {
                bgcolor: spaceSurface,
                borderRadius: "999px",
                content: '""',
                height: 44,
                left: "16px",
                pointerEvents: "none",
                position: "absolute",
                right: "16px",
                top: "12px",
                zIndex: 0,
            },
            "&::before": {
                WebkitBackdropFilter: "blur(4px)",
                WebkitMaskImage:
                    "linear-gradient(to bottom, #000 0%, transparent 100%)",
                backdropFilter: "blur(4px)",
                background: `linear-gradient(to bottom, ${spaceAppBackgroundColor}, ${alpha(spaceAppBackgroundColor, 0.35)} 75%, transparent)`,
                content: '""',
                height: "calc(100% + 28px)",
                left: 0,
                maskImage:
                    "linear-gradient(to bottom, #000 0%, transparent 100%)",
                pointerEvents: "none",
                position: "absolute",
                right: 0,
                top: 0,
                zIndex: -1,
            },
            "@media (min-width: 600px)": { maxWidth: 390 },
        }}
    >
        {children}
        <Box
            component="button"
            type="button"
            aria-label="Settings"
            onClick={onOpenSettings}
            sx={{
                appearance: "none",
                alignItems: "center",
                bgcolor: "transparent",
                border: 0,
                borderRadius: "50%",
                boxSizing: "border-box",
                color: spaceText,
                cursor: onOpenSettings ? "pointer" : "default",
                display: "flex",
                height: headerActionSize,
                justifyContent: "center",
                lineHeight: 0,
                overflow: "hidden",
                p: 0,
                placeSelf: "center start",
                position: "relative",
                width: headerActionSize,
                zIndex: 1,
                "&:focus-visible": {
                    outline: `2px solid ${green}`,
                    outlineOffset: 2,
                },
            }}
        >
            <HugeiconsIcon
                icon={Menu01Icon}
                size={headerIconSize}
                strokeWidth={2.5}
            />
        </Box>
        <Box
            sx={{
                alignItems: "center",
                alignSelf: "center",
                boxSizing: "border-box",
                display: "flex",
                height: 36,
                justifyContent: "center",
                justifySelf: "center",
                lineHeight: 0,
                minWidth: 0,
                overflow: "visible",
                placeSelf: "center",
                position: "relative",
                px: "16px",
                zIndex: 1,
            }}
        >
            <Box
                component="img"
                alt="Space"
                src="/images/space.svg"
                sx={{ display: "block", height: 19, width: "auto" }}
            />
        </Box>
        <Box
            component="button"
            type="button"
            aria-label={
                showUnreadIndicator
                    ? "Open messages with unread activity"
                    : "Open messages"
            }
            onClick={onOpenMessages}
            sx={{
                appearance: "none",
                alignItems: "center",
                bgcolor: "transparent",
                border: 0,
                boxSizing: "border-box",
                color: spaceText,
                cursor: onOpenMessages ? "pointer" : "default",
                display: "flex",
                fontSize: 0,
                height: headerActionSize,
                justifyContent: "center",
                justifySelf: "end",
                lineHeight: 0,
                p: 0,
                position: "relative",
                width: headerActionSize,
                zIndex: 1,
                "& svg": { display: "block" },
                "&:focus-visible": {
                    borderRadius: "50%",
                    outline: `2px solid ${green}`,
                    outlineOffset: 2,
                },
            }}
        >
            <Box
                aria-hidden
                sx={{
                    alignItems: "center",
                    display: "flex",
                    height: headerChatCircleSize,
                    justifyContent: "center",
                    position: "relative",
                    width: headerChatCircleSize,
                    "& svg path:first-of-type": { display: "none" },
                }}
            >
                <HugeiconsIcon
                    icon={BubbleChatIcon}
                    size={headerIconSize}
                    strokeWidth={2.5}
                />
                {showUnreadIndicator && (
                    <Box
                        sx={{
                            bgcolor: dangerColor,
                            border: `2px solid ${spaceSurface}`,
                            borderRadius: "50%",
                            boxSizing: "border-box",
                            height: 12.5,
                            position: "absolute",
                            right: 4.5,
                            top: 5,
                            width: 12.5,
                            zIndex: 1,
                        }}
                    />
                )}
            </Box>
        </Box>
    </Box>
);
