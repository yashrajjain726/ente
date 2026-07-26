import { Box, Dialog, Skeleton, useMediaQuery } from "@mui/material";
import { ConfirmationActionSheet } from "components/ConfirmationActionSheet";
import { SpaceBottomSheetTransition } from "components/SpaceBottomSheetTransition";
import React from "react";
import {
    getOrCreateCurrentSpaceLink,
    rotateCurrentSpaceLink,
    type CurrentSpaceLink,
} from "services/space";
import { spaceInviteURL } from "services/spaceInvite";
import { onOpenSpaceShareLinkDialog } from "services/spaceShareLink";

const green = "#08C225";
const dangerColor = "#F63A3A";

export const SpaceShareLinkDialogHost: React.FC = () => {
    const isBottomSheet = useMediaQuery("(max-width: 599px)");
    const linkRequestID = React.useRef(0);
    const [open, setOpen] = React.useState(false);
    const [link, setLink] = React.useState<CurrentSpaceLink>();
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string>();
    const [copied, setCopied] = React.useState(false);
    const [isChangeConfirmationOpen, setIsChangeConfirmationOpen] =
        React.useState(false);
    const [confirming, setConfirming] = React.useState(false);

    const loadLink = React.useCallback(() => {
        const requestID = ++linkRequestID.current;
        setOpen(true);
        setLink(undefined);
        setLoading(true);
        setError(undefined);
        setCopied(false);
        void getOrCreateCurrentSpaceLink()
            .then((nextLink) => {
                if (linkRequestID.current == requestID) setLink(nextLink);
            })
            .catch((error: unknown) => {
                if (linkRequestID.current != requestID) return;
                console.error("Failed to create Space link", error);
                setError("Couldn't create the link. Please try again.");
            })
            .finally(() => {
                if (linkRequestID.current == requestID) setLoading(false);
            });
    }, []);

    React.useEffect(() => {
        return onOpenSpaceShareLinkDialog(loadLink);
    }, [loadLink]);

    const close = () => {
        linkRequestID.current++;
        setLink(undefined);
        setLoading(false);
        setOpen(false);
    };

    const url = link
        ? spaceInviteURL({
              accessKey: link.accessKey,
              spaceUsername: link.spaceSlug,
          })
        : "";

    const copy = async () => {
        if (!url) return;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch (error) {
            console.error("Failed to copy Space link", error);
            setError("Couldn't copy the link.");
        }
    };

    const share = async () => {
        if (!url) return;
        if (typeof navigator.share != "function") {
            await copy();
            return;
        }
        try {
            await navigator.share({ url });
        } catch (error) {
            if (
                !(error instanceof DOMException && error.name == "AbortError")
            ) {
                console.error("Failed to share Space link", error);
                setError("Couldn't share the link.");
            }
        }
    };

    const confirm = () => {
        if (confirming) return;
        setConfirming(true);
        setError(undefined);
        void rotateCurrentSpaceLink()
            .then((nextLink) => {
                setIsChangeConfirmationOpen(false);
                setLink(nextLink);
                setCopied(false);
            })
            .catch((error: unknown) => {
                console.error("Failed to change Space link", error);
                setIsChangeConfirmationOpen(false);
                setError("Couldn't change the link.");
            })
            .finally(() => setConfirming(false));
    };

    return (
        <>
            <Dialog
                open={open}
                onClose={close}
                maxWidth={false}
                slots={
                    isBottomSheet
                        ? { transition: SpaceBottomSheetTransition }
                        : undefined
                }
                slotProps={{
                    backdrop: {
                        sx: { backgroundColor: "rgba(0, 0, 0, 0.48)" },
                    },
                    paper: {
                        sx: {
                            bgcolor: "#FAFAFA",
                            borderRadius: "28px 28px 0 0",
                            bottom: 0,
                            boxShadow: "none",
                            boxSizing: "border-box",
                            left: 0,
                            m: 0,
                            maxWidth: "none",
                            p: "26px 20px 24px",
                            position: "fixed",
                            width: "100vw",
                            "@media (min-width: 600px)": {
                                borderRadius: "20px",
                                bottom: "auto",
                                left: "50%",
                                maxWidth: 420,
                                top: "50%",
                                transform: "translate(-50%, -50%)",
                                width: 420,
                            },
                        },
                    },
                }}
            >
                <Box
                    component="h2"
                    sx={{
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 17,
                        fontWeight: 700,
                        lineHeight: "24px",
                        m: 0,
                        textAlign: "center",
                    }}
                >
                    Share
                </Box>
                <Box
                    sx={{
                        color: "#666",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 13,
                        lineHeight: "18px",
                        mt: "6px",
                    }}
                >
                    This link allows anyone who receives it to view your profile
                    and all current and future posts. You can remove their
                    access at any time by changing the link.
                </Box>
                {loading ? (
                    <Skeleton
                        variant="rounded"
                        sx={{ borderRadius: "14px", height: 52, mt: "22px" }}
                    />
                ) : (
                    <Box
                        sx={{
                            alignItems: "center",
                            bgcolor: "#FFF",
                            border: "1px solid #E7E7E7",
                            borderRadius: "14px",
                            display: "flex",
                            gap: "10px",
                            mt: "22px",
                            p: "6px 6px 6px 14px",
                        }}
                    >
                        <Box
                            sx={{
                                flex: 1,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {url}
                        </Box>
                        <ActionButton
                            label={copied ? "Copied" : "Copy"}
                            onClick={copy}
                        />
                    </Box>
                )}
                {error && (
                    <Box
                        role="alert"
                        sx={{
                            color: dangerColor,
                            fontSize: 13,
                            mt: "10px",
                            textAlign: "center",
                        }}
                    >
                        {error}
                    </Box>
                )}
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        mt: "18px",
                    }}
                >
                    <ActionButton
                        disabled={!link || loading}
                        label="Share link"
                        primary
                        onClick={share}
                    />
                    <ActionButton
                        disabled={!link || loading}
                        label="Change link"
                        onClick={() => setIsChangeConfirmationOpen(true)}
                    />
                </Box>
            </Dialog>
            <ConfirmationActionSheet
                open={isChangeConfirmationOpen}
                title="Change this link?"
                description="A new link will replace this one. People with the current link will no longer be able to load your Space. Anything already downloaded stays with them."
                confirmLabel="Change link"
                confirmBackgroundColor={green}
                confirmDisabled={confirming}
                confirmActionPhase={confirming ? "busy" : null}
                cancelDisabled={confirming}
                onCancel={() => {
                    if (!confirming) setIsChangeConfirmationOpen(false);
                }}
                onConfirm={confirm}
            />
        </>
    );
};

interface ActionButtonProps {
    disabled?: boolean;
    label: string;
    onClick: () => void | Promise<void>;
    primary?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
    disabled,
    label,
    onClick,
    primary,
}) => (
    <Box
        component="button"
        type="button"
        disabled={disabled}
        onClick={() => void onClick()}
        sx={{
            bgcolor: primary ? "#000" : "#F0F0F0",
            border: 0,
            borderRadius: "14px",
            color: primary ? "#FFF" : "#111",
            cursor: disabled ? "default" : "pointer",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 650,
            minHeight: 46,
            opacity: disabled ? 0.5 : 1,
            px: "18px",
        }}
    >
        {label}
    </Box>
);
