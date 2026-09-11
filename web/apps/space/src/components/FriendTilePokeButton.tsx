import { HandPointingLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Box } from "@mui/material";
import type { SpaceActionPhase } from "components/ActionFeedback";
import log from "ente-base/log";
import React from "react";
import { spaceAppBackgroundColor, spaceText } from "styles/colors";
import { spaceTileCircleInset } from "styles/tiles";
import { spaceTouchTargetSize } from "styles/touch-targets";

const iconSize = 18;
const pokeAnimationDurationMs = 2000;

export const FriendTilePokeButton: React.FC<{
    avatarSize: number;
    name: string;
    onPoke: () => Promise<void>;
    tileWidth: number;
}> = ({ avatarSize, name, onPoke, tileWidth }) => {
    const [phase, setPhase] = React.useState<SpaceActionPhase | null>(null);
    const [failed, setFailed] = React.useState(false);
    const iconTipInset = avatarSize / 12;
    const inset = `calc(${spaceTileCircleInset(avatarSize)} - ${(spaceTouchTargetSize - avatarSize) / 2}px)`;
    const contactX = `calc(${2 * avatarSize - iconTipInset - tileWidth}px + 2 * ${spaceTileCircleInset(avatarSize)})`;

    React.useEffect(() => {
        if (phase != "done") return;
        const timeout = window.setTimeout(
            () => setPhase(null),
            pokeAnimationDurationMs + 100,
        );
        return () => window.clearTimeout(timeout);
    }, [phase]);

    const poke = async () => {
        setPhase("busy");
        setFailed(false);
        try {
            await onPoke();
            setPhase("done");
        } catch (error) {
            log.error("Failed to send poke", error);
            setPhase(null);
            setFailed(true);
        }
    };

    const label = failed
        ? `Couldn't poke ${name}. Tap to retry.`
        : phase == "busy"
          ? `Poking ${name}`
          : phase == "done"
            ? `Poked ${name}`
            : `Poke ${name}`;

    return (
        <Box
            component="button"
            type="button"
            aria-label={label}
            aria-live="polite"
            aria-busy={phase == "busy"}
            title={label}
            disabled={phase != null}
            onClick={() => void poke()}
            sx={{
                "--space-poke-contact-x": contactX,
                "--space-poke-icon-scale": avatarSize / iconSize,
                alignItems: "center",
                appearance: "none",
                bgcolor: "transparent",
                border: 0,
                borderRadius: "999px",
                bottom: inset,
                color: failed
                    ? "#F63A3A"
                    : phase
                      ? "#08C225"
                      : spaceAppBackgroundColor,
                cursor: phase ? "default" : "pointer",
                display: "flex",
                height: spaceTouchTargetSize,
                justifyContent: "center",
                lineHeight: 0,
                p: 0,
                position: "absolute",
                right: inset,
                width: spaceTouchTargetSize,
                zIndex: 3,
                "&:focus-visible": {
                    outline: `2px solid ${spaceText}`,
                    outlineOffset: 2,
                },
            }}
        >
            <Box
                component="span"
                sx={{
                    alignItems: "center",
                    bgcolor: "#FFFFFF",
                    borderRadius: "50%",
                    display: "flex",
                    height: avatarSize,
                    justifyContent: "center",
                    width: avatarSize,
                }}
            >
                <Box
                    component="span"
                    aria-hidden
                    sx={{
                        animation: phase
                            ? `spaceTilePokeJab ${pokeAnimationDurationMs}ms ease-in-out`
                            : "none",
                        display: "flex",
                        pointerEvents: "none",
                        "@keyframes spaceTilePokeJab": {
                            "0%, 100%": { transform: "translateX(0) scale(1)" },
                            "27.5%, 52%, 73.75%": {
                                transform:
                                    "translateX(calc(var(--space-poke-contact-x) + 8px)) scale(var(--space-poke-icon-scale))",
                            },
                            "41%, 63%": {
                                transform:
                                    "translateX(var(--space-poke-contact-x)) scale(var(--space-poke-icon-scale))",
                            },
                        },
                        "@media (prefers-reduced-motion: reduce)": {
                            animation: "none",
                        },
                    }}
                >
                    <HugeiconsIcon
                        icon={HandPointingLeftIcon}
                        size={iconSize}
                        strokeWidth={2}
                    />
                </Box>
            </Box>
        </Box>
    );
};
