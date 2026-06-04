import { Box } from "@mui/material";
import { EnteLogo } from "ente-base/components/EnteLogo";
import React, { useEffect, useRef, useState } from "react";
import { spaceTouchTargetSize } from "styles/touchTargets";

export const onboardingGreen = "#08C225";
export const onboardingTitle = "Share your life";
export const onboardingDescription =
    "A private, end-to-end encrypted space for sharing everyday moments with friends and family";
export const addFriendOnboardingTitle = "Follow their life";

const softGreen = "#E7F6E9";
const copyGreen = "#AAFFB8";
const activePaginationGreen = "#07951D";
const inactivePaginationGreen = "#5EE873";
const carouselSlideDurationMs = 4800;

const onboardingSlides = [
    {
        description: onboardingDescription,
        image: "/images/share-memories.svg",
        title: onboardingTitle,
    },
    {
        description:
            "Only you and your friends can see what you share. Everything is end-to-end encrypted.",
        image: "/images/share-memories.svg",
        title: "Private by design",
    },
    {
        description:
            "No brain rot. No ads. No strangers. Just everyday photos from friends and family.",
        image: "/images/share-memories.svg",
        title: "Just your people",
    },
] as const;

interface ActionButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    variant: "primary" | "secondary";
}

const ActionButton: React.FC<ActionButtonProps> = ({
    children,
    onClick,
    variant,
}) => (
    <Box
        component="button"
        type="button"
        onClick={onClick}
        sx={{
            alignItems: "center",
            bgcolor: variant == "primary" ? "black" : softGreen,
            border: 0,
            borderRadius: "20px",
            color: variant == "primary" ? "white" : onboardingGreen,
            cursor: "pointer",
            display: "flex",
            fontFamily: '"Inter Variable", Inter, sans-serif',
            fontSize: 14,
            fontWeight: 500,
            height: 48,
            justifyContent: "center",
            lineHeight: "20px",
            p: "14px 24px",
            textDecoration: "none",
            width: "100%",
            "&:focus-visible": {
                outline: "2px solid rgba(255 255 255 / 0.88)",
                outlineOffset: 3,
            },
            "&:hover": {
                bgcolor: variant == "primary" ? "#121212" : "#DDF2E0",
            },
        }}
    >
        {children}
    </Box>
);

interface OnboardingScreenProps {
    description?: string;
    onCreateAccount: () => void;
    onLogin?: () => void;
    title?: string;
}

interface OnboardingPaginationDotsProps {
    activeSlideIndex: number;
    onShowSlide: (index: number) => void;
    slides: readonly { title: string }[];
}

