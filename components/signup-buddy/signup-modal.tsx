"use client";

import { useEffect, useState, useTransition } from "react";
import { EyeBuddy } from "./eye-buddy";
import { CodeBoxes, CodeNote, EMAIL, noAutofill, normalEmail as normal, useEmailCode, type Outcome, type Purpose } from "./email-code";

export type { Outcome, Purpose };
export type Provider = "google" | "apple";

type Field = "name" | "email" | "password";
/** What has focus, for the mascot: a field, or the code boxes */
type Focus = Field | "code";

/**
 * Sign up: name, email (confirmed with an emailed code), then a password.
 * Log in: email and password. Code: forgot the password, log in with an emailed code instead.
 */
type Mode = "signup" | "login" | "code";

const FIELDS: Record<Mode, Field[]> = {
  signup: ["name", "email", "password"],
  login: ["email", "password"],
  code: ["email"],
};

const PASSWORD_MIN = 8;

// No visible labels: the placeholder says what goes in, and screen readers get the label
const LABELS: Record<Field, string> = { name: "Name", email: "Email", password: "Password" };
const HINTS: Record<Field, string> = { name: "Your name", email: "Your email", password: "Your password" };

export type SignupModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called once they're signed up or logged in */
  onSuccess?: () => void;
  /** The sign-up title */
  headline?: string;
  initialMode?: "signup" | "login";
  /** Faces and a count under the title, e.g. { count: "8,000+ builders", label: "already joined" } */
  socialProof?: { count: string; label?: string; avatars?: string[] };
  /** Social buttons to show; they need onOAuth */
  providers?: Provider[];
  /** A newsletter opt-in shown before the account is created, ticked by default; leave out to hide it */
  newsletter?: React.ReactNode;

  /** Mail a 6-digit code: "signup" to confirm a new address, "login" for a forgotten password */
  sendCode: (email: string, purpose: Purpose) => Promise<Outcome>;
  /** Check the code. For "signup" this only proves the email; for "login" it signs them in */
  verifyCode: (email: string, code: string, purpose: Purpose) => Promise<Outcome>;
  /** Create the account, after the email is proven. Return { error, codeExpired: true } to send them back for a new code */
  signUp: (details: { name: string; email: string; password: string; newsletter: boolean }) => Promise<Outcome | { error: string; codeExpired: true }>;
  logIn: (details: { email: string; password: string }) => Promise<Outcome>;
  /** Off to Google or Apple; usually a redirect */
  onOAuth?: (provider: Provider, options: { newsletter: boolean }) => Promise<Outcome>;
};

