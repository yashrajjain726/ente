import {
    ArrowLeft02Icon,
    MoreVerticalIcon,
    UserRemove01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Menu, MenuItem } from "@mui/material";
import { ConfirmationActionSheet } from "components/ConfirmationActionSheet";
import {
    spaceActionDoneDurationMs,
    type SpaceActionPhase,
} from "components/SpaceActionFeedback";
import type { FriendProfile } from "data/friends";
import React, { useState } from "react";
import { initialsFor } from "utils/spaceDisplay";

export const friendsBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000";
const textStrong = "#303030";
const textSoft = "#777777";
const dangerColor = "#F63A3A";

interface FriendsScreenProps {
    friends: FriendProfile[];
    onBack?: () => void;
    onOpenFriend?: (friendID: string) => void;
    onUnfriend?: (friendID: string) => Promise<void> | void;
}

interface FriendRowProps {
    friend: FriendProfile;
    onOpenFriend?: (friendID: string) => void;
    onUnfriend?: (friendID: string) => void;
}

const FriendRow: React.FC<FriendRowProps> = ({
    friend,
    onOpenFriend,
    onUnfriend,
}) => {
    const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(
        null,
    );
    const isActionsOpen = Boolean(actionsAnchor);
    const actionsMenuID = `friend-actions-menu-${friend.id}`;
    const actionsButtonID = `friend-actions-button-${friend.id}`;
    const displayName = friend.fullName.trim() || friend.username.trim();
    const initials = initialsFor(displayName || friend.username);

    const closeActions = () => setActionsAnchor(null);

    const unfriend = () => {
        closeActions();
        onUnfriend?.(friend.id);
    };

    return (
        <Box
            component="li"
            sx={{
                alignItems: "center",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 32px",
                gap: "12px",
                listStyle: "none",
                minHeight: 72,
                px: "18px",
                py: "12px",
                width: "100%",
            }}
        >
            <Box
                component={onOpenFriend ? "button" : "div"}
                type={onOpenFriend ? "button" : undefined}
                onClick={
                    onOpenFriend ? () => onOpenFriend(friend.id) : undefined
                }
                sx={{
                    alignItems: "center",
                    bgcolor: "transparent",
                    border: 0,
                    borderRadius: "12px",
                    cursor: onOpenFriend ? "pointer" : "default",
                    display: "flex",
                    gap: "12px",
                    maxWidth: "100%",
                    minWidth: 0,
                    p: 0,
                    textAlign: "left",
                    width: "fit-content",
                    "&:focus-visible": {
                        outline: `2px solid ${green}`,
                        outlineOffset: 2,
                    },
                }}
            >
                <Box
                    sx={{
                        alignItems: "center",
                        bgcolor: friend.avatarUrl ? "transparent" : paleGreen,
                        borderRadius: "50%",
                        color: green,
                        display: "flex",
                        flexShrink: 0,
                        height: 48,
                        justifyContent: "center",
                        overflow: "hidden",
                        width: 48,
                    }}
                >
                    {friend.avatarUrl ? (
                        <Box
                            component="img"
                            alt=""
                            src={friend.avatarUrl}
                            sx={{
                                display: "block",
                                height: "100%",
                                objectFit: "cover",
                                objectPosition: "center",
                                width: "100%",
                            }}
                        />
                    ) : (
                        <Box
                            sx={{
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 15,
                                fontWeight: 800,
                                lineHeight: 1,
                            }}
                        >
                            {initials}
                        </Box>
                    )}
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        flex: "0 1 auto",
                        flexDirection: "column",
                        justifyContent: "center",
                        minWidth: 0,
                    }}
                >
                    <Box
                        sx={{
                            color: textStrong,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 15,
                            fontWeight: 700,
                            lineHeight: "20px",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {displayName}
                    </Box>
                    <Box
                        sx={{
                            color: textSoft,
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 13,
                            fontWeight: 600,
                            lineHeight: "18px",
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        @{friend.username}
                    </Box>
                </Box>
            </Box>
            <Box
                component="button"
                id={actionsButtonID}
                type="button"
                aria-label={`Actions for ${displayName}`}
                aria-controls={isActionsOpen ? actionsMenuID : undefined}
                aria-expanded={isActionsOpen ? "true" : undefined}
                aria-haspopup="menu"
                onClick={(event) => setActionsAnchor(event.currentTarget)}
                sx={{
                    alignItems: "center",
                    bgcolor: "transparent",
                    border: 0,
                    borderRadius: "50%",
                    color: textBase,
                    cursor: "pointer",
                    display: "flex",
                    height: 32,
                    justifyContent: "center",
                    justifySelf: "flex-end",
                    p: 0,
                    width: 32,
                    "&:focus-visible": {
                        outline: `2px solid ${green}`,
                        outlineOffset: 2,
                    },
                    "&:hover": { bgcolor: "rgba(0, 0, 0, 0.035)" },
                }}
            >
                <HugeiconsIcon
                    icon={MoreVerticalIcon}
                    size={20}
                    strokeWidth={1.8}
                />
            </Box>
            <Menu
                id={actionsMenuID}
                anchorEl={actionsAnchor}
                open={isActionsOpen}
                onClose={closeActions}
                anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
                transformOrigin={{ horizontal: "right", vertical: "top" }}
                slotProps={{
                    paper: {
                        sx: {
                            borderRadius: "16px",
                            boxShadow: "0 14px 40px rgba(0, 0, 0, 0.16)",
                            mt: "6px",
                            minWidth: 0,
                            p: "4px",
                            width: "max-content",
                        },
                    },
                    list: { "aria-labelledby": actionsButtonID, sx: { p: 0 } },
                }}
            >
                <MenuItem
                    disableRipple
                    onClick={unfriend}
                    sx={{
                        borderRadius: "10px",
                        color: dangerColor,
                        gap: "8px",
                        minHeight: 38,
                        px: "9px",
                        py: "7px",
                        whiteSpace: "nowrap",
                        "&.Mui-focusVisible": {
                            bgcolor: "rgba(246, 58, 58, 0.06)",
                        },
                        "&:active": { bgcolor: "rgba(246, 58, 58, 0.06)" },
                        "&:hover": { bgcolor: "rgba(246, 58, 58, 0.06)" },
                    }}
                >
                    <HugeiconsIcon
                        icon={UserRemove01Icon}
                        size={18}
                        strokeWidth={1.8}
                    />
                    <Box
                        sx={{
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 13,
                            fontWeight: 650,
                            lineHeight: "18px",
                        }}
                    >
                        Unfriend
                    </Box>
                </MenuItem>
            </Menu>
        </Box>
    );
};

export const FriendsScreen: React.FC<FriendsScreenProps> = ({
    friends,
    onBack,
    onOpenFriend,
    onUnfriend,
}) => {
    const [friendToUnfriend, setFriendToUnfriend] =
        React.useState<FriendProfile | null>(null);
    const [unfriendActionPhase, setUnfriendActionPhase] =
        React.useState<SpaceActionPhase | null>(null);
    const [unfriendErrorMessage, setUnfriendErrorMessage] = React.useState<
        string | null
    >(null);
    const isUnfriendActionRunning = unfriendActionPhase != null;

    const cancelUnfriend = () => {
        if (isUnfriendActionRunning) return;
        setUnfriendErrorMessage(null);
        setFriendToUnfriend(null);
    };

    const confirmUnfriend = () => {
        if (!friendToUnfriend || isUnfriendActionRunning) return;
        setUnfriendErrorMessage(null);
        setUnfriendActionPhase("busy");
        void (async () => {
            try {
                await Promise.resolve(onUnfriend?.(friendToUnfriend.id));
                setUnfriendActionPhase("done");
            } catch (error) {
                console.error("Failed to unfriend space friend", error);
                setUnfriendActionPhase(null);
                setUnfriendErrorMessage("Couldn't unfriend. Please try again.");
            }
        })();
    };

    React.useEffect(() => {
        if (unfriendActionPhase != "done") return;

        const timeoutID = window.setTimeout(() => {
            setFriendToUnfriend(null);
        }, spaceActionDoneDurationMs);

        return () => window.clearTimeout(timeoutID);
    }, [unfriendActionPhase]);

    const handleUnfriendSheetExited = () => {
        setUnfriendActionPhase(null);
        setUnfriendErrorMessage(null);
    };

    return (
        <Box
            component="main"
            sx={{
                bgcolor: friendsBackground,
                color: textBase,
                display: "grid",
                boxSizing: "border-box",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: friendsBackground,
                    boxSizing: "border-box",
                    minHeight: "100svh",
                    mx: "auto",
                    position: "relative",
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
                        Friends
                    </Box>
                </Box>

                {friends.length > 0 ? (
                    <Box
                        component="ul"
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            m: 0,
                            mt: "8px",
                            p: 0,
                            width: "100%",
                        }}
                    >
                        {friends.map((friend) => (
                            <FriendRow
                                key={friend.id}
                                friend={friend}
                                onOpenFriend={onOpenFriend}
                                onUnfriend={() => {
                                    setUnfriendErrorMessage(null);
                                    setFriendToUnfriend(friend);
                                }}
                            />
                        ))}
                    </Box>
                ) : (
                    <Box
                        sx={{
                            alignItems: "center",
                            color: textSoft,
                            display: "flex",
                            inset: 0,
                            justifyContent: "center",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            fontWeight: 600,
                            lineHeight: "20px",
                            pointerEvents: "none",
                            position: "absolute",
                            px: "24px",
                            textAlign: "center",
                        }}
                    >
                        No friends yet
                    </Box>
                )}
            </Box>
            <ConfirmationActionSheet
                open={Boolean(friendToUnfriend)}
                title="Are you sure you want to unfriend?"
                confirmLabel="Yes, unfriend"
                confirmActionPhase={unfriendActionPhase}
                confirmDisabled={isUnfriendActionRunning}
                errorMessage={unfriendErrorMessage}
                cancelDisabled={isUnfriendActionRunning}
                onCancel={cancelUnfriend}
                onConfirm={confirmUnfriend}
                onExited={handleUnfriendSheetExited}
            />
        </Box>
    );
};
