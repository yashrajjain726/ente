import TwoFactorRecoverPage, {
    type RecoverPageProps,
} from "../two-factor/recover";

export default function PasskeyRecoverPage(
    props: Omit<RecoverPageProps, "twoFactorType">,
): React.JSX.Element {
    return <TwoFactorRecoverPage {...props} twoFactorType="passkey" />;
}
