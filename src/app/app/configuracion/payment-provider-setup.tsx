import { Provider, WebPaymentProviderSettings } from "./web-payment-provider-settings";

export function PaymentProviderSetup({
  settings,
}: {
  settings: { id: string; web_payments_enabled: boolean; web_payment_provider: Provider } | null;
}) {
  return <WebPaymentProviderSettings settings={settings} />;
}
