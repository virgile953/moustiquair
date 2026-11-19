"use client";

import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { City } from "@/lib/cities";

/**
 * Teacher login.
 *
 * The password is never checked here: the form posts it to the server, which
 * verifies the scrypt hash and creates an HttpOnly session cookie.
 */
export function AdminLogin({ city }: { city: City }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        setError(body?.error?.message ?? "La connexion a échoué.");
        return;
      }

      setPassword("");
      router.refresh();
    } catch {
      setError("Le serveur est injoignable. Réessayez dans un instant.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-[calc(100dvh-68px)] items-center justify-center overflow-hidden px-5 py-14">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 12%, rgba(217,75,56,0.12), transparent 38%)",
        }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-5 flex items-center justify-between gap-3">
          <Badge variant="soft">
            <LockKeyhole className="size-3" aria-hidden="true" />
            Espace enseignant
          </Badge>
          <span className="text-xs font-medium text-muted-foreground">
            {city.name} · {city.insee}
          </span>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_35px_90px_-58px_rgba(33,29,25,0.65)] sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Connexion à la modération</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cet espace permet de valider les signalements de {city.name} et de gérer les données de
            démonstration de cette commune. Il est réservé à l&apos;enseignant responsable du
            projet.
          </p>

          <form className="mt-6" onSubmit={handleSubmit}>
            {/* Helps password managers associate this single-field login with the teacher account. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value="enseignant"
              readOnly
              hidden
            />
            <Label htmlFor="admin-password">Mot de passe enseignant</Label>
            <Input
              id="admin-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-2"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
            />
            {error ? (
              <p
                id="login-error"
                role="alert"
                className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="mt-4 w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              Se connecter
            </Button>
          </form>

          <p className="mt-5 border-t border-border/70 pt-4 text-[0.7rem] leading-relaxed text-muted-foreground">
            Le mot de passe est vérifié côté serveur à partir d&apos;un hachage scrypt. Aucun mot de
            passe en clair n&apos;est stocké dans le code ou la base de données.
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Les signalements publics ne demandent aucun compte.
        </p>
      </div>
    </main>
  );
}
