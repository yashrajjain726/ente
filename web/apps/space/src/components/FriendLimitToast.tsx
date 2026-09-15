import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import {
    SpaceActionToast,
    spaceToastAutoDismissDurationMs,
} from "components/ActionToast";
import React from "react";

const dangerColor = "#F63A3A";

interface SpaceFriendLimitToastProps {
    message: string;
    onClose: () => void;
}

export const SpaceFriendLimitToast: React.FC<SpaceFriendLimitToastProps> = ({
    message,
    onClose,
}) => {
    const username = message.startsWith("@")
        ? message.split(" ", 1)[0]
        : undefined;

    return (
        <SpaceActionToast
            animateEntrance
            autoDismissAfterMs={spaceToastAutoDismissDurationMs}
            closeLabel="Dismiss friend limit"
            icon={
                <HugeiconsIcon
                    color={dangerColor}
                    icon={AlertCircleIcon}
                    size={20}
                    strokeWidth={1.8}
                />
            }
            message={
                username ? (
                    <Box sx={{ display: "flex" }}>
                        <Box
                            component="span"
                            sx={{
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {username}
                        </Box>
                        <Box
                            component="span"
                            sx={{ flexShrink: 0, whiteSpace: "pre" }}
                        >
                            {message.slice(username.length)}
                        </Box>
                    </Box>
                ) : (
                    message
                )
            }
            onClose={onClose}
        />
    );
};
