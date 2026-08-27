import React from "react";

export type SpaceCircleNameArcPosition = "upper-left" | "top" | "upper-right";

interface SpaceCircleNameArcProps {
    id: string;
    name: string;
    nameInset: number;
    position: SpaceCircleNameArcPosition;
    ringColor: string;
    ringWidth: number;
    size: number;
}

export const SpaceCircleNameArc: React.FC<SpaceCircleNameArcProps> = ({
    id,
    name,
    nameInset,
    position,
    ringColor,
    ringWidth,
    size,
}) => {
    const center = size / 2;
    const fontSize = Math.max(8, Math.min(11, size * 0.065));
    const radius = center - fontSize * 0.2 - nameInset;
    const arcCenterAngle =
        position == "upper-left"
            ? (Math.PI * 5) / 4
            : position == "upper-right"
              ? (Math.PI * 7) / 4
              : (Math.PI * 3) / 2;
    const arcStartAngle = arcCenterAngle - Math.PI / 4;
    const arcEndAngle = arcCenterAngle + Math.PI / 4;
    const path = `M ${center + radius * Math.cos(arcStartAngle)} ${center + radius * Math.sin(arcStartAngle)} A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos(arcEndAngle)} ${center + radius * Math.sin(arcEndAngle)}`;
    const uppercaseName = name.toLocaleUpperCase();
    const arcLength = (Math.PI * radius) / 2;
    const labelWidth = Math.min(
        arcLength - fontSize,
        uppercaseName.length * fontSize * 0.68 + fontSize * 0.4,
    );
    const halfGapAngle = labelWidth / (2 * radius);
    const gapStartAngle = arcCenterAngle - halfGapAngle;
    const gapEndAngle = arcCenterAngle + halfGapAngle;
    const gapPath = `M ${center + radius * Math.cos(gapStartAngle)} ${center + radius * Math.sin(gapStartAngle)} A ${radius} ${radius} 0 0 1 ${center + radius * Math.cos(gapEndAngle)} ${center + radius * Math.sin(gapEndAngle)}`;
    const ringMaskID = `${id}-ring-mask`;

    return (
        <svg
            aria-hidden
            focusable="false"
            viewBox={`0 0 ${size} ${size}`}
            style={{
                height: "100%",
                inset: 0,
                overflow: "visible",
                pointerEvents: "none",
                position: "absolute",
                width: "100%",
                zIndex: 2,
            }}
        >
            <defs>
                <path id={id} d={path} />
                <mask
                    id={ringMaskID}
                    maskContentUnits="userSpaceOnUse"
                    maskUnits="userSpaceOnUse"
                    x={-size}
                    y={-size}
                    width={size * 3}
                    height={size * 3}
                >
                    <rect
                        x={-size}
                        y={-size}
                        width={size * 3}
                        height={size * 3}
                        fill="#FFF"
                    />
                    <path
                        d={gapPath}
                        fill="none"
                        stroke="#000"
                        strokeLinecap="round"
                        strokeWidth={fontSize + 4}
                    />
                </mask>
            </defs>
            <circle
                cx={center}
                cy={center}
                r={center - ringWidth / 2}
                fill="none"
                mask={`url(#${ringMaskID})`}
                stroke={ringColor}
                strokeWidth={ringWidth}
            />
            <text
                fill="rgba(255, 255, 255, 0.86)"
                fontFamily='"Nunito", sans-serif'
                fontSize={fontSize}
                fontWeight={800}
                letterSpacing="0.04em"
            >
                <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
                    {uppercaseName}
                </textPath>
            </text>
        </svg>
    );
};
