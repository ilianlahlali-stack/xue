"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) {
        setError(
          error.message === "Email not confirmed"
            ? "Adresse non confirmée : clique sur le lien reçu par mail, puis reconnecte-toi."
            : "Identifiants incorrects."
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) {
        setError(error.message === "Signups not allowed for this instance" ? "Les inscriptions sont fermées." : error.message);
        return;
      }
      if (data.session) {
        router.replace("/");
        router.refresh();
      } else {
        setInfo("Compte créé : confirme ton adresse via le mail reçu, puis connecte-toi.");
        setMode("signin");
      }
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="hz-kai flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-4xl text-accent-ink shadow-lg shadow-accent/20">
            学
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Xué</h1>
            <p className="text-sm text-muted">{mode === "signin" ? "Content de te revoir" : "Créer ton compte"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <label>
            <Label>Email</Label>
            <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            <Label>Mot de passe</Label>
            <Input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>}
          {info && <p className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{info}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={loading}>
            {loading ? "…" : mode === "signin" ? "Se connecter" : "Créer le compte"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-sm text-muted hover:text-ink"
        >
          {mode === "signin" ? "Première fois ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
