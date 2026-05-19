import {
    ArrowLeft02Icon,
    Cancel01Icon,
    Loading03Icon,
    Navigation03Icon,
    Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Menu, MenuItem, Tooltip } from "@mui/material";
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
const dangerColor = "#F63A3A";
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
    onDeleteMessage: (messageId: string) => Promise<void>;
    onOpenSelectedFriendProfile: (
        friend: SocialWallMessageConversation["friend"],
    ) => void;
    onOpenThread: (conversation: SocialWallMessageConversation) => void;
    onReplyToMessage: (
        wallId: string,
        messageId: string,
        text: string,
    ) => Promise<void>;
    onSendMessage: (wallId: string, text: string) => Promise<void>;
    onSetMessageLiked: (messageId: string, liked: boolean) => Promise<void>;
    profile: SetupProfile;
    selectedFriend?: SocialWallMessageConversation["friend"];
}

interface MessageContextMenuState {
    anchorEl: HTMLElement;
    message: SocialWallMessage;
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

const copyTextToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
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
        return message.text || "Replied to a post";
    }
    if (message.replyMessageId) {
        return message.text || "Replied to a message";
    }
    return message.text;
};

const truncateMessageText = (text: string): string => {
    const lines = text.split("\n");
    const firstLine = lines[0] ?? text;
    if (firstLine.length > 100) return `${firstLine.slice(0, 100)}...`;
    return lines.length > 1 ? `${firstLine}...` : firstLine;
};

const isCurrentProfileMessage = (
    message: SocialWallMessage,
    profile: SetupProfile,
) => isCurrentProfileActor(message.sender, profile);

const isCurrentProfileActor = (
    actor: SocialWallMessage["sender"],
    profile: SetupProfile,
) => {
    if (actor.wallId && profile.wallId) {
        return actor.wallId == profile.wallId;
    }
    if (actor.wallSlug && profile.wallSlug) {
        return actor.wallSlug == profile.wallSlug;
    }
    return actor.username == profile.username;
};

const actorName = (actor: SocialWallMessage["sender"]) =>
    firstNameFrom(actor.fullName.trim() || actor.username);

const messageLikeTooltipLabel = (
    message: SocialWallMessage,
    profile: SetupProfile,
) => {
    const otherParticipant = isCurrentProfileActor(message.sender, profile)
        ? message.recipient
        : message.sender;
    const likerNames: string[] = [];
    if (message.viewerLiked) likerNames.push("You");
    if (message.likeCount > likerNames.length) {
        likerNames.push(actorName(otherParticipant));
    }
    if (message.likeCount > likerNames.length) {
        likerNames.push(`${message.likeCount - likerNames.length} others`);
    }
    return likerNames.filter(Boolean).join(" and ") || "Liked";
};

const conversationPreview = (
    conversation: SocialWallMessageConversation,
    profile: SetupProfile,
) => {
    const activity = conversation.latestActivity;
    if (activity.type == "friend_add") return "Added you as a friend";
    if (activity.type == "friend_remove") return "Removed you as a friend";
    if (activity.type == "post_like") return "Liked your post";
    if (activity.type == "post_reply") {
        return "Replied";
    }
    if (activity.type == "post_like_and_reply") {
        return "Liked and replied";
    }
    if (activity.type == "message_like") {
        const text = activity.message?.text.trim();
        return text
            ? `Liked "${truncateMessageText(text)}"`
            : "Liked a message";
    }

    const message = activity.message;
    if (!message) return "";
    const preview = messagePreview(message);
    return isCurrentProfileMessage(message, profile)
        ? `You: ${preview}`
        : preview;
};

const quotedConversationActivityPreview = (
    activity: SocialWallMessageConversation["latestActivity"],
) => {
    const text = activity.message?.text.trim();
    if (!text) return undefined;
    const previewText = truncateMessageText(text);

    if (activity.type == "message_like") {
        return { prefix: 'Liked "', previewText, suffix: '"' };
    }
    if (activity.type == "post_reply") {
        return { prefix: 'Replied "', previewText, suffix: '"' };
    }
    if (activity.type == "post_like_and_reply") {
        return { prefix: 'Liked and replied "', previewText, suffix: '"' };
    }
    return undefined;
};