const OnboardingPaginationDots: React.FC<OnboardingPaginationDotsProps> = ({
    activeSlideIndex,
    onShowSlide,
    slides,
}) => (
    <Box
        sx={{
            alignItems: "center",
            display: "flex",
            flexShrink: 0,
            gap: "14px",
            justifyContent: "center",
            mt: "26px",
        }}
    >
        {slides.map((slide, index) => (
            <Box
                key={slide.title}
                component="button"
                type="button"
                aria-label={`Show onboarding page ${index + 1}`}
                aria-current={activeSlideIndex == index ? "page" : undefined}
                onClick={() => onShowSlide(index)}
                sx={{
                    alignItems: "center",
                    bgcolor: "transparent",
                    border: 0,
                    borderRadius: "999px",
                    cursor: "pointer",
                    display: "flex",
                    height: spaceTouchTargetSize,
                    justifyContent: "center",
                    p: 0,
                    width: spaceTouchTargetSize,
                    "&:focus-visible": {
                        outline: "2px solid white",
                        outlineOffset: 4,
                    },
                }}
            >
                <Box
                    component="span"
                    sx={{
                        bgcolor:
                            activeSlideIndex == index
                                ? activePaginationGreen
                                : inactivePaginationGreen,
                        borderRadius: "999px",
                        height: 10,
                        transition:
                            "background-color 180ms ease, height 180ms ease, width 180ms ease",
                        width: activeSlideIndex == index ? 24 : 10,
                        "@media (prefers-reduced-motion: reduce)": {
                            transition: "none",
                        },
                    }}
                />
            </Box>
        ))}
    </Box>
);

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
    description = onboardingDescription,
    onCreateAccount,
    onLogin,
    title = onboardingTitle,
}) => {
    const [activeSlideIndex, setActiveSlideIndex] = useState(0);
    const touchStartXRef = useRef<number | null>(null);
    const slides = onboardingSlides.map((slide, index) =>
        index == 0 ? { ...slide, description, title } : slide,
    );

    useEffect(() => {
        const prefersReducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        if (prefersReducedMotion) return undefined;

        const timeoutID = window.setTimeout(() => {
            setActiveSlideIndex((index) => (index + 1) % slides.length);
        }, carouselSlideDurationMs);

        return () => window.clearTimeout(timeoutID);
    }, [activeSlideIndex, slides.length]);

    const showSlide = (index: number) => setActiveSlideIndex(index);

    const showPreviousSlide = () =>
        setActiveSlideIndex(
            (index) => (index - 1 + slides.length) % slides.length,
        );

    const showNextSlide = () =>
        setActiveSlideIndex((index) => (index + 1) % slides.length);

    const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = (
        event,
    ) => {
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
    };

    const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = (event) => {
        const startX = touchStartXRef.current;
        touchStartXRef.current = null;
        const endX = event.changedTouches[0]?.clientX;
        if (startX == null || endX == null) return;

        const deltaX = endX - startX;
        if (Math.abs(deltaX) < 44) return;
        if (deltaX > 0) {
            showPreviousSlide();
        } else {
            showNextSlide();
        }
    };

    return (
        <Box
            className="green-bg"
            component="main"
            sx={{
                bgcolor: onboardingGreen,
                color: "white",
                display: "grid",
                minHeight: "100svh",
                overflow: "hidden",
                placeItems: { xs: "stretch", sm: "start center" },
            }}
        >
            <Box
                className="green-bg"
                sx={{
                    alignItems: "center",
                    bgcolor: onboardingGreen,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    height: "100svh",
                    minHeight: "100svh",
                    mx: "auto",
                    overflow: "hidden",
                    px: 3,
                    width: "100%",
                    "@media (min-width: 600px)": { maxWidth: 390 },
                }}
            >
                <Box
                    component="header"
                    sx={{
                        alignItems: "center",
                        display: "grid",
                        flexShrink: 0,
                        gridTemplateColumns: "40px 1fr 40px",
                        height: 40,
                        mt: "clamp(24px, 5.5svh, 44px)",
                        width: "100%",
                    }}
                >
                    <Box />
                    <Box
                        sx={{
                            color: "white",
                            justifySelf: "center",
                            lineHeight: 0,
                        }}
                    >
                        <EnteLogo height={24} />
                    </Box>
                    <Box />
                </Box>
                <Box
                    sx={{
                        alignItems: "center",
                        display: "flex",
                        flexDirection: "column",
                        flex: "1 1 auto",
                        justifyContent: "center",
                        minHeight: 0,
                        overflow: "hidden",
                        width: "100%",
                    }}
                >
                    <Box
                        onTouchEnd={handleTouchEnd}
                        onTouchStart={handleTouchStart}
                        sx={{
                            flexShrink: 0,
                            overflow: "hidden",
                            width: "100%",
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                transform: `translateX(-${activeSlideIndex * 100}%)`,
                                transition:
                                    "transform 360ms cubic-bezier(0.32, 0.72, 0, 1)",
                                width: "100%",
                                "@media (prefers-reduced-motion: reduce)": {
                                    transition: "none",
                                },
                            }}
                        >
                            {slides.map((slide) => (
                                <Box
                                    key={slide.title}
                                    sx={{
                                        alignItems: "center",
                                        display: "flex",
                                        flex: "0 0 100%",
                                        flexDirection: "column",
                                        justifyContent: "center",
                                        minWidth: 0,
                                        overflow: "hidden",
                                        width: "100%",
                                    }}
                                >
                                    <Box
                                        component="img"
                                        alt=""
                                        src={slide.image}
                                        sx={{
                                            flexShrink: 0,
                                            height: "clamp(132px, 29svh, 245.189px)",
                                            maxWidth: "min(282px, 76vw)",
                                            width: "auto",
                                            "@media (max-width: 340px)": {
                                                height: "auto",
                                                width: "76vw",
                                            },
                                        }}
                                    />
                                    <Box
                                        sx={{
                                            alignItems: "center",
                                            display: "flex",
                                            flexDirection: "column",
                                            flexShrink: 0,
                                            mt: "clamp(28px, 7svh, 60px)",
                                            textAlign: "center",
                                            width: "100%",
                                            "@media (min-height: 760px)": {
                                                mt: "92px",
                                            },
                                        }}
                                    >
                                        <Box
                                            component="h1"
                                            sx={{
                                                fontFamily:
                                                    "Nunito, sans-serif",
                                                fontSize: 24,
                                                fontWeight: 800,
                                                letterSpacing: 0,
                                                lineHeight: "29px",
                                                m: 0,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {slide.title}
                                        </Box>
                                        <Box
                                            component="p"
                                            sx={{
                                                color: copyGreen,
                                                fontFamily:
                                                    '"Inter Variable", Inter, sans-serif',
                                                fontSize: 14,
                                                fontWeight: 500,
                                                lineHeight: "20px",
                                                m: 0,
                                                mt: "12px",
                                                width: "100%",
                                            }}
                                        >
                                            {slide.description}
                                        </Box>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                    <OnboardingPaginationDots
                        activeSlideIndex={activeSlideIndex}
                        onShowSlide={showSlide}
                        slides={slides}
                    />
                </Box>
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        flexShrink: 0,
                        gap: "12px",
                        mb: "calc(32px + env(safe-area-inset-bottom))",
                        width: "100%",
                        "@media (min-width: 600px)": { mb: "44px" },
                    }}
                >
                    <ActionButton variant="primary" onClick={onCreateAccount}>
                        Create an Ente account
                    </ActionButton>
                    <ActionButton variant="secondary" onClick={onLogin}>
                        Login to existing account
                    </ActionButton>
                </Box>
            </Box>
        </Box>
    );
};
