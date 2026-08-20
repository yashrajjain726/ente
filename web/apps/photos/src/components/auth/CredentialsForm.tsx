import { styled } from "@mui/material";
import type { CredentialsPresentationProps } from "ente-accounts/pages/credentials";
import { pt } from "ente-base/i18n";
import { t } from "i18next";
import type React from "react";
import { FormFooter } from "./FormFooter";
import { ScreenHeader } from "./ScreenHeader";
import { TextLink } from "./TextLink";

export function CredentialsForm({
    userEmail,
    host,
    passwordForm,
    onRecover,
    onChangeEmail,
}: CredentialsPresentationProps): React.JSX.Element {
    return (
        <>
            <ScreenHeader
                title={t("enter_password")}
                subtitle={
                    <>
                        {pt("Signing in as ")}
                        <Email>{userEmail}</Email>
                    </>
                }
            />
            {passwordForm}
            <FormFooter>
                <FooterLinks>
                    <TextLink onClick={onRecover}>
                        {t("forgot_password")}
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

const FooterLinks = styled("div")({
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
});

const Host = styled("div")({
    minHeight: "16px",
    textAlign: "center",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: "16px",
    color: "var(--photos-auth-text-faint)",
});
