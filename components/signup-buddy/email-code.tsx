"use client";

import { useState } from "react";

/**
 * Confirming an email with a 6-digit code: the email field turns into six
 * code boxes once the code is sent, then back into the locked address with a
 * check. Sending and checking are up to you (see SignupModal's sendCode and verifyCode).
 */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalEmail = (email: string) => email.trim().toLowerCase();

export type EmailStage = "typing" | "code" | "verified";
export type Purpose = "signup" | "login";

/** What your auth calls return: nothing when it worked, or a message to show */
export type Outcome = { error?: string } | void;

/**
 * Props for the sign-up name and email, so the browser shows no saved
 * suggestions: Chrome ignores autocomplete="off" on name and email fields but
 * never autofills a search field. inputMode keeps the email keyboard on phones.
 */
export function noAutofill(kind: "name" | "email") {
  return {
    type: "search",
    autoComplete: "off",
    inputMode: kind === "email" ? ("email" as const) : ("text" as const),
    autoCapitalize: kind === "email" ? "none" : "words",
    spellCheck: false,
    enterKeyHint: "next" as const,
  };
}

/** The code's state around your two calls: send returns an error message or "", type says whether the code checked out */
export function useEmailCode({
  sendCode,
  verifyCode,
}: {
  sendCode: (email: string, purpose: Purpose) => Promise<Outcome>;
  verifyCode: (email: string, code: string, purpose: Purpose) => Promise<Outcome>;
}) {
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  // After "Change", the address isn't mailed again until it changes or they ask
  const [holdFor, setHoldFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sending" | "checking" | null>(null);

  const stage = (email: string): EmailStage => (verified === email ? "verified" : sentTo === email ? "code" : "typing");

  return {
    code,
    busy,
    verified,
    stage,
    /** Whether a finished address should be mailed once typing pauses */
    canAutoSend: (email: string) => EMAIL.test(email) && stage(email) === "typing" && holdFor !== email && !busy,
    async send(email: string, purpose: Purpose): Promise<string> {
      setBusy("sending");
      setSentTo(email);
      setCode("");
      setHoldFor(null);
      const error = await sendCode(email, purpose).then(
        (r) => r?.error ?? "",
        () => "We couldn't send the code. Try again.",
      );
      setBusy(null);
      if (error) {
        setSentTo(null);
        setHoldFor(email);
      }
      return error;
    },
    /**
     * Takes the boxes' new value; checks the code once all six digits are in.
     * "signup" only proves the email (the password step creates the account), "login" signs them in.
     */
    async type(email: string, value: string, purpose: Purpose): Promise<{ verified: boolean; error: string }> {
      setCode(value);
      // Typing works while the code is still sending: only a check already running waits
      if (value.length < 6 || busy === "checking") return { verified: false, error: "" };
      setBusy("checking");
      const error = await verifyCode(email, value, purpose).then(
        (r) => r?.error ?? "",
        () => "We couldn't check the code. Try again.",
      );
      setBusy(null);
      if (error) {
        setCode("");
        return { verified: false, error };
      }
      setVerified(email);
      return { verified: true, error: "" };
    },
    /** Back to typing the address, e.g. to fix a typo */
    change(email: string) {
      setHoldFor(email);
      setSentTo(null);
      setCode("");
    },
    reset() {
      setSentTo(null);
      setCode("");
    },
  };
}

/** Six boxes for the email code. One invisible input on top takes typing, paste and the keyboard's code suggestion. */
export function CodeBoxes({
  value,
  disabled,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, 5);
  return (
    <div className="relative">
      <div className="grid grid-cols-6 gap-2.5" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            id={`sb-code-box-${i}`}
            className={`flex h-12 items-center justify-center rounded-xl bg-[var(--sb-panel-2)] text-[20px] font-semibold text-[var(--sb-fg)] transition-shadow ${
              focused && i === active ? "ring-2 ring-[var(--sb-accent)]" : "ring-1 ring-[var(--sb-border)]"
            } ${disabled ? "opacity-60" : ""}`}
          >
            {value[i] ??
              (focused && i === active ? <span className="h-5 w-[1.5px] animate-pulse rounded-[1px] bg-[var(--sb-fg)]" /> : null)}
          </span>
        ))}
      </div>
      <input
        id="sb-code"
        aria-label="6-digit code"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}

/** Under the boxes: where the code went, with Change to fix the address */
export function CodeNote({ email, sending, onChange }: { email: string; sending: boolean; onChange: () => void }) {
  return (
    <p className="mt-3 truncate text-[13px] text-[var(--sb-muted)]">
      {sending ? "Sending a code to " : "Enter the code sent to "}
      <span className="text-[var(--sb-fg)]">{email}</span>
      {" · "}
      <button type="button" onClick={onChange} className="underline underline-offset-4 hover:text-[var(--sb-fg)]">
        Change
      </button>
    </p>
  );
}
