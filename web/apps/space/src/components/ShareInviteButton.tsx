import { Share08Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { spaceToastAutoDismissDurationMs } from "components/ActionToast";
import React from "react";
import { spaceEmptyStateButtonSx } from "styles/buttons";
import { spaceAppBackgroundColor, spaceText } from "styles/colors";

export const SpaceShareIcon: React.FC<{
    size?: number;
    strokeWidth?: number;
}> = ({ size = 18, strokeWidth = 1.8 }) => (
    <HugeiconsIcon icon={Share08Icon} size={size} strokeWidth={strokeWidth} />
);

interface SpaceShareInviteButtonProps {
    profileLink?: string;
    sharing?: boolean;
    variant?: "green" | "secondary";
    onShareError?: (error: unknown) => void;
    onSharingChange?: (sharing: boolean) => void;
}

export const SpaceShareInviteButton: React.FC<SpaceShareInviteButtonProps> = ({
    profileLink,
    sharing,
    variant = "green",
    onShareError,
    onSharingChange,
}) => {
    const [copied, setCopied] = React.useState(false);
    const [canShare, setCanShare] = React.useState(false);
    const isSharing = sharing ?? false;
    const isDisabled = isSharing || !profileLink;

    React.useEffect(() => {
        setCanShare(typeof navigator.share == "function");
    }, []);

    React.useEffect(() => {
        if (!copied) return;
        const timeoutID = window.setTimeout(
            () => setCopied(false),
            spaceToastAutoDismissDurationMs,
        );
        return () => window.clearTimeout(timeoutID);
    }, [copied]);

    const shareInvite = async () => {
        if (isDisabled || !profileLink) return;
        onSharingChange?.(true);
        try {
            if (typeof navigator.share == "function") {
                try {
                    await navigator.share({ url: profileLink });
                } catch (error) {
                    if (
                        error instanceof DOMException &&
                        error.name == "AbortError"
                    ) {
                        return;
                    }
                    throw error;
                }
            } else {
                await navigator.clipboard.writeText(profileLink);
                setCopied(true);
            }
        } catch (error) {
            onShareError?.(error);
        } finally {
            onSharingChange?.(false);
        }
    };

    return (
        <Box
            className={variant == "green" ? "green-bg" : undefined}
            component="button"
            type="button"
            aria-live="polite"
            disabled={isDisabled}
            onClick={() => void shareInvite()}
            sx={
                variant == "secondary"
                    ? {
                          ...spaceEmptyStateButtonSx,
                          bgcolor: "#FFFFFF",
                          color: spaceAppBackgroundColor,
                          "&:focus-visible": {
                              outline: `2px solid ${spaceText}`,
                              outlineOffset: 2,
                          },
                          "&:hover:not(:disabled)": { bgcolor: spaceText },
                      }
                    : spaceEmptyStateButtonSx
            }
        >
            <SpaceShareIcon />
            {copied
                ? "Invite link copied"
                : canShare
                  ? "Share invite link"
                  : "Copy invite link"}
        </Box>
    );
};
