import {
    Cancel01Icon,
    Comment01Icon,
    Delete02Icon,
    FavouriteIcon,
    MoreHorizontalIcon,
    Navigation03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box, Menu, MenuItem, TextField } from "@mui/material";
import { ConfirmationActionSheet } from "components/ConfirmationActionSheet";
import {
    socialActionBusyDurationMs,
    socialActionDoneDurationMs,
    type SocialActionPhase,
} from "components/SocialActionFeedback";
import { formatTimeAgo } from "ente-base/date";
import type PhotoSwipe from "photoswipe";
import React from "react";
import {
    firstNameFrom,
    formatSocialDate,
    initialsFor,
} from "utils/socialDisplay";

const green = "#08C225";
const paleGreen = "#E7F6E9";
const textBase = "#F4F4F4";
const textSecondary = "#A6A6A6";
const textTertiary = "rgba(244, 244, 244, 0.52)";
const viewerBackground = "#000000";
const controlBackground = "rgba(36, 36, 36, 0.72)";
const controlBackgroundHover = "rgba(48, 48, 48, 0.86)";
const controlIcon = "#D8D8D8";
const dangerColor = "#F63A3A";
const viewerHeaderHeight = 56;
const viewerBottomPadding = 72;
const defaultPhotoWidth = 900;
const defaultPhotoHeight = 680;
const viewerExitDurationMs = 200;
const viewerExitTransition = `${viewerExitDurationMs}ms cubic-bezier(0.4, 0, 0.2, 1)`;
const commentsBackground = "#202020";
const commentsSurface = "#2C2C2C";
const commentsSurfaceHover = "#343434";
const commentsOwnerBubble = "#3FA43D";
const commentsMuted = "rgba(244, 244, 244, 0.54)";
const commentsTimestamp = "rgba(255, 255, 255, 0.55)";

interface SocialViewerUser {
    avatarUrl?: string | null;
    name: string;
}

export interface SocialViewerPhoto {
    alt?: string;
    avatarUrl?: string | null;
    friendID?: string;
    height?: number;
    imageUrl: string;
    name: string;
    timestampMs: number;
    width?: number;
}

interface SocialFileViewerProps {
    currentUser?: SocialViewerUser;
    onClose: () => void;
    onDeletePost?: () => void;
    onOpenProfile?: () => void;
    photo: SocialViewerPhoto;
}

interface SocialComment {
    id: string;
    author: string;
    avatarUrl?: string | null;
    createdAtMicros: number;
    isDeleted?: boolean;
    isOwner?: boolean;
    parentCommentID?: string;
    text: string;
}

interface SocialLiker {
    id: string;
    avatarUrl?: string | null;
    name: string;
}

interface CommentContextMenuState {
    anchorEl: HTMLElement;
    comment: SocialComment;
}

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const commentGroupTimeThresholdMicros = 10 * minuteMs * 1000;
const microsForTimestamp = (timestampMs: number) => timestampMs * 1000;
const microsAgo = (durationMs: number) =>
    microsForTimestamp(Date.now() - durationMs);

const mockComments: SocialComment[] = [
    {
        id: "kabir-plan",
        author: "Kabir Mehta",
        avatarUrl: "/images/sample-feed-1.jpg",
        createdAtMicros: microsAgo(6 * minuteMs),
        text: "This is the overlook near the old forest road, right?",
    },
    {
        id: "you-kabir-plan",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(5 * minuteMs),
        isOwner: true,
        parentCommentID: "kabir-plan",
        text: "Yes. We took the smaller trail behind the tea stall.",
    },
    {
        id: "you-kabir-plan-2",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(4 * minuteMs + 45 * 1000),
        isOwner: true,
        text: "The first marker is easy to miss.",
    },
    {
        id: "you-kabir-plan-3",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(4 * minuteMs + 30 * 1000),
        isOwner: true,
        parentCommentID: "you-kabir-plan-2",
        text: "If you hit the stream crossing, you have gone too far.",
    },
    {
        id: "kabir-followup",
        author: "Kabir Mehta",
        avatarUrl: "/images/sample-feed-1.jpg",
        createdAtMicros: microsAgo(4 * minuteMs),
        parentCommentID: "you-kabir-plan",
        text: "Nice, adding this to the Sunday route.",
    },
    {
        id: "nikhil",
        author: "Nikhil Rao",
        avatarUrl: "/images/sample-feed-5.jpg",
        createdAtMicros: microsAgo(22 * minuteMs),
        text: "This trail needs to be on our next trip list.",
    },
    {
        id: "nikhil-chain-1",
        author: "Nikhil Rao",
        avatarUrl: "/images/sample-feed-5.jpg",
        createdAtMicros: microsAgo(21 * minuteMs),
        text: "The ridge looks quiet enough for a picnic stop too.",
    },
    {
        id: "you-nikhil",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(20 * minuteMs),
        isOwner: true,
        parentCommentID: "nikhil-chain-1",
        text: "It was quiet until about 9. After that it filled up fast.",
    },
    {
        id: "mira",
        author: "Mira Sen",
        avatarUrl: "/images/sample-feed-3.jpg",
        createdAtMicros: microsAgo(34 * minuteMs),
        text: "The colors in this shot are so good.",
    },
    {
        id: "you-reply-mira",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(32 * minuteMs),
        isOwner: true,
        parentCommentID: "mira",
        text: "That evening light did all the work.",
    },
    {
        id: "mira-followup",
        author: "Mira Sen",
        avatarUrl: "/images/sample-feed-3.jpg",
        createdAtMicros: microsAgo(31 * minuteMs),
        parentCommentID: "you-reply-mira",
        text: "Still counts. You noticed it at the right time.",
    },
    {
        id: "aparna",
        author: "Aparna Bhatnagar",
        avatarUrl: "/images/sample-feed-4.jpg",
        createdAtMicros: microsAgo(52 * minuteMs),
        text: "The framing is perfect.",
    },
    {
        id: "mira-reply",
        author: "Mira Sen",
        avatarUrl: "/images/sample-feed-3.jpg",
        createdAtMicros: microsAgo(50 * minuteMs),
        parentCommentID: "aparna",
        text: "Agree, the path pulls you right in.",
    },
    {
        id: "aparna-reply-mira",
        author: "Aparna Bhatnagar",
        avatarUrl: "/images/sample-feed-4.jpg",
        createdAtMicros: microsAgo(49 * minuteMs),
        parentCommentID: "mira-reply",
        text: "Exactly. The leading line is doing everything.",
    },
    {
        id: "devika",
        author: "Devika Iyer",
        avatarUrl: "/images/sample-feed-2.jpg",
        createdAtMicros: microsAgo(74 * minuteMs),
        text: "Saving this for the weekend plan.",
    },
    {
        id: "you-reply-devika",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(72 * minuteMs),
        isOwner: true,
        parentCommentID: "devika",
        text: "Go early if you want the quiet stretch.",
    },
    {
        id: "devika-route",
        author: "Devika Iyer",
        avatarUrl: "/images/sample-feed-2.jpg",
        createdAtMicros: microsAgo(70 * minuteMs),
        parentCommentID: "you-reply-devika",
        text: "Good call. I will try sunrise.",
    },
    {
        id: "you-devika-route",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(69 * minuteMs),
        isOwner: true,
        parentCommentID: "devika-route",
        text: "Carry water. There is nothing open before the bend.",
    },
    {
        id: "kabir",
        author: "Kabir Mehta",
        avatarUrl: "/images/sample-feed-1.jpg",
        createdAtMicros: microsAgo(3 * hourMs),
        text: "Looks peaceful. Was it crowded?",
    },
    {
        id: "you-crowd-reply",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(3 * hourMs - 5 * minuteMs),
        isOwner: true,
        parentCommentID: "kabir",
        text: "Not really. We went just after sunrise.",
    },
    {
        id: "kabir-crowd-2",
        author: "Kabir Mehta",
        avatarUrl: "/images/sample-feed-1.jpg",
        createdAtMicros: microsAgo(3 * hourMs - 8 * minuteMs),
        parentCommentID: "you-crowd-reply",
        text: "That explains the empty path. Worth the early alarm.",
    },
    {
        id: "you-crowd-3",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(3 * hourMs - 10 * minuteMs),
        isOwner: true,
        parentCommentID: "kabir-crowd-2",
        text: "The first half hour was the best part.",
    },
    {
        id: "samar",
        author: "Samar Jain",
        avatarUrl: "/images/sample-feed-4.jpg",
        createdAtMicros: microsAgo(3 * dayMs),
        text: "The composition makes it feel cinematic.",
    },
    {
        id: "samar-2",
        author: "Samar Jain",
        avatarUrl: "/images/sample-feed-4.jpg",
        createdAtMicros: microsAgo(3 * dayMs - 8 * minuteMs),
        text: "Also love that the sky is not overdone.",
    },
    {
        id: "leena",
        author: "Leena Shah",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(8 * dayMs),
        text: "Need the exact location for this one.",
    },
    {
        id: "you-reply-leena",
        author: "You",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(8 * dayMs - 34 * minuteMs),
        isOwner: true,
        parentCommentID: "leena",
        text: "I will send you the pin.",
    },
    {
        id: "leena-final",
        author: "Leena Shah",
        avatarUrl: "/images/sample-feed-6.jpg",
        createdAtMicros: microsAgo(8 * dayMs - 39 * minuteMs),
        parentCommentID: "you-reply-leena",
        text: "Perfect. This one is going on the list.",
    },
];

