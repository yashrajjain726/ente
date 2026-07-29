import { styled } from "@mui/material";

const CARD_WIDTH_PX = 518;
const CARD_HEIGHT_PX = 628;

interface MemoryEndCardProps {
    width: number;
}

export function MemoryEndCard({ width }: MemoryEndCardProps) {
    const scale = width / CARD_WIDTH_PX;

    return (
        <CardContainer>
            <CardStage style={{ transform: `scale(${scale})` }}>
                <Artwork
                    src="/images/memories-end-card.webp"
                    alt="Preserve your memories with Ente"
                />
                <DownloadButton
                    href="https://ente.com/try"
                    target="_blank"
                    rel="noopener"
                    data-memory-control="true"
                >
                    Download Ente
                </DownloadButton>
            </CardStage>
        </CardContainer>
    );
}

const CardContainer = styled("div")({
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
});

const CardStage = styled("div")({
    position: "relative",
    width: `${CARD_WIDTH_PX}px`,
    height: `${CARD_HEIGHT_PX}px`,
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: "21px",
    background: "linear-gradient(180deg, #f9f9f9 60%, #939393 184%)",
    transformOrigin: "center",
});

const Artwork = styled("img")({
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
});

const DownloadButton = styled("a")({
    position: "absolute",
    left: "317px",
    top: "227.6px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "15.7px",
    padding: "15.7px 27.9px",
    color: "#fff",
    backgroundColor: "#08c225",
    fontFamily: "'Outfit Variable', sans-serif",
    fontSize: "14px",
    fontWeight: 700,
    lineHeight: "normal",
    textDecoration: "none",
    whiteSpace: "nowrap",
    transition: "background-color 150ms ease",
    "&:hover": { backgroundColor: "#07a820" },
});
