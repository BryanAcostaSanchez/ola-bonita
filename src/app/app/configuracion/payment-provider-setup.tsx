"use client";

import { useState } from "react";
import { GetnetSettings } from "./getnet-settings";
import { Provider, WebPaymentProviderSettings } from "./web-payment-provider-settings";

export function PaymentProviderSetup({
  settings,
  getnetConfigured,
}: {
  settings: { id: string; web_payments_enabled: boolean; web_payment_provider: Provider } | null;
  getnetConfigured: boolean;
}) {
  const [provider, setProvider] = useState<Provider>(
    settings?.web_payment_provider ?? "mercadopago",
  );

  return <>
    <WebPaymentProviderSettings settings={settings} onProviderSaved={setProvider} />
    {provider === "getnet" && <GetnetSettings configured={getnetConfigured} />}
  </>;
}
