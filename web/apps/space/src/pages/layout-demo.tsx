import { ArrowLeft02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpaceFileViewer } from "components/FileViewer";
import { SpaceHomeHeader, spaceHomeHeaderHeight } from "components/HomeHeader";
import { SpaceOwnPostTile } from "components/OwnPostTile";
import { useBrowserBackClose } from "hooks/use-browser-back-close";
import React from "react";
import { FriendPostTile } from "screens/HomeScreen";
import type { SpacePost } from "services/space";
import { useSpaceAppState } from "state/app-state";
import { spaceAppBackground, spaceSurface, spaceText } from "styles/colors";
import {
    homeTileGridLayout,
    homeTilePlacements,
    maximumHomeTileCount,
    usesHomeTileGrid,
    type HomeTilePlacement,
} from "utils/home-tile-layout";
import { useSpaceRouter } from "utils/route-transitions";
import { spaceRoutes } from "utils/routes";

const controlButtonColor = spaceSurface;

const demoOwnPosts: SpacePost[] = [
    "/images/default-cover-image.jpg",
    "/images/invite-bg.jpg",
    "/images/default-profile-pic.png",
].map((imageUrl, index) => ({
    friendID: "demo-self",
    imageUrl,
    name: "You",
    postId: 100 - index,
    spaceId: "demo-self",
    timestampMs: 1_700_000_000_000 - index * 86_400_000,
    viewerLiked: false,
}));

interface CanvasSize {
    height: number;
    width: number;
}

interface LayoutDemoPostProps {
    count: number;
    index: number;
    placement?: HomeTilePlacement;
}

const LayoutDemoPost: React.FC<LayoutDemoPostProps> = ({
    count,
    index,
    placement,
}) => {
    const showAllVariants = count >= 5;
    const friendRequestDirection = showAllVariants
        ? index == 0
            ? ("sent" as const)
            : index == 1
              ? ("received" as const)
              : undefined
        : count == 2 && index == 1
          ? ("sent" as const)
          : count >= 2 && index == 0
            ? ("received" as const)
            : undefined;
    const seenPostIndex = showAllVariants ? 2 : count >= 3 ? 1 : undefined;
    const unseenPostIndex = showAllVariants ? 3 : count >= 3 ? 2 : undefined;
    const hasPlaceholderMedia = index == seenPostIndex;
    const isUnread = index == unseenPostIndex;
    const username = friendRequestDirection
        ? friendRequestDirection == "sent"
            ? "request_pending"
            : "new_friend"
        : `friend${index + 1}`;
    const friend = {
        friendsCount: 0,
        fullName: `Friend ${index + 1}`,
        id: `demo-friend-${index + 1}`,
        username,
    };
    const post: SpacePost | undefined =
        hasPlaceholderMedia || isUnread
            ? {
                  friendID: friend.id,
                  name: friend.fullName,
                  postId: index + 1,
                  spaceId: friend.id,
                  timestampMs: 1_700_000_000_000 - index * 60_000,
                  username,
                  viewerLiked: false,
              }
            : undefined;

    return (
        <FriendPostTile
            avatarUrl={
                hasPlaceholderMedia ? "/images/default-profile-pic.png" : null
            }
            friend={friend}
            friendRequestDirection={friendRequestDirection}
            imageUrl={
                hasPlaceholderMedia
                    ? "/images/invite-bg.jpg"
                    : isUnread
                      ? "/images/default-cover-image.jpg"
                      : undefined
            }
            isAvatarPending={false}
            isLoading={false}
            isRead={!isUnread}
            isUnavailable={false}
            onAcceptFriendRequest={
                friendRequestDirection == "received"
                    ? () => Promise.resolve()
                    : undefined
            }
            onDiscardFriendRequest={
                friendRequestDirection == "received"
                    ? () => Promise.resolve()
                    : undefined
            }
            onOpenFriendRequest={
                friendRequestDirection ? () => undefined : undefined
            }
            onOpenPosts={() => undefined}
            isTwoTileLayout={count == 2}
            placement={placement}
            posts={post ? [post] : []}
            showFriendRequestDetails={count <= 2}
        />
    );
};

