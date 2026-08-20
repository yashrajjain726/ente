import { styled } from "@mui/material";
import type { VerifyMasterPasswordPresentationProps } from "ente-accounts/components/VerifyMasterPasswordForm";
import { t } from "i18next";
import type React from "react";
import { Button } from "./Button";
import { Form } from "./Form";
import { FormFields } from "./FormFields";
import { FormFooter } from "./FormFooter";
import { TextField } from "./TextField";

export function PasswordForm({
    userEmail,
    password,
    passwordError,
    isSubmitting,
    submitButtonTitle,
    onPasswordChange,
    onSubmit,
}: VerifyMasterPasswordPresentationProps): React.JSX.Element {
    return (
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
                <TextField
                    name="password"
                    value={password}
                    onChange={onPasswordChange}
                    type="password"
                    autoComplete="current-password"
                    label={t("password")}
                    showPasswordToggle
                    autoFocus
                    disabled={isSubmitting}
                    error={Boolean(passwordError)}
                    helperText={passwordError}
                />
            </FormFields>
            <FormFooter>
                <Button fullWidth type="submit" loading={isSubmitting}>
                    {submitButtonTitle}
                </Button>
            </FormFooter>
        </Form>
    );
}

const HiddenEmail = styled("input")({ display: "none" });
