import { SocialPageMeta } from "components/SocialPageMeta";
import { SocialRouteFallback } from "components/SocialRouteFallback";
import { useRouter } from "next/router";
import React from "react";
import { MessagesScreen, messagesBackground } from "screens/MessagesScreen";
import {
    loadCurrentMessageConversations,
    loadCurrentMessageThread,
    sendCurrentMessage,
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
            .then((page) => setConversations(page.items))
            .catch((error: unknown) =>
                console.error("Failed to load message conversations", error),
            )
            .finally(() => setIsConversationsLoading(false));
    }, []);

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
                onBack={() => void router.push(socialRoutes.notifications)}
                onCloseThread={() => setSelectedFriend(undefined)}
                onOpenThread={setSelectedFriend}
                onSendMessage={async (wallId, text) => {
                    const message = await sendCurrentMessage(wallId, text);
                    setMessages((currentMessages) => [
                        ...currentMessages,
                        message,
                    ]);
                    refreshConversations();
                }}
                profile={profile}
                selectedFriend={selectedFriend}
            />
        </>
    );
};

export default Page;
