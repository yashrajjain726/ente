import { ArrowLeft02Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpacePostFloatingActionButton } from "components/PostFloatingActionButton";
import React from "react";
import { homeCirclePlacements } from "utils/home-circle-layout";

const background = "#0C1014";
const headerChromeColor = "#202825";
const headerHeight = 64;
const layoutVerticalInset =
    "calc(112px + max(env(safe-area-inset-top, 0px), env(safe-area-inset-bottom, 0px)))";
const maximumFriendCount = 15;

interface CanvasSize {
    height: number;
    width: number;
}

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

    const placements = homeCirclePlacements(
        friendCount,
        canvasSize.width,
        canvasSize.height,
    );
    const circleSize = placements[0]?.size ?? 0;
    const avatarSize = Math.min(32, circleSize * 0.2);
    const ringWidth = Math.max(1, Math.min(3, circleSize * 0.018));
    const avatarSeparation = Math.max(1, Math.min(4, circleSize * 0.025));

    return (
        <Box
            component="main"
            sx={{
                bgcolor: background,
                color: "#FFF",
                height: "100svh",
                overflow: "hidden",
                position: "relative",
            }}
        >
            <Box
                sx={{
                    height: "100%",
                    maxWidth: 390,
                    mx: "auto",
                    position: "relative",
                    width: "100%",
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
                        bottom: layoutVerticalInset,
                        left: "16px",
                        position: "absolute",
                        right: "16px",
                        top: layoutVerticalInset,
                    }}
                >
                    <Box
                        ref={canvasRef}
                        sx={{
                            height: "100%",
                            position: "relative",
                            width: "100%",
                        }}
                    >
                        {circleSize > 0 &&
                            placements.map(({ size, x, y }, index) => (
                                <Box
                                    key={index}
                                    sx={{
                                        bgcolor: "#1A211F",
                                        border: `${ringWidth}px solid #2A3430`,
                                        borderRadius: "50%",
                                        boxSizing: "border-box",
                                        height: size,
                                        left: x,
                                        position: "absolute",
                                        top: y,
                                        width: size,
                                    }}
                                >
                                    <Box
                                        sx={{
                                            bgcolor: "#39433F",
                                            borderRadius: "50%",
                                            boxShadow: `0 0 0 ${avatarSeparation}px ${background}`,
                                            height: avatarSize,
                                            left: "14.645%",
                                            position: "absolute",
                                            top: "14.645%",
                                            transform: "translate(-50%, -50%)",
                                            width: avatarSize,
                                        }}
                                    />
                                </Box>
                            ))}
                    </Box>
                </Box>
                <SpacePostFloatingActionButton />
            </Box>
        </Box>
    );
};

export default LayoutDemoPage;