const mockPhotoLikers: SocialLiker[] = [
    { id: "mira", avatarUrl: "/images/sample-feed-3.jpg", name: "Mira Sen" },
    {
        id: "kabir",
        avatarUrl: "/images/sample-feed-1.jpg",
        name: "Kabir Mehta",
    },
    {
        id: "devika",
        avatarUrl: "/images/sample-feed-2.jpg",
        name: "Devika Iyer",
    },
    {
        id: "nikhil",
        avatarUrl: "/images/sample-feed-5.jpg",
        name: "Nikhil Rao",
    },
];

const commentAuthorKey = (comment: SocialComment) =>
    comment.isOwner ? "current-user" : comment.author;

const getParentComment = (
    parentCommentID: string | undefined,
    comments: SocialComment[],
): SocialComment | undefined => {
    if (!parentCommentID) return undefined;
    return comments.find((comment) => comment.id == parentCommentID);
};

const truncateCommentText = (text: string): string => {
    const lines = text.split("\n");
    const firstLine = lines[0] ?? text;
    if (firstLine.length > 100) return `${firstLine.slice(0, 100)}...`;
    return lines.length > 1 ? `${firstLine}...` : firstLine;
};

const sameCommentAuthor = (first: SocialComment, second: SocialComment) =>
    commentAuthorKey(first) == commentAuthorKey(second);

const viewerActionButtonSx = {
    alignItems: "center",
    bgcolor: controlBackground,
    border: 0,
    borderRadius: "50%",
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.36)",
    color: controlIcon,
    cursor: "pointer",
    display: "flex",
    height: 48,
    justifyContent: "center",
    p: 0,
    transition: "background-color 120ms ease, transform 120ms ease",
    width: 48,
    "&:active": { bgcolor: "#3A3A3A", transform: "scale(0.96)" },
    "&:focus-visible": { outline: `2px solid ${green}`, outlineOffset: 2 },
    "&:hover": { bgcolor: controlBackgroundHover },
};

const viewerCountBadgeSx = {
    alignItems: "center",
    bgcolor: "#FFFFFF",
    border: `2px solid ${viewerBackground}`,
    borderRadius: "50%",
    boxSizing: "border-box",
    color: "#111111",
    display: "inline-flex",
    fontFamily: '"Inter Variable", Inter, sans-serif',
    fontSize: 10,
    fontWeight: 800,
    height: 24,
    justifyContent: "center",
    lineHeight: 1,
    position: "absolute",
    right: -8,
    top: -8,
    width: 24,
};

