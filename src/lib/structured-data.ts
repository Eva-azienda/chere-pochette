/**
 * Structured data (schema.org JSON-LD) for search engines.
 *
 * Pages build nodes with the helpers below and pass them to the layout:
 *   <BaseLayout … jsonLd={[productJsonLd(product, lang), breadcrumbJsonLd(lang, trail)]}>
 * BaseLayout prints them as ONE <script type="application/ld+json"> with an "@graph".
 *
 * Shipping and return facts come from src/data/site.json and MUST say the same as
 * src/content/legal/<lang>.md (delivery, returns) and src/i18n/<lang>.json
 * (info.shipping, info.returns): Google compares the markup with what the page says.
 */
import { DEFAULT_LANG, HREFLANG, LOCALES, useTranslations, type Lang } from './i18n';
import { absoluteUrl, assetPath, localePath } from './urls';
import { describeProduct, photoUrl, site, type Product } from './catalog';

export type JsonLdNode = Record<string, unknown>;
export type Crumb = { name: string; path: string };

const S = 'https://schema.org/';
const HOME_URL = absoluteUrl(localePath(DEFAULT_LANG, ''));
/** Stable ids: every page points to the same organisation, website and return policy. */
const ORG_ID = `${HOME_URL}#organization`;
const WEBSITE_ID = `${HOME_URL}#website`;
const RETURNS_ID = `${HOME_URL}#return-policy`;

/** We pack and ship on school days (texts: "giorni lavorativi" / "Arbeitstage" / "working days"). */
const WORKING_DAYS = {
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => S + d),
};

const dayRange = ([min, max]: readonly number[]) => ({
  '@type': 'QuantitativeValue',
  minValue: min,
  maxValue: max,
  unitCode: 'DAY',
});

/**
 * sameAs only for a PROFILE url (instagram.com/<name>/), never for a single post (/p/…).
 * A link copied from the app ("…/<name>?igsh=…") is cleaned up to https://www.instagram.com/<name>/.
 */
function instagramProfile(): string | undefined {
  try {
    const url = new URL(site.instagram);
    const name = /^\/(?!p\/|reel\/)([\w.]+)\/?$/.exec(url.pathname)?.[1];
    return /^(www\.)?instagram\.com$/.test(url.hostname) && name ? `https://www.instagram.com/${name}/` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Goodwill return policy (legal texts «Resi» / info.returns): write within 14 days of receiving
 * or collecting the bag, unused and in original condition, return postage paid by the customer,
 * refund of the bag price (not of the original shipping fee → no refundType).
 */
function returnPolicy(lang: Lang): JsonLdNode {
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: site.shippingCountries,
    returnPolicyCountry: 'CH',
    returnPolicyCategory: `${S}MerchantReturnFiniteReturnWindow`,
    merchantReturnDays: site.returns.days,
    returnMethod: `${S}ReturnByMail`,
    returnFees: `${S}ReturnFeesCustomerResponsibility`,
    returnLabelSource: `${S}ReturnLabelCustomerResponsibility`,
    itemCondition: `${S}NewCondition`,
    merchantReturnLink: absoluteUrl(localePath(lang, 'info/#returns')),
  };
}

/** Flat-rate Swiss Post shipping to every country in site.shippingCountries. */
function offerShippingDetails(): JsonLdNode[] {
  return site.shippingCountries.map((country) => ({
    '@type': 'OfferShippingDetails',
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: country },
    shippingRate: { '@type': 'MonetaryAmount', value: site.shippingFee, currency: site.currency },
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      businessDays: WORKING_DAYS,
      handlingTime: dayRange(site.delivery.handlingDays),
      transitTime: dayRange(site.delivery.transitDays),
    },
  }));
}

/** Home page (all languages): who we are. OnlineStore = Google's recommended type for web shops. */
export function organizationJsonLd(lang: Lang): JsonLdNode {
  const { t } = useTranslations(lang);
  const org = site.organisation;
  const [, postalCode, locality] = /^(\d{4})\s+(.+)$/.exec(org.city) ?? [];
  const instagram = instagramProfile();
  return {
    '@type': 'OnlineStore',
    '@id': ORG_ID,
    name: site.name,
    alternateName: 'Chere Pochette',
    url: HOME_URL,
    logo: { '@type': 'ImageObject', url: absoluteUrl(assetPath('brand/logo-bordeaux.png')), width: 800, height: 420 },
    image: absoluteUrl(assetPath('brand/icon-512.png')),
    description: t('meta.pages.home.description'),
    slogan: site.slogan,
    email: site.email,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: site.email,
      availableLanguage: LOCALES.map((l) => HREFLANG[l]),
      areaServed: site.shippingCountries,
    },
    address: {
      '@type': 'PostalAddress',
      // No street while site.json still has a placeholder ("TODO…").
      streetAddress: /^todo/i.test(org.address) ? undefined : org.address,
      postalCode,
      addressLocality: locality,
      addressRegion: 'TI',
      addressCountry: 'CH',
    },
    areaServed: site.shippingCountries,
    sameAs: instagram ? [instagram] : undefined,
    hasMerchantReturnPolicy: { '@id': RETURNS_ID, ...returnPolicy(lang) },
  };
}

/** Home page: site name for Google ("Chère Pochette" instead of the domain). */
export function websiteJsonLd(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: HOME_URL,
    name: site.name,
    alternateName: ['Chere Pochette', new URL(HOME_URL).hostname.replace(/^www\./, '')],
    inLanguage: LOCALES.map((l) => HREFLANG[l]),
    publisher: { '@id': ORG_ID },
  };
}

/** Product page of one unique bag (available → InStock, sold → SoldOut). */
export function productJsonLd(product: Product, lang: Lang): JsonLdNode {
  const { t } = useTranslations(lang);
  const info = describeProduct(product, lang);
  const url = absoluteUrl(localePath(lang, `shop/${product.id}/`));
  const vars = { model: info.title, number: info.number, price: info.price };
  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    url,
    name: t('meta.pages.product.title', vars),
    sku: product.id,
    productID: product.id,
    description: t('meta.pages.product.description', vars),
    image: product.photos.length ? product.photos.map((p) => absoluteUrl(photoUrl(p.src, 1600))) : undefined,
    brand: { '@type': 'Brand', name: site.name },
    color: info.colour.label,
    material: t('product.materials.schema'),
    category: info.modelType,
    offers: {
      '@type': 'Offer',
      url,
      price: product.price.toFixed(2),
      priceCurrency: site.currency,
      availability: S + (product.status === 'available' ? 'InStock' : 'SoldOut'),
      itemCondition: `${S}NewCondition`,
      seller: { '@type': 'Organization', '@id': ORG_ID, name: site.name },
      // Free pickup in Bellinzona is NOT a CHF 0 shipping rate: Google would show "free delivery".
      availableDeliveryMethod: [`${S}ParcelService`, `${S}OnSitePickup`],
      shippingDetails: offerShippingDetails(),
      hasMerchantReturnPolicy: returnPolicy(lang),
    },
  };
}

/** Breadcrumb trail, e.g. Home › Shop › Belle · Bordeaux. Paths as for localePath(): '', 'shop/', … */
export function breadcrumbJsonLd(lang: Lang, trail: Crumb[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(localePath(lang, crumb.path)),
    })),
  };
}

/** The <script> body. "<" is escaped so the JSON can never close the <script> tag early. */
export function jsonLdScript(nodes: JsonLdNode | JsonLdNode[]): string {
  const graph = Array.isArray(nodes) ? nodes : [nodes];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}