const ConversationPreviewLine: React.FC<{
    conversation: SocialWallMessageConversation;
    profile: SetupProfile;
}> = ({ conversation, profile }) => {
    const activity = conversation.latestActivity;
    const quotedPreview = quotedConversationActivityPreview(activity);
    const previewLineSx = {
        color: textSecondary,
        fontFamily: '"Inter Variable", Inter, sans-serif',
        fontSize: 13,
        fontWeight: conversation.unread ? 700 : 500,
        lineHeight: "18px",
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    };

    if (!quotedPreview) {
        return (
            <Box sx={previewLineSx}>
                {conversationPreview(conversation, profile)}
            </Box>
        );
    }

    return (
        <Box sx={{ ...previewLineSx, alignItems: "baseline", display: "flex" }}>
            <Box component="span" sx={{ flexShrink: 0 }}>
                {quotedPreview.prefix}
            </Box>
            <Box
                component="span"
                sx={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {quotedPreview.previewText}
            </Box>
            <Box component="span" sx={{ flexShrink: 0 }}>
                {quotedPreview.suffix}
            </Box>
        </Box>
    );
};

const sameMessageSender = (
    first: SocialWallMessage | undefined,
    second: SocialWallMessage | undefined,
) => Boolean(first && second && first.sender.wallId == second.sender.wallId);

const ReplyIcon: React.FC = () => (
    <svg
        width="12"
        height="9"
        viewBox="0 0 12 9"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M4.5241 0.242677C4.62341 0.34442 4.67919 0.482337 4.67919 0.626134C4.67919 0.76993 4.62341 0.907847 4.5241 1.00959L1.89369 3.70102H7.68483C8.3587 3.70102 9.35854 3.9036 10.2042 4.52653C11.0775 5.17045 11.7507 6.23762 11.7507 7.86116C11.7507 8.00507 11.6948 8.14309 11.5953 8.24485C11.4959 8.34661 11.361 8.40378 11.2203 8.40378C11.0797 8.40378 10.9448 8.34661 10.8453 8.24485C10.7459 8.14309 10.69 8.00507 10.69 7.86116C10.69 6.59069 10.1844 5.84982 9.58481 5.40776C8.95761 4.94544 8.18899 4.78627 7.68483 4.78627H1.89369L4.5241 7.4777C4.5762 7.52738 4.61799 7.58728 4.64698 7.65384C4.67597 7.72041 4.69155 7.79226 4.69281 7.86512C4.69406 7.93798 4.68096 8.01035 4.65429 8.07791C4.62762 8.14548 4.58792 8.20686 4.53756 8.25839C4.4872 8.30991 4.42722 8.35053 4.36118 8.37782C4.29515 8.40512 4.22442 8.41852 4.15321 8.41723C4.082 8.41595 4.01178 8.4 3.94673 8.37034C3.88167 8.34068 3.82313 8.29792 3.77457 8.24461L0.23908 4.6271C0.139767 4.52536 0.0839844 4.38744 0.0839844 4.24364C0.0839844 4.09985 0.139767 3.96193 0.23908 3.86019L3.77457 0.242677C3.87401 0.141061 4.0088 0.0839844 4.14934 0.0839844C4.28987 0.0839844 4.42466 0.141061 4.5241 0.242677Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="0.166667"
        />
    </svg>
);

const HeartIcon: React.FC<{ filled?: boolean; small?: boolean }> = ({
    filled,
    small,
}) => (
    <svg
        width={small ? "13" : "16"}
        height={small ? "11" : "14"}
        viewBox="0 0 16 14"
        fill={filled ? green : "none"}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M6.63749 12.3742C4.66259 10.885 0.75 7.4804 0.75 4.41664C0.75 2.39161 2.22368 0.75 4.25 0.75C5.3 0.75 6.35 1.10294 7.75 2.51469C9.15 1.10294 10.2 0.75 11.25 0.75C13.2763 0.75 14.75 2.39161 14.75 4.41664C14.75 7.4804 10.8374 10.885 8.86251 12.3742C8.19793 12.8753 7.30207 12.8753 6.63749 12.3742Z"
            stroke={filled ? green : "currentColor"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const DeleteIcon: React.FC = () => (
    <svg
        width="13"
        height="15"
        viewBox="0 0 13 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M11.5 2.83203L11.0869 9.51543C10.9813 11.223 10.9285 12.0768 10.5005 12.6906C10.2889 12.9941 10.0165 13.2502 9.70047 13.4427C9.0614 13.832 8.206 13.832 6.49513 13.832C4.78208 13.832 3.92553 13.832 3.28603 13.442C2.96987 13.2492 2.69733 12.9926 2.48579 12.6886C2.05792 12.0738 2.0063 11.2188 1.90307 9.50883L1.5 2.83203M0.5 2.83333H12.5M9.2038 2.83333L8.74873 1.89449C8.4464 1.27084 8.2952 0.959013 8.03447 0.76454C7.97667 0.7214 7.9154 0.683027 7.85133 0.6498C7.5626 0.5 7.21607 0.5 6.523 0.5C5.81253 0.5 5.45733 0.5 5.16379 0.65608C5.09873 0.690673 5.03665 0.7306 4.97819 0.775447C4.71443 0.9778 4.56709 1.30103 4.27241 1.94751L3.86861 2.83333M4.83203 10.166V6.16602M8.16797 10.166V6.16602"
            stroke="currentColor"
            strokeLinecap="round"
        />
    </svg>
);

const CopyIcon: React.FC = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M4.5 4.5V2.5C4.5 1.39543 5.39543 0.5 6.5 0.5H11.5C12.6046 0.5 13.5 1.39543 13.5 2.5V7.5C13.5 8.60457 12.6046 9.5 11.5 9.5H9.5M2.5 4.5H7.5C8.60457 4.5 9.5 5.39543 9.5 6.5V11.5C9.5 12.6046 8.60457 13.5 7.5 13.5H2.5C1.39543 13.5 0.5 12.6046 0.5 11.5V6.5C0.5 5.39543 1.39543 4.5 2.5 4.5Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

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
                            fontFamily: '"Inter Variable", Inter, sans-serif',
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
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 12,
                            fontWeight: 500,
                            lineHeight: "17px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {isUnavailable ? "(deleted)" : quote.caption || "Photo"}
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

const MessageReplyPreview: React.FC<{
    isOwn: boolean;
    parentMessage?: SocialWallMessage;
    profile: SetupProfile;
}> = ({ isOwn, parentMessage, profile }) => {
    const isDeleted = !parentMessage || parentMessage.isDeleted;
    const parentIsOwn = parentMessage
        ? isCurrentProfileMessage(parentMessage, profile)
        : false;
    const parentName = parentMessage
        ? parentIsOwn
            ? "You"
            : firstNameFrom(
                  parentMessage.sender.fullName.trim() ||
                      parentMessage.sender.username,
              )
        : undefined;

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
            <Box sx={{ minWidth: 0 }}>
                {parentName && (
                    <Box
                        sx={{
                            color: "rgba(244, 244, 244, 0.92)",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 12,
                            fontWeight: 750,
                            lineHeight: "18px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {parentName}
                    </Box>
                )}
                <Box
                    sx={{
                        color: "rgba(244, 244, 244, 0.82)",
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 12,
                        fontWeight: 500,
                        lineHeight: "17px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {isDeleted
                        ? "Deleted message"
                        : truncateMessageText(parentMessage.text)}
                </Box>
            </Box>
        </Box>
    );
};

const MessageBubble: React.FC<{
    isHighlighted: boolean;
    isLastInSequence: boolean;
    message: SocialWallMessage;
    onOpenActions: (message: SocialWallMessage, anchorEl: HTMLElement) => void;
    ownWallID?: string;
    parentMessage?: SocialWallMessage;
    profile: SetupProfile;
    showTimestamp: boolean;
}> = ({
    isHighlighted,
    isLastInSequence,
    message,
    onOpenActions,
    ownWallID,
    parentMessage,
    profile,
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
    const hasMessageReply = Boolean(message.replyMessageId);
    const hasInlinePreview = message.kind == "post_reply" || hasMessageReply;
    const [isLikeTooltipOpen, setIsLikeTooltipOpen] = React.useState(false);
    const likeTooltipTimerRef = React.useRef<number | undefined>(undefined);
    const likeTooltipLabel = messageLikeTooltipLabel(message, profile);

    const clearLikeTooltipTimer = React.useCallback(() => {
        if (likeTooltipTimerRef.current == undefined) return;
        window.clearTimeout(likeTooltipTimerRef.current);
        likeTooltipTimerRef.current = undefined;
    }, []);

    const showLikeTooltip = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        clearLikeTooltipTimer();
        setIsLikeTooltipOpen(true);
        likeTooltipTimerRef.current = window.setTimeout(() => {
            setIsLikeTooltipOpen(false);
            likeTooltipTimerRef.current = undefined;
        }, 1800);
    };

    const handleContextMenu = (
        event: React.MouseEvent,
        bubbleElement: HTMLElement,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        window.getSelection()?.removeAllRanges();
        onOpenActions(message, bubbleElement);
    };

    React.useEffect(() => clearLikeTooltipTimer, [clearLikeTooltipTimer]);

    React.useEffect(() => {
        clearLikeTooltipTimer();
        setIsLikeTooltipOpen(false);
    }, [
        clearLikeTooltipTimer,
        message.id,
        message.likeCount,
        message.viewerLiked,
    ]);

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
                zIndex: isHighlighted ? 3 : message.likeCount > 0 ? 1 : "auto",
            }}
        >
            <Box
                onContextMenu={(event) => {
                    const bubbleElement =
                        event.currentTarget.querySelector<HTMLElement>(
                            "[data-message-bubble]",
                        );
                    if (bubbleElement) {
                        handleContextMenu(event, bubbleElement);
                    }
                }}
                sx={{
                    maxWidth: "min(calc(100vw - 72px), 360px)",
                    position: "relative",
                    width: "fit-content",
                }}
            >
                <Box
                    data-message-bubble
                    className={isOwn ? "green-bg" : undefined}
                    sx={{
                        bgcolor: isOwn ? outgoingBubble : incomingBubble,
                        borderRadius: bubbleBorderRadius,
                        color: threadText,
                        cursor: "context-menu",
                        display: "block",
                        maxWidth: "100%",
                        minWidth: 0,
                        ml: 0,
                        overflow: "visible",
                        position: "relative",
                        px: "16px",
                        py: hasInlinePreview ? "16px" : "14px",
                        textAlign: "left",
                        userSelect: "none",
                        WebkitTouchCallout: "none",
                        WebkitUserSelect: "none",
                        width: "fit-content",
                        "& *": {
                            userSelect: "none",
                            WebkitTouchCallout: "none",
                            WebkitUserSelect: "none",
                        },
                        "&:hover": {
                            bgcolor: isOwn
                                ? outgoingBubble
                                : threadSurfaceHover,
                        },
                    }}
                >
                    <QuotePreview isOwn={isOwn} message={message} />
                    {hasMessageReply && (
                        <MessageReplyPreview
                            isOwn={isOwn}
                            parentMessage={parentMessage}
                            profile={profile}
                        />
                    )}
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
                    {message.likeCount > 0 && (
                        <Tooltip
                            arrow
                            disableFocusListener
                            disableHoverListener
                            disableTouchListener
                            open={isLikeTooltipOpen}
                            placement={isOwn ? "left" : "right"}
                            title={likeTooltipLabel}
                            slotProps={{
                                tooltip: {
                                    sx: {
                                        bgcolor: "#111111",
                                        borderRadius: "6px",
                                        color: threadText,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        lineHeight: "16px",
                                        px: "8px",
                                        py: "5px",
                                    },
                                },
                                arrow: { sx: { color: "#111111" } },
                            }}
                        >
                            <Box
                                component="button"
                                type="button"
                                aria-label={`Liked by ${likeTooltipLabel}`}
                                onClick={showLikeTooltip}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                }}
                                sx={{
                                    alignItems: "center",
                                    appearance: "none",
                                    bgcolor: "#2B2B2B",
                                    border: `2px solid ${threadBackground}`,
                                    borderRadius: "999px",
                                    bottom: -11,
                                    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.2)",
                                    boxSizing: "border-box",
                                    color: green,
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 10,
                                    fontWeight: 800,
                                    gap: "4px",
                                    height: 22,
                                    justifyContent: "center",
                                    lineHeight: 1,
                                    minWidth: 34,
                                    pb: "1px",
                                    px: "7px",
                                    position: "absolute",
                                    zIndex: 2,
                                    ...(isOwn ? { left: 8 } : { right: 8 }),
                                    "&:focus-visible": {
                                        outline: `2px solid ${green}`,
                                        outlineOffset: 2,
                                    },
                                }}
                            >
                                <HeartIcon filled small />
                                {message.likeCount}
                            </Box>
                        </Tooltip>
                    )}
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
                        mt: message.likeCount > 0 ? "14px" : "6px",
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
    onDeleteMessage,
    onOpenSelectedFriendProfile,
    onOpenThread,
    onReplyToMessage,
    onSendMessage,
    onSetMessageLiked,
    profile,
    selectedFriend,
}) => {
    const [messageText, setMessageText] = React.useState("");
    const [messageContextMenu, setMessageContextMenu] =
        React.useState<MessageContextMenuState | null>(null);
    const [replyingTo, setReplyingTo] =
        React.useState<SocialWallMessage | null>(null);
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
    const messageByID = React.useMemo(
        () => new Map(messages.map((message) => [message.id, message])),
        [messages],
    );
    const isContextMessageLiked = Boolean(
        messageContextMenu?.message.viewerLiked,
    );

    const sendMessage = () => {
        const text = messageText.trim();
        if (!selectedFriend || !canSend) return;
        const wallId = selectedFriend.wallId ?? selectedFriend.id;
        setSendPhase("sending");
        const sendPromise = replyingTo
            ? onReplyToMessage(wallId, replyingTo.id, text)
            : onSendMessage(wallId, text);
        void sendPromise
            .then(() => {
                setMessageText("");
                setReplyingTo(null);
                setSendPhase("done");
                window.setTimeout(() => setSendPhase("idle"), 900);
            })
            .catch((error: unknown) => {
                console.error("Failed to send message", error);
                setSendPhase("idle");
            });
    };

    const openMessageActions = (
        message: SocialWallMessage,
        anchorEl: HTMLElement,
    ) => {
        setMessageContextMenu({ anchorEl, message });
    };

    const closeMessageActions = () => setMessageContextMenu(null);

    const handleMessageAction = (
        action: "copy" | "delete" | "like" | "reply",
    ) => {
        const targetMessage = messageContextMenu?.message;
        if (!targetMessage) return;
        closeMessageActions();

        switch (action) {
            case "copy":
                void copyTextToClipboard(targetMessage.text).catch(
                    (error: unknown) =>
                        console.error("Failed to copy message", error),
                );
                break;
            case "like":
                void onSetMessageLiked(
                    targetMessage.id,
                    !targetMessage.viewerLiked,
                ).catch((error: unknown) =>
                    console.error("Failed to update message like", error),
                );
                break;
            case "reply":
                setReplyingTo(targetMessage);
                window.setTimeout(() => composerRef.current?.focus(), 0);
                break;
            case "delete":
                void onDeleteMessage(targetMessage.id).catch((error: unknown) =>
                    console.error("Failed to delete message", error),
                );
                if (replyingTo?.id == targetMessage.id) {
                    setReplyingTo(null);
                }
                break;
        }
    };

    const handleComposerKeyDown = (event: React.KeyboardEvent) => {
        if (event.key != "Enter" || event.shiftKey) return;

        event.preventDefault();
        sendMessage();
    };

    React.useLayoutEffect(() => {
        resizeComposer(composerRef.current);
    }, [messageText, replyingTo]);

    React.useEffect(() => {
        setReplyingTo(null);
        setMessageContextMenu(null);
        setMessageText("");
    }, [selectedFriend]);

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
                        aria-label={
                            isThreadOpen ? "Back to notifications" : "Back"
                        }
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
                    {isThreadOpen && selectedFriend ? (
                        <Box
                            component="h1"
                            sx={{
                                justifySelf: "center",
                                m: 0,
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            <Box
                                component="button"
                                type="button"
                                aria-label={
                                    selectedName
                                        ? `Open ${selectedName}'s profile`
                                        : "Open friend profile"
                                }
                                onClick={() =>
                                    onOpenSelectedFriendProfile(selectedFriend)
                                }
                                sx={{
                                    appearance: "none",
                                    bgcolor: "transparent",
                                    border: 0,
                                    color: "inherit",
                                    cursor: "pointer",
                                    display: "block",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 18,
                                    fontWeight: 700,
                                    lineHeight: "24px",
                                    m: 0,
                                    maxWidth: "100%",
                                    minWidth: 0,
                                    overflow: "hidden",
                                    p: 0,
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    "&:focus-visible": {
                                        borderRadius: "4px",
                                        outline: `2px solid ${green}`,
                                        outlineOffset: 3,
                                    },
                                }}
                            >
                                {firstNameFrom(selectedName)}
                            </Box>
                        </Box>
                    ) : (
                        <Box
                            component="h1"
                            sx={{
                                color: "inherit",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
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
                            Notifications
                        </Box>
                    )}
                    <Box aria-hidden />
                </Box>

                {isThreadOpen && selectedFriend ? (
                    <>
                        <Box
                            ref={threadScrollRef}
                            sx={{
                                boxSizing: "border-box",
                                height: replyingTo
                                    ? "calc(100svh - 56px - 142px - env(safe-area-inset-bottom))"
                                    : "calc(100svh - 56px - 72px - env(safe-area-inset-bottom))",
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
                            ) : messages.length == 0 ? (
                                <Box
                                    sx={{
                                        alignItems: "center",
                                        display: "flex",
                                        height: "100%",
                                        justifyContent: "center",
                                        pointerEvents: "none",
                                        textAlign: "center",
                                    }}
                                >
                                    <Box
                                        component="p"
                                        sx={{
                                            color: threadTimestamp,
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            fontSize: 14,
                                            fontWeight: 650,
                                            lineHeight: "20px",
                                            m: 0,
                                        }}
                                    >
                                        No messages yet
                                    </Box>
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
                                        const nextMessage = messages[index + 1];
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
                                                isHighlighted={
                                                    messageContextMenu?.message
                                                        .id == message.id
                                                }
                                                isLastInSequence={
                                                    isLastInSequence
                                                }
                                                message={message}
                                                onOpenActions={
                                                    openMessageActions
                                                }
                                                ownWallID={profile.wallId}
                                                parentMessage={
                                                    message.replyMessageId
                                                        ? messageByID.get(
                                                              message.replyMessageId,
                                                          )
                                                        : undefined
                                                }
                                                profile={profile}
                                                showTimestamp={isLastInSequence}
                                            />
                                        );
                                    })}
                                </Box>
                            )}
                        </Box>
                        <Menu
                            anchorEl={messageContextMenu?.anchorEl}
                            open={Boolean(messageContextMenu)}
                            onClose={closeMessageActions}
                            anchorOrigin={{
                                horizontal: "right",
                                vertical: "bottom",
                            }}
                            transformOrigin={{
                                horizontal: "right",
                                vertical: "top",
                            }}
                            slotProps={{
                                paper: {
                                    sx: {
                                        bgcolor: "#1E1E1E",
                                        borderRadius: "16px",
                                        boxShadow:
                                            "0 14px 40px rgba(0, 0, 0, 0.22)",
                                        minWidth: 132,
                                        p: "4px",
                                    },
                                },
                                list: { sx: { p: 0 } },
                            }}
                        >
                            <MenuItem
                                disableRipple
                                onClick={() => handleMessageAction("like")}
                                sx={{
                                    borderRadius: "12px",
                                    color: threadText,
                                    gap: "8px",
                                    minHeight: 38,
                                    px: "8px",
                                    py: "7px",
                                    "&:hover": {
                                        bgcolor: "rgba(255, 255, 255, 0.1)",
                                    },
                                }}
                            >
                                <HeartIcon small />
                                <Box
                                    sx={{
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 13,
                                        fontWeight: 650,
                                        lineHeight: "18px",
                                    }}
                                >
                                    {isContextMessageLiked ? "Unlike" : "Like"}
                                </Box>
                            </MenuItem>
                            <MenuItem
                                disableRipple
                                onClick={() => handleMessageAction("reply")}
                                sx={{
                                    borderRadius: "12px",
                                    color: threadText,
                                    gap: "8px",
                                    minHeight: 38,
                                    px: "8px",
                                    py: "7px",
                                    "&:hover": {
                                        bgcolor: "rgba(255, 255, 255, 0.1)",
                                    },
                                }}
                            >
                                <ReplyIcon />
                                <Box
                                    sx={{
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 13,
                                        fontWeight: 650,
                                        lineHeight: "18px",
                                    }}
                                >
                                    Reply
                                </Box>
                            </MenuItem>
                            <MenuItem
                                disableRipple
                                onClick={() => handleMessageAction("copy")}
                                sx={{
                                    borderRadius: "12px",
                                    color: threadText,
                                    gap: "8px",
                                    minHeight: 38,
                                    px: "8px",
                                    py: "7px",
                                    "&:hover": {
                                        bgcolor: "rgba(255, 255, 255, 0.1)",
                                    },
                                }}
                            >
                                <CopyIcon />
                                <Box
                                    sx={{
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 13,
                                        fontWeight: 650,
                                        lineHeight: "18px",
                                    }}
                                >
                                    Copy
                                </Box>
                            </MenuItem>
                            {messageContextMenu?.message &&
                                isCurrentProfileMessage(
                                    messageContextMenu.message,
                                    profile,
                                ) && (
                                    <MenuItem
                                        disableRipple
                                        onClick={() =>
                                            handleMessageAction("delete")
                                        }
                                        sx={{
                                            borderRadius: "12px",
                                            color: dangerColor,
                                            gap: "8px",
                                            minHeight: 38,
                                            px: "8px",
                                            py: "7px",
                                            "&:hover": {
                                                bgcolor:
                                                    "rgba(246, 58, 58, 0.14)",
                                            },
                                        }}
                                    >
                                        <DeleteIcon />
                                        <Box
                                            sx={{
                                                fontFamily:
                                                    '"Inter Variable", Inter, sans-serif',
                                                fontSize: 13,
                                                fontWeight: 650,
                                                lineHeight: "18px",
                                            }}
                                        >
                                            Delete
                                        </Box>
                                    </MenuItem>
                                )}
                        </Menu>
                        <Box
                            sx={{
                                bgcolor: threadBackground,
                                bottom: 0,
                                boxSizing: "border-box",
                                display: "grid",
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
                            {replyingTo && (
                                <Box
                                    sx={{
                                        bgcolor: "#262626",
                                        borderLeft: "3px solid #8C8C8C",
                                        borderRadius: "12px",
                                        boxSizing: "border-box",
                                        display: "grid",
                                        gap: "8px",
                                        gridTemplateColumns:
                                            "minmax(0, 1fr) 24px",
                                        p: "9px 8px 9px 12px",
                                        width: "100%",
                                    }}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Box
                                            sx={{
                                                color: threadTimestamp,
                                                fontFamily:
                                                    '"Inter Variable", Inter, sans-serif',
                                                fontSize: 12,
                                                fontWeight: 650,
                                                lineHeight: "16px",
                                            }}
                                        >
                                            Replying to{" "}
                                            {isCurrentProfileMessage(
                                                replyingTo,
                                                profile,
                                            )
                                                ? "yourself"
                                                : firstNameFrom(
                                                      replyingTo.sender.fullName.trim() ||
                                                          replyingTo.sender
                                                              .username,
                                                  )}
                                        </Box>
                                        <Box
                                            sx={{
                                                color: threadText,
                                                fontFamily:
                                                    '"Inter Variable", Inter, sans-serif',
                                                fontSize: 13,
                                                fontWeight: 600,
                                                lineHeight: "18px",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {truncateMessageText(
                                                replyingTo.text,
                                            )}
                                        </Box>
                                    </Box>
                                    <Box
                                        component="button"
                                        type="button"
                                        aria-label="Cancel reply"
                                        onClick={() => {
                                            setReplyingTo(null);
                                            composerRef.current?.focus();
                                        }}
                                        sx={{
                                            alignItems: "center",
                                            bgcolor: "transparent",
                                            border: 0,
                                            borderRadius: "50%",
                                            color: "#D8D8D8",
                                            cursor: "pointer",
                                            display: "flex",
                                            height: 24,
                                            justifyContent: "center",
                                            p: 0,
                                            width: 24,
                                            "&:focus-visible": {
                                                outline: `2px solid ${green}`,
                                                outlineOffset: 2,
                                            },
                                            "&:hover": { color: threadText },
                                        }}
                                    >
                                        <HugeiconsIcon
                                            icon={Cancel01Icon}
                                            size={16}
                                            strokeWidth={1.8}
                                        />
                                    </Box>
                                </Box>
                            )}
                            <Box
                                sx={{
                                    alignItems: "flex-end",
                                    display: "flex",
                                    gap: "8px",
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
                                        "&::placeholder": {
                                            color: threadMuted,
                                        },
                                        "&:focus": {
                                            bgcolor: threadSurfaceHover,
                                        },
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
                                                transform:
                                                    "translate(-1px, 1px)",
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
                                                transform:
                                                    "translate(-1px, 1px)",
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
                                    component="p"
                                    sx={{
                                        color: textSecondary,
                                        fontFamily:
                                            '"Inter Variable", Inter, sans-serif',
                                        fontSize: 14,
                                        fontWeight: 500,
                                        lineHeight: "20px",
                                        m: 0,
                                    }}
                                >
                                    No notifications yet
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
                                            conversation.latestActivity
                                                .createdAtMs,
                                        ),
                                    );
                                    const postThumbnailUrl =
                                        conversation.latestActivity.post
                                            ?.imageUrl;
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
                                                    onOpenThread(conversation)
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
                                                        postThumbnailUrl
                                                            ? "44px minmax(0, 1fr) 44px"
                                                            : "44px minmax(0, 1fr)",
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
                                                            alignItems:
                                                                "center",
                                                            display: "flex",
                                                            gap: "4px",
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                flex: "0 1 auto",
                                                                fontFamily:
                                                                    '"Inter Variable", Inter, sans-serif',
                                                                fontSize: 14,
                                                                fontWeight: 700,
                                                                lineHeight:
                                                                    "20px",
                                                                minWidth: 0,
                                                                overflow:
                                                                    "hidden",
                                                                textOverflow:
                                                                    "ellipsis",
                                                                whiteSpace:
                                                                    "nowrap",
                                                            }}
                                                        >
                                                            {firstNameFrom(
                                                                name,
                                                            )}
                                                        </Box>
                                                        <Box
                                                            aria-hidden
                                                            component="span"
                                                            sx={{
                                                                color: textSecondary,
                                                                flexShrink: 0,
                                                                fontFamily:
                                                                    '"Inter Variable", Inter, sans-serif',
                                                                fontSize: 12,
                                                                fontWeight: 600,
                                                                lineHeight:
                                                                    "16px",
                                                            }}
                                                        >
                                                            &middot;
                                                        </Box>
                                                        <Box
                                                            component="time"
                                                            dateTime={new Date(
                                                                conversation.latestActivity.createdAtMs,
                                                            ).toISOString()}
                                                            sx={{
                                                                color: textSecondary,
                                                                flexShrink: 0,
                                                                fontFamily:
                                                                    '"Inter Variable", Inter, sans-serif',
                                                                fontSize: 12,
                                                                fontWeight: 600,
                                                                lineHeight:
                                                                    "16px",
                                                                whiteSpace:
                                                                    "nowrap",
                                                            }}
                                                        >
                                                            {timestampLabel}
                                                        </Box>
                                                        {conversation.unread && (
                                                            <Box
                                                                aria-hidden
                                                                sx={{
                                                                    bgcolor: green,
                                                                    borderRadius:
                                                                        "50%",
                                                                    flexShrink: 0,
                                                                    height: 8,
                                                                    width: 8,
                                                                }}
                                                            />
                                                        )}
                                                    </Box>
                                                    <ConversationPreviewLine
                                                        conversation={
                                                            conversation
                                                        }
                                                        profile={profile}
                                                    />
                                                </Box>
                                                {postThumbnailUrl && (
                                                    <Box
                                                        component="img"
                                                        alt=""
                                                        src={postThumbnailUrl}
                                                        sx={{
                                                            borderRadius: "6px",
                                                            display: "block",
                                                            height: 44,
                                                            objectFit: "cover",
                                                            objectPosition:
                                                                "center",
                                                            width: 44,
                                                        }}
                                                    />
                                                )}
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