const SocialAvatar: React.FC<{
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

interface HeartIconProps {
    filled?: boolean;
    small?: boolean;
}

const HeartIcon: React.FC<HeartIconProps> = ({ filled, small }) => (
    <svg
        width={small ? "13" : "16"}
        height={small ? "11" : "14"}
        viewBox="0 0 16 14"
        fill={filled ? "#08C225" : "none"}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M6.63749 12.3742C4.66259 10.885 0.75 7.4804 0.75 4.41664C0.75 2.39161 2.22368 0.75 4.25 0.75C5.3 0.75 6.35 1.10294 7.75 2.51469C9.15 1.10294 10.2 0.75 11.25 0.75C13.2763 0.75 14.75 2.39161 14.75 4.41664C14.75 7.4804 10.8374 10.885 8.86251 12.3742C8.19793 12.8753 7.30207 12.8753 6.63749 12.3742Z"
            stroke={filled ? "#08C225" : "currentColor"}
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

const HeartFilledIcon: React.FC = () => (
    <svg
        width="18"
        height="16"
        viewBox="0 0 30 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12.4926 23.4794C8.64537 20.6025 1.02344 14.0254 1.02344 8.10676C1.02344 4.19475 3.89425 1.02344 7.84162 1.02344C9.88707 1.02344 11.9325 1.70526 14.6598 4.43253C17.3871 1.70526 19.4325 1.02344 21.478 1.02344C25.4253 1.02344 28.2962 4.19475 28.2962 8.10676C28.2962 14.0254 20.6743 20.6025 16.827 23.4794C15.5324 24.4474 13.7872 24.4474 12.4926 23.4794Z"
            fill="#08C225"
            stroke="#08C225"
            strokeWidth="2.04545"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

interface CommentItemProps {
    comment: SocialComment;
    isHighlighted: boolean;
    isLiked: boolean;
    isLastInSequence: boolean;
    onOpenActions: (comment: SocialComment, anchorEl: HTMLElement) => void;
    parentComment?: SocialComment;
    showHeader: boolean;
    showOwnTimestamp: boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({
    comment,
    isHighlighted,
    isLiked,
    isLastInSequence,
    onOpenActions,
    parentComment,
    showHeader,
    showOwnTimestamp,
}) => {
    const isOwner = Boolean(comment.isOwner);
    const authorName = firstNameFrom(comment.author);
    const timestampLabel = formatTimeAgo(comment.createdAtMicros);
    const timestampDateTime = new Date(
        Math.floor(comment.createdAtMicros / 1000),
    ).toISOString();
    const parentAuthorName = parentComment
        ? firstNameFrom(parentComment.author)
        : undefined;
    const bubbleBorderRadius = isOwner
        ? isLastInSequence
            ? "20px 6px 20px 20px"
            : "20px 6px 6px 20px"
        : isLastInSequence
          ? "6px 20px 20px 20px"
          : "6px 20px 20px 6px";

    const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;

        event.preventDefault();
        event.stopPropagation();
        onOpenActions(comment, event.currentTarget);
    };

    return (
        <Box
            component="li"
            data-comment-id={comment.id}
            sx={{
                alignItems: isOwner ? "flex-end" : "flex-start",
                display: "flex",
                flexDirection: "column",
                listStyle: "none",
                mb: isLastInSequence ? "24px" : "6px",
                maxWidth: "100%",
                minWidth: 0,
                position: "relative",
                width: "100%",
                zIndex: isHighlighted ? 2 : "auto",
            }}
        >
            {showHeader && (
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "10px",
                        maxWidth: "min(calc(100vw - 32px), 360px)",
                        mb: "10px",
                        minWidth: 0,
                        width: "100%",
                    }}
                >
                    <SocialAvatar
                        avatarUrl={comment.avatarUrl}
                        name={authorName}
                        size={28}
                    />
                    <Box
                        sx={{
                            alignItems: "baseline",
                            display: "flex",
                            gap: "4px",
                            minWidth: 0,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                        }}
                    >
                        <Box
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 14,
                                fontWeight: 750,
                                lineHeight: "20px",
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {authorName}
                        </Box>
                        <Box
                            aria-hidden
                            sx={{
                                color: commentsTimestamp,
                                flexShrink: 0,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: "16px",
                            }}
                        >
                            ·
                        </Box>
                        <Box
                            component="time"
                            dateTime={timestampDateTime}
                            sx={{
                                color: commentsTimestamp,
                                flexShrink: 0,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 12,
                                fontWeight: 600,
                                lineHeight: "16px",
                            }}
                        >
                            {timestampLabel}
                        </Box>
                    </Box>
                </Box>
            )}
            {showOwnTimestamp && (
                <Box
                    component="time"
                    dateTime={timestampDateTime}
                    sx={{
                        color: commentsTimestamp,
                        fontFamily: '"Inter Variable", Inter, sans-serif',
                        fontSize: 12,
                        fontWeight: 600,
                        lineHeight: "16px",
                        mb: "6px",
                        mr: "2px",
                    }}
                >
                    {timestampLabel}
                </Box>
            )}
            <Box
                className={isOwner ? "green-bg" : undefined}
                onContextMenu={handleContextMenu}
                sx={{
                    bgcolor: isOwner ? commentsOwnerBubble : commentsSurface,
                    borderRadius: bubbleBorderRadius,
                    color: textBase,
                    display: "block",
                    maxWidth: "min(calc(100vw - 72px), 360px)",
                    minWidth: 0,
                    ml: isOwner ? 0 : "38px",
                    overflow: "visible",
                    position: "relative",
                    px: "16px",
                    py: parentComment ? "16px" : "14px",
                    textAlign: "left",
                    width: "fit-content",
                    "&:hover": {
                        bgcolor: isOwner ? commentsOwnerBubble : "#343434",
                    },
                }}
            >
                {parentComment && (
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
                                bgcolor: isOwner
                                    ? "rgba(255, 255, 255, 0.55)"
                                    : "#8C8C8C",
                                borderRadius: "999px",
                                flexShrink: 0,
                                width: 3,
                            }}
                        />
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
                                {parentAuthorName}
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
                                {parentComment.isDeleted
                                    ? "(deleted)"
                                    : truncateCommentText(parentComment.text)}
                            </Box>
                        </Box>
                    </Box>
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
                    {comment.text}
                </Box>
                {isLiked && (
                    <Box
                        aria-label="Liked"
                        role="img"
                        sx={{
                            alignItems: "center",
                            bgcolor: "#2B2B2B",
                            border: `2px solid ${commentsBackground}`,
                            borderRadius: "999px",
                            bottom: -11,
                            boxShadow: "0 4px 10px rgba(0, 0, 0, 0.2)",
                            boxSizing: "border-box",
                            color: green,
                            display: "inline-flex",
                            height: 22,
                            justifyContent: "center",
                            minWidth: 28,
                            px: "7px",
                            position: "absolute",
                            ...(isOwner ? { left: 8 } : { right: 8 }),
                        }}
                    >
                        <HeartIcon filled small />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export const SocialFileViewer: React.FC<SocialFileViewerProps> = ({
    currentUser,
    onClose,
    onDeletePost,
    onOpenProfile,
    photo,
}) => {
    const [screen, setScreen] = React.useState<"photo" | "comments" | "likes">(
        "photo",
    );
    const [isPhotoLiked, setIsPhotoLiked] = React.useState(false);
    const [isCommentButtonPopping, setIsCommentButtonPopping] =
        React.useState(false);
    const [comments, setComments] =
        React.useState<SocialComment[]>(mockComments);
    const [commentText, setCommentText] = React.useState("");
    const [replyingTo, setReplyingTo] = React.useState<SocialComment | null>(
        null,
    );
    const [likedCommentIDs, setLikedCommentIDs] = React.useState<Set<string>>(
        () => new Set(),
    );
    const [commentContextMenu, setCommentContextMenu] =
        React.useState<CommentContextMenuState | null>(null);
    const displayName = firstNameFrom(photo.name);
    const dateLabel = formatSocialDate(photo.timestampMs);
    const initials = initialsFor(photo.name);
    const viewerRootRef = React.useRef<HTMLDivElement | null>(null);
    const commentsContainerRef = React.useRef<HTMLDivElement | null>(null);
    const commentInputRef = React.useRef<HTMLTextAreaElement | null>(null);
    const commentOpenTimeoutRef = React.useRef<number | null>(null);
    const likeHoldTimeoutRef = React.useRef<number | null>(null);
    const likeHoldStartPointRef = React.useRef<{ x: number; y: number } | null>(
        null,
    );
    const ignoreNextLikeClickRef = React.useRef(false);
    const suppressNextLikeContextMenuRef = React.useRef(false);
    const suppressLikeContextMenuTimeoutRef = React.useRef<number | null>(null);
    const currentUserName = currentUser?.name.trim() || "You";
    const photoLikers = React.useMemo(() => {
        if (!isPhotoLiked) return mockPhotoLikers;

        return [
            {
                id: "current-user",
                avatarUrl: currentUser?.avatarUrl,
                name: "You",
            },
            ...mockPhotoLikers,
        ];
    }, [currentUser?.avatarUrl, isPhotoLiked]);
    const sortedVisibleComments = React.useMemo(
        () =>
            comments
                .filter((comment) => !comment.isDeleted)
                .sort(
                    (first, second) =>
                        second.createdAtMicros - first.createdAtMicros,
                ),
        [comments],
    );
    const commentCount = sortedVisibleComments.length;
    const likeCount = photoLikers.length;
    const commentButtonLabel =
        commentCount > 0
            ? `Comment on photo, ${commentCount} ${
                  commentCount == 1 ? "comment" : "comments"
              }`
            : "Comment on photo";
    const likeCountLabel = `${likeCount} ${likeCount == 1 ? "like" : "likes"}`;
    const isContextCommentLiked = commentContextMenu
        ? likedCommentIDs.has(commentContextMenu.comment.id)
        : false;
    const canSendComment = commentText.trim().length > 0;
    const [actionsAnchor, setActionsAnchor] =
        React.useState<HTMLElement | null>(null);
    const [deleteSheetOpen, setDeleteSheetOpen] = React.useState(false);
    const [deleteActionPhase, setDeleteActionPhase] =
        React.useState<SocialActionPhase | null>(null);
    const [isDeleteExit, setIsDeleteExit] = React.useState(false);
    const actionsMenuID = "social-viewer-actions-menu";
    const actionsButtonID = "social-viewer-actions-button";
    const isActionsOpen = Boolean(actionsAnchor);
    const isDeleteActionRunning = deleteActionPhase != null;

    const clearLikeHoldTimeout = () => {
        if (likeHoldTimeoutRef.current != null) {
            window.clearTimeout(likeHoldTimeoutRef.current);
            likeHoldTimeoutRef.current = null;
        }
        likeHoldStartPointRef.current = null;
    };

    const suppressNativeLikeContextMenu = () => {
        suppressNextLikeContextMenuRef.current = true;
        if (suppressLikeContextMenuTimeoutRef.current != null)
            window.clearTimeout(suppressLikeContextMenuTimeoutRef.current);

        suppressLikeContextMenuTimeoutRef.current = window.setTimeout(() => {
            suppressNextLikeContextMenuRef.current = false;
            suppressLikeContextMenuTimeoutRef.current = null;
        }, 700);
    };

    const openLikes = () => {
        clearLikeHoldTimeout();
        setCommentContextMenu(null);
        setScreen("likes");
    };

    const closeLikes = React.useCallback(() => {
        if (likeHoldTimeoutRef.current != null) {
            window.clearTimeout(likeHoldTimeoutRef.current);
            likeHoldTimeoutRef.current = null;
        }
        likeHoldStartPointRef.current = null;
        setScreen("photo");
    }, []);

    const handlePhotoLikeClick = () => {
        if (ignoreNextLikeClickRef.current) {
            ignoreNextLikeClickRef.current = false;
            return;
        }

        setIsPhotoLiked((isLiked) => !isLiked);
    };

    const handlePhotoLikeContextMenu = (
        event: React.MouseEvent<HTMLElement>,
    ) => {
        event.preventDefault();
        event.stopPropagation();
        ignoreNextLikeClickRef.current = false;
        openLikes();
    };

    const handleLikeCountClick = (event: React.MouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        openLikes();
    };

    const startPhotoLikeHold = (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType == "mouse" && event.button != 0) return;

        clearLikeHoldTimeout();
        likeHoldStartPointRef.current = { x: event.clientX, y: event.clientY };
        likeHoldTimeoutRef.current = window.setTimeout(() => {
            likeHoldTimeoutRef.current = null;
            likeHoldStartPointRef.current = null;
            ignoreNextLikeClickRef.current = true;
            suppressNativeLikeContextMenu();
            openLikes();
            window.setTimeout(() => {
                ignoreNextLikeClickRef.current = false;
            }, 400);
        }, 500);
    };

    const cancelPhotoLikeHoldOnMove = (
        event: React.PointerEvent<HTMLElement>,
    ) => {
        const startPoint = likeHoldStartPointRef.current;
        if (!startPoint) return;

        const distance = Math.hypot(
            event.clientX - startPoint.x,
            event.clientY - startPoint.y,
        );
        if (distance > 8) clearLikeHoldTimeout();
    };

    const closeActions = () => setActionsAnchor(null);

    const requestDeletePost = () => {
        if (isDeleteActionRunning || isDeleteExit) return;
        closeActions();
        setDeleteSheetOpen(true);
    };

    const closeDeleteSheet = () => {
        if (isDeleteActionRunning || isDeleteExit) return;
        setDeleteSheetOpen(false);
    };

    const confirmDeletePost = () => {
        if (isDeleteActionRunning || isDeleteExit) return;
        setDeleteActionPhase("busy");
    };

    const openComments = () => {
        if (isCommentButtonPopping) return;

        setIsCommentButtonPopping(true);
        commentOpenTimeoutRef.current = window.setTimeout(() => {
            commentOpenTimeoutRef.current = null;
            setIsCommentButtonPopping(false);
            setScreen("comments");
        }, 120);
    };

    const closeComments = () => {
        if (commentOpenTimeoutRef.current != null) {
            window.clearTimeout(commentOpenTimeoutRef.current);
            commentOpenTimeoutRef.current = null;
        }

        setCommentContextMenu(null);
        setIsCommentButtonPopping(false);
        setScreen("photo");
    };

    const openCommentActions = (
        comment: SocialComment,
        anchorEl: HTMLElement,
    ) => {
        setCommentContextMenu({ anchorEl, comment });
    };

    const closeCommentActions = () => setCommentContextMenu(null);

    const handleCommentAction = (action: "like" | "reply" | "delete") => {
        if (!commentContextMenu) return;

        const targetComment = commentContextMenu.comment;
        setCommentContextMenu(null);

        switch (action) {
            case "like":
                setLikedCommentIDs((currentIDs) => {
                    const nextIDs = new Set(currentIDs);
                    if (nextIDs.has(targetComment.id)) {
                        nextIDs.delete(targetComment.id);
                    } else {
                        nextIDs.add(targetComment.id);
                    }
                    return nextIDs;
                });
                break;
            case "reply":
                setReplyingTo(targetComment);
                break;
            case "delete":
                setComments((currentComments) =>
                    currentComments.map((comment) =>
                        comment.id == targetComment.id
                            ? { ...comment, isDeleted: true }
                            : comment,
                    ),
                );
                setLikedCommentIDs((currentIDs) => {
                    if (!currentIDs.has(targetComment.id)) return currentIDs;

                    const nextIDs = new Set(currentIDs);
                    nextIDs.delete(targetComment.id);
                    return nextIDs;
                });
                setReplyingTo((currentReply) =>
                    currentReply?.id == targetComment.id ? null : currentReply,
                );
                break;
        }
    };

    const sendComment = () => {
        const text = commentText.trim();
        if (!text) return;

        const newComment: SocialComment = {
            author: currentUserName,
            avatarUrl: currentUser?.avatarUrl,
            createdAtMicros: Date.now() * 1000,
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            isOwner: true,
            parentCommentID: replyingTo?.id,
            text,
        };

        setComments((currentComments) => [...currentComments, newComment]);
        setCommentText("");
        setReplyingTo(null);

        window.setTimeout(() => {
            if (commentsContainerRef.current)
                commentsContainerRef.current.scrollTop = 0;
        }, 0);
    };

    const handleCommentKeyDown = (event: React.KeyboardEvent) => {
        event.stopPropagation();
        if (event.key != "Enter" || event.shiftKey) return;

        event.preventDefault();
        sendComment();
    };

    React.useEffect(
        () => () => {
            if (commentOpenTimeoutRef.current != null)
                window.clearTimeout(commentOpenTimeoutRef.current);
            if (likeHoldTimeoutRef.current != null)
                window.clearTimeout(likeHoldTimeoutRef.current);
            if (suppressLikeContextMenuTimeoutRef.current != null)
                window.clearTimeout(suppressLikeContextMenuTimeoutRef.current);
        },
        [],
    );

    React.useEffect(() => {
        const suppressDelayedContextMenu = (event: MouseEvent) => {
            if (!suppressNextLikeContextMenuRef.current) return;

            event.preventDefault();
            event.stopPropagation();
            suppressNextLikeContextMenuRef.current = false;
            if (suppressLikeContextMenuTimeoutRef.current != null) {
                window.clearTimeout(suppressLikeContextMenuTimeoutRef.current);
                suppressLikeContextMenuTimeoutRef.current = null;
            }
        };

        document.addEventListener("contextmenu", suppressDelayedContextMenu, {
            capture: true,
        });
        return () =>
            document.removeEventListener(
                "contextmenu",
                suppressDelayedContextMenu,
                { capture: true },
            );
    }, []);

    React.useEffect(() => {
        if (replyingTo) commentInputRef.current?.focus();
    }, [replyingTo]);

    React.useEffect(() => {
        if (!deleteActionPhase) return;

        const timeoutID = window.setTimeout(
            () => {
                if (deleteActionPhase == "busy") {
                    setDeleteActionPhase("done");
                    return;
                }

                setDeleteSheetOpen(false);
                onDeletePost?.();
                setIsDeleteExit(true);
            },
            deleteActionPhase == "busy"
                ? socialActionBusyDurationMs
                : socialActionDoneDurationMs,
        );

        return () => window.clearTimeout(timeoutID);
    }, [deleteActionPhase, onDeletePost]);

    const handleDeleteSheetExited = () => {
        if (!isDeleteExit) return;

        setDeleteActionPhase(null);
    };

    React.useEffect(() => {
        if (!isDeleteExit) return;

        const timeoutID = window.setTimeout(onClose, viewerExitDurationMs);
        return () => window.clearTimeout(timeoutID);
    }, [isDeleteExit, onClose]);

    React.useEffect(() => {
        const root = viewerRootRef.current;
        if (!root) return;

        let disposed = false;
        let closedByReact = false;
        let pswp: PhotoSwipe | undefined;

        void import("photoswipe").then(({ default: PhotoSwipeClass }) => {
            if (disposed || !viewerRootRef.current) return;

            pswp = new PhotoSwipeClass({
                allowPanToNext: false,
                appendToEl: viewerRootRef.current,
                arrowKeys: false,
                arrowNext: false,
                arrowPrev: false,
                bgClickAction: false,
                bgOpacity: 1,
                clickToCloseNonZoomable: false,
                close: false,
                closeOnVerticalDrag: false,
                counter: false,
                dataSource: [
                    {
                        alt: photo.alt ?? `${photo.name} post`,
                        height: photo.height ?? defaultPhotoHeight,
                        src: photo.imageUrl,
                        width: photo.width ?? defaultPhotoWidth,
                    },
                ],
                doubleTapAction: "zoom",
                errorMsg: "Unable to preview this photo",
                escKey: false,
                imageClickAction: "zoom",
                index: 0,
                loop: false,
                mainClass: "pswp-social-viewer",
                maxZoomLevel: 4,
                paddingFn: () => ({
                    bottom: viewerBottomPadding,
                    left: 0,
                    right: 0,
                    top: viewerHeaderHeight,
                }),
                pinchToClose: false,
                returnFocus: false,
                secondaryZoomLevel: 2,
                showHideAnimationType: "none",
                spacing: 0,
                tapAction: false,
                trapFocus: false,
                wheelToZoom: true,
                zoom: false,
            });
            pswp.on("close", () => {
                if (!closedByReact) onClose();
            });
            pswp.init();
        });

        return () => {
            disposed = true;
            closedByReact = true;
            pswp?.destroy();
        };
    }, [
        onClose,
        photo.alt,
        photo.height,
        photo.imageUrl,
        photo.name,
        photo.width,
    ]);

    React.useEffect(() => {
        if (typeof document == "undefined") return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    React.useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (deleteSheetOpen) return;
            if (event.key != "Escape") return;

            if (commentContextMenu) {
                closeCommentActions();
                return;
            }
            if (screen == "comments") {
                closeComments();
                return;
            }
            if (screen == "likes") {
                closeLikes();
                return;
            }

            onClose();
        };

        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [closeLikes, commentContextMenu, deleteSheetOpen, onClose, screen]);

    return (
        <Box
            ref={viewerRootRef}
            role="dialog"
            aria-label={`${displayName} photo viewer`}
            aria-modal="true"
            sx={{
                bgcolor: viewerBackground,
                boxSizing: "border-box",
                color: textBase,
                display: "flex",
                flexDirection: "column",
                inset: 0,
                isolation: "isolate",
                maxWidth: "100vw",
                minHeight: "100svh",
                opacity: isDeleteExit ? 0 : 1,
                overflow: "hidden",
                overflowX: "hidden",
                pointerEvents: isDeleteExit ? "none" : "auto",
                position: "fixed",
                transition: `opacity ${viewerExitTransition}`,
                width: "100%",
                zIndex: 1300,
            }}
        >
            <Box
                component="header"
                sx={{
                    alignItems: "center",
                    display: "grid",
                    flexShrink: 0,
                    gap: "12px",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    minHeight: viewerHeaderHeight,
                    position: "relative",
                    px: "16px",
                    width: "100%",
                    zIndex: 2,
                }}
            >
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "10px",
                        minWidth: 0,
                    }}
                >
                    <Box
                        component={onOpenProfile ? "button" : "div"}
                        type={onOpenProfile ? "button" : undefined}
                        aria-label={
                            onOpenProfile
                                ? `Open ${displayName}'s profile`
                                : undefined
                        }
                        onClick={onOpenProfile}
                        sx={{
                            appearance: "none",
                            alignItems: "center",
                            bgcolor: photo.avatarUrl
                                ? "transparent"
                                : paleGreen,
                            border: 0,
                            borderRadius: "50%",
                            color: green,
                            cursor: onOpenProfile ? "pointer" : "default",
                            display: "flex",
                            flexShrink: 0,
                            height: 32,
                            justifyContent: "center",
                            overflow: "hidden",
                            p: 0,
                            width: 32,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                        }}
                    >
                        {photo.avatarUrl ? (
                            <Box
                                component="img"
                                alt=""
                                src={photo.avatarUrl}
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
                                    fontSize: 11,
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
                            alignItems: "baseline",
                            display: "flex",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            fontSize: 14,
                            gap: "4px",
                            lineHeight: "20px",
                            minWidth: 0,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                        }}
                    >
                        <Box
                            component={onOpenProfile ? "button" : "span"}
                            type={onOpenProfile ? "button" : undefined}
                            aria-label={
                                onOpenProfile
                                    ? `Open ${displayName}'s profile`
                                    : undefined
                            }
                            onClick={onOpenProfile}
                            sx={{
                                appearance: "none",
                                bgcolor: "transparent",
                                border: 0,
                                color: "inherit",
                                cursor: onOpenProfile ? "pointer" : "default",
                                fontFamily: "inherit",
                                fontSize: "inherit",
                                fontWeight: 650,
                                lineHeight: "inherit",
                                minWidth: 0,
                                overflow: "hidden",
                                p: 0,
                                textAlign: "left",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                "&:focus-visible": {
                                    borderRadius: "4px",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            {displayName}
                        </Box>
                        <Box
                            component="span"
                            aria-hidden
                            sx={{
                                color: textSecondary,
                                flexShrink: 0,
                                fontWeight: 500,
                            }}
                        >
                            ·
                        </Box>
                        <Box
                            component="time"
                            dateTime={new Date(photo.timestampMs).toISOString()}
                            sx={{
                                color: textTertiary,
                                flexShrink: 0,
                                fontSize: 12,
                                fontWeight: 500,
                            }}
                        >
                            {dateLabel}
                        </Box>
                    </Box>
                </Box>
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        gap: "16px",
                        justifySelf: "flex-end",
                    }}
                >
                    {onDeletePost && (
                        <Box
                            component="button"
                            id={actionsButtonID}
                            type="button"
                            aria-label="Post actions"
                            aria-controls={
                                isActionsOpen ? actionsMenuID : undefined
                            }
                            aria-expanded={isActionsOpen ? "true" : undefined}
                            aria-haspopup="menu"
                            onClick={(event) =>
                                setActionsAnchor(event.currentTarget)
                            }
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                color: controlIcon,
                                cursor: "pointer",
                                display: "flex",
                                height: 32,
                                justifyContent: "center",
                                p: 0,
                                width: 32,
                                "&:focus-visible": {
                                    borderRadius: "50%",
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": { color: textBase },
                            }}
                        >
                            <HugeiconsIcon
                                icon={MoreHorizontalIcon}
                                size={26}
                                strokeWidth={2}
                            />
                        </Box>
                    )}
                    <Box
                        component="button"
                        type="button"
                        aria-label="Close viewer"
                        onClick={onClose}
                        sx={{
                            alignItems: "center",
                            bgcolor: controlBackground,
                            border: 0,
                            borderRadius: "50%",
                            color: controlIcon,
                            cursor: "pointer",
                            display: "flex",
                            height: 28,
                            justifyContent: "center",
                            p: 0,
                            width: 28,
                            "&:focus-visible": {
                                outline: `2px solid ${green}`,
                                outlineOffset: 2,
                            },
                            "&:hover": { bgcolor: controlBackgroundHover },
                        }}
                    >
                        <HugeiconsIcon
                            icon={Cancel01Icon}
                            size={18}
                            strokeWidth={1.8}
                        />
                    </Box>
                </Box>
                {onDeletePost && (
                    <Menu
                        id={actionsMenuID}
                        anchorEl={actionsAnchor}
                        open={isActionsOpen}
                        onClose={closeActions}
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
                                        "0 14px 40px rgba(0, 0, 0, 0.16)",
                                    mt: "6px",
                                    minWidth: 0,
                                    p: "4px",
                                    width: "max-content",
                                },
                            },
                            list: {
                                "aria-labelledby": actionsButtonID,
                                sx: { p: 0 },
                            },
                        }}
                    >
                        <MenuItem
                            disableRipple
                            onClick={requestDeletePost}
                            sx={{
                                alignItems: "center",
                                borderRadius: "10px",
                                color: dangerColor,
                                display: "flex",
                                gap: "8px",
                                minHeight: 38,
                                px: "8px",
                                py: "7px",
                                whiteSpace: "nowrap",
                                "&.Mui-focusVisible": {
                                    bgcolor: "rgba(246, 58, 58, 0.14)",
                                },
                                "&:active": {
                                    bgcolor: "rgba(246, 58, 58, 0.14)",
                                },
                                "&:hover": {
                                    bgcolor: "rgba(246, 58, 58, 0.14)",
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={Delete02Icon}
                                size={18}
                                strokeWidth={1.8}
                                style={{ flexShrink: 0 }}
                            />
                            <Box
                                sx={{
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 13,
                                    fontWeight: 650,
                                    lineHeight: "18px",
                                }}
                            >
                                Delete post
                            </Box>
                        </MenuItem>
                    </Menu>
                )}
            </Box>
            <Box
                sx={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    position: "relative",
                    width: "100%",
                }}
            />
            <Box
                aria-hidden
                sx={{
                    background:
                        "linear-gradient(180deg, rgba(0, 0, 0, 0.32) 0%, rgba(0, 0, 0, 0.13) 58%, rgba(0, 0, 0, 0) 100%)",
                    height: 44,
                    left: 0,
                    pointerEvents: "none",
                    position: "fixed",
                    right: 0,
                    top: 0,
                    zIndex: 1,
                }}
            />
            <Box
                aria-hidden
                sx={{
                    background:
                        "linear-gradient(0deg, rgba(0, 0, 0, 0.34) 0%, rgba(0, 0, 0, 0.14) 58%, rgba(0, 0, 0, 0) 100%)",
                    bottom: 0,
                    height: 52,
                    left: 0,
                    pointerEvents: "none",
                    position: "fixed",
                    right: 0,
                    zIndex: 1,
                }}
            />
            <Box
                sx={{
                    bottom: "16px",
                    display: "flex",
                    gap: "10px",
                    position: "fixed",
                    right: "16px",
                    zIndex: 2,
                }}
            >
                <Box
                    sx={{ height: 48, position: "relative", width: 48 }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label={
                            isPhotoLiked ? "Unlike photo" : "Like photo"
                        }
                        aria-pressed={isPhotoLiked}
                        onClick={handlePhotoLikeClick}
                        onContextMenuCapture={handlePhotoLikeContextMenu}
                        onPointerCancel={clearLikeHoldTimeout}
                        onPointerDown={startPhotoLikeHold}
                        onPointerLeave={clearLikeHoldTimeout}
                        onPointerMove={cancelPhotoLikeHoldOnMove}
                        onPointerUp={clearLikeHoldTimeout}
                        sx={{
                            ...viewerActionButtonSx,
                            touchAction: "manipulation",
                            userSelect: "none",
                            WebkitTouchCallout: "none",
                            WebkitUserSelect: "none",
                        }}
                    >
                        <HugeiconsIcon
                            fill={isPhotoLiked ? green : "none"}
                            icon={FavouriteIcon}
                            primaryColor={isPhotoLiked ? green : undefined}
                            size={26}
                            strokeWidth={1.8}
                        />
                    </Box>
                    {likeCount > 0 && (
                        <Box
                            component="button"
                            type="button"
                            aria-label={`View ${likeCountLabel}`}
                            onClick={handleLikeCountClick}
                            sx={{
                                ...viewerCountBadgeSx,
                                cursor: "pointer",
                                p: 0,
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                            }}
                        >
                            {likeCount}
                        </Box>
                    )}
                </Box>
                <Box
                    component="button"
                    type="button"
                    aria-label={commentButtonLabel}
                    onClick={openComments}
                    sx={{
                        ...viewerActionButtonSx,
                        position: "relative",
                        transform: isCommentButtonPopping
                            ? "scale(0.96)"
                            : "scale(1)",
                    }}
                >
                    <HugeiconsIcon
                        icon={Comment01Icon}
                        size={26}
                        strokeWidth={1.8}
                    />
                    {commentCount > 0 && (
                        <Box
                            aria-hidden
                            sx={viewerCountBadgeSx}
                        >
                            {commentCount}
                        </Box>
                    )}
                </Box>
            </Box>
            {screen == "likes" && (
                <Box
                    sx={{
                        bgcolor: commentsBackground,
                        boxSizing: "border-box",
                        color: textBase,
                        display: "flex",
                        flexDirection: "column",
                        inset: 0,
                        maxWidth: "100vw",
                        overflow: "hidden",
                        overflowX: "hidden",
                        position: "fixed",
                        width: "100%",
                        zIndex: 3,
                    }}
                >
                    <Box
                        component="header"
                        sx={{
                            alignItems: "center",
                            boxSizing: "border-box",
                            display: "grid",
                            flexShrink: 0,
                            gridTemplateColumns: "1fr 40px",
                            minHeight: 56,
                            px: "16px",
                            width: "100%",
                        }}
                    >
                        <Box
                            component="h1"
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 16,
                                fontWeight: 750,
                                lineHeight: "20px",
                                m: 0,
                            }}
                        >
                            {likeCount} {likeCount == 1 ? "like" : "likes"}
                        </Box>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Close likes"
                            onClick={closeLikes}
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                borderRadius: "50%",
                                color: controlIcon,
                                cursor: "pointer",
                                display: "flex",
                                height: 28,
                                justifyContent: "center",
                                justifySelf: "flex-end",
                                p: 0,
                                width: 28,
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": {
                                    bgcolor: "transparent",
                                    color: textBase,
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={18}
                                strokeWidth={1.8}
                            />
                        </Box>
                    </Box>
                    <Box
                        component="ul"
                        sx={{
                            boxSizing: "border-box",
                            flex: "1 1 auto",
                            listStyle: "none",
                            m: 0,
                            maxWidth: "100%",
                            minHeight: 0,
                            overflowX: "hidden",
                            overflowY: "auto",
                            p: "14px 16px 18px",
                            width: "100%",
                        }}
                    >
                        {photoLikers.length == 0 ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    color: commentsMuted,
                                    display: "flex",
                                    flex: "1 1 auto",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    justifyContent: "center",
                                    lineHeight: "20px",
                                    minHeight: "100%",
                                }}
                            >
                                No likes yet
                            </Box>
                        ) : (
                            photoLikers.map((liker) => (
                                <Box
                                    component="li"
                                    key={liker.id}
                                    sx={{
                                        alignItems: "center",
                                        borderRadius: "12px",
                                        boxSizing: "border-box",
                                        display: "flex",
                                        gap: "12px",
                                        minHeight: 52,
                                        px: "2px",
                                        py: "8px",
                                        width: "100%",
                                    }}
                                >
                                    <SocialAvatar
                                        avatarUrl={liker.avatarUrl}
                                        name={liker.name}
                                        size={36}
                                    />
                                    <Box
                                        sx={{
                                            color: textBase,
                                            flex: "1 1 auto",
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            fontSize: 14,
                                            fontWeight: 650,
                                            lineHeight: "20px",
                                            minWidth: 0,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {liker.name}
                                    </Box>
                                    <Box
                                        aria-hidden
                                        sx={{
                                            alignItems: "center",
                                            display: "flex",
                                            flexShrink: 0,
                                            justifyContent: "center",
                                        }}
                                    >
                                        <HeartFilledIcon />
                                    </Box>
                                </Box>
                            ))
                        )}
                    </Box>
                </Box>
            )}
            {screen == "comments" && (
                <Box
                    sx={{
                        bgcolor: commentsBackground,
                        boxSizing: "border-box",
                        color: textBase,
                        display: "flex",
                        flexDirection: "column",
                        inset: 0,
                        maxWidth: "100vw",
                        overflow: "hidden",
                        overflowX: "hidden",
                        position: "fixed",
                        width: "100%",
                        zIndex: 3,
                    }}
                >
                    {commentContextMenu && (
                        <Box
                            aria-hidden
                            onClick={closeCommentActions}
                            sx={{
                                bgcolor: "rgba(0, 0, 0, 0.6)",
                                inset: 0,
                                position: "absolute",
                                zIndex: 1,
                            }}
                        />
                    )}
                    <Box
                        component="header"
                        sx={{
                            alignItems: "center",
                            boxSizing: "border-box",
                            display: "grid",
                            flexShrink: 0,
                            gridTemplateColumns: "1fr 40px",
                            minHeight: 56,
                            px: "16px",
                            width: "100%",
                        }}
                    >
                        <Box
                            component="h1"
                            sx={{
                                color: textBase,
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 16,
                                fontWeight: 750,
                                lineHeight: "20px",
                                m: 0,
                            }}
                        >
                            {commentCount}{" "}
                            {commentCount == 1 ? "comment" : "comments"}
                        </Box>
                        <Box
                            component="button"
                            type="button"
                            aria-label="Close comments"
                            onClick={closeComments}
                            sx={{
                                alignItems: "center",
                                bgcolor: "transparent",
                                border: 0,
                                borderRadius: "50%",
                                color: controlIcon,
                                cursor: "pointer",
                                display: "flex",
                                height: 28,
                                justifyContent: "center",
                                justifySelf: "flex-end",
                                p: 0,
                                width: 28,
                                "&:focus-visible": {
                                    outline: `2px solid ${green}`,
                                    outlineOffset: 2,
                                },
                                "&:hover": {
                                    bgcolor: "transparent",
                                    color: textBase,
                                },
                            }}
                        >
                            <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={18}
                                strokeWidth={1.8}
                            />
                        </Box>
                    </Box>
                    <Box
                        component="ol"
                        ref={commentsContainerRef}
                        sx={{
                            boxSizing: "border-box",
                            display: "flex",
                            flex: "1 1 auto",
                            flexDirection: "column-reverse",
                            m: 0,
                            maxWidth: "100%",
                            minHeight: 0,
                            overflowX: "hidden",
                            overflowY: "auto",
                            p: "14px 16px 18px",
                            width: "100%",
                        }}
                    >
                        {sortedVisibleComments.length == 0 ? (
                            <Box
                                sx={{
                                    alignItems: "center",
                                    color: commentsMuted,
                                    display: "flex",
                                    flex: "1 1 auto",
                                    fontFamily:
                                        '"Inter Variable", Inter, sans-serif',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    justifyContent: "center",
                                    lineHeight: "20px",
                                    minHeight: 0,
                                }}
                            >
                                No comments yet
                            </Box>
                        ) : (
                            sortedVisibleComments.map((comment, index) => {
                                const prevComment =
                                    sortedVisibleComments[index + 1];
                                const nextComment =
                                    sortedVisibleComments[index - 1];
                                const isSameSequenceAsPrev =
                                    prevComment &&
                                    sameCommentAuthor(prevComment, comment) &&
                                    comment.createdAtMicros -
                                        prevComment.createdAtMicros <=
                                        commentGroupTimeThresholdMicros;
                                const isSameSequenceAsNext =
                                    nextComment &&
                                    sameCommentAuthor(nextComment, comment) &&
                                    nextComment.createdAtMicros -
                                        comment.createdAtMicros <=
                                        commentGroupTimeThresholdMicros;
                                const isFirstInSequence = !isSameSequenceAsPrev;
                                const isLastInSequence = !isSameSequenceAsNext;

                                return (
                                    <CommentItem
                                        key={comment.id}
                                        comment={comment}
                                        isHighlighted={
                                            commentContextMenu?.comment.id ==
                                            comment.id
                                        }
                                        isLastInSequence={isLastInSequence}
                                        isLiked={likedCommentIDs.has(
                                            comment.id,
                                        )}
                                        onOpenActions={openCommentActions}
                                        parentComment={getParentComment(
                                            comment.parentCommentID,
                                            comments,
                                        )}
                                        showHeader={
                                            isFirstInSequence &&
                                            !comment.isOwner
                                        }
                                        showOwnTimestamp={
                                            isFirstInSequence &&
                                            Boolean(comment.isOwner)
                                        }
                                    />
                                );
                            })
                        )}
                    </Box>
                    <Menu
                        anchorEl={commentContextMenu?.anchorEl}
                        open={Boolean(commentContextMenu)}
                        onClose={closeCommentActions}
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
                            onClick={() => handleCommentAction("like")}
                            sx={{
                                borderRadius: "12px",
                                color: textBase,
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
                                {isContextCommentLiked ? "Unlike" : "Like"}
                            </Box>
                        </MenuItem>
                        <MenuItem
                            disableRipple
                            onClick={() => handleCommentAction("reply")}
                            sx={{
                                borderRadius: "12px",
                                color: textBase,
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
                        {commentContextMenu?.comment.isOwner && (
                            <MenuItem
                                disableRipple
                                onClick={() => handleCommentAction("delete")}
                                sx={{
                                    borderRadius: "12px",
                                    color: dangerColor,
                                    gap: "8px",
                                    minHeight: 38,
                                    px: "8px",
                                    py: "7px",
                                    "&:hover": {
                                        bgcolor: "rgba(246, 58, 58, 0.14)",
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
                            bgcolor: commentsBackground,
                            boxSizing: "border-box",
                            flexShrink: 0,
                            maxWidth: "100%",
                            p: "18px 14px max(12px, env(safe-area-inset-bottom))",
                            width: "100%",
                        }}
                    >
                        {replyingTo && (
                            <Box
                                sx={{
                                    bgcolor: "rgba(255, 255, 255, 0.08)",
                                    borderLeft: "3px solid #8C8C8C",
                                    borderRadius: "12px",
                                    boxSizing: "border-box",
                                    display: "grid",
                                    gap: "8px",
                                    gridTemplateColumns: "minmax(0, 1fr) 24px",
                                    mb: "10px",
                                    p: "9px 8px 9px 12px",
                                    width: "100%",
                                }}
                            >
                                <Box sx={{ minWidth: 0 }}>
                                    <Box
                                        sx={{
                                            color: commentsTimestamp,
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            fontSize: 12,
                                            fontWeight: 650,
                                            lineHeight: "16px",
                                        }}
                                    >
                                        Replying to{" "}
                                        {replyingTo.isOwner
                                            ? "yourself"
                                            : firstNameFrom(replyingTo.author)}
                                    </Box>
                                    <Box
                                        sx={{
                                            color: textBase,
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
                                        {truncateCommentText(replyingTo.text)}
                                    </Box>
                                </Box>
                                <Box
                                    component="button"
                                    type="button"
                                    aria-label="Cancel reply"
                                    onClick={() => {
                                        setReplyingTo(null);
                                        commentInputRef.current?.focus();
                                    }}
                                    sx={{
                                        alignItems: "center",
                                        bgcolor: "transparent",
                                        border: 0,
                                        borderRadius: "50%",
                                        color: controlIcon,
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
                                        "&:hover": { color: textBase },
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
                                bgcolor: commentsSurface,
                                borderRadius: "24px",
                                boxSizing: "border-box",
                                maxWidth: "100%",
                                minWidth: 0,
                                position: "relative",
                                width: "100%",
                            }}
                        >
                            <Box
                                sx={{
                                    alignItems: "center",
                                    boxSizing: "border-box",
                                    display: "flex",
                                    maxHeight: 300,
                                    minHeight: 40,
                                    overflow: "auto",
                                    p: "1px 54px 3px 16px",
                                    width: "100%",
                                    "&::-webkit-scrollbar": { width: "8px" },
                                    "&::-webkit-scrollbar-track": {
                                        background: "transparent",
                                    },
                                    "&::-webkit-scrollbar-thumb": {
                                        background: "rgba(255, 255, 255, 0.3)",
                                        borderRadius: "4px",
                                    },
                                    "&::-webkit-scrollbar-thumb:hover": {
                                        background: "rgba(255, 255, 255, 0.5)",
                                    },
                                    scrollbarColor:
                                        "rgba(255, 255, 255, 0.3) transparent",
                                    scrollbarWidth: "thin",
                                }}
                            >
                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={1}
                                    variant="standard"
                                    placeholder="Add a comment..."
                                    value={commentText}
                                    onChange={(event) =>
                                        setCommentText(event.target.value)
                                    }
                                    onKeyDown={handleCommentKeyDown}
                                    onClick={(event) => event.stopPropagation()}
                                    inputRef={commentInputRef}
                                    slotProps={{
                                        htmlInput: { maxLength: 280 },
                                    }}
                                    sx={{
                                        "& .MuiInput-root": {
                                            fontFamily:
                                                '"Inter Variable", Inter, sans-serif',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            lineHeight: "21px",
                                            "&::before, &::after": {
                                                display: "none",
                                            },
                                        },
                                        "& .MuiInputBase-input": {
                                            color: textBase,
                                            font: "inherit",
                                            lineHeight: "21px",
                                            p: 0,
                                            "&::placeholder": {
                                                color: commentsMuted,
                                                opacity: 1,
                                            },
                                        },
                                    }}
                                />
                            </Box>
                            <Box
                                component="button"
                                type="button"
                                aria-label="Send comment"
                                disabled={!canSendComment}
                                onClick={sendComment}
                                sx={{
                                    alignItems: "center",
                                    bgcolor: canSendComment
                                        ? "#FFFFFF"
                                        : commentsSurfaceHover,
                                    border: 0,
                                    borderRadius: "50%",
                                    color: canSendComment
                                        ? "#3A3A3A"
                                        : controlIcon,
                                    cursor: canSendComment
                                        ? "pointer"
                                        : "default",
                                    display: "flex",
                                    height: 32,
                                    justifyContent: "center",
                                    opacity: canSendComment ? 1 : 0.42,
                                    p: 0,
                                    position: "absolute",
                                    right: 8,
                                    bottom: 7,
                                    transition:
                                        "background-color 180ms ease, color 180ms ease, opacity 180ms ease, transform 120ms ease",
                                    width: 32,
                                    "&:active": {
                                        transform: canSendComment
                                            ? "scale(0.96)"
                                            : "none",
                                    },
                                    "&:focus-visible": {
                                        outline: `2px solid ${green}`,
                                        outlineOffset: 2,
                                    },
                                    "&:hover": {
                                        bgcolor: canSendComment
                                            ? "#F2F2F2"
                                            : "rgba(255, 255, 255, 0.14)",
                                    },
                                }}
                            >
                                <Box
                                    component="span"
                                    sx={{
                                        display: "flex",
                                        transform: "translate(-1px, 1px)",
                                    }}
                                >
                                    <HugeiconsIcon
                                        icon={Navigation03Icon}
                                        size={16}
                                        strokeWidth={1.8}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            )}
            {onDeletePost && (
                <ConfirmationActionSheet
                    appearance="dark"
                    open={deleteSheetOpen}
                    title="Are you sure you want to delete this?"
                    confirmLabel="Yes, delete"
                    confirmActionPhase={deleteActionPhase}
                    confirmDisabled={isDeleteActionRunning}
                    cancelDisabled={isDeleteActionRunning}
                    onCancel={closeDeleteSheet}
                    onConfirm={confirmDeletePost}
                    onExited={handleDeleteSheetExited}
                />
            )}
        </Box>
    );
};
