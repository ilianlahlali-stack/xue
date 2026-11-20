"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ChevronRight, MessagesSquare, Plus } from "lucide-react";
import { addConversation, listConversations } from "@/lib/db";
import type { Conversation } from "@/lib/types";
import { Button, Card, Chip, Input, Label, Page, PageHeader, Spinner } from "@/components/ui";

const TOPIC_IDEAS = ["Se présenter", "Au restaurant", "Ma famille", "Le week-end", "Faire les courses", "Mes études"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function PracticePage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listConversations().then(setConversations);
  }, []);

  async function start(e?: FormEvent) {
    e?.preventDefault();
    setCreating(true);
    const title = topic.trim() || `Conversation du ${new Date().toLocaleDateString("fr-FR")}`;
    const conversation = await addConversation({ title, topic: topic.trim() });
    router.push(`/practice/${conversation.id}`);
  }

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Practice"
        subtitle="Discute en chinois avec l'IA : elle corrige tes phrases et répond avec les mots et structures que tu connais."
      />

      <Card className="mb-6 p-5">
        <form onSubmit={start} className="flex flex-col gap-3">
          <label>
            <Label hint="facultatif">Thème de la conversation</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex. au restaurant, ma famille…" />
          </label>
          <div className="-mx-1 flex flex-wrap gap-2">
            {TOPIC_IDEAS.map((idea) => (
              <Chip key={idea} active={topic === idea} onClick={() => setTopic(topic === idea ? "" : idea)}>
                {idea}
              </Chip>
            ))}
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={creating}>
            <Plus size={18} /> Nouvelle conversation
          </Button>
        </form>
      </Card>

      {conversations === null ? (
        <div className="flex justify-center py-10 text-muted">
          <Spinner />
        </div>
      ) : conversations.length > 0 ? (
        <>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Conversations</h2>
          <ul className="flex flex-col gap-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/practice/${c.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:border-accent/40"
                >
                  <MessagesSquare size={18} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="text-xs text-muted">{formatDate(c.updated_at)}</span>
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Page>
  );
}
