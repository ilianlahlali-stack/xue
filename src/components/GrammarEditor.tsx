"use client";

import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { fr } from "@blocknote/core/locales";
import type { PartialBlock } from "@blocknote/core";

/** Notion-like block editor. Load with next/dynamic and `ssr: false`. */
export default function GrammarEditor({
  initialContent,
  onChange,
}: {
  initialContent: unknown;
  onChange: (document: unknown) => void;
}) {
  const editor = useCreateBlockNote({
    initialContent:
      Array.isArray(initialContent) && initialContent.length ? (initialContent as PartialBlock[]) : undefined,
    dictionary: {
      ...fr,
      placeholders: {
        ...fr.placeholders,
        default: "Écris, ou tape « / » pour insérer un titre, une liste, un tableau…",
      },
    },
  });

  return <BlockNoteView editor={editor} onChange={() => onChange(editor.document)} />;
}
