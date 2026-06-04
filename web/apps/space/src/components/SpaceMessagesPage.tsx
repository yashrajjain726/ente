import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React from "react";
import { MessagesScreen, messagesBackground } from "screens/MessagesScreen";
import type { SetupProfile } from "screens/SetupProfileScreen";
import {
    createCurrentProfileLink,
    deleteCurrentMessage,
    loadCurrentMessageConversations,
    loadCurrentMessageThread,
    loadCurrentSpaceFriends,
    markCurrentMessagesRead,
    replyToCurrentMessage,
    sendCurrentMessage,
    setCurrentMessageLiked,
    type SpaceMessage,
    type SpaceMessageConversation,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

interface SpaceMessagesPageProps {
    selectedSpaceId?: string;
}

const friendSpaceId = (friend: SpaceMessageConversation["friend"]) =>
    friend.spaceId ?? friend.id;

const conversationId = (conversation: SpaceMessageConversation) =>
    friendSpaceId(conversation.friend);

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
    const router = useRouter();
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
    const [isThreadLoading, setIsThreadLoading] = React.useState(false);
    const [messages, setMessages] = React.useState<SpaceMessage[]>([]);
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
    const selectedFriendPlaceholder = React.useMemo(
        () =>
            selectedSpaceId ? placeholderFriend(selectedSpaceId) : undefined,
        [selectedSpaceId],
    );
    const selectedFriend =
        selectedConversation?.friend ??
        selectedFriendFromFriends ??
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

    const refreshConversations = React.useCallback(() => {
        setIsConversationsLoading(true);
        void loadCurrentMessageConversations()
            .then((page) => {
                const unreadConversationIds = page.items
                    .filter((conversation) => conversation.notificationUnread)
                    .map(conversationId);
                const passiveUnreadConversationIds = page.items
                    .filter(
                        (conversation) =>
                            conversation.notificationUnread &&
                            !conversation.unread,
                    )
                    .map(conversationId);
                setNewConversationIds(unreadConversationIds);
                setConversations(page.items);
                if (passiveUnreadConversationIds.length == 0) return;
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
            })
            .catch((error: unknown) =>
                console.error("Failed to load message conversations", error),
            )
            .finally(() => setIsConversationsLoading(false));
    }, []);

    const openConversation = React.useCallback(
        (conversation: SpaceMessageConversation) => {
            void router.push(spaceRoutes.message(conversationId(conversation)));
        },
        [router],
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
        refreshConversations();
    }, [profile, refreshConversations]);

    React.useEffect(() => {
        if (!profile?.spaceId) return;

        void loadCurrentSpaceFriends(profile.spaceId)
            .then((nextFriends) => {
                setFriends(nextFriends);
            })
            .catch((error: unknown) =>
                console.error("Failed to load space friends", error),
            );
    }, [profile?.spaceId, setFriends]);

    React.useEffect(() => {
        if (!selectedSpaceId || !selectedConversation) return;
        if (markedReadSpaceIdRef.current == selectedSpaceId) return;

        markedReadSpaceIdRef.current = selectedSpaceId;
        markConversationRead(selectedSpaceId);
    }, [markConversationRead, selectedConversation, selectedSpaceId]);

    React.useEffect(() => {
        if (
            !selectedSpaceId ||
            isConversationsLoading ||
            selectedConversation
        ) {
            return;
        }

        void router.replace(spaceRoutes.messages);
    }, [isConversationsLoading, router, selectedConversation, selectedSpaceId]);

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
            <SpacePageMeta
                themeColor={messagesBackground}
                title="Messages | Ente Space"
            />
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
                onOpenSelectedFriendProfile={(friend) =>
                    void router.push(spaceRoutes.friend(friendSpaceId(friend)))
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
                    refreshConversations();
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
                    refreshConversations();
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
                    refreshConversations();
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
                    refreshConversations();
                }}
                profile={profile}
                selectedFriend={selectedFriend}
            />
        </>
    );
};
