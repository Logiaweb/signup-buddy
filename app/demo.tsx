"use client";

import { useState } from "react";
import { SignupModal } from "@/components/signup-buddy";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A fake app behind the modal, so the blur has something to show */
function Backdrop() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="h-8 w-40 rounded-lg bg-white/10" />
      <div className="mt-16 h-14 w-2/3 rounded-xl bg-white/15" />
      <div className="mt-4 h-6 w-1/3 rounded-lg bg-[#3a6df0]/40" />
      <div className="mt-12 grid grid-cols-2 gap-5 md:grid-cols-4">
        {["#f54e00", "#3a6df0", "#2f9e5b", "#c084fc", "#f59e0b", "#14b8a6", "#ec4899", "#64748b"].map((c) => (
          <div key={c} className="aspect-[4/3] rounded-2xl" style={{ background: `linear-gradient(135deg, ${c}55, #ffffff10)` }} />
        ))}
      </div>
    </div>
  );
}

export function Demo() {
  const [open, setOpen] = useState(true);
  const [user, setUser] = useState<string | null>(null);
  const [note, setNote] = useState("");

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#141213] text-[#f4f1ee]">
      <Backdrop />

      <div className="fixed inset-x-0 bottom-8 flex flex-col items-center gap-3 px-6 text-center">
        {user ? <p className="text-[15px]">Signed in as {user}. That&apos;s the whole flow.</p> : null}
        {note ? <p className="text-[13px] text-[#9b938f]">{note}</p> : null}
        <button
          type="button"
          onClick={() => {
            setUser(null);
            setOpen(true);
          }}
          className="rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-black"
        >
          Open the sign-up modal
        </button>
        <p className="text-[13px] text-[#9b938f]">Demo: any 6-digit code works, except 000000.</p>
      </div>

      <SignupModal
        open={open}
        onClose={() => setOpen(false)}
        socialProof={{ count: "8,000+ builders", label: "already joined" }}
        newsletter={
          <>
            <span className="font-medium text-[#f4f1ee]">Send me the weekly newsletter.</span> One email a week, unsubscribe anytime.
          </>
        }
        // Mock auth: swap these for your own (Supabase, Clerk, Better Auth, your API...)
        sendCode={async (email) => {
          await wait(700);
          setNote(`(A real app would email a code to ${email}.)`);
        }}
        verifyCode={async (_email, code) => {
          await wait(600);
          if (code === "000000") return { error: "That code didn't work. Check it and try again." };
        }}
        signUp={async ({ name }) => {
          await wait(900);
          setUser(name);
        }}
        logIn={async ({ email }) => {
          await wait(900);
          setUser(email);
        }}
        onOAuth={async (provider) => {
          await wait(500);
          setNote(`(A real app would redirect to ${provider === "google" ? "Google" : "Apple"} here.)`);
        }}
        onSuccess={() => {
          setNote("");
          setOpen(false);
        }}
      />
    </main>
  );
}
