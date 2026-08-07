export default {
    async fetch(request: Request, env: Env) {
        return handleRequest(request, env.DISCORD_WEBHOOK_URL);
    },
} satisfies ExportedHandler<Env>;

interface Env {
    DISCORD_WEBHOOK_URL: string;
}

const handleRequest = async (request: Request, discordWebhookURL: string) => {
    const requestBody = await request.text();
    const requestJSON = JSON.parse(requestBody);
    const sender = requestJSON["sender"]["login"];
    if (sender === "cloudflare-pages[bot]" || sender === "CLAassistant") {
        return new Response(null, { status: 200 });
    }

    // Discord parses GitHub payloads sent to `/github`.
    // Unsupported events are silently dropped with a 204.
    const response = await fetch(`${discordWebhookURL}/github`, {
        method: request.method,
        headers: request.headers,
        body: requestBody,
    });

    if (response.status == 429) {
        // Discord can rate-limit `/github` while the normal webhook still works.
        let activityURL: string | undefined;
        if (requestJSON["comment"]) {
            activityURL = requestJSON["comment"]["html_url"];
        }
        if (!activityURL && requestJSON["issue"]) {
            activityURL = requestJSON["issue"]["html_url"];
        }
        if (!activityURL && requestJSON["discussion"]) {
            activityURL = requestJSON["discussion"]["html_url"];
        }

        const action = requestJSON["action"];

        if (activityURL && ["created", "opened"].includes(action)) {
            return fetch(discordWebhookURL, {
                method: request.method,
                headers: request.headers,
                body: JSON.stringify({
                    content: `Activity in ${activityURL}`,
                }),
            });
        }
    }

    return response;
};
