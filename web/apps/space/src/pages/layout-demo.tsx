import { ArrowLeft02Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpacePostFloatingActionButton } from "components/PostFloatingActionButton";
import React from "react";
import { FriendPostCircle } from "screens/HomeScreen";
import { spaceAppBackground } from "styles/colors";
import {
    homeCircleGridLayout,
    homeCirclePlacements,
    usesHomeCircleGrid,
    type HomeCirclePlacement,
} from "utils/home-circle-layout";

const headerChromeColor = "#202825";
const headerHeight = 64;
const maximumFriendCount = 15;

interface CanvasSize {
    height: number;
    width: number;
}

interface LayoutDemoPostProps {
    index: number;
    placement?: HomeCirclePlacement;
}

const LayoutDemoPost: React.FC<LayoutDemoPostProps> = ({
    index,
    placement,
}) => (
    <FriendPostCircle
        avatarUrl={null}
        friend={{
            friendsCount: 0,
            fullName: `Friend ${index + 1}`,
            id: `demo-friend-${index + 1}`,
            username: `friend${index + 1}`,
        }}
        isAvatarPending={false}
        isLoading={false}
        isRead
        isUnavailable={false}
        onOpenPosts={() => undefined}
        placement={placement}
        posts={[]}
    />
);

const LayoutDemoPage: React.FC = () => {
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
                    Math.min(maximumFriendCount, count + 1),
                );
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const usesGrid = usesHomeCircleGrid(friendCount);
    const placements = homeCirclePlacements(
        friendCount,
        canvasSize.width,
        canvasSize.height,
    );
    const gridLayout = homeCircleGridLayout(
        friendCount,
        canvasSize.width,
        canvasSize.height,
    );

    return (
        <Box
            component="main"
            sx={{
                background: spaceAppBackground,
                color: "#FFF",
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
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        display: "grid",
                        gridTemplateColumns: "48px minmax(0, 1fr) 48px",
                        height: headerHeight,
                        px: "10px",
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
                            bgcolor: headerChromeColor,
                            border: 0,
                            borderRadius: "50%",
                            color: "#FFF",
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
                        sx={{
                            alignItems: "center",
                            bgcolor: headerChromeColor,
                            borderRadius: "999px",
                            display: "flex",
                            fontFamily: '"Inter Variable", Inter, sans-serif',
                            height: 36,
                            justifySelf: "center",
                            px: "15px",
                        }}
                    >
                        <Box
                            component="img"
                            alt="Space"
                            src="/images/space.svg"
                            sx={{ display: "block", height: 18, width: "auto" }}
                        />
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        aria-label="Show one more friend"
                        disabled={friendCount == maximumFriendCount}
                        onClick={() =>
                            setFriendCount((count) =>
                                Math.min(maximumFriendCount, count + 1),
                            )
                        }
                        sx={{
                            alignItems: "center",
                            appearance: "none",
                            bgcolor: headerChromeColor,
                            border: 0,
                            borderRadius: "50%",
                            color: "#FFF",
                            cursor:
                                friendCount == maximumFriendCount
                                    ? "default"
                                    : "pointer",
                            display: "flex",
                            height: 36,
                            justifyContent: "center",
                            justifySelf: "end",
                            opacity:
                                friendCount == maximumFriendCount ? 0.3 : 1,
                            p: 0,
                            width: 36,
                        }}
                    >
                        <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            size={22}
                            strokeWidth={2.2}
                        />
                    </Box>
                </Box>
                <Box
                    sx={{
                        boxSizing: "border-box",
                        display: "flex",
                        flexDirection: "column",
                        height: `calc(100svh - ${headerHeight}px)`,
                        minWidth: 0,
                        pb: "calc(env(safe-area-inset-bottom) + 112px)",
                        pt: `calc(env(safe-area-inset-bottom) + 112px - ${headerHeight}px)`,
                        px: "16px",
                        width: "100%",
                    }}
                >
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
                            minHeight: 0,
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
                                          index={index}
                                      />
                                  ),
                              )
                            : placements.map((placement, index) => (
                                  <LayoutDemoPost
                                      key={index}
                                      index={index}
                                      placement={placement}
                                  />
                              ))}
                    </Box>
                </Box>
                <SpacePostFloatingActionButton />
            </Box>
        </Box>
    );
};

export default LayoutDemoPage;
