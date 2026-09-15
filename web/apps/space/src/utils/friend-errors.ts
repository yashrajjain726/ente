import { isNamedError } from "ente-base/error";
import {
    maximumSpaceFriendCount,
    spaceFriendLimitMessage,
} from "./friend-limits";

export const isSpaceFriendLimitError = (error: unknown) =>
    isNamedError(error, "friend_limit_reached") ||
    isNamedError(error, "other_friend_limit_reached");

export const spaceFriendLimitErrorMessage = (
    error: unknown,
    username: string | undefined,
) => {
    if (isNamedError(error, "other_friend_limit_reached")) {
        return `${username ? `@${username} has` : "They've"} filled all ${maximumSpaceFriendCount} friend spots.`;
    }
    if (isNamedError(error, "friend_limit_reached"))
        return spaceFriendLimitMessage;
    return undefined;
};

export const isFriendRequestCanceledError = (error: unknown) =>
    isNamedError(error, "friend_request_unavailable");

export const friendRequestErrorMessage = (error: unknown, username: string) => {
    const limitMessage = spaceFriendLimitErrorMessage(error, username);
    if (limitMessage) return limitMessage;
    if (isNamedError(error, "profile_not_found")) {
        return `No Space profile found for @${username}.`;
    }
    if (isNamedError(error, "self_friendship")) {
        return "You can't add yourself as a friend.";
    }
    if (isNamedError(error, "friend_request_limit_reached")) {
        return `@${username} can't receive more friend requests right now.`;
    }
    return "Couldn't send the friend request. Please try again.";
};