const LayoutDemoPage: React.FC = () => {
    const router = useSpaceRouter();
    const { profile } = useSpaceAppState();
    const [ownPostIndex, setOwnPostIndex] = React.useState<number>();
    useBrowserBackClose({
        open: ownPostIndex !== undefined,
        onClose: () => setOwnPostIndex(undefined),
        stateKey: "space-layout-demo-viewer",
    });
    const ownPostPhotos = demoOwnPosts.map((post) => ({
        ...post,
        alt: "Your post",
        avatarUrl: profile?.avatarUrl,
        imageUrl: post.imageUrl!,
    }));
    const [friendCount, setFriendCount] = React.useState(1);
    const [canvasSize, setCanvasSize] = React.useState<CanvasSize>({
        height: 0,
        width: 0,
    });
    const canvasRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const updateSize = () => {
            const { height, width } = canvas.getBoundingClientRect();
            setCanvasSize({ height, width });
        };
        const observer = new ResizeObserver(updateSize);
        observer.observe(canvas);
        updateSize();
        return () => observer.disconnect();
    }, []);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key == "ArrowLeft") {
                setFriendCount((count) => Math.max(1, count - 1));
            } else if (event.key == "ArrowRight") {
                setFriendCount((count) =>
                    Math.min(maximumHomeTileCount, count + 1),
                );
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const usesGrid = usesHomeTileGrid(friendCount);
    const placements = homeTilePlacements(
        friendCount,
        canvasSize.width,
        canvasSize.height,
    );
    const gridLayout = homeTileGridLayout(
        friendCount,
        canvasSize.width,
        canvasSize.height,
    );

    return (
        <Box
            component="main"
            sx={{
                background: spaceAppBackground,
                color: spaceText,
                display: "grid",
                minHeight: "100svh",
                overflowX: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
                position: "relative",
            }}
        >
            <Box
                sx={{
                    boxSizing: "border-box",
                    maxWidth: "100%",
                    minHeight: "100svh",
                    minWidth: 0,
                    mx: "auto",
                    overflowX: "hidden",
                    position: "relative",
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <SpaceHomeHeader
                    profile={profile}
                    onOpenMessages={() =>
                        void router.push(spaceRoutes.messages)
                    }
                    onOpenProfile={
                        profile
                            ? () => void router.push(spaceRoutes.profile)
                            : undefined
                    }
                />
                <Box
                    sx={{
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        minHeight: `calc(100svh - ${spaceHomeHeaderHeight}px)`,
                        minWidth: 0,
                        pb: "calc(env(safe-area-inset-bottom) + 72px)",
                        px: "16px",
                        pt: "12px",
                        width: "100%",
                    }}
                >
                    <SpaceOwnPostTile
                        profile={profile}
                        post={demoOwnPosts[0]}
                        onNewPost={() => void router.push("/app/post")}
                        onOpenPost={() => setOwnPostIndex(0)}
                        onOpenProfile={() =>
                            void router.push(spaceRoutes.profile)
                        }
                    />
                    <Box
                        ref={canvasRef}
                        sx={{
                            display: usesGrid ? "grid" : "block",
                            flex: "1 1 auto",
                            gap: gridLayout ? `${gridLayout.gap}px` : undefined,
                            gridTemplateColumns: gridLayout
                                ? `repeat(3, ${gridLayout.size}px)`
                                : undefined,
                            gridTemplateRows: gridLayout
                                ? `repeat(${gridLayout.rows}, ${gridLayout.size}px)`
                                : undefined,
                            minHeight: 320,
                            placeContent: usesGrid ? "center" : undefined,
                            position: "relative",
                            width: "100%",
                        }}
                    >
                        {usesGrid && gridLayout
                            ? Array.from(
                                  { length: friendCount },
                                  (_, index) => (
                                      <LayoutDemoPost
                                          key={index}
                                          count={friendCount}
                                          index={index}
                                      />
                                  ),
                              )
                            : placements.map((placement, index) => (
                                  <LayoutDemoPost
                                      key={index}
                                      count={friendCount}
                                      index={index}
                                      placement={placement}
                                  />
                              ))}
                    </Box>
                </Box>
                <Box
                    sx={{
                        bottom: "calc(env(safe-area-inset-bottom) + 20px)",
                        display: "flex",
                        gap: "8px",
                        left: "max(20px, calc((100vw - 390px) / 2 + 20px))",
                        position: "fixed",
                        zIndex: 5,
                    }}
                >
                    <Box
                        component="button"
                        type="button"
                        aria-label="Show one fewer friend"
                        disabled={friendCount == 1}
                        onClick={() =>
                            setFriendCount((count) => Math.max(1, count - 1))
                        }
                        sx={{
                            alignItems: "center",
                            appearance: "none",
                            bgcolor: controlButtonColor,
                            border: 0,
                            borderRadius: "50%",
                            color: spaceText,
                            cursor: friendCount == 1 ? "default" : "pointer",
                            display: "flex",
                            height: 36,
                            justifyContent: "center",
                            opacity: friendCount == 1 ? 0.3 : 1,
                            p: 0,
                            width: 36,
                        }}
                    >
                        <HugeiconsIcon
                            icon={ArrowLeft02Icon}
                            size={22}
                            strokeWidth={2.2}
                        />
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        aria-label="Show one more friend"
                        disabled={friendCount == maximumHomeTileCount}
                        onClick={() =>
                            setFriendCount((count) =>
                                Math.min(maximumHomeTileCount, count + 1),
                            )
                        }
                        sx={{
                            alignItems: "center",
                            appearance: "none",
                            bgcolor: controlButtonColor,
                            border: 0,
                            borderRadius: "50%",
                            color: spaceText,
                            cursor:
                                friendCount == maximumHomeTileCount
                                    ? "default"
                                    : "pointer",
                            display: "flex",
                            height: 36,
                            justifyContent: "center",
                            opacity:
                                friendCount == maximumHomeTileCount ? 0.3 : 1,
                            p: 0,
                            width: 36,
                        }}
                    >
                        <HugeiconsIcon
                            icon={ArrowRight02Icon}
                            size={22}
                            strokeWidth={2.2}
                        />
                    </Box>
                </Box>
                {ownPostIndex !== undefined && (
                    <SpaceFileViewer
                        photo={ownPostPhotos[ownPostIndex]!}
                        photos={ownPostPhotos}
                        photoIndex={ownPostIndex}
                        onPhotoIndexChange={setOwnPostIndex}
                        postActionMode="hidden"
                        onClose={() => setOwnPostIndex(undefined)}
                    />
                )}
            </Box>
        </Box>
    );
};

export default LayoutDemoPage;
