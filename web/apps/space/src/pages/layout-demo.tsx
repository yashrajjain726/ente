import { Add01Icon, MinusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import { SpaceHomeOrbit } from "components/HomeOrbit";
import { SpacePageMeta } from "components/PageMeta";
import React from "react";
import { homeBackground } from "screens/HomeScreen";
import { homeOrbitPlacements } from "utils/home-orbit-layout";

const green = "#08C225";
const headerChromeColor = "#202825";
const headerHeight = 64;
const postButtonSize = 64;
const sampleColors = [
    "#D16B51",
    "#4F80C0",
    "#8A64B8",
    "#B79443",
    "#418C75",
    "#B85C8A",
];

interface DemoCanvasSize {
    height: number;
    width: number;
}

const HeaderControl: React.FC<{
    disabled?: boolean;
    icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
    label: string;
    onClick: () => void;
}> = ({ disabled = false, icon, label, onClick }) => (
    <Box
        component="button"
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        sx={{
            alignItems: "center",
            appearance: "none",
            bgcolor: headerChromeColor,
            border: 0,
            borderRadius: "50%",
            color: "#FFF",
            cursor: disabled ? "default" : "pointer",
            display: "flex",
            height: 36,
            justifyContent: "center",
            opacity: disabled ? 0.35 : 1,
            p: 0,
            width: 36,
            "&:focus-visible": {
                outline: `2px solid ${green}`,
                outlineOffset: 2,
            },
        }}
    >
        <HugeiconsIcon icon={icon} size={22} strokeWidth={2.4} />
    </Box>
);

const Page = () => {
    const [count, setCount] = React.useState(1);
    const [canvasSize, setCanvasSize] = React.useState<DemoCanvasSize>({
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

    const placements = homeOrbitPlacements(
        count,
        canvasSize.width,
        canvasSize.height,
    );
    const avatarSize = placements[0]?.avatarSize;

    return (
        <>
            <SpacePageMeta themeColor={homeBackground} />
            <Box
                component="main"
                sx={{
                    background:
                        "radial-gradient(ellipse 120% 95% at 50% 58%, rgba(38, 78, 52, 0.16), transparent 72%), #0C1014",
                    display: "grid",
                    height: "100svh",
                    overflow: "hidden",
                    placeItems: { xs: "stretch", sm: "start center" },
                }}
            >
                <Box
                    sx={{
                        boxSizing: "border-box",
                        height: "100svh",
                        maxWidth: "100%",
                        mx: "auto",
                        overflow: "hidden",
                        position: "relative",
                        width: "100%",
                        "@media (min-width: 600px)": { maxWidth: 390 },
                    }}
                >
                    <Box
                        component="header"
                        sx={{
                            alignItems: "center",
                            color: "#FFF",
                            display: "grid",
                            gridTemplateColumns: "44px minmax(0, 1fr) 44px",
                            height: headerHeight,
                            px: 2,
                            position: "relative",
                            zIndex: 2,
                        }}
                    >
                        <HeaderControl
                            disabled={count == 1}
                            icon={MinusSignIcon}
                            label="Remove friend"
                            onClick={() =>
                                setCount((current) => Math.max(1, current - 1))
                            }
                        />
                        <Box
                            sx={{
                                bgcolor: headerChromeColor,
                                borderRadius: "999px",
                                fontFamily:
                                    '"Inter Variable", Inter, sans-serif',
                                fontSize: 13,
                                fontWeight: 650,
                                justifySelf: "center",
                                lineHeight: "20px",
                                px: "14px",
                                py: "8px",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {`${count} ${count == 1 ? "friend" : "friends"}${avatarSize ? ` · ${Math.round(avatarSize)}px` : ""}`}
                        </Box>
                        <Box sx={{ justifySelf: "end" }}>
                            <HeaderControl
                                icon={Add01Icon}
                                label="Add friend"
                                onClick={() =>
                                    setCount((current) => current + 1)
                                }
                            />
                        </Box>
                    </Box>
                    <Box
                        sx={{
                            height: "100%",
                            inset: 0,
                            position: "absolute",
                            width: "100%",
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
                            <Box
                                component="ul"
                                aria-label="Sample friends"
                                sx={{
                                    height: "100%",
                                    m: 0,
                                    p: 0,
                                    position: "relative",
                                    width: "100%",
                                }}
                            >
                                {placements.map((placement, index) => (
                                    <SpaceHomeOrbit
                                        key={index}
                                        hasNewPost={index % 3 == 1}
                                        placement={placement}
                                    >
                                        <Box
                                            role="img"
                                            aria-label={`Sample friend ${index + 1}`}
                                            sx={{
                                                alignItems: "center",
                                                bgcolor:
                                                    sampleColors[
                                                        index %
                                                            sampleColors.length
                                                    ],
                                                borderRadius: "50%",
                                                boxShadow:
                                                    "0 3px 8px rgba(0, 0, 0, 0.2), 0 12px 24px rgba(0, 0, 0, 0.14)",
                                                color: "#FFF",
                                                display: "flex",
                                                fontFamily:
                                                    '"Inter Variable", Inter, sans-serif',
                                                fontSize: Math.max(
                                                    8,
                                                    placement.avatarSize * 0.3,
                                                ),
                                                fontWeight: 700,
                                                height: "100%",
                                                justifyContent: "center",
                                                width: "100%",
                                            }}
                                        >
                                            {index + 1}
                                        </Box>
                                    </SpaceHomeOrbit>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                    <Box
                        aria-hidden
                        sx={{
                            alignItems: "center",
                            bgcolor: green,
                            borderRadius: "50%",
                            bottom: "calc(env(safe-area-inset-bottom) + 20px)",
                            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.36)",
                            color: "#FFF",
                            display: "flex",
                            height: postButtonSize,
                            justifyContent: "center",
                            position: "fixed",
                            right: "max(20px, calc((100vw - 390px) / 2 + 20px))",
                            width: postButtonSize,
                        }}
                    >
                        <HugeiconsIcon
                            icon={Add01Icon}
                            size={34}
                            strokeWidth={2.1}
                        />
                    </Box>
                </Box>
            </Box>
        </>
    );
};

export default Page;
