import { keyframes } from "@mui/material/styles";

export const spacePostLikePopDurationMs = 520;
export const spacePostLikePopTiming = "cubic-bezier(0.2, 0.82, 0.22, 1)";

export const spacePostLikeButtonPop = keyframes`
    0% {
        transform: scale(1);
    }

    24% {
        transform: scale(0.88);
    }

    55% {
        transform: scale(1.16);
    }

    78% {
        transform: scale(0.97);
    }

    100% {
        transform: scale(1);
    }
`;

export const spacePostLikeHeartPop = keyframes`
    0% {
        opacity: 0.72;
        transform: scale(0.58) rotate(-10deg);
    }

    44% {
        opacity: 1;
        transform: scale(1.38) rotate(6deg);
    }

    72% {
        transform: scale(0.93) rotate(-3deg);
    }

    100% {
        opacity: 1;
        transform: scale(1) rotate(0deg);
    }
`;
