import { useLoaderData } from "react-router";
import { authenticate } from "../../shopify.server";
import { getWebhookStats } from "../../models/webhook-logger.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const stats = await getWebhookStats(session.shop, 100);
  return { stats };
};

export default function WebhooksPage() {
  const { stats } = useLoaderData();
  const { events, stats: webhookStats } = stats;

  return (
    <s-page heading="Webhook Monitoring">
      <s-section>
        <s-stack direction="block" gap="base">
          {/* Statistici generale */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <s-stack direction="block" gap="base">
              <s-heading level="2">Overview</s-heading>
              <s-stack direction="inline" gap="base" style={{ flexWrap: "wrap" }}>
                <s-box padding="base" background="subdued" borderRadius="base" style={{ minWidth: "150px" }}>
                  <s-text variant="bodyMd" tone="subdued">Total Events</s-text>
                  <s-heading level="3">{webhookStats.total}</s-heading>
                </s-box>
                <s-box padding="base" background="subdued" borderRadius="base" style={{ minWidth: "150px" }}>
                  <s-text variant="bodyMd" tone="subdued">Success</s-text>
                  <s-heading level="3" tone="success">{webhookStats.success}</s-heading>
                </s-box>
                <s-box padding="base" background="subdued" borderRadius="base" style={{ minWidth: "150px" }}>
                  <s-text variant="bodyMd" tone="subdued">Errors</s-text>
                  <s-heading level="3" tone="critical">{webhookStats.error}</s-heading>
                </s-box>
                <s-box padding="base" background="subdued" borderRadius="base" style={{ minWidth: "150px" }}>
                  <s-text variant="bodyMd" tone="subdued">Avg Response Time</s-text>
                  <s-heading level="3">{webhookStats.avgResponseTime}ms</s-heading>
                </s-box>
              </s-stack>
            </s-stack>
          </s-box>

          {/* Statistici per topic */}
          {Object.keys(webhookStats.byTopic).length > 0 && (
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <s-heading level="2">By Topic</s-heading>
                <s-stack direction="block" gap="tight">
                  {Object.entries(webhookStats.byTopic).map(([topic, topicStats]) => (
                    <s-box key={topic} padding="base" background="subdued" borderRadius="base">
                      <s-stack direction="inline" gap="base" alignment="space-between">
                        <div>
                          <s-text variant="bodyMd" fontWeight="semibold">{topic}</s-text>
                          <s-text variant="bodySm" tone="subdued">
                            {topicStats.success} success, {topicStats.error} errors
                          </s-text>
                        </div>
                        <s-badge
                          status={topicStats.error === 0 ? "success" : "critical"}
                          tone={topicStats.error === 0 ? "success" : "critical"}
                        >
                          {topicStats.error === 0 ? "OK" : `${topicStats.error} errors`}
                        </s-badge>
                      </s-stack>
                    </s-box>
                  ))}
                </s-stack>
              </s-stack>
            </s-box>
          )}

          {/* Lista evenimentelor */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <s-stack direction="block" gap="base">
              <s-heading level="2">Recent Events</s-heading>
              {events.length === 0 ? (
                <s-text tone="subdued">No webhook events yet</s-text>
              ) : (
                <s-stack direction="block" gap="tight">
                  {events.map((event) => (
                    <s-box
                      key={event.id}
                      padding="base"
                      background={event.status === "error" ? "critical-subdued" : "subdued"}
                      borderRadius="base"
                      borderWidth={event.status === "error" ? "base" : "none"}
                      borderColor={event.status === "error" ? "critical" : undefined}
                    >
                      <s-stack direction="inline" gap="base" alignment="space-between" style={{ flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: "200px" }}>
                          <s-stack direction="inline" gap="tight" style={{ marginBottom: "4px" }}>
                            <s-text variant="bodyMd" fontWeight="semibold">{event.topic}</s-text>
                            <s-badge
                              status={event.status === "success" ? "success" : "critical"}
                              tone={event.status === "success" ? "success" : "critical"}
                            >
                              {event.status}
                            </s-badge>
                            {event.responseTime && (
                              <s-text variant="bodySm" tone="subdued">
                                {event.responseTime}ms
                              </s-text>
                            )}
                          </s-stack>
                          <s-text variant="bodySm" tone="subdued">
                            {new Date(event.createdAt).toLocaleString()}
                          </s-text>
                          {event.errorMessage && (
                            <s-text variant="bodySm" tone="critical" style={{ marginTop: "4px", display: "block" }}>
                              Error: {event.errorMessage}
                            </s-text>
                          )}
                        </div>
                      </s-stack>
                    </s-box>
                  ))}
                </s-stack>
              )}
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}



