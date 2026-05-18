import {
    ArrowLeft02Icon,
    Loading03Icon,
    Navigation03Icon,
    Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { SocialLoadingSpinner } from "components/SocialRouteFallback";
import { formatTimeAgo } from "ente-base/date";
import React from "react";
import type { SetupProfile } from "screens/SetupProfileScreen";
import type {
    SocialWallMessage,
    SocialWallMessageConversation,
} from "services/socialWall";
import { firstNameFrom, initialsFor } from "utils/socialDisplay";

export const messagesBackground = "#FFFFFF";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#000000";
const textSecondary = "#777777";
const threadBackground = "#202020";
const threadSurface = "#2C2C2C";
const threadSurfaceHover = "#343434";
const outgoingBubble = "#3FA43D";
const incomingBubble = "#2C2C2C";
const threadText = "#F4F4F4";
const threadMuted = "rgba(244, 244, 244, 0.54)";
const threadTimestamp = "rgba(255, 255, 255, 0.55)";
const composerHeight = 48;
const composerMaxHeight = 112;
const composerPadding = 14;
const composerPaddingLeft = 18;
const messageGroupTimeThresholdMs = 10 * 60 * 1000;

const sendSpin = keyframes`
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
`;

interface MessagesScreenProps {
    conversations: SocialWallMessageConversation[];
    isConversationsLoading?: boolean;
    isThreadLoading?: boolean;
    messages: SocialWallMessage[];
    onBack?: () => void;
    onCloseThread: () => void;
    onOpenThread: (friend: SocialWallMessageConversation["friend"]) => void;
    onSendMessage: (wallId: string, text: string) => Promise<void>;
    profile: SetupProfile;
    selectedFriend?: SocialWallMessageConversation["friend"];
}

const microsForTimestamp = (timestampMs: number) => timestampMs * 1000;

const resizeComposer = (input: HTMLTextAreaElement | null) => {
    if (!input) return;

    input.style.height = `${composerHeight}px`;
    const nextHeight = Math.min(input.scrollHeight, composerMaxHeight);
    input.style.height = `${Math.max(composerHeight, nextHeight)}px`;
    input.style.overflowY =
        input.scrollHeight > composerMaxHeight ? "auto" : "hidden";
};

const Avatar: React.FC<{
    avatarUrl?: string | null;
    name: string;
    size: number;
}> = ({ avatarUrl, name, size }) => (
    <Box
        sx={{
            alignItems: "center",
            bgcolor: avatarUrl ? "transparent" : paleGreen,
            borderRadius: "50%",
            color: green,
            display: "flex",
            flexShrink: 0,
            height: size,
            justifyContent: "center",
            overflow: "hidden",
            width: size,
        }}
    >
        {avatarUrl ? (
            <Box
                component="img"
                alt=""
                src={avatarUrl}
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
                    fontFamily: '"Inter Variable", Inter, sans-serif',
                    fontSize: Math.max(10, Math.round(size * 0.34)),
                    fontWeight: 800,
                    lineHeight: 1,
                }}
            >
                {initialsFor(name)}
            </Box>
        )}
    </Box>
);

const messagePreview = (message: SocialWallMessage) => {
    if (message.kind == "post_reply") {
        return message.text ? `Reply: ${message.text}` : "Replied to a post";
    }
    return message.text;
};

const sameMessageSender = (
    first: SocialWallMessage | undefined,
    second: SocialWallMessage | undefined,
) => Boolean(first && second && first.sender.wallId == second.sender.wallId);

