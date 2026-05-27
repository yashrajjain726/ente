import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React from "react";
import { MessagesScreen, messagesBackground } from "screens/MessagesScreen";
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

const conversationId = (conversation: SpaceMessageConversation) =>
    conversation.friend.spaceId ?? conversation.friend.id;

const Page: React.FC = () => {
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
    const [selectedFriend, setSelectedFriend] = React.useState<
        SpaceMessageConversation["friend"] | undefined
    >();
    const selectedFriendSpaceId = selectedFriend?.spaceId ?? selectedFriend?.id;
    const selectedFriendSpaceIdRef = React.useRef<string | undefined>(
        undefined,
    );
    const selectedFriendSpaceSlug = selectedFriend?.spaceSlug;
    const selectedFriendUsername = selectedFriend?.username;
    const isSelectedFriendCurrent = Boolean(
        selectedFriendSpaceId &&
            friends.some((friend) => {
                const friendSpaceId = friend.spaceId ?? friend.id;
                return (
                    friendSpaceId == selectedFriendSpaceId ||
                    (selectedFriendSpaceSlug &&
                        friend.spaceSlug == selectedFriendSpaceSlug) ||
                    friend.username == selectedFriendUsername
                );
            }),
    );
    const isThreadReadOnly =
        Boolean(selectedFriend) && !isSelectedFriendCurrent;

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
                    passiveUnreadConversationIds.map((friendSpaceId) =>
                        markCurrentMessagesRead(friendSpaceId),
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
            setIsThreadLoading(true);
            setMessages([]);
            setSelectedFriend(conversation.friend);
            const friendSpaceId =
                conversation.friend.spaceId ?? conversation.friend.id;
            selectedFriendSpaceIdRef.current = friendSpaceId;
            setNewConversationIds((currentIds) =>
                currentIds.filter((id) => id != friendSpaceId),
            );
            setConversations((currentConversations) =>
                currentConversations.map((currentConversation) =>
                    (currentConversation.friend.spaceId ??
                        currentConversation.friend.id) == friendSpaceId
                        ? {
                              ...currentConversation,
                              notificationUnread: false,
                              unread: false,
                          }
                        : currentConversation,
                ),
            );
            void markCurrentMessagesRead(friendSpaceId).catch(
                (error: unknown) =>
                    console.warn(
                        "Failed to mark message conversation read",
                        error,
                    ),
            );
        },
        [],
    );

    const closeConversation = React.useCallback(() => {
        setSelectedFriend(undefined);
        selectedFriendSpaceIdRef.current = undefined;
        setIsThreadLoading(false);
        setMessages([]);
    }, []);

    const appendMessageIfThreadIsCurrent = React.useCallback(
        (spaceId: string, message: SpaceMessage) => {
            if (selectedFriendSpaceIdRef.current != spaceId) return;
            setMessages((currentMessages) => [...currentMessages, message]);
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
        if (!selectedFriend) {
            selectedFriendSpaceIdRef.current = undefined;
            setMessages([]);
            setIsThreadLoading(false);
            return;
        }

        let cancelled = false;
        const threadSpaceId = selectedFriend.spaceId ?? selectedFriend.id;
        selectedFriendSpaceIdRef.current = threadSpaceId;
        setIsThreadLoading(true);
        void loadCurrentMessageThread(threadSpaceId)
            .then((page) => {
                if (!cancelled) setMessages(page.items);
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
    }, [selectedFriend]);

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
                    void router.push(
                        spaceRoutes.friend(friend.spaceId ?? friend.id),
                    )
                }
                onOpenThread={openConversation}
                onSendMessage={async (spaceId, text) => {
                    const message = await sendCurrentMessage(spaceId, text);
                    appendMessageIfThreadIsCurrent(spaceId, message);
                    refreshConversations();
                }}
                onReplyToMessage={async (spaceId, messageId, text) => {
                    const message = await replyToCurrentMessage(
                        spaceId,
                        messageId,
                        text,
                    );
                    appendMessageIfThreadIsCurrent(spaceId, message);
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

export default Page;
