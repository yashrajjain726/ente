import {
    Notification02Icon,
    ScreenAddToHomeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpaceNotificationPermissionInstructions } from "components/SpaceNotificationPermissionInstructions";
import { SpacePWAInstallInstructions } from "components/SpacePWAInstallPrompt";
import {
    isSpaceIOS,
    isSpaceStandalone,
    useSpacePWAInstallPrompt,
} from "hooks/useSpacePWAInstallPrompt";
import React from "react";
import type { PublicSpaceLinkSession } from "services/space";
import {
    isSpaceWebPushSupported,
    reconcilePublicSpaceWebPush,
    subscribeToPublicSpaceWebPush,
    type SpaceWebPushState,
} from "services/spaceWebPush";

interface SpacePublicProfileNotificationControlProps {
    session: PublicSpaceLinkSession;
}

export const SpacePublicProfileNotificationControl: React.FC<
    SpacePublicProfileNotificationControlProps
> = ({ session }) => {
    const installPrompt = useSpacePWAInstallPrompt();
    const updating = React.useRef(false);
    const [state, setState] = React.useState<SpaceWebPushState>("unavailable");
    const [busy, setBusy] = React.useState(true);
    const [installInstructionsOpen, setInstallInstructionsOpen] =
        React.useState(false);
    const [permissionInstructionsOpen, setPermissionInstructionsOpen] =
        React.useState(false);
    const route =
        typeof window == "undefined"
            ? ""
            : `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const requiresIOSInstall = isSpaceIOS() && !isSpaceStandalone();

    const reconcile = React.useCallback(async () => {
        if (!route || !isSpaceWebPushSupported() || requiresIOSInstall) {
            setState("unavailable");
            setBusy(false);
            return;
        }
        try {
            setState(await reconcilePublicSpaceWebPush(session, route));
        } catch (error) {
            console.warn(
                "Failed to reconcile public Space notifications",
                error,
            );
            setState("recovery");
        } finally {
            setBusy(false);
        }
    }, [requiresIOSInstall, route, session]);

    React.useEffect(() => {
        let running = false;
        const check = () => {
            if (running || updating.current) return;
            running = true;
            void reconcile().finally(() => {
                running = false;
            });
        };
        const checkWhenVisible = () => {
            if (document.visibilityState == "visible") check();
        };

        check();
        window.addEventListener("focus", check);
        document.addEventListener("visibilitychange", checkWhenVisible);
        return () => {
            window.removeEventListener("focus", check);
            document.removeEventListener("visibilitychange", checkWhenVisible);
        };
    }, [reconcile]);

    const canShowNotifications =
        !requiresIOSInstall && isSpaceWebPushSupported();
    const showNotificationButton =
        canShowNotifications &&
        (updating.current ||
            (!busy && state != "subscribed" && state != "unavailable"));
    const showNotificationStatus =
        canShowNotifications && !busy && state == "subscribed";
    const showInstall = requiresIOSInstall && installPrompt.canInstall;
    const reserveControlSpace =
        busy && (canShowNotifications || requiresIOSInstall);
    if (
        !showNotificationButton &&
        !showNotificationStatus &&
        !showInstall &&
        !reserveControlSpace
    ) {
        return null;
    }

    const enable = async () => {
        if (Notification.permission == "denied") {
            setPermissionInstructionsOpen(true);
            return;
        }
        updating.current = true;
        setBusy(true);
        try {
            const permission = await subscribeToPublicSpaceWebPush(
                session,
                route,
            );
            if (permission == "granted") {
                setState("subscribed");
            } else if (permission == "denied") {
                setState("denied");
                setPermissionInstructionsOpen(true);
            }
        } catch (error) {
            console.warn("Failed to update public Space notifications", error);
            setState("recovery");
        } finally {
            updating.current = false;
            setBusy(false);
        }
    };

    const label = busy ? "Enabling…" : "Get notified of new posts";

    return (
        <>
            <Box
                sx={{
                    alignItems: "center",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    justifyContent: "center",
                    minHeight: 40,
                    mt: "14px",
                }}
            >
                {showNotificationButton && (
                    <PublicProfileControlButton
                        busy={busy}
                        icon={Notification02Icon}
                        label={label}
                        onClick={() => void enable()}
                    />
                )}
                {showNotificationStatus && <PublicProfileNotificationStatus />}
                {showInstall && (
                    <PublicProfileControlButton
                        icon={ScreenAddToHomeIcon}
                        label="Add to home screen"
                        onClick={() => setInstallInstructionsOpen(true)}
                    />
                )}
            </Box>
            <SpacePWAInstallInstructions
                mode={installPrompt.mode}
                open={installInstructionsOpen}
                onClose={() => setInstallInstructionsOpen(false)}
                onDismiss={() => setInstallInstructionsOpen(false)}
            />
            <SpaceNotificationPermissionInstructions
                open={permissionInstructionsOpen}
                onClose={() => setPermissionInstructionsOpen(false)}
            />
        </>
    );
};

const PublicProfileNotificationStatus: React.FC = () => (
    <Box
        role="status"
        sx={{
            alignItems: "center",
            color: "#777777",
            display: "inline-flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 500,
            gap: "8px",
            minHeight: 40,
        }}
    >
        <HugeiconsIcon icon={Notification02Icon} size={18} strokeWidth={1.9} />
        You’ll be notified of new posts
    </Box>
);

const PublicProfileControlButton: React.FC<{
    busy?: boolean;
    icon: IconSvgElement;
    label: string;
    onClick: () => void;
}> = ({ busy, icon, label, onClick }) => (
    <Box
        component="button"
        type="button"
        disabled={busy}
        onClick={onClick}
        sx={{
            alignItems: "center",
            appearance: "none",
            bgcolor: "#F2F2F2",
            border: 0,
            borderRadius: "14px",
            color: "#1B1B1B",
            cursor: busy ? "default" : "pointer",
            display: "inline-flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 600,
            gap: "8px",
            minHeight: 40,
            opacity: busy ? 0.7 : 1,
            px: "16px",
            "&:hover": { bgcolor: busy ? "#F2F2F2" : "#E7E7E7" },
            "&:focus-visible": {
                outline: "2px solid #1B1B1B",
                outlineOffset: 2,
            },
        }}
    >
        <HugeiconsIcon icon={icon} size={18} strokeWidth={1.9} />
        {label}
    </Box>
);
