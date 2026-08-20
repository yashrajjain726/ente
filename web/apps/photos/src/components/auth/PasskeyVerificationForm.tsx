import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CircularProgress, styled } from "@mui/material";
import type { VerifyingPasskeyPresentationProps } from "ente-accounts/components/LoginComponents";
import { pt } from "ente-base/i18n";
import { t } from "i18next";
import type React from "react";
import { Button } from "./Button";
import { FormFooter } from "./FormFooter";
import { ScreenHeader } from "./ScreenHeader";
import {
    authBodyTypography,
    authMiniTypography,
    authTransientProps,
} from "./styles";
import { TextLink } from "./TextLink";

export function PasskeyVerificationForm({
    email,
    host,
    verificationStatus,
    isChecking,
    onRetry,
    onCheckStatus,
    onRecover,
    onChangeEmail,
}: VerifyingPasskeyPresentationProps): React.JSX.Element {
    const stalled = verificationStatus === "pending";

    const checkStatusButton = (
        <Button
            fullWidth
            variant={stalled ? "secondary" : "primary"}
            onClick={onCheckStatus}
            loading={isChecking}
        >
            {t("check_status")}
        </Button>
    );

    const reopenButton = (
        <Button
            fullWidth
            variant={stalled ? "primary" : "secondary"}
            onClick={onRetry}
        >
            {pt("Open the browser window again")}
        </Button>
    );

    return (
        <>
            <ScreenHeader
                title={pt("Verify your passkey")}
                subtitle={
                    <>
                        {pt("We opened a browser window")}
                        {email ? (
                            <>
                                {pt(" for ")}
                                <Email>{email}</Email>
                            </>
                        ) : null}
                    </>
                }
            />
            <StatusCard role="status" $stalled={stalled}>
                {stalled ? (
                    <StatusIcon>
                        <HugeiconsIcon
                            icon={InformationCircleIcon}
                            size={20}
                            strokeWidth={2}
                            aria-hidden="true"
                        />
                    </StatusIcon>
                ) : (
                    <CircularProgress
                        size={20}
                        sx={{
                            color: "var(--photos-auth-primary)",
                            flexShrink: 0,
                        }}
                    />
                )}
                <StatusText>
                    <StatusTitle>
                        {stalled
                            ? pt("Still waiting")
                            : t("waiting_for_verification")}
                    </StatusTitle>
                    <StatusCaption>
                        {stalled
                            ? pt(
                                  "The browser window may have been closed before you finished. Open it again to retry.",
                              )
                            : pt("This page updates on its own")}
                    </StatusCaption>
                </StatusText>
            </StatusCard>
            <FormFooter>
                {stalled ? (
                    <>
                        {reopenButton}
                        {checkStatusButton}
                    </>
                ) : (
                    <>
                        {checkStatusButton}
                        {reopenButton}
                    </>
                )}
                <FooterLinks>
                    <TextLink onClick={onRecover}>
                        {t("recover_account")}
                    </TextLink>
                    <TextLink onClick={onChangeEmail}>
                        {t("change_email")}
                    </TextLink>
                </FooterLinks>
                <Host>{host ?? ""}</Host>
            </FormFooter>
        </>
    );
}

const Email = styled("strong")({
    color: "var(--photos-auth-text)",
    wordBreak: "break-word",
});

const StatusCard = styled(
    "div",
    authTransientProps,
)<{ $stalled: boolean }>(({ $stalled }) => ({
    padding: "16px",
    borderRadius: "20px",
    display: "flex",
    alignItems: $stalled ? "flex-start" : "center",
    gap: "12px",
    backgroundColor: $stalled
        ? "color-mix(in srgb, var(--photos-auth-caution) 12%, transparent)"
        : "var(--photos-auth-field)",
    boxShadow: `inset 0 0 0 1px ${
        $stalled
            ? "color-mix(in srgb, var(--photos-auth-caution) 32%, transparent)"
            : "var(--photos-auth-stroke)"
    }`,
}));

const StatusIcon = styled("div")({
    flexShrink: 0,
    display: "flex",
    color: "var(--photos-auth-caution)",
});

const StatusText = styled("div")({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
});

const StatusTitle = styled("div")({
    ...authBodyTypography,
    fontWeight: 600,
    color: "var(--photos-auth-text)",
});

const StatusCaption = styled("p")({
    ...authMiniTypography,
    margin: 0,
    textWrap: "pretty",
    color: "var(--photos-auth-text-muted)",
});

const FooterLinks = styled("div")({
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
});

const Host = styled("div")({
    ...authMiniTypography,
    minHeight: "16px",
    textAlign: "center",
    color: "var(--photos-auth-text-faint)",
});
