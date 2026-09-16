import type { ComponentType, JSX, PropsWithChildren } from "react";

interface AuthShellProps extends PropsWithChildren {
    contentWidth?: 400 | 420;
}

/** Compose at module scope so rerenders preserve form state and focus. */
export function withAuthPageShell<Props extends object>(
    Form: ComponentType<Props>,
    Shell: ComponentType<AuthShellProps>,
    contentWidth?: AuthShellProps["contentWidth"],
): ComponentType<Props> {
    return function AuthPresentation(props: Props): JSX.Element {
        return (
            <Shell contentWidth={contentWidth}>
                <Form {...props} />
            </Shell>
        );
    };
}
