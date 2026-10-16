import { useMemo, useState } from "react";
import { CURRENCIES } from "@/masroof/catalog";
import type { AccountType } from "@/masroof/types";
import { useMasroof } from "@/masroof/store";
import { Mark } from "@/components/masroof/icons";
import { fieldClass, PrimaryButton, QuietButton, useI18n } from "@/components/masroof/ui";

const TYPES: AccountType[] = ["cash", "bank", "mobile_wallet", "card", "savings", "other"];

export function Onboarding() {
  const { t, tf, locale } = useI18n();
  const settings = useMasroof((s) => s.data.settings);
  const patchSettings = useMasroof((s) => s.patchSettings);
  const finish = useMasroof((s) => s.finishOnboarding);
  const [step, setStep] = useState(settings.onboardingStep || 0);
  const [query, setQuery] = useState("");
  const [name, setName] = useState(settings.pendingAccountName || (locale === "ar" ? "نقد" : "Cash"));
  const [type, setType] = useState<AccountType>(settings.pendingAccountType || "cash");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [sample, setSample] = useState(settings.pendingSample);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CURRENCIES.filter((c) => !q || c.code.toLowerCase().includes(q) || c.en.toLowerCase().includes(q) || c.ar.includes(query.trim())).slice(0, 12);
  }, [query]);

  const go = (next: number) => {
    setStep(next);
    setError("");
    void patchSettings({ onboardingStep: next, pendingAccountName: name, pendingAccountType: type, pendingSample: sample });
  };

  const complete = async (useSample: boolean, usePin: string | null) => {
    setBusy(true);
    await finish({
      accountName: name.trim() || (locale === "ar" ? "نقد" : "Cash"),
      accountType: type,
      sample: useSample,
      pin: usePin,
    });
    setBusy(false);
  };

  const skip = () => void complete(false, null);

  const pinIssue = () => {
    if (pin.length < 4 || pin.length > 6 || pin2.length < 4) return t("pinShort");
    if (pin !== pin2) return t("pinMismatch");
    return "";
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 py-8">
      <div className="flex items-center justify-between">
        <Mark className="size-9 text-accent" />
        <p className="text-xs tracking-widest text-muted uppercase">{tf("stepOf", { n: step + 1 })}</p>
      </div>
      {step === 0 ? (
        <div className="mt-10 flex flex-1 flex-col">
          <p className="text-sm text-muted">{t("kicker")}</p>
          <h1 className="mt-2 font-display text-5xl leading-tight">{t("tagline")}</h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted">{t("subtag")}</p>
          <p className="mt-10 text-sm text-muted">{t("languageTitle")}</p>
          <div className="mt-3 grid gap-3">
            <Choice on={locale === "en"} onClick={() => void patchSettings({ locale: "en" })} label={t("langEnglish")} />
            <Choice on={locale === "ar"} onClick={() => void patchSettings({ locale: "ar" })} label={t("langArabic")} />
          </div>
          <div className="mt-auto grid gap-3 pt-8">
            <PrimaryButton onClick={() => go(1)}>{t("continue")}</PrimaryButton>
            <QuietButton onClick={skip}>{t("skipSetup")}</QuietButton>
            <p className="text-center text-sm text-muted">{t("defaultsHint")}</p>
          </div>
        </div>
      ) : null}
      {step === 1 ? (
        <div className="mt-8 flex min-h-0 flex-1 flex-col">
          <h1 className="font-display text-4xl">{t("currencyTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("currencyHelp")}</p>
          <input className={`${fieldClass} mt-5`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchCurrency")} aria-label={t("searchCurrency")} />
          <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-4">
            {currencies.map((c) => (
              <Choice
                key={c.code}
                on={settings.baseCurrency === c.code}
                onClick={() => void patchSettings({ baseCurrency: c.code })}
                label={`${c.code} · ${locale === "ar" ? c.ar : c.en}`}
              />
            ))}
          </div>
          <div className="grid gap-3 pt-3">
            <PrimaryButton onClick={() => go(2)}>{t("continue")}</PrimaryButton>
            <QuietButton onClick={skip}>{t("skipSetup")}</QuietButton>
          </div>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="mt-8 flex flex-1 flex-col">
          <h1 className="font-display text-4xl">{t("accountTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{t("accountHelp")}</p>
          <p className="mt-2 text-sm text-muted">{t("noHalf")}</p>
          <label className="mt-5 block text-sm text-muted">
            {t("accountName")}
            <input className={`${fieldClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {TYPES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`h-12 rounded-xl border text-sm ${type === item ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface"}`}
              >
                {t(item === "mobile_wallet" ? "mobileWallet" : item)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">{t("savingsAre")}</p>
          <div className="mt-auto grid gap-3 pt-8">
            <PrimaryButton onClick={() => go(3)} disabled={!name.trim()}>{t("continue")}</PrimaryButton>
            <QuietButton onClick={() => go(1)}>{t("back")}</QuietButton>
          </div>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="mt-8 flex flex-1 flex-col">
          <h1 className="font-display text-4xl">{t("securityTitle")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t("securityBody")}</p>
          <label className="mt-5 block text-sm text-muted">
            {t("setPin")}
            <input className={`${fieldClass} nums mt-1`} inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>
          <label className="mt-3 block text-sm text-muted">
            {t("pinAgain")}
            <input className={`${fieldClass} nums mt-1`} inputMode="numeric" autoComplete="off" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>
          {pin && /^(\d)\1+$/.test(pin) ? <p className="mt-2 text-sm text-warn">{t("pinEasy")}</p> : null}
          {error ? <p className="mt-2 text-sm text-expense" role="alert">{error}</p> : null}
          <div className="mt-auto grid gap-3 pt-8">
            <PrimaryButton
              disabled={busy}
              onClick={() => {
                const issue = pinIssue();
                if (issue) {
                  setError(issue);
                  return;
                }
                go(4);
              }}
            >
              {t("setPin")}
            </PrimaryButton>
            <QuietButton onClick={() => { setPin(""); setPin2(""); go(4); }}>{t("skipPin")}</QuietButton>
          </div>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="mt-8 flex flex-1 flex-col">
          <h1 className="font-display text-4xl">{t("sampleTitle")}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t("sampleHelp")}</p>
          <div className="mt-5 grid gap-3">
            <Choice on={sample} onClick={() => setSample(true)} label={t("sampleOn")} />
            <Choice on={!sample} onClick={() => setSample(false)} label={t("sampleOff")} />
          </div>
          <div className="mt-auto grid gap-3 pt-8">
            <PrimaryButton disabled={busy} onClick={() => void complete(sample, pin.length >= 4 && pin === pin2 ? pin : null)}>
              {t("enterApp")}
            </PrimaryButton>
            <QuietButton onClick={() => go(3)}>{t("back")}</QuietButton>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Choice({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-14 items-center rounded-2xl border px-4 text-start text-base ${on ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface"}`}
    >
      {label}
    </button>
  );
}
