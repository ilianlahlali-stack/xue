"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, FileUp, HardDrive, LogOut, RotateCcw, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { supabaseBackupDb } from "@/lib/db";
import { backupCounts, describeCounts, exportBackup, parseBackup, restoreBackup, type Backup } from "@/lib/backup";
import {
  lastFileExport,
  listSnapshots,
  localBackupAvailable,
  markFileExported,
  saveBackupFile,
  saveSnapshot,
  type Snapshot,
} from "@/lib/localBackup";
import { Button, Card, Page, PageHeader, Spinner } from "@/components/ui";

function formatDate(iso: string | Date) {
  return new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ago(date: Date) {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "done"; text: string } | { kind: "error"; text: string };

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Backup | null>(null);
  const [lastExport, setLastExport] = useState<Date | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
    listSnapshots().then(setSnapshots);
    // localStorage is only readable in the browser, after the first render.
    const timer = setTimeout(() => setLastExport(lastFileExport()), 0);
    return () => clearTimeout(timer);
  }, []);

  async function prepare() {
    setStatus({ kind: "busy", text: "Récupération de toutes tes données…" });
    try {
      setPrepared(await exportBackup(supabaseBackupDb()));
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", text: `Export impossible : ${err instanceof Error ? err.message : err}` });
    }
  }

  async function saveFile(backup: Backup) {
    await saveBackupFile(backup);
    markFileExported();
    setLastExport(new Date());
  }

  async function restore(backup: Backup, origin: string) {
    const summary = describeCounts(backupCounts(backup));
    const ok = confirm(
      `Restaurer la sauvegarde du ${formatDate(backup.exported_at)} (${origin}) ?\n\n${summary}\n\n` +
        "Ce qui manque est remis, ce qui existe est remis tel qu'à cette date (progression des révisions comprise). " +
        "Ce que tu as ajouté depuis est conservé."
    );
    if (!ok) return;
    try {
      await restoreBackup(supabaseBackupDb(), backup, (step) => setStatus({ kind: "busy", text: `Restauration : ${step}…` }));
      setStatus({ kind: "done", text: `Restauration terminée : ${summary}.` });
    } catch (err) {
      setStatus({
        kind: "error",
        text: `La restauration s'est arrêtée : ${err instanceof Error ? err.message : err}. Tu peux la relancer sans risque de doublons.`,
      });
    }
  }

  async function restoreFromFile(file: File) {
    try {
      await restore(parseBackup(await file.text()), file.name);
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function snapshotNow() {
    if (!localBackupAvailable()) {
      setStatus({ kind: "error", text: "Ce navigateur ne permet pas de garder des copies (navigation privée ?)." });
      return;
    }
    setStatus({ kind: "busy", text: "Copie en cours…" });
    try {
      await saveSnapshot(await exportBackup(supabaseBackupDb()));
      setSnapshots(await listSnapshots());
      setStatus({ kind: "done", text: "Copie enregistrée sur cet appareil." });
    } catch (err) {
      setStatus({ kind: "error", text: `Copie impossible : ${err instanceof Error ? err.message : err}` });
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const busy = status.kind === "busy";

  return (
    <Page className="max-w-2xl">
      <PageHeader title="Réglages" />

      <Card className="mb-4 flex flex-col gap-5 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-good-soft text-good">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2 className="font-semibold">Sauvegarde</h2>
            <p className="mt-0.5 text-sm text-muted">
              Tes données vivent dans Supabase. Pour ne jamais tout perdre, garde aussi un fichier chez toi (Fichiers, iCloud,
              Drive, mail…) : il contient tout, progression des révisions comprise, et se restaure même dans une base neuve.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {prepared ? (
            <>
              <p className="text-sm">{describeCounts(backupCounts(prepared))}</p>
              <Button variant="primary" size="lg" onClick={() => saveFile(prepared)}>
                <Download size={18} /> Enregistrer le fichier
              </Button>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={prepare} disabled={busy}>
              <Download size={18} /> Exporter mes données
            </Button>
          )}
          <p className="text-xs text-muted">
            {lastExport ? `Dernier fichier enregistré ${ago(lastExport)} sur cet appareil.` : "Aucun fichier enregistré depuis cet appareil."}{" "}
            Un export par semaine suffit.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm font-medium">Restaurer depuis un fichier</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) restoreFromFile(file);
            }}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileUp size={18} /> Choisir un fichier
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <HardDrive size={16} className="text-muted" /> Copies automatiques sur cet appareil
          </p>
          <p className="text-xs text-muted">
            Une copie par jour est gardée dans cet appareil (les 7 dernières), sur chaque appareil où tu utilises l&apos;app.
          </p>
          {/* snapshots is null until the browser storage has been read (never on the server). */}
          <Button size="sm" className="self-start" onClick={snapshotNow} disabled={busy || snapshots === null}>
            Faire une copie maintenant
          </Button>
          {snapshots === null ? (
            <Spinner />
          ) : snapshots.length === 0 ? (
            <p className="text-sm text-muted">Pas encore de copie ici : la première se fait automatiquement en utilisant l&apos;app.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {snapshots.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 rounded-xl bg-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">{formatDate(s.created_at)}</p>
                    <p className="text-xs text-muted">{describeCounts(s.counts)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                    <Button size="sm" variant="ghost" onClick={() => saveFile(s.backup)}>
                      <Download size={15} /> Fichier
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => restore(s.backup, "copie de l'appareil")} disabled={busy}>
                      <RotateCcw size={15} /> Restaurer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {status.kind !== "idle" && (
          <p
            className={
              status.kind === "error"
                ? "rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent"
                : status.kind === "done"
                  ? "rounded-xl bg-good-soft px-3 py-2 text-sm text-good"
                  : "flex items-center gap-2 text-sm text-muted"
            }
          >
            {status.kind === "busy" && <Spinner />}
            {status.text}
          </p>
        )}
      </Card>

      <Card className="flex items-center gap-3 p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Compte</h2>
          <p className="truncate text-sm text-muted">{email ?? "…"}</p>
        </div>
        <Button onClick={signOut}>
          <LogOut size={16} /> Se déconnecter
        </Button>
      </Card>
    </Page>
  );
}
