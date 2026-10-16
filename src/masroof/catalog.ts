import type { AccountType, Swatch } from "@/masroof/types";

export type CurrencyInfo = { code: string; exp: number; en: string; ar: string };

export const CURRENCIES: CurrencyInfo[] = [
  { code: "QAR", exp: 2, en: "Qatari riyal", ar: "ريال قطري" },
  { code: "USD", exp: 2, en: "US dollar", ar: "دولار أمريكي" },
  { code: "EUR", exp: 2, en: "Euro", ar: "يورو" },
  { code: "GBP", exp: 2, en: "Pound sterling", ar: "جنيه إسترليني" },
  { code: "AED", exp: 2, en: "UAE dirham", ar: "درهم إماراتي" },
  { code: "SAR", exp: 2, en: "Saudi riyal", ar: "ريال سعودي" },
  { code: "KWD", exp: 3, en: "Kuwaiti dinar", ar: "دينار كويتي" },
  { code: "BHD", exp: 3, en: "Bahraini dinar", ar: "دينار بحريني" },
  { code: "OMR", exp: 3, en: "Omani rial", ar: "ريال عماني" },
  { code: "EGP", exp: 2, en: "Egyptian pound", ar: "جنيه مصري" },
  { code: "SDG", exp: 2, en: "Sudanese pound", ar: "جنيه سوداني" },
  { code: "JOD", exp: 3, en: "Jordanian dinar", ar: "دينار أردني" },
  { code: "MAD", exp: 2, en: "Moroccan dirham", ar: "درهم مغربي" },
  { code: "TND", exp: 3, en: "Tunisian dinar", ar: "دينار تونسي" },
  { code: "TRY", exp: 2, en: "Turkish lira", ar: "ليرة تركية" },
  { code: "INR", exp: 2, en: "Indian rupee", ar: "روبية هندية" },
  { code: "PKR", exp: 2, en: "Pakistani rupee", ar: "روبية باكستانية" },
  { code: "IDR", exp: 2, en: "Indonesian rupiah", ar: "روبية إندونيسية" },
  { code: "MYR", exp: 2, en: "Malaysian ringgit", ar: "رينغيت ماليزي" },
  { code: "SGD", exp: 2, en: "Singapore dollar", ar: "دولار سنغافوري" },
  { code: "JPY", exp: 0, en: "Japanese yen", ar: "ين ياباني" },
  { code: "CNY", exp: 2, en: "Chinese yuan", ar: "يوان صيني" },
  { code: "AUD", exp: 2, en: "Australian dollar", ar: "دولار أسترالي" },
  { code: "CAD", exp: 2, en: "Canadian dollar", ar: "دولار كندي" },
  { code: "CHF", exp: 2, en: "Swiss franc", ar: "فرنك سويسري" },
  { code: "ZAR", exp: 2, en: "South African rand", ar: "راند جنوب أفريقي" },
  { code: "NGN", exp: 2, en: "Nigerian naira", ar: "نايرا نيجيرية" },
  { code: "KES", exp: 2, en: "Kenyan shilling", ar: "شلن كيني" },
  { code: "GHS", exp: 2, en: "Ghanaian cedi", ar: "سيدي غاني" },
  { code: "KRW", exp: 0, en: "Korean won", ar: "وون كوري" },
];

const CURRENCY_MAP = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCY_MAP.get(code) ?? { code, exp: 2, en: code, ar: code };
}

export function exponent(code: string): number {
  return currencyInfo(code).exp;
}

export type SeedCategory = {
  id: string;
  nameKey: string;
  kind: "expense" | "income";
  icon: string;
  swatch: Swatch;
};

