import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import React from "react";
import { MessagesScreen, messagesBackground } from "screens/MessagesScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import {
    confirmCurrentFriendRequest,
    createCurrentProfileLink,
    deleteCurrentFriendRequest,
    deleteCurrentMessage,
    loadCurrentFriendRequests,
    loadCurrentMessageConversations,
    loadCurrentMessageThread,
    loadCurrentSpaceFriends,
    loadCurrentSpaceProfile,
    markCurrentMessagesRead,
    replyToCurrentMessage,
    sendCurrentMessage,
    setCurrentMessageLiked,
    type SpaceFriendRequest,
    type SpaceMessage,
    type SpaceMessageConversation,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";
import { useSpaceRouter } from "utils/spaceRouteTransitions";

interface SpaceMessagesPageProps {
    selectedSpaceId?: string;
}

const friendSpaceId = (friend: SpaceMessageConversation["friend"]) =>
    friend.spaceId ?? friend.id;

const conversationId = (conversation: SpaceMessageConversation) =>
    conversation.latestActivity.type == "friend_request"
        ? conversation.latestActivity.id
        : friendSpaceId(conversation.friend);

const friendRequestActivityId = (requestId: number) =>
    `friend_request:${requestId}`;

const friendRequestIdFromConversation = (
    conversation: SpaceMessageConversation,
) => Number(conversation.latestActivity.id.split(":")[1]);

const isFriendRequestConversation = (conversation: SpaceMessageConversation) =>
    conversation.latestActivity.type == "friend_request";

const conversationFromFriendRequest = ({
    createdAtMs,
    requester,
    requestId,
}: SpaceFriendRequest): SpaceMessageConversation => ({
    friend: requester,
    latestActivity: {
        createdAtMs,
        id: friendRequestActivityId(requestId),
        outgoing: false,
        type: "friend_request",
    },
    notificationUnread: true,
    unread: true,
    unreadCount: 1,
});

let nextLocalMessageID = 0;

const localMessageIdPrefix = "space-local-message-";

const createLocalMessageID = () =>
    `${localMessageIdPrefix}${Date.now()}-${nextLocalMessageID++}`;

const placeholderFriend = (
    spaceId: string,
): SpaceMessageConversation["friend"] => ({
    avatarUrl: null,
    friendsCount: 0,
    fullName: "",
    id: spaceId,
    spaceId,
    username: "",
});

const currentProfileMessageActor = (
    profile: SetupProfile,
): SpaceMessage["sender"] => ({
    avatarObjectKey: profile.avatarObjectKey,
    avatarUpdatedAt: profile.avatarUpdatedAt,
    avatarUrl: profile.avatarUrl,
    friendsCount: 0,
    fullName: profile.fullName,
    id: profile.spaceId ?? profile.username,
    spaceId: profile.spaceId,
    spaceSlug: profile.spaceSlug,
    username: profile.username,
});

const createLocalMessage = ({
    profile,
    recipient,
    replyMessageId,
    text,
}: {
    profile: SetupProfile;
    recipient: SpaceMessageConversation["friend"];
    replyMessageId?: string;
    text: string;
}): SpaceMessage => {
    const createdAtMs = Date.now();
    return {
        createdAtMs,
        id: createLocalMessageID(),
        isDeleted: false,
        kind: "regular",
        likeCount: 0,
        recipient,
        replyMessageId,
        sender: currentProfileMessageActor(profile),
        text,
        updatedAtMs: createdAtMs,
        viewerLiked: false,
    };
};

