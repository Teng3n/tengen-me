export const PRODUCT = {
  name: "World of Warcraft: Forever Collector's Edition",
  handle: "wowccl0012-world-of-warcraft-forever-collectors-edition",
  productId: "10220685590777",
  variantId: "48891708506361",
  sku: "WOWCCL001200",
  url: "https://gear.blizzard.com/products/wowccl0012-world-of-warcraft-forever-collectors-edition",
} as const;

// This URL is sent to the buyer, never fetched by the monitor.
// Shopify still validates stock and the buyer reviews/authorizes payment.
export const ONE_COPY_CHECKOUT_URL = `https://gear.blizzard.com/cart/${PRODUCT.variantId}:1?payment=shop_pay`;

export type StockStatus = "available" | "unavailable" | "unknown";
export type DeliveryChannel = "push";

export interface Env {
  DB: D1Database;
  REMINDERS?: DurableObjectNamespace;
  CHECKER?: DurableObjectNamespace;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ADMIN_TOKEN?: string;
  HELPER_TOKEN?: string;
  PUSH_PROVIDER?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  HEALTHCHECKS_URL?: string;
  FAILURE_ALERT_AFTER?: string;
  CHECK_LOG_RETENTION_DAYS?: string;
}

export interface EndpointEvidence {
  url: string;
  httpStatus?: number;
  attempts: number;
  elapsedMs: number;
  responseDate?: string;
  retryAfterMs?: number;
  error?: string;
}

export interface ButtonEvidence {
  matchingForms: number;
  state: "enabled" | "disabled" | "conflict" | "missing";
  labels: string[];
  variantInputDisabled: boolean[];
  buttonDisabled: boolean[];
}

export interface StockEvidence {
  alertRule?: "any-positive";
  positiveSignals?: Array<"inventory" | "purchase-button">;
  checksHealthy?: boolean;
  productId?: string;
  variantId?: string;
  sku?: string;
  productName?: string;
  price?: string;
  inventoryAvailable?: boolean;
  button?: ButtonEvidence;
  productFeed: EndpointEvidence;
  productPage: EndpointEvidence;
  reasons: string[];
}

export interface StockResult {
  status: StockStatus;
  checkedAt: string;
  evidence: StockEvidence;
}

export interface MonitorState {
  paused: boolean;
  lastStatus: StockStatus | null;
  lastDefinitiveStatus: Exclude<StockStatus, "unknown"> | null;
  availabilityEpoch: number;
  lastCheckAt: string | null;
  lastDefinitiveAt: string | null;
  lastAvailableAt: string | null;
  consecutiveUnknown: number;
  unknownStreakStartedAt: string | null;
  failureAlertedFor: string | null;
  updatedAt: string;
}

export interface NotificationEvent {
  eventId: string;
  eventType: "stock" | "health" | "recovery" | "test";
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
}

export interface DueDelivery extends NotificationEvent {
  channel: DeliveryChannel;
  attempts: number;
}

export interface DeliveryResult {
  ok: boolean;
  retryable: boolean;
  providerId?: string;
  error?: string;
  retryAfterMs?: number;
}
