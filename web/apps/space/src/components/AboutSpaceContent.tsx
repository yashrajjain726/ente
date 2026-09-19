import React from "react";
import styles from "styles/about-space.module.css";

const photo = (name: string) => `/images/about/${name}.webp`;

const Feature: React.FC<{
    title: React.ReactNode;
    cropVisual?: boolean;
    children: React.ReactNode;
}> = ({ title, cropVisual, children }) => (
    <section
        className={
            cropVisual
                ? `${styles.feature} ${styles.cropVisual}`
                : styles.feature
        }
    >
        <div className={styles.featureHeading}>
            <h2>{title}</h2>
        </div>
        {children}
    </section>
);

const FeedPreview: React.FC = () => (
    <img
        className={styles.feedPreview}
        src={photo("feed-screen")}
        alt="Space’s feed showing Sophie’s cat by the window and Chloe’s bookshelf."
        width={780}
        height={1560}
        loading="lazy"
    />
);

export const SpaceAboutContent: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => (
    <div className={styles.content}>
        <section className={`${styles.hero} green-bg`}>
            <div className={styles.heroCopy}>
                <h2>Share everyday photos with your people.</h2>
            </div>
            <div className={styles.heroVisual}>
                <FeedPreview />
            </div>
        </section>

        <Feature
            title={
                <>
                    No brain rot. No ads.
                    <br />
                    Just your friends.
                </>
            }
            cropVisual
        >
            <div className={styles.quietVisual}>
                <img
                    className={styles.quietIllustration}
                    src="/images/ducky-space.svg"
                    alt=""
                    width={282}
                    height={246}
                    loading="lazy"
                />
            </div>
        </Feature>

        <Feature title="See what your friends and family are up to." cropVisual>
            <div className={`${styles.screenPreview} ${styles.shortPreview}`}>
                <img
                    className={styles.screenCapture}
                    src={photo("friends-screen")}
                    alt="Further down the feed: Ben’s pancakes, Alex’s park photos, and Emma’s walk around Laurelhurst Park."
                    width={780}
                    height={1768}
                    loading="lazy"
                />
            </div>
        </Feature>

        <Feature title="Like and reply to their posts." cropVisual>
            <div className={`${styles.screenPreview} ${styles.chatPreview}`}>
                <img
                    className={styles.screenCapture}
                    src={photo("chat-screen")}
                    alt="Alex replies to Ben’s breakfast post, ‘i owe you half a pancake’. Ben answers, ‘You can get coffee next time’."
                    width={780}
                    height={1020}
                    loading="lazy"
                />
            </div>
        </Feature>

        <Feature title="Poke a friend who hasn’t posted in a while." cropVisual>
            <div className={`${styles.screenPreview} ${styles.pokePreview}`}>
                <img
                    className={styles.screenCapture}
                    src={photo("poke-screen")}
                    alt="Alex pokes Liam, who posts his first photo in over two weeks. Alex replies to the bike photo, ‘fixed it??’. Liam replies, ‘Noah did. I was about to buy a new tire’."
                    width={780}
                    height={1160}
                    loading="lazy"
                />
            </div>
        </Feature>

        <Feature
            title={
                <>
                    Truly private with
                    <br />
                    end-to-end encryption.
                </>
            }
            cropVisual
        >
            <div className={styles.privacyVisual}>
                <img
                    className={styles.privacyIllustration}
                    src="/images/about/ducky-encryption.svg"
                    alt=""
                    width={410}
                    height={300}
                    loading="lazy"
                />
            </div>
        </Feature>

        <section className={`${styles.closing} green-bg`}>
            <h2 className={styles.tagline}>More social, less media.</h2>
            {children}
        </section>
    </div>
);