export const SpaceMessagesPage: React.FC<SpaceMessagesPageProps> = ({
    selectedSpaceId,
}) => {
    const router = useSpaceRouter();
    const {
        friends,
        profile,
        profileLoadError,
        profileLoadStatus,
        setFriends,
    } = useSpaceAppState();
    const [conversations, setConversations] = React.useState<
        SpaceMessageConversation[]
    >([]);
    const [isConversationsLoading, setIsConversationsLoading] =
        React.useState(true);
    const [isFriendsLoading, setIsFriendsLoading] = React.useState(true);
    const [isThreadLoading, setIsThreadLoading] = React.useState(false);
    const [messages, setMessages] = React.useState<SpaceMessage[]>([]);
    const [selectedFriendProfile, setSelectedFriendProfile] =
        React.useState<SpaceMessageConversation["friend"]>();
    const [
        selectedFriendProfileLoadFailedSpaceId,
        setSelectedFriendProfileLoadFailedSpaceId,
    ] = React.useState<string>();
    const [newConversationIds, setNewConversationIds] = React.useState<
        string[]
    >([]);
    const selectedFriendSpaceIdRef = React.useRef<string | undefined>(
        undefined,
    );
    const markedReadSpaceIdRef = React.useRef<string | undefined>(undefined);
    const selectedConversation = React.useMemo(
        () =>
            selectedSpaceId
                ? conversations.find(
                      (conversation) =>
                          conversationId(conversation) == selectedSpaceId,
                  )
                : undefined,
        [conversations, selectedSpaceId],
    );
    const selectedFriendFromFriends = React.useMemo(
        () =>
            selectedSpaceId
                ? friends.find(
                      (friend) => friendSpaceId(friend) == selectedSpaceId,
                  )
                : undefined,
        [friends, selectedSpaceId],
    );
    const selectedLoadedFriendProfile =
        selectedFriendProfile &&
        friendSpaceId(selectedFriendProfile) == selectedSpaceId
            ? selectedFriendProfile
            : undefined;
    const selectedFriendPlaceholder = React.useMemo(
        () =>
            selectedSpaceId ? placeholderFriend(selectedSpaceId) : undefined,
        [selectedSpaceId],
    );
    const selectedFriend =
        selectedConversation?.friend ??
        selectedFriendFromFriends ??
        selectedLoadedFriendProfile ??
        selectedFriendPlaceholder;
    const selectedFriendSpaceId = selectedFriend
        ? friendSpaceId(selectedFriend)
        : undefined;
    const selectedFriendSpaceSlug = selectedFriend?.spaceSlug;
    const selectedFriendUsername = selectedFriend?.username;
    const isSelectedFriendCurrent = Boolean(
        selectedFriendSpaceId &&
            friends.some((friend) => {
                const currentFriendSpaceId = friendSpaceId(friend);
                return (
                    currentFriendSpaceId == selectedFriendSpaceId ||
                    (selectedFriendSpaceSlug &&
                        friend.spaceSlug == selectedFriendSpaceSlug) ||
                    friend.username == selectedFriendUsername
                );
            }),
    );
    const isThreadReadOnly =
        Boolean(selectedFriend) && !isSelectedFriendCurrent;

    const markConversationRead = React.useCallback((spaceId: string) => {
        setNewConversationIds((currentIds) =>
            currentIds.filter((id) => id != spaceId),
        );
        setConversations((currentConversations) => {
            return currentConversations.map((conversation) =>
                conversationId(conversation) == spaceId
                    ? {
                          ...conversation,
                          notificationUnread: false,
                          unread: false,
                          unreadCount: 0,
                      }
                    : conversation,
            );
        });
        void markCurrentMessagesRead(spaceId).catch((error: unknown) =>
            console.warn("Failed to mark message conversation read", error),
        );
    }, []);

    const refreshConversations = React.useCallback(async () => {
        setIsConversationsLoading(true);
        try {
            const [page, requests] = await Promise.all([
                loadCurrentMessageConversations(),
                loadCurrentFriendRequests(),
            ]);
            const items = [
                ...requests.map(conversationFromFriendRequest),
                ...page.items,
            ].sort(
                (left, right) =>
                    right.latestActivity.createdAtMs -
                    left.latestActivity.createdAtMs,
            );
            const unreadConversationIds = items
                .filter((conversation) => conversation.notificationUnread)
                .map(conversationId);
            const passiveUnreadConversationIds = page.items
                .filter(
                    (conversation) =>
                        conversation.notificationUnread && !conversation.unread,
                )
                .map(conversationId);
            setNewConversationIds(unreadConversationIds);
            setConversations(items);
            if (passiveUnreadConversationIds.length > 0) {
                void Promise.all(
                    passiveUnreadConversationIds.map((spaceId) =>
                        markCurrentMessagesRead(spaceId),
                    ),
                ).catch((error: unknown) =>
                    console.warn(
                        "Failed to mark passive message activity read",
                        error,
                    ),
                );
            }
            return true;
        } catch (error: unknown) {
            console.error("Failed to load message conversations", error);
            return false;
        } finally {
            setIsConversationsLoading(false);
        }
    }, []);

    const openConversation = React.useCallback(
        (conversation: SpaceMessageConversation) => {
            if (isFriendRequestConversation(conversation)) return;
            void router.push(spaceRoutes.message(conversationId(conversation)));
        },
        [router],
    );

    const confirmFriendRequest = React.useCallback(
        async (conversation: SpaceMessageConversation) => {
            await confirmCurrentFriendRequest(
                friendRequestIdFromConversation(conversation),
            );
            window.location.reload();
        },
        [],
    );

    const deleteFriendRequest = React.useCallback(
        async (conversation: SpaceMessageConversation) => {
            await deleteCurrentFriendRequest(
                friendRequestIdFromConversation(conversation),
            );
            void refreshConversations();
        },
        [refreshConversations],
    );

    const closeConversation = React.useCallback(() => {
        if (selectedSpaceId) void router.push(spaceRoutes.messages);
    }, [router, selectedSpaceId]);

    const appendMessageIfThreadIsCurrent = React.useCallback(
        (spaceId: string, message: SpaceMessage) => {
            if (selectedFriendSpaceIdRef.current != spaceId) return;
            setMessages((currentMessages) => [...currentMessages, message]);
        },
        [],
    );

    const replaceMessageIfThreadIsCurrent = React.useCallback(
        (spaceId: string, localMessageId: string, message: SpaceMessage) => {
            if (selectedFriendSpaceIdRef.current != spaceId) return;
            setMessages((currentMessages) => {
                const hasConfirmedMessage = currentMessages.some(
                    (currentMessage) => currentMessage.id == message.id,
                );
                if (hasConfirmedMessage) {
                    return currentMessages
                        .filter(
                            (currentMessage) =>
                                currentMessage.id != localMessageId,
                        )
                        .map((currentMessage) =>
                            currentMessage.id == message.id
                                ? message
                                : currentMessage,
                        );
                }

                const hasLocalMessage = currentMessages.some(
                    (currentMessage) => currentMessage.id == localMessageId,
                );
                if (!hasLocalMessage) return [...currentMessages, message];

                return currentMessages.map((currentMessage) =>
                    currentMessage.id == localMessageId
                        ? message
                        : currentMessage,
                );
            });
        },
        [],
    );

    const removeMessageIfThreadIsCurrent = React.useCallback(
        (spaceId: string, messageId: string) => {
            if (selectedFriendSpaceIdRef.current != spaceId) return;
            setMessages((currentMessages) =>
                currentMessages.filter((message) => message.id != messageId),
            );
        },
        [],
    );

    React.useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(spaceRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    React.useEffect(() => {
        if (!profile) return;
        void refreshConversations();
    }, [profile, refreshConversations]);

    React.useEffect(() => {
        if (!profile?.spaceId) {
            setIsFriendsLoading(false);
            return;
        }

        let cancelled = false;
        setIsFriendsLoading(true);
        void loadCurrentSpaceFriends(profile.spaceId)
            .then((nextFriends) => {
                if (!cancelled) setFriends(nextFriends);
            })
            .catch((error: unknown) =>
                console.error("Failed to load space friends", error),
            )
            .finally(() => {
                if (!cancelled) setIsFriendsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [profile?.spaceId, setFriends]);

    React.useEffect(() => {
        if (!selectedSpaceId || !selectedConversation) return;
        if (markedReadSpaceIdRef.current == selectedSpaceId) return;

        markedReadSpaceIdRef.current = selectedSpaceId;
        markConversationRead(selectedSpaceId);
    }, [markConversationRead, selectedConversation, selectedSpaceId]);

    const shouldLoadSelectedFriendProfile = Boolean(
        selectedSpaceId &&
            !isConversationsLoading &&
            !isFriendsLoading &&
            !selectedConversation &&
            !selectedFriendFromFriends,
    );

    React.useEffect(() => {
        setSelectedFriendProfile(undefined);
        setSelectedFriendProfileLoadFailedSpaceId(undefined);

        if (!selectedSpaceId || !shouldLoadSelectedFriendProfile) return;

        let cancelled = false;
        void loadCurrentSpaceProfile(selectedSpaceId)
            .then((friend) => {
                if (!cancelled) setSelectedFriendProfile(friend);
            })
            .catch((error: unknown) => {
                console.error("Failed to load selected space profile", error);
                if (!cancelled) {
                    setSelectedFriendProfileLoadFailedSpaceId(selectedSpaceId);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [selectedSpaceId, shouldLoadSelectedFriendProfile]);

    React.useEffect(() => {
        if (
            !selectedSpaceId ||
            isConversationsLoading ||
            isFriendsLoading ||
            selectedConversation ||
            selectedFriendFromFriends ||
            selectedLoadedFriendProfile ||
            (shouldLoadSelectedFriendProfile &&
                selectedFriendProfileLoadFailedSpaceId != selectedSpaceId)
        ) {
            return;
        }

        void router.replace(spaceRoutes.messages);
    }, [
        isConversationsLoading,
        isFriendsLoading,
        router,
        selectedConversation,
        selectedFriendFromFriends,
        selectedFriendProfileLoadFailedSpaceId,
        selectedLoadedFriendProfile,
        selectedSpaceId,
        shouldLoadSelectedFriendProfile,
    ]);

    React.useEffect(() => {
        markedReadSpaceIdRef.current = undefined;

        if (!selectedSpaceId) {
            selectedFriendSpaceIdRef.current = undefined;
            setMessages([]);
            setIsThreadLoading(false);
            return;
        }

        let cancelled = false;
        selectedFriendSpaceIdRef.current = selectedSpaceId;
        setMessages([]);
        setIsThreadLoading(true);
        void loadCurrentMessageThread(selectedSpaceId)
            .then((page) => {
                if (!cancelled) {
                    const loadedMessageIds = new Set(
                        page.items.map((message) => message.id),
                    );
                    setMessages((currentMessages) => [
                        ...page.items,
                        ...currentMessages.filter(
                            (message) => !loadedMessageIds.has(message.id),
                        ),
                    ]);
                }
            })
            .catch((error: unknown) =>
                console.error("Failed to load message thread", error),
            )
            .finally(() => {
                if (!cancelled) setIsThreadLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedSpaceId]);

    if (profileLoadStatus != "ready" || !profile) {
        return (
            <SpaceRouteFallback
                background={messagesBackground}
                message={profileLoadError}
            />
        );
    }

    return (
        <>
            <SpacePageMeta themeColor={messagesBackground} />
            <MessagesScreen
                conversations={conversations}
                friendsCount={friends.length}
                isConversationsLoading={isConversationsLoading}
                isThreadLoading={isThreadLoading}
                isThreadReadOnly={isThreadReadOnly}
                messages={messages}
                newConversationIds={newConversationIds}
                onBack={() => void router.push(spaceRoutes.home)}
                onCloseThread={closeConversation}
                onConfirmFriendRequest={confirmFriendRequest}
                onDeleteFriendRequest={deleteFriendRequest}
                onOpenSelectedFriendProfile={(friend) =>
                    void router.push(spaceRoutes.friend(friendSpaceId(friend)))
                }
                onOpenQuotePost={(quote) =>
                    void router.push(
                        spaceRoutes.post(quote.spaceId, quote.postId),
                    )
                }
                onOpenThread={openConversation}
                onSendMessage={async (spaceId, text) => {
                    const optimisticMessage = createLocalMessage({
                        profile,
                        recipient: selectedFriend ?? placeholderFriend(spaceId),
                        text,
                    });
                    appendMessageIfThreadIsCurrent(spaceId, optimisticMessage);
                    try {
                        const message = await sendCurrentMessage(spaceId, text);
                        replaceMessageIfThreadIsCurrent(
                            spaceId,
                            optimisticMessage.id,
                            message,
                        );
                    } catch (error) {
                        removeMessageIfThreadIsCurrent(
                            spaceId,
                            optimisticMessage.id,
                        );
                        throw error;
                    }
                    void refreshConversations();
                }}
                onReplyToMessage={async (spaceId, messageId, text) => {
                    const optimisticMessage = createLocalMessage({
                        profile,
                        recipient: selectedFriend ?? placeholderFriend(spaceId),
                        replyMessageId: messageId,
                        text,
                    });
                    appendMessageIfThreadIsCurrent(spaceId, optimisticMessage);
                    try {
                        const message = await replyToCurrentMessage(
                            spaceId,
                            messageId,
                            text,
                        );
                        replaceMessageIfThreadIsCurrent(
                            spaceId,
                            optimisticMessage.id,
                            message,
                        );
                    } catch (error) {
                        removeMessageIfThreadIsCurrent(
                            spaceId,
                            optimisticMessage.id,
                        );
                        throw error;
                    }
                    void refreshConversations();
                }}
                onSetMessageLiked={async (messageId, liked) => {
                    await setCurrentMessageLiked(messageId, liked);
                    setMessages((currentMessages) =>
                        currentMessages.map((message) =>
                            message.id == messageId
                                ? {
                                      ...message,
                                      likeCount: Math.max(
                                          0,
                                          message.likeCount + (liked ? 1 : -1),
                                      ),
                                      viewerLiked: liked,
                                  }
                                : message,
                        ),
                    );
                    void refreshConversations();
                }}
                onShareProfileLink={async () => {
                    if (!profile.spaceId) throw new Error("Missing space.");
                    return (await createCurrentProfileLink(profile.spaceId))
                        .url;
                }}
                onDeleteMessage={async (messageId) => {
                    await deleteCurrentMessage(messageId);
                    setMessages((currentMessages) =>
                        currentMessages.filter(
                            (message) => message.id != messageId,
                        ),
                    );
                    void refreshConversations();
                }}
                profile={profile}
                selectedFriend={selectedFriend}
            />
        </>
    );
};