export const SEED_CATEGORIES: SeedCategory[] = [
  { id: "cat_bills", nameKey: "catBills", kind: "expense", icon: "Receipt", swatch: "sand" },
  { id: "cat_auto", nameKey: "catAuto", kind: "expense", icon: "Car", swatch: "sage" },
  { id: "cat_home", nameKey: "catHome", kind: "expense", icon: "House", swatch: "pine" },
  { id: "cat_kids", nameKey: "catKids", kind: "expense", icon: "Baby", swatch: "sand" },
  { id: "cat_clothes", nameKey: "catClothes", kind: "expense", icon: "Shirt", swatch: "clay" },
  { id: "cat_food", nameKey: "catFood", kind: "expense", icon: "Utensils", swatch: "pine" },
  { id: "cat_fuel", nameKey: "catFuel", kind: "expense", icon: "Fuel", swatch: "sage" },
  { id: "cat_fun", nameKey: "catFun", kind: "expense", icon: "Clapperboard", swatch: "clay" },
  { id: "cat_health", nameKey: "catHealth", kind: "expense", icon: "HeartPulse", swatch: "sand" },
  { id: "cat_salary", nameKey: "catSalary", kind: "income", icon: "Banknote", swatch: "pine" },
  { id: "cat_other_in", nameKey: "catOtherIn", kind: "income", icon: "CircleDollarSign", swatch: "sage" },
];

export const ACCOUNT_ICONS: Record<AccountType, string> = {
  cash: "Wallet",
  bank: "Landmark",
  mobile_wallet: "Smartphone",
  card: "CreditCard",
  savings: "PiggyBank",
  other: "CircleDollarSign",
};

export function detectDefaults(): { locale: "en" | "ar"; currency: string; weekStart: 0 | 1 | 6 } {
  let lang = "en";
  let tz = "";
  if (typeof navigator !== "undefined") lang = navigator.language || "en";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    tz = "";
  }
  const locale: "en" | "ar" = lang.toLowerCase().startsWith("ar") ? "ar" : "en";
  const currency = currencyFromZone(tz) ?? currencyFromLang(lang) ?? "USD";
  const gulf = /Qatar|Riyadh|Dubai|Kuwait|Bahrain|Muscat/.test(tz);
  const weekStart: 0 | 1 | 6 = locale === "ar" || gulf ? 6 : /en-US|en-CA/.test(lang) ? 0 : 1;
  return { locale, currency, weekStart };
}

function currencyFromZone(tz: string): string | null {
  const table: [RegExp, string][] = [
    [/Qatar/, "QAR"],
    [/Dubai|Abu_Dhabi/, "AED"],
    [/Riyadh/, "SAR"],
    [/Kuwait/, "KWD"],
    [/Bahrain/, "BHD"],
    [/Muscat/, "OMR"],
    [/Khartoum/, "SDG"],
    [/Cairo/, "EGP"],
    [/Amman/, "JOD"],
    [/Singapore/, "SGD"],
    [/Tokyo/, "JPY"],
    [/Seoul/, "KRW"],
    [/Shanghai|Hong_Kong/, "CNY"],
    [/London/, "GBP"],
    [/Paris|Berlin|Rome|Madrid|Amsterdam/, "EUR"],
    [/New_York|Chicago|Los_Angeles|Denver|Phoenix/, "USD"],
    [/Kolkata|Calcutta/, "INR"],
    [/Karachi/, "PKR"],
    [/Jakarta/, "IDR"],
    [/Kuala_Lumpur/, "MYR"],
    [/Sydney|Melbourne/, "AUD"],
    [/Toronto|Vancouver/, "CAD"],
    [/Zurich/, "CHF"],
    [/Johannesburg/, "ZAR"],
    [/Lagos/, "NGN"],
    [/Nairobi/, "KES"],
    [/Accra/, "GHS"],
    [/Istanbul/, "TRY"],
    [/Casablanca/, "MAD"],
    [/Tunis/, "TND"],
  ];
  for (const [re, code] of table) if (re.test(tz)) return code;
  return null;
}

function currencyFromLang(lang: string): string | null {
  const region = lang.split("-")[1]?.toUpperCase();
  const map: Record<string, string> = {
    QA: "QAR",
    US: "USD",
    GB: "GBP",
    AE: "AED",
    SA: "SAR",
    KW: "KWD",
    BH: "BHD",
    OM: "OMR",
    EG: "EGP",
    SD: "SDG",
    JO: "JOD",
    JP: "JPY",
    IN: "INR",
    EU: "EUR",
    DE: "EUR",
    FR: "EUR",
  };
  return region ? (map[region] ?? null) : null;
}
