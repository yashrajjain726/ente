import { SpacePageMeta } from "components/SpacePageMeta";
import { SpaceRouteFallback } from "components/SpaceRouteFallback";
import { useRouter } from "next/router";
import React from "react";
import { MessagesScreen, messagesBackground } from "screens/MessagesScreen";
import {
    deleteCurrentMessage,
    loadCurrentMessageConversations,
    loadCurrentMessageThread,
    loadCurrentSpaceFriends,
    markCurrentNotificationsRead,
    replyToCurrentMessage,
    sendCurrentMessage,
    setCurrentMessageLiked,
    type SpaceMessage,
    type SpaceMessageConversation,
} from "services/space";
import { useSpaceAppState } from "state/spaceAppState";
import { spaceRoutes } from "utils/spaceRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { friends, profile, profileLoadStatus, setFriends } =
        useSpaceAppState();
    const [conversations, setConversations] = React.useState<
        SpaceMessageConversation[]
    >([]);
    const [isConversationsLoading, setIsConversationsLoading] =
        React.useState(true);
    const [isThreadLoading, setIsThreadLoading] = React.useState(false);
    const [messages, setMessages] = React.useState<SpaceMessage[]>([]);
    const [selectedFriend, setSelectedFriend] = React.useState<
        SpaceMessageConversation["friend"] | undefined
    >();
    const selectedFriendSpaceId = selectedFriend?.spaceId ?? selectedFriend?.id;
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
                setConversations(page.items);
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
            setConversations((currentConversations) =>
                currentConversations.map((currentConversation) =>
                    (currentConversation.friend.spaceId ??
                        currentConversation.friend.id) == friendSpaceId
                        ? { ...currentConversation, unread: false }
                        : currentConversation,
                ),
            );
            void markCurrentNotificationsRead(friendSpaceId).catch(
                (error: unknown) =>
                    console.warn(
                        "Failed to mark notification conversation read",
                        error,
                    ),
            );
        },
        [],
    );

    const closeConversation = React.useCallback(() => {
        setSelectedFriend(undefined);
        setIsThreadLoading(false);
        setMessages([]);
    }, []);

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
            .then(setFriends)
            .catch((error: unknown) =>
                console.error("Failed to load space friends", error),
            );
    }, [profile?.spaceId, setFriends]);

    React.useEffect(() => {
        if (!selectedFriend) {
            setMessages([]);
            setIsThreadLoading(false);
            return;
        }

        let cancelled = false;
        setIsThreadLoading(true);
        void loadCurrentMessageThread(
            selectedFriend.spaceId ?? selectedFriend.id,
        )
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

    if (profileLoadStatus == "loading" || !profile) {
        return <SpaceRouteFallback background={messagesBackground} />;
    }

    return (
        <>
            <SpacePageMeta themeColor={messagesBackground} />
            <MessagesScreen
                conversations={conversations}
                isConversationsLoading={isConversationsLoading}
                isThreadLoading={isThreadLoading}
                isThreadReadOnly={isThreadReadOnly}
                messages={messages}
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
                    setMessages((currentMessages) => [
                        ...currentMessages,
                        message,
                    ]);
                    refreshConversations();
                }}
                onReplyToMessage={async (spaceId, messageId, text) => {
                    const message = await replyToCurrentMessage(
                        spaceId,
                        messageId,
                        text,
                    );
                    setMessages((currentMessages) => [
                        ...currentMessages,
                        message,
                    ]);
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