/** What's wrong with a field's answer, or ""; on sign-up the email only counts once its code checked out (codeReady) */
function problemWith(f: Field, values: Record<Field, string>, mode: Mode, codeReady: boolean): string {
  const v = values[f].trim();
  if (f === "name" && !v) return "Add your name.";
  if (f === "email" && !EMAIL.test(v)) return "That email doesn't look right.";
  if (f === "email" && mode === "signup" && !codeReady) return "Enter the 6-digit code we emailed you.";
  if (f === "password" && !values.password) return "Add your password.";
  if (f === "password" && mode === "signup" && values.password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters for your password.`;
  }
  return "";
}

/** Where the text cursor sits in an input, on screen, for the mascot to look at */
function caretPoint(input: HTMLInputElement): { x: number; y: number } {
  const box = input.getBoundingClientRect();
  const style = getComputedStyle(input);
  const ctx = document.createElement("canvas").getContext("2d");
  const pad = parseFloat(style.paddingLeft);
  let width = 0;
  if (ctx) {
    ctx.font = style.font;
    width = ctx.measureText(input.value.slice(0, input.selectionStart ?? input.value.length)).width;
  }
  return {
    x: Math.min(box.left + pad + width - input.scrollLeft, box.right - pad),
    y: box.top + box.height / 2,
  };
}

/** The value after the last change settles, so the mascot doesn't retype on every key */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** What the mascot says, from where the visitor is in the form */
function mascotLine(o: {
  error: string | undefined;
  pending: boolean;
  busy: "sending" | "checking" | null;
  field: Focus;
  signup: boolean;
  first: string;
  emailOk: boolean;
  verified: boolean;
}): string {
  if (o.error) return "Hmm, check that one.";
  if (o.pending) return "One second...";
  if (o.busy === "sending") return "Sending you a code...";
  if (o.busy === "checking") return "Checking your code...";
  if (o.field === "code") return "Check your inbox.";
  if (o.field === "password") return "I'm not looking.";
  if (o.field === "email") {
    if (o.verified) return "You're verified!";
    if (o.emailOk) return "That looks right.";
    if (!o.signup) return "Welcome back!";
    return o.first ? `Nice to meet you, ${o.first}!` : "What's your email?";
  }
  return o.first ? `Hi ${o.first}!` : "Hi! What's your name?";
}

const socialButton =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--sb-panel-2)] text-[15px] font-semibold text-[var(--sb-fg)] ring-1 ring-[var(--sb-border)] transition-colors hover:bg-[var(--sb-panel-3)] disabled:opacity-60";

/** Google's "G", in its own colours */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/** Apple's logo, filled like the real one */
function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} className="-mt-0.5" fill="currentColor" aria-hidden>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 256 256" width={18} height={18} fill="currentColor" aria-hidden>
      <path d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 256 256" width={20} height={20} fill="currentColor" aria-label="Email verified" className={className}>
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24Zm45.66 85.66-56 56a8 8 0 0 1-11.32 0l-24-24a8 8 0 0 1 11.32-11.32L112 148.69l50.34-50.35a8 8 0 0 1 11.32 11.32Z" />
    </svg>
  );
}

const AVATAR_FILLS = ["linear-gradient(135deg,#ffb38a,#f54e00)", "linear-gradient(135deg,#9ad0ff,#3a6df0)", "linear-gradient(135deg,#c6f0b0,#2f9e5b)"];

/** Social proof: three faces, the count, then what they did */
function SocialProof({ count, label = "already joined", avatars }: NonNullable<SignupModalProps["socialProof"]>) {
  const faces = avatars?.length ? avatars.slice(0, 3) : AVATAR_FILLS;
  return (
    <div className="mt-4 flex items-center gap-2.5">
      <span className="flex shrink-0 -space-x-2">
        {faces.map((src, i) =>
          avatars?.length ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 rounded-full object-cover ring-2 ring-[var(--sb-panel)]"
              style={{ zIndex: faces.length - i }}
            />
          ) : (
            <span key={src} className="h-6 w-6 rounded-full ring-2 ring-[var(--sb-panel)]" style={{ background: src, zIndex: faces.length - i }} />
          ),
        )}
      </span>
      <p className="text-[13px] leading-[1.35] text-[var(--sb-muted)]">
        <span className="font-semibold text-[var(--sb-fg)]">{count}</span> {label}
      </p>
    </div>
  );
}

/**
 * A sign-up modal with a mascot that watches you type. Each field shows once
 * the last one is right, the email is confirmed with a 6-digit code, and the
 * cube shuts its eyes for the password. Bring your own auth through the props.
 */
export function SignupModal(props: SignupModalProps) {
  if (!props.open) return null;
  return (
    <>
      <style href="signup-buddy" precedence="default">
        {CSS}
      </style>
      <Dialog {...props} />
    </>
  );
}

function Dialog({
  onClose,
  onSuccess,
  headline = "Sign up to keep exploring",
  initialMode = "signup",
  socialProof,
  providers = ["google", "apple"],
  newsletter,
  sendCode,
  verifyCode,
  signUp,
  logIn,
  onOAuth,
}: SignupModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const signup = mode === "signup";
  // Sign-up confirms the email with a code; "code" logs in with one
  const usesCode = mode !== "login";
  // Kept ticked unless they untick it
  const [weekly, setWeekly] = useState(Boolean(newsletter));
  const [done, setDone] = useState(false);
  const [oauthPending, startOAuthTransition] = useTransition();
  const [submitPending, startSubmit] = useTransition();
  const pending = done || oauthPending || submitPending;
  const socials = onOAuth ? providers : [];

  // The form grows: the next field shows below once the last one is filled in and typing pauses, or on Enter
  const fields = FIELDS[mode];
  const [values, setValues] = useState<Record<Field, string>>({ name: "", email: "", password: "" });
  const [shown, setShown] = useState(1);
  const [focused, setFocused] = useState<Focus | null>(null);
  const [error, setError] = useState("");
  const all = shown === fields.length;

  // The email field turns into code boxes once the code is sent, then back into the locked, checked address
  const emailCode = useEmailCode({ sendCode, verifyCode });
  const { busy } = emailCode;
  const email = normal(values.email);
  // Sign-up: the code checked out, so the email is proven and the password comes next
  const codeReady = signup && emailCode.verified === email;
  const emailOk = EMAIL.test(email);
  const emailStage = usesCode ? emailCode.stage(email) : "typing";

  // The mascot: watches the text cursor, shuts its eyes for the password, comments on the answers
  const [gaze, setGaze] = useState<{ x: number; y: number } | null>(null);
  const [hops, setHops] = useState(0);
  const [shakes, setShakes] = useState(0);
  const field: Focus = focused ?? (emailStage === "code" ? "code" : fields[shown - 1]);
  const first = values.name.trim().split(/\s+/)[0];
  const line = useSettled(
    mascotLine({ error, pending, busy, field, signup, first, emailOk, verified: emailStage === "verified" }),
    350,
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  function focusField(f: Focus, tries = 30) {
    // Once the render that shows it lands; the email's spot holds the code boxes while a code is pending
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(`#sb-${f}`) ?? (f === "email" ? document.querySelector<HTMLInputElement>("#sb-code") : null);
      // Disabled while a code is sending or checking: wait for it like for a field not rendered yet
      if (input && !input.disabled) input.focus();
      else if (tries > 0) focusField(f, tries - 1);
    });
  }

  function complain(f: Focus, problem: string) {
    setError(problem);
    setShakes((n) => n + 1);
    focusField(f);
  }

  function finish() {
    setDone(true);
    setHops((n) => n + 1);
    onSuccess?.();
  }

  async function sendEmailCode() {
    const problem = await emailCode.send(email, signup ? "signup" : "login");
    if (problem) return complain("email", problem);
    setError("");
    setHops((n) => n + 1);
    focusField("code");
  }

  /** Back to typing the address, e.g. to fix a typo */
  function changeEmail() {
    emailCode.change(email);
    setError("");
    focusField("email");
  }

  function social(provider: Provider) {
    setError("");
    startOAuthTransition(async () => {
      const result = await onOAuth?.(provider, { newsletter: signup && weekly });
      if (result?.error) complain(fields[0], result.error);
    });
  }

  /** Shows and focuses the field after this one, once this one is right; a typed email gets its code first */
  function advanceFrom(f: Field) {
    if (f === "email" && usesCode && emailStage !== "verified" && !codeReady) {
      if (!emailOk) return complain("email", "That email doesn't look right.");
      if (emailStage === "typing" && !busy) sendEmailCode();
      else if (emailStage === "code") focusField("code");
      return;
    }
    const problem = problemWith(f, values, mode, codeReady);
    if (problem) return complain(f, problem);
    const index = fields.indexOf(f);
    if (index === fields.length - 1) return submit();
    if (index + 1 >= shown) setHops((n) => n + 1);
    setShown((n) => Math.max(n, index + 2));
    focusField(fields[index + 1]);
  }

  /** The last field is right: create the account (sign-up) or check the password (log-in) */
  function submit() {
    setError("");
    startSubmit(async () => {
      const result = signup
        ? await signUp({ name: values.name.trim(), email, password: values.password, newsletter: weekly })
        : await logIn({ email, password: values.password });
      if (result?.error) {
        if ("codeExpired" in result) {
          // The proof expired: back to the address, to get a new code
          emailCode.change(email);
          setShown(2);
          return complain("email", result.error);
        }
        return complain("password", result.error);
      }
      finish();
    });
  }

  function switchMode(to: Mode) {
    if (pending) return;
    setMode(to);
    setShown(1);
    setError("");
    emailCode.reset();
    setGaze(null);
  }

  function change(f: Field, e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (f === "email" && !emailOk && EMAIL.test(normal(value))) setHops((n) => n + 1);
    setValues((v) => ({ ...v, [f]: value }));
    setError("");
    if (f !== "password") setGaze(caretPoint(e.target));
  }

  async function changeCode(value: string) {
    setError("");
    const box = document.getElementById(`sb-code-box-${Math.min(value.length, 5)}`)?.getBoundingClientRect();
    if (box) setGaze({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const result = await emailCode.type(email, value, signup ? "signup" : "login");
    if (result.error) return complain("code", result.error);
    if (!result.verified) return;
    setHops((n) => n + 1);
    if (signup) {
      // Email proven: the boxes turn back into the locked address, and the password comes next
      setShown(fields.length);
      focusField("password");
      return;
    }
    // Logged in with the code
    finish();
  }

  /** Sign-up skips the browser's saved suggestions on name and email; log-in keeps them, and password managers get the password */
  function typeProps(f: Field) {
    if (f === "password") return { type: "password", autoComplete: signup ? "new-password" : "current-password" };
    return signup ? noAutofill(f) : { type: f === "name" ? "text" : "email", autoComplete: f };
  }

  function follow(f: Field, e: React.SyntheticEvent<HTMLInputElement>) {
    setFocused(f);
    if (f !== "password") setGaze(caretPoint(e.currentTarget));
  }

  // Once typing pauses: show the next field, and mail the code to a finished address.
  // No dependency list: every render restarts the timer, so it only fires after a pause.
  useEffect(() => {
    const mailNow = usesCode && emailCode.canAutoSend(email) && (!signup || !problemWith("name", values, mode, codeReady));
    const timer = window.setTimeout(
      () => {
        if (mailNow) return void sendEmailCode();
        let filled = 0;
        while (filled < fields.length - 1 && !problemWith(fields[filled], values, mode, codeReady)) filled++;
        if (filled + 1 <= shown) return;
        setShown(filled + 1);
        setHops((h) => h + 1);
        // Still in the field they just finished: carry on into the new one
        if (focused === fields[filled - 1]) focusField(fields[filled]);
      },
      // A longer pause before mailing, so a half-typed address isn't sent
      mailNow ? 1400 : 900,
    );
    return () => window.clearTimeout(timer);
  });

  const inputClass =
    "h-12 w-full rounded-xl bg-[var(--sb-panel-2)] px-4 text-[16px] text-[var(--sb-fg)] outline-none ring-1 ring-[var(--sb-border)] placeholder:text-[var(--sb-muted)] focus:ring-2 focus:ring-[var(--sb-accent)] [&::-webkit-search-cancel-button]:appearance-none";

  return (
    <div className="sb-root fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-labelledby="sb-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-md" />
      <div className="sb-fade-in-up relative max-h-[92dvh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl bg-[var(--sb-panel)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] text-[var(--sb-fg)] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)] md:rounded-3xl md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[var(--sb-muted)] hover:bg-[var(--sb-panel-2)] hover:text-[var(--sb-fg)]"
        >
          <CloseIcon />
        </button>

        <h2 id="sb-title" className="pr-8 text-[26px] font-semibold leading-[1.1] tracking-[-0.03em]">
          {signup ? headline : "Welcome back"}
        </h2>
        {signup ? null : (
          <p className="mt-1.5 text-[15px] leading-[1.5] text-[var(--sb-muted)]">
            {mode === "code" ? "We'll email you a code to log in." : "Log in to pick up where you left off."}
          </p>
        )}
        {signup && socialProof ? <SocialProof {...socialProof} /> : null}

        {socials.length ? (
          <>
            <div className={`mt-6 grid gap-2 ${socials.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {socials.map((p) => (
                <button key={p} type="button" onClick={() => social(p)} disabled={pending} className={socialButton}>
                  {p === "google" ? <GoogleG /> : <AppleMark />}
                  {p === "google" ? "Google" : "Apple"}
                </button>
              ))}
            </div>
            <p className="mt-5 flex items-center gap-3 text-[13px] text-[var(--sb-muted)] before:h-px before:flex-1 before:bg-[var(--sb-border)] after:h-px after:flex-1 after:bg-[var(--sb-border)]">
              or with your email
            </p>
          </>
        ) : null}

        {/* The mascot sits right above the fields it watches */}
        <EyeBuddy size={52} bubble="right" say={line} gaze={gaze} closed={field === "password"} hops={hops} shakes={shakes} className="mt-6" />

        <form
          key={mode}
          onSubmit={(e) => {
            e.preventDefault();
            if (emailStage === "code") {
              if (emailCode.code.length === 6) changeCode(emailCode.code);
              else focusField("code");
              return;
            }
            advanceFrom(fields[shown - 1]);
          }}
          className="mt-4 flex flex-col gap-4"
          noValidate
        >
          {fields.slice(0, shown).map((f, i) =>
            f === "email" && emailStage === "code" ? (
              // The code boxes take the email's place until the code checks out
              <div key="code" className="sb-fade-in-up">
                <CodeBoxes
                  value={emailCode.code}
                  disabled={busy === "checking" || pending}
                  onChange={changeCode}
                  onFocus={() => setFocused("code")}
                  onBlur={() => {
                    setFocused(null);
                    setGaze(null);
                  }}
                />
                <CodeNote email={email} sending={busy === "sending"} onChange={changeEmail} />
              </div>
            ) : (
              <label key={f} className={`block ${i ? "sb-fade-in-up" : ""}`}>
                <span className="relative block">
                  <input
                    id={`sb-${f}`}
                    name={f}
                    {...typeProps(f)}
                    value={values[f]}
                    // Verified: the address is locked, with a check
                    readOnly={f === "email" && emailStage === "verified"}
                    onChange={(e) => change(f, e)}
                    onFocus={(e) => follow(f, e)}
                    onClick={(e) => follow(f, e)}
                    onKeyUp={(e) => follow(f, e)}
                    onBlur={() => {
                      setFocused(null);
                      setGaze(null);
                    }}
                    onKeyDown={(e) => {
                      // Enter opens the next field; on the last one it submits
                      if (e.key === "Enter" && f !== fields[fields.length - 1]) {
                        e.preventDefault();
                        advanceFrom(f);
                      }
                    }}
                    aria-label={LABELS[f]}
                    placeholder={f === "password" && signup ? `Choose a password (${PASSWORD_MIN}+ characters)` : HINTS[f]}
                    className={`${inputClass} ${f === "email" && emailStage === "verified" ? "pr-12 text-[var(--sb-muted)] focus:ring-1 focus:ring-[var(--sb-border)]" : ""}`}
                  />
                  {f === "email" && emailStage === "verified" ? (
                    <CheckIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--sb-accent)]" />
                  ) : null}
                </span>
              </label>
            ),
          )}

          {/* Right under the password, on log-in */}
          {mode === "login" && all ? (
            <p className="-mt-2 text-[13px] text-[var(--sb-muted)]">
              Forgot your password?{" "}
              <button type="button" onClick={() => switchMode("code")} className="font-medium text-[var(--sb-fg)] underline underline-offset-4">
                Get a code by email
              </button>
            </p>
          ) : null}

          {/* Once the email's code is in, with the password and the button that creates the account */}
          {newsletter && signup && all && codeReady ? (
            <label className="sb-fade-in-up flex cursor-pointer items-start gap-3 text-[14px] leading-[1.45] text-[var(--sb-muted)]">
              <input
                type="checkbox"
                checked={weekly}
                onChange={(e) => setWeekly(e.target.checked)}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--sb-accent)]"
              />
              <span>{newsletter}</span>
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-[var(--sb-danger)]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || busy === "checking" || (emailStage === "code" ? emailCode.code.length < 6 : busy !== null)}
            className="sb-button text-[16px]"
          >
            {pending
              ? signup
                ? "Creating your account..."
                : "Logging in..."
              : busy === "checking"
                ? "Checking..."
                : busy === "sending" && emailStage !== "code"
                  ? "Sending your code..."
                  : all && mode !== "code"
                    ? signup
                      ? "Create my free account"
                      : "Log in"
                    : "Continue"}
          </button>
        </form>

        <p className="mt-4 text-center text-[14px] text-[var(--sb-muted)]">
          {signup ? "Already a member? " : mode === "code" ? "Remember your password? " : "New here? "}
          <button
            type="button"
            onClick={() => switchMode(signup || mode === "code" ? "login" : "signup")}
            className="font-medium text-[var(--sb-fg)] underline underline-offset-4"
          >
            {signup || mode === "code" ? "Log in" : "Create a free account"}
          </button>
        </p>
      </div>
    </div>
  );
}

/**
 * The colours, the button and the animations. :where() keeps the defaults at
 * zero specificity, so a `.sb-root { --sb-accent: ... }` of yours wins.
 */
const CSS = `
:where(.sb-root) {
  --sb-panel: #1f1c1d;
  --sb-panel-2: #2a2627;
  --sb-panel-3: #141213;
  --sb-fg: #f4f1ee;
  --sb-muted: #9b938f;
  --sb-border: rgba(255, 255, 255, 0.08);
  --sb-accent: #f54e00;
  --sb-accent-top: #f66e00;
  --sb-accent-edge: #d94300;
  --sb-danger: #f87171;
  --sb-bubble: #f6f3ef;
  --sb-bubble-fg: #1c1a1b;
  --sb-cube: #1c1a1b;
  --sb-eye: #f6f3ef;
  color-scheme: dark;
}
.sb-root input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; }

.sb-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 0 24px;
  border: 0;
  border-radius: 9999px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #fff;
  background: linear-gradient(180deg, var(--sb-accent-top) 0, var(--sb-accent) 100%);
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.33), 0 0 0 1px var(--sb-accent-edge);
  cursor: pointer;
  transition: filter 0.12s ease, transform 0.12s ease, opacity 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}
.sb-button:hover { filter: brightness(1.08); }
.sb-button:active { transform: scale(0.985); filter: brightness(0.96); }
.sb-button:disabled { opacity: 0.45; transform: none; filter: none; cursor: default; }
.sb-button:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 3px; }

@keyframes sb-fade-in-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
.sb-fade-in-up { animation: sb-fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }

@keyframes sb-hop {
  0% { transform: translateY(0) scaleY(1); }
  25% { transform: translateY(-9px) scaleY(1.04); }
  50% { transform: translateY(0) scaleY(0.94); }
  70% { transform: translateY(-3px) scaleY(1); }
  100% { transform: translateY(0) scaleY(1); }
}
.sb-hop { animation: sb-hop 0.6s cubic-bezier(0.3, 0.9, 0.4, 1); transform-origin: 50% 100%; }

@keyframes sb-shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  20% { transform: translateX(-5px) rotate(-6deg); }
  40% { transform: translateX(5px) rotate(5deg); }
  60% { transform: translateX(-3px) rotate(-3deg); }
  80% { transform: translateX(2px) rotate(1deg); }
}
.sb-shake { animation: sb-shake 0.5s ease-in-out; }

@media (prefers-reduced-motion: reduce) {
  .sb-fade-in-up, .sb-hop, .sb-shake { animation: none; }
}
`;
