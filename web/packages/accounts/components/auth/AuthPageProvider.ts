import { createContext, useContext, type ComponentType } from "react";
import type { VerifyingPasskeyPresentationProps } from "../LoginComponents";
import type { AuthPageShellProps } from "./AuthPageShell";

/** App defaults for shared account pages, not reusable forms or dialogs. */
export interface AuthPageConfig {
    passkeyPresentation?: ComponentType<VerifyingPasskeyPresentationProps>;
    Shell?: ComponentType<
        Pick<AuthPageShellProps, "children" | "contentWidth">
    >;
}

const AuthPageContext = createContext<AuthPageConfig>({});

export const AuthPageProvider = AuthPageContext.Provider;

export const useAuthPageConfig = (): AuthPageConfig =>
    useContext(AuthPageContext);