const QuotePreview: React.FC<{
    isOwn: boolean;
    message: SocialWallMessage;
}> = ({ isOwn, message }) => {
    if (message.kind != "post_reply") return null;
    const quote = message.quote;
    const isUnavailable = !quote || quote.isUnavailable || !quote.imageUrl;

    return (
        <Box
            sx={{
                alignItems: "stretch",
                display: "flex",
                gap: "10px",
                mb: "8px",
                maxWidth: "100%",
                minWidth: 0,
            }}
        >
            <Box
                aria-hidden
                sx={{
                    alignSelf: "stretch",
                    bgcolor: isOwn ? "rgba(255, 255, 255, 0.55)" : "#8C8C8C",
                    borderRadius: "999px",
                    flexShrink: 0,
                    width: 3,
                }}
            />
            <Box
                sx={{
                    alignItems: "center",
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "minmax(0, 1fr) 44px",
                    minWidth: 0,
                    width: "100%",
                }}
            >
                <Box sx={{ minWidth: 0 }}>
                    <Box
                        sx={{
                            color: "rgba(244, 244, 244, 0.92)",
                            fontFamily:
                                '"Inter Variable", Inter, sans-serif',
                            fontSize: 12,
                            fontWeight: 750,
                            lineHeight: "18px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Post
                    </Box>
                    <Box
                        sx={{
                            color: "rgba(244, 244, 244, 0.82)",
                            fontFamily:
                                '"Inter Variable", Inter, sans-serif',
                            fontSize: 12,
                            fontWeight: 500,
                            lineHeight: "17px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {isUnavailable
                            ? "(deleted)"
                            : quote?.caption || "Photo"}
                    </Box>
                </Box>
                {isUnavailable ? (
                    <Box
                        sx={{
                            bgcolor: "rgba(255, 255, 255, 0.08)",
                            borderRadius: "6px",
                            height: 44,
                            width: 44,
                        }}
                    />
                ) : (
                    <Box
                        component="img"
                        alt=""
                        src={quote.imageUrl}
                        sx={{
                            borderRadius: "6px",
                            display: "block",
                            height: 44,
                            objectFit: "cover",
                            objectPosition: "center",
                            width: 44,
                        }}
                    />
                )}
            </Box>
        </Box>
    );
};

const MessageBubble: React.FC<{
    isLastInSequence: boolean;
    message: SocialWallMessage;
    ownWallID?: string;
    showTimestamp: boolean;
}> = ({
    isLastInSequence,
    message,
    ownWallID,
    showTimestamp,
}) => {
    const isOwn = message.sender.wallId == ownWallID;
    const timestampLabel = formatTimeAgo(
        microsForTimestamp(message.createdAtMs),
    );
    const timestampDateTime = new Date(
        Math.floor(microsForTimestamp(message.createdAtMs) / 1000),
    ).toISOString();
    const bubbleBorderRadius = isOwn
        ? isLastInSequence
            ? "20px 6px 20px 20px"
            : "20px 6px 6px 20px"
        : isLastInSequence
          ? "6px 20px 20px 20px"
          : "6px 20px 20px 6px";

    return (
        <Box
            component="li"
            sx={{
                alignItems: isOwn ? "flex-end" : "flex-start",
                display: "flex",
                flexDirection: "column",
                listStyle: "none",
                mb: isLastInSequence ? "24px" : "6px",
                maxWidth: "100%",
                minWidth: 0,
                position: "relative",
                width: "100%",
                zIndex: "auto",
            }}
        >
            <Box
                className={isOwn ? "green-bg" : undefined}
                sx={{
                    bgcolor: isOwn ? outgoingBubble : incomingBubble,
                    borderRadius: bubbleBorderRadius,
                    color: threadText,
                    display: "block",
                    maxWidth: "min(calc(100vw - 72px), 360px)",
                    minWidth: 0,
                    ml: 0,
                    overflow: "visible",
                    position: "relative",
                    px: "16px",
                    py: message.kind == "post_reply" ? "16px" : "14px",
                    textAlign: "left",
                    width: "fit-content",
                    "&:hover": {
                        bgcolor: isOwn ? outgoingBubble : threadSurfaceHover,
                    },
                }}
            >
                <QuotePreview isOwn={isOwn} message={message} />
                <Box
                    sx={{
                        color: "rgba(244, 244, 244, 0.94)",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: "21px",
                        overflowWrap: "anywhere",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {message.text}
                </Box>
            </Box>
            {showTimestamp && (
                <Box
                    component="time"
                    dateTime={timestampDateTime}
                    sx={{
                        color: threadTimestamp,
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: "16px",
                        ml: isOwn ? 0 : "2px",
                        mt: "6px",
                        mr: isOwn ? "2px" : 0,
                    }}
                >
                    {timestampLabel}
                </Box>
            )}
        </Box>
    );
};

export const MessagesScreen: React.FC<MessagesScreenProps> = ({
    conversations,
    isConversationsLoading = false,
    isThreadLoading = false,
    messages,
    onBack,
    onCloseThread,
    onOpenThread,
    onSendMessage,
    profile,
    selectedFriend,
}) => {
    const [messageText, setMessageText] = React.useState("");
    const [sendPhase, setSendPhase] = React.useState<
        "done" | "idle" | "sending"
    >("idle");
    const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const threadScrollRef = React.useRef<HTMLDivElement | null>(null);
    const isThreadOpen = Boolean(selectedFriend);
    const canSend = messageText.trim().length > 0 && sendPhase == "idle";
    const selectedName = selectedFriend
        ? selectedFriend.fullName.trim() || selectedFriend.username
        : "";
    const isSendStatus = sendPhase != "idle";
    const isSendButtonActive = canSend || isSendStatus;

    const sendMessage = () => {
        const text = messageText.trim();
        if (!selectedFriend || !canSend) return;
        setSendPhase("sending");
        void onSendMessage(selectedFriend.wallId ?? selectedFriend.id, text)
            .then(() => {
                setMessageText("");
                setSendPhase("done");
                window.setTimeout(() => setSendPhase("idle"), 900);
            })
            .catch((error: unknown) => {
                console.error("Failed to send message", error);
                setSendPhase("idle");
            });
    };

    const handleComposerKeyDown = (event: React.KeyboardEvent) => {
        if (event.key != "Enter" || event.shiftKey) return;

        event.preventDefault();
        sendMessage();
    };

    React.useLayoutEffect(() => {
        resizeComposer(composerRef.current);
    }, [messageText]);

    React.useLayoutEffect(() => {
        if (!selectedFriend || isThreadLoading) return;

        const scroller = threadScrollRef.current;
        if (!scroller) return;

        scroller.scrollTop = scroller.scrollHeight;
    }, [isThreadLoading, messages.length, selectedFriend]);

    return (
        <Box
            component="main"
            sx={{
                bgcolor: isThreadOpen ? threadBackground : messagesBackground,
                color: isThreadOpen ? threadText : textBase,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                sx={{
                    bgcolor: "inherit",
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
                        aria-label={isThreadOpen ? "Back to messages" : "Back"}
                        onClick={isThreadOpen ? onCloseThread : onBack}
                        sx={{
                            alignItems: "center",
                            bgcolor: "transparent",
                            border: 0,
                            color: "inherit",
                            cursor:
                                isThreadOpen || onBack ? "pointer" : "default",
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
                            color: "inherit",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 18,
                            fontWeight: 700,
                            justifySelf: "center",
                            lineHeight: "24px",
                            m: 0,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {isThreadOpen
                            ? firstNameFrom(selectedName)
                            : "Messages"}
                    </Box>
                    <Box aria-hidden />
                </Box>

                {isThreadOpen && selectedFriend ? (
                    <>
                        <Box
                            ref={threadScrollRef}
                            sx={{
                                boxSizing: "border-box",
                                height: "calc(100svh - 56px - 72px - env(safe-area-inset-bottom))",
                                overflowY: "auto",
                                px: "14px",
                                py: "12px",
                            }}
                        >
                            {isThreadLoading ? (
                                <Box
                                    sx={{
                                        alignItems: "center",
                                        display: "flex",
                                        height: "100%",
                                        justifyContent: "center",
                                    }}
                                >
                                    <SocialLoadingSpinner ariaLabel="Loading messages" />
                                </Box>
                            ) : (
                                <Box
                                    component="ol"
                                    sx={{
                                        display: "flex",
                                        flexDirection: "column",
                                        listStyle: "none",
                                        m: 0,
                                        p: 0,
                                    }}
                                >
                                    {messages.map((message, index) => {
                                        const nextMessage =
                                            messages[index + 1];
                                        const isSameSequenceAsNext =
                                            sameMessageSender(
                                                message,
                                                nextMessage,
                                            ) &&
                                            nextMessage!.createdAtMs -
                                                message.createdAtMs <=
                                                messageGroupTimeThresholdMs;
                                        const isLastInSequence =
                                            !isSameSequenceAsNext;

                                        return (
                                            <MessageBubble
                                                key={message.id}
                                                isLastInSequence={
                                                    isLastInSequence
                                                }
                                                message={message}
                                                ownWallID={profile.wallId}
                                                showTimestamp={
                                                    isLastInSequence
                                                }
                                            />
                                        );
                                    })}
                                </Box>
                            )}
                        </Box>
                        <Box
                            sx={{
                                alignItems: "flex-end",
                                bgcolor: threadBackground,
                                bottom: 0,
                                boxSizing: "border-box",
                                display: "flex",
                                gap: "8px",
                                left: 0,
                                maxWidth: { sm: 390 },
                                mx: { sm: "auto" },
                                p: "10px 14px calc(10px + env(safe-area-inset-bottom))",
                                position: "fixed",
                                right: 0,
                                width: "100%",
                            }}
                        >
                            <Box
                                ref={composerRef}
                                component="textarea"
                                aria-label={`Message ${selectedName}`}
                                onChange={(event) => {
                                    setMessageText(event.target.value);
                                    resizeComposer(event.currentTarget);
                                }}
                                onKeyDown={handleComposerKeyDown}
                                placeholder="Message"
                                rows={1}
                                value={messageText}
                                sx={{
                                    bgcolor: threadSurface,
                                    border: 0,
                                    borderRadius: "24px",
                                    boxSizing: "border-box",
                                    color: threadText,
                                    flex: "1 1 auto",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    lineHeight: "20px",
                                    maxHeight: composerMaxHeight,
                                    minHeight: composerHeight,
                                    minWidth: 0,
                                    outline: 0,
                                    overflow: "hidden",
                                    pb: `${composerPadding}px`,
                                    pl: `${composerPaddingLeft}px`,
                                    pr: `${composerPadding}px`,
                                    pt: `${composerPadding}px`,
                                    resize: "none",
                                    "&::placeholder": { color: threadMuted },
                                    "&:focus": { bgcolor: threadSurfaceHover },
                                }}
                            />
                            <Box
                                component="button"
                                type="button"
                                aria-label={
                                    sendPhase == "sending"
                                        ? "Sending"
                                        : sendPhase == "done"
                                          ? "Sent"
                                          : "Send message"
                                }
                                disabled={!canSend}
                                onClick={sendMessage}
                                sx={{
                                    alignItems: "center",
                                    bgcolor: isSendStatus
                                        ? threadSurfaceHover
                                        : canSend
                                          ? "#FFFFFF"
                                          : threadSurfaceHover,
                                    border: 0,
                                    borderRadius: "50%",
                                    color:
                                        sendPhase == "sending"
                                            ? "#D8D8D8"
                                            : sendPhase == "done"
                                              ? green
                                              : canSend
                                                ? "#3A3A3A"
                                                : "#D8D8D8",
                                    cursor: canSend ? "pointer" : "default",
                                    display: "flex",
                                    flexShrink: 0,
                                    height: composerHeight,
                                    justifyContent: "center",
                                    opacity:
                                        sendPhase == "sending"
                                            ? 0.72
                                            : isSendButtonActive
                                              ? 1
                                              : 0.42,
                                    p: 0,
                                    transition:
                                        "background-color 180ms ease, color 180ms ease, opacity 180ms ease, transform 120ms ease",
                                    width: composerHeight,
                                    "&:active": {
                                        transform: canSend
                                            ? "scale(0.96)"
                                            : "none",
                                    },
                                    "&:focus-visible": {
                                        outline: `2px solid ${green}`,
                                        outlineOffset: 2,
                                    },
                                    "&:hover": {
                                        bgcolor: isSendStatus
                                            ? threadSurfaceHover
                                            : canSend
                                              ? "#F2F2F2"
                                              : "rgba(255, 255, 255, 0.14)",
                                    },
                                }}
                            >
                                {sendPhase == "sending" ? (
                                    <Box
                                        component="span"
                                        sx={{
                                            animation: `${sendSpin} 1s linear infinite`,
                                            display: "flex",
                                            transform: "none",
                                        }}
                                    >
                                        <HugeiconsIcon
                                            icon={Loading03Icon}
                                            size={22}
                                            strokeWidth={1.8}
                                        />
                                    </Box>
                                ) : sendPhase == "done" ? (
                                    <Box
                                        component="span"
                                        sx={{
                                            display: "flex",
                                            transform: "translate(-1px, 1px)",
                                        }}
                                    >
                                        <HugeiconsIcon
                                            icon={Tick02Icon}
                                            primaryColor={green}
                                            size={22}
                                            strokeWidth={1.8}
                                        />
                                    </Box>
                                ) : (
                                    <Box
                                        component="span"
                                        sx={{
                                            display: "flex",
                                            transform: "translate(-1px, 1px)",
                                        }}
                                    >
                                        <HugeiconsIcon
                                            icon={Navigation03Icon}
                                            size={24}
                                            strokeWidth={1.8}
                                        />
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </>
                ) : (
                    <>
                        {isConversationsLoading ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    boxSizing: "border-box",
                                    display: "flex",
                                    inset: 0,
                                    justifyContent: "center",
                                    pointerEvents: "none",
                                    position: "absolute",
                                }}
                            >
                                <SocialLoadingSpinner ariaLabel="Loading messages" />
                            </Box>
                        ) : conversations.length == 0 ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    boxSizing: "border-box",
                                    display: "flex",
                                    flexDirection: "column",
                                    inset: 0,
                                    justifyContent: "center",
                                    pointerEvents: "none",
                                    position: "absolute",
                                    px: 3,
                                    textAlign: "center",
                                }}
                            >
                                <Box
                                    component="h2"
                                    sx={{
                                        color: textBase,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 16,
                                        fontWeight: 700,
                                        letterSpacing: 0,
                                        lineHeight: "22px",
                                        m: 0,
                                    }}
                                >
                                    No messages yet
                                </Box>
                                <Box
                                    component="p"
                                    sx={{
                                        color: textSecondary,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 14,
                                        fontWeight: 500,
                                        lineHeight: "20px",
                                        m: 0,
                                        mt: "8px",
                                        maxWidth: 260,
                                    }}
                                >
                                    Replies to posts and messages from friends
                                    will appear here.
                                </Box>
                            </Box>
                        ) : (
                            <Box
                                component="ul"
                                sx={{
                                    boxSizing: "border-box",
                                    listStyle: "none",
                                    m: 0,
                                    p: "12px 16px 28px",
                                }}
                            >
                                {conversations.map((conversation) => {
                                    const name =
                                        conversation.friend.fullName.trim() ||
                                        conversation.friend.username;
                                    const timestampLabel = formatTimeAgo(
                                        microsForTimestamp(
                                            conversation.lastMessage
                                                .createdAtMs,
                                        ),
                                    );
                                    return (
                                        <Box
                                            component="li"
                                            key={conversation.friend.id}
                                            sx={{ listStyle: "none" }}
                                        >
                                            <Box
                                                component="button"
                                                type="button"
                                                onClick={() =>
                                                    onOpenThread(
                                                        conversation.friend,
                                                    )
                                                }
                                                sx={{
                                                    alignItems: "center",
                                                    appearance: "none",
                                                    bgcolor: "transparent",
                                                    border: 0,
                                                    borderRadius: "8px",
                                                    color: textBase,
                                                    cursor: "pointer",
                                                    display: "grid",
                                                    gap: "10px",
                                                    gridTemplateColumns:
                                                        "44px minmax(0, 1fr) auto",
                                                    minHeight: 64,
                                                    p: "8px 0",
                                                    textAlign: "left",
                                                    width: "100%",
                                                    "&:focus-visible": {
                                                        outline: `2px solid ${green}`,
                                                        outlineOffset: 2,
                                                    },
                                                }}
                                            >
                                                <Avatar
                                                    avatarUrl={
                                                        conversation.friend
                                                            .avatarUrl
                                                    }
                                                    name={name}
                                                    size={44}
                                                />
                                                <Box sx={{ minWidth: 0 }}>
                                                    <Box
                                                        sx={{
                                                            fontFamily:
                                                                '"Inter Variable", Inter, sans-serif',
                                                            fontSize: 14,
                                                            fontWeight: 700,
                                                            lineHeight: "20px",
                                                            overflow: "hidden",
                                                            textOverflow:
                                                                "ellipsis",
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        {firstNameFrom(name)}
                                                    </Box>
                                                    <Box
                                                        sx={{
                                                            color: textSecondary,
                                                            fontFamily:
                                                                '"Inter Variable", Inter, sans-serif',
                                                            fontSize: 13,
                                                            fontWeight: 500,
                                                            lineHeight: "18px",
                                                            overflow: "hidden",
                                                            textOverflow:
                                                                "ellipsis",
                                                            whiteSpace:
                                                                "nowrap",
                                                        }}
                                                    >
                                                        {messagePreview(
                                                            conversation.lastMessage,
                                                        )}
                                                    </Box>
                                                </Box>
                                                <Box
                                                    sx={{
                                                        color: textSecondary,
                                                        fontFamily:
                                                            '"Inter Variable", Inter, sans-serif',
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        lineHeight: "16px",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {timestampLabel}
                                                </Box>
                                            </Box>
                                        </Box>
                                    );
                                })}
                            </Box>
                        )}
                    </>
                )}
            </Box>
        </Box>
    );
};
