// Default-deny list: domains where Orta must not appear out of the box.
// Users can override individually with the `!domain.tld` syntax in disabledSites.
// Keep this list short, conservative, and broadly applicable. Niche regional banks
// can be added by the user; the goal here is to cover the highest-risk surfaces.

export const BUILTIN_BLOCKED_DOMAINS: readonly string[] = [
  // Payments and checkouts.
  'stripe.com',
  'checkout.stripe.com',
  'paypal.com',
  'checkout.com',
  'adyen.com',
  'braintreepayments.com',
  'wise.com',
  'revolut.com',
  '*.mercadopago.com',
  '*.mercadopago.com.ar',
  '*.mercadopago.com.mx',
  '*.mercadopago.com.br',

  // Identity / SSO.
  'accounts.google.com',
  'login.microsoftonline.com',
  'login.live.com',
  'appleid.apple.com',
  'id.atlassian.com',
  'id.apple.com',
  'auth0.com',
  'okta.com',
  '*.okta.com',
  'onelogin.com',

  // Password managers.
  '1password.com',
  'bitwarden.com',
  'dashlane.com',
  'lastpass.com',
  'keepersecurity.com',
  'nordpass.com',

  // Banking — major international + regional majors.
  'chase.com',
  'bankofamerica.com',
  'wellsfargo.com',
  'citi.com',
  'citibank.com',
  'usbank.com',
  'capitalone.com',
  'discover.com',
  'americanexpress.com',
  'hsbc.com',
  'barclays.com',
  'barclays.co.uk',
  'lloydsbank.com',
  'santander.com',
  '*.santander.com',
  'bbva.com',
  '*.bbva.com',
  '*.bbva.mx',
  '*.bbva.es',
  'banorte.com',
  'banamex.com',
  'scotiabank.com',
  'rbcroyalbank.com',
  'td.com',
  'bnpparibas.com',
  'deutschebank.com',
  'unicredit.it',
  'intesasanpaolo.com',
  'caixabank.es',
  '*.caixabank.es',
  'ingdirect.es',
  'bancomer.com',

  // Government TLDs (subdomain-broad).
  '*.gov',
  '*.gov.uk',
  '*.gob.mx',
  '*.gob.es',
  '*.gob.ar',
  '*.gob.cl',
  '*.gob.pe',
  '*.gov.au',
  '*.gov.br',
  '*.gov.co',
  '*.gc.ca',

  // Crypto wallets / exchanges with high-stakes credential fields.
  'coinbase.com',
  'binance.com',
  'kraken.com',
  'metamask.io',
  'ledger.com',
];
