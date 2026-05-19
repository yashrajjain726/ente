import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React from "react";
import { MessagesScreen, messagesBackground } from "screens/MessagesScreen";
import {
    deleteCurrentMessage,
    loadCurrentMessageConversations,
    loadCurrentMessageThread,
    markCurrentNotificationsRead,
    replyToCurrentMessage,
    sendCurrentMessage,
    setCurrentMessageLiked,
    type SocialWallMessage,
    type SocialWallMessageConversation,
} from "services/socialWall";
import { useSocialAppState } from "state/socialAppState";
import { socialRoutes } from "utils/socialRoutes";

const Page: React.FC = () => {
    const router = useRouter();
    const { profile, profileLoadStatus } = useSocialAppState();
    const [conversations, setConversations] = React.useState<
        SocialWallMessageConversation[]
    >([]);
    const [isConversationsLoading, setIsConversationsLoading] =
        React.useState(true);
    const [isThreadLoading, setIsThreadLoading] = React.useState(false);
    const [messages, setMessages] = React.useState<SocialWallMessage[]>([]);
    const [selectedFriend, setSelectedFriend] = React.useState<
        SocialWallMessageConversation["friend"] | undefined
    >();

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
        (conversation: SocialWallMessageConversation) => {
            setSelectedFriend(conversation.friend);
            const friendWallId = conversation.friend.wallId ?? conversation.friend.id;
            setConversations((currentConversations) =>
                currentConversations.map((currentConversation) =>
                    (currentConversation.friend.wallId ??
                        currentConversation.friend.id) == friendWallId
                        ? { ...currentConversation, unread: false }
                        : currentConversation,
                ),
            );
            void markCurrentNotificationsRead(friendWallId).catch(
                (error: unknown) =>
                    console.warn(
                        "Failed to mark notification conversation read",
                        error,
                    ),
            );
        },
        [],
    );

    React.useEffect(() => {
        if (profileLoadStatus == "ready" && !profile) {
            void router.replace(socialRoutes.onboarding);
        }
    }, [profile, profileLoadStatus, router]);

    React.useEffect(() => {
        if (!profile) return;
        refreshConversations();
    }, [profile, refreshConversations]);

    React.useEffect(() => {
        if (!selectedFriend) {
            setMessages([]);
            return;
        }

        let cancelled = false;
        setIsThreadLoading(true);
        void loadCurrentMessageThread(
            selectedFriend.wallId ?? selectedFriend.id,
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
        return <SocialRouteFallback background={messagesBackground} />;
    }

    return (
        <>
            <SocialPageMeta themeColor={messagesBackground} />
            <MessagesScreen
                conversations={conversations}
                isConversationsLoading={isConversationsLoading}
                isThreadLoading={isThreadLoading}
                messages={messages}
                onBack={() => void router.push(socialRoutes.home)}
                onCloseThread={() => setSelectedFriend(undefined)}
                onOpenThread={openConversation}
                onSendMessage={async (wallId, text) => {
                    const message = await sendCurrentMessage(wallId, text);
                    setMessages((currentMessages) => [
                        ...currentMessages,
                        message,
                    ]);
                    refreshConversations();
                }}
                onReplyToMessage={async (wallId, messageId, text) => {
                    const message = await replyToCurrentMessage(
                        wallId,
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
