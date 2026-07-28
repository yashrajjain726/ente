import { Box, Dialog, useMediaQuery } from "@mui/material";
import { SpaceBottomSheetTransition } from "components/SpaceBottomSheetTransition";
import { isSpaceIOS } from "hooks/useSpacePWAInstallPrompt";
import React from "react";

const green = "#08C225";

interface SpaceNotificationPermissionInstructionsProps {
    onClose: () => void;
    open: boolean;
}

export const SpaceNotificationPermissionInstructions: React.FC<
    SpaceNotificationPermissionInstructionsProps
> = ({ onClose, open }) => {
    const titleID = React.useId();
    const isBottomSheet = useMediaQuery("(max-width: 599px)");
    const steps = isSpaceIOS()
        ? [
              "Open Settings",
              'Tap "Notifications"',
              'Tap "Ente Space" and turn on "Allow Notifications"',
          ]
        : [
              "Open your browser's site settings for Space",
              'Find "Notifications"',
              'Choose "Allow"',
          ];

    return (
        <Dialog
            open={open}
            onClose={onClose}
            aria-labelledby={titleID}
            maxWidth={false}
            sx={{ "--space-dialog-backdrop": "rgba(0 0 0 / 0.56)" }}
            slots={
                isBottomSheet
                    ? { transition: SpaceBottomSheetTransition }
                    : undefined
            }
            slotProps={{
                paper: {
                    sx: {
                        borderRadius: "28px 28px 0 0",
                        bottom: 0,
                        m: 0,
                        p: "26px 20px calc(24px + env(safe-area-inset-bottom))",
                        position: "fixed",
                        width: "100vw",
                        "@media (min-width: 600px)": {
                            borderRadius: "20px",
                            bottom: "auto",
                            left: "50%",
                            maxWidth: 342,
                            p: "24px 20px 20px",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                        },
                    },
                },
            }}
        >
            <Box
                component="h2"
                id={titleID}
                sx={{
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 16,
                    fontWeight: 650,
                    m: 0,
                    textAlign: "center",
                }}
            >
                Turn on notifications
            </Box>
            <Box
                component="ol"
                sx={{
                    color: "#555",
                    display: "grid",
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    gap: "12px",
                    lineHeight: "20px",
                    my: "22px",
                    pl: "28px",
                }}
            >
                {steps.map((step) => (
                    <li key={step}>{step}</li>
                ))}
            </Box>
            <Box
                className="green-bg"
                component="button"
                type="button"
                onClick={onClose}
                sx={{
                    bgcolor: green,
                    border: 0,
                    borderRadius: "20px",
                    color: "#FFFFFF",
                    cursor: "pointer",
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: 14,
                    fontWeight: 650,
                    height: 48,
                    width: "100%",
                }}
            >
                Got it
            </Box>
        </Dialog>
    );
};
