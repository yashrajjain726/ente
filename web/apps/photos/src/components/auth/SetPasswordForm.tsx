import { styled } from "@mui/material";
import type { NewPasswordPresentationProps } from "ente-accounts/components/NewPasswordForm";
import { pt } from "ente-base/i18n";
import { t } from "i18next";
import type React from "react";
import { Button } from "./Button";
import { Form } from "./Form";
import { FormFields } from "./FormFields";
import { FormFooter } from "./FormFooter";
import { Message } from "./Message";
import { PasswordStrengthMessage } from "./PasswordStrengthMessage";
import { ScreenHeader } from "./ScreenHeader";
import { TextField } from "./TextField";
import { TextLink } from "./TextLink";

export function SetPasswordForm({
    userEmail,
    password,
    confirmPassword,
    passwordError,
    confirmPasswordError,
    passwordStrength,
    isSubmitting,
    isSubmitDisabled,
    submitButtonTitle,
    onBack,
    onPasswordChange,
    onConfirmPasswordChange,
    onSubmit,
}: NewPasswordPresentationProps): React.JSX.Element {
    return (
        <>
            <ScreenHeader
                title={submitButtonTitle}
                subtitle={pt(
                    "We don't store your password. If you forget it, the only way back to your photos is your recovery key.",
                )}
            />
            <Form onSubmit={onSubmit}>
                <HiddenEmail
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={userEmail}
                    readOnly
                    tabIndex={-1}
                />
                <FormFields>
                    <PasswordField>
                        <TextField
                            name="password"
                            label={t("password")}
                            placeholder={pt("Choose a strong password")}
                            autoComplete="new-password"
                            showPasswordToggle
                            value={password}
                            onChange={onPasswordChange}
                            error={Boolean(passwordError)}
                            helperText={passwordError}
                            disabled={isSubmitting}
                            autoFocus
                        />
                        <PasswordStrengthMessage
                            strength={passwordStrength}
                            visible={Boolean(password)}
                        />
                    </PasswordField>
                    <TextField
                        name="confirmPassword"
                        label={t("confirm_password")}
                        placeholder={pt("Type it once more")}
                        autoComplete="new-password"
                        showPasswordToggle
                        value={confirmPassword}
                        onChange={onConfirmPasswordChange}
                        error={Boolean(confirmPasswordError)}
                        helperText={confirmPasswordError}
                        disabled={isSubmitting}
                    />
                </FormFields>
                <FormFooter>
                    <Button
                        fullWidth
                        type="submit"
                        loading={isSubmitting}
                        disabled={isSubmitDisabled}
                    >
                        {submitButtonTitle}
                    </Button>
                    {isSubmitting ? (
                        <SubmittingMessage>
                            <Message>{t("key_generation_in_progress")}</Message>
                        </SubmittingMessage>
                    ) : null}
                    {onBack ? (
                        <BackAction>
                            <TextLink onClick={onBack} disabled={isSubmitting}>
                                {t("go_back")}
                            </TextLink>
                        </BackAction>
                    ) : null}
                </FormFooter>
            </Form>
        </>
    );
}

const HiddenEmail = styled("input")({ display: "none" });

const PasswordField = styled("div")({
    "--photos-auth-message-gap": "8px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
});

const SubmittingMessage = styled("div")({
    display: "flex",
    justifyContent: "center",
});

const BackAction = styled("div")({ display: "flex", justifyContent: "center" });
