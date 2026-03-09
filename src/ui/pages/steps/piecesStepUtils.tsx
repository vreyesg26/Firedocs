import { useEffect, useRef, useState } from "react";
import { Text, Tooltip } from "@mantine/core";

export const FIX_IDENTIFIER_OPTIONS = ["Hotfix", "Bugfix", "Incidencia"] as const;

export type FixIdentifier = (typeof FIX_IDENTIFIER_OPTIONS)[number];

export function extFromFileName(fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed.includes(".")) return "";

  const lastPart = trimmed.split(".").pop()?.trim() || "";
  if (!lastPart) return "";

  const ext = lastPart.toUpperCase();
  if (ext === "XQ" || ext === "XQY") return "XQUERY";
  if (ext === "BIZ") return "BUSINESS";
  return ext;
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function moveListItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length || from < 0 || from >= items.length) {
    return items;
  }

  const next = [...items];
  const [picked] = next.splice(from, 1);
  next.splice(to, 0, picked);
  return next;
}

export function inferIdentifierFromBranch(
  branch: string | undefined,
): FixIdentifier {
  const normalized = (branch || "").toLowerCase();
  if (normalized.includes("bugfix")) return "Bugfix";
  if (normalized.includes("hotfix")) return "Hotfix";
  return "Hotfix";
}

export function normalizeIdentifier(
  value: string | null | undefined,
): FixIdentifier {
  if (!value) return "Hotfix";
  const normalized = value.trim().toLowerCase();
  if (normalized === "bugfix") return "Bugfix";
  if (normalized === "incidencia") return "Incidencia";
  return "Hotfix";
}

export function formatGitDateTime(value: string | undefined) {
  if (!value?.trim()) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function toDateTimeInputValue(value: string | undefined) {
  if (!value?.trim()) return "";
  if (value.includes("T")) return value.slice(0, 16);
  if (value.includes(" ")) return value.replace(" ", "T").slice(0, 16);
  return value;
}

export function toDateTimeDisplayValue(value: string | undefined) {
  if (!value?.trim()) return "";
  return value.replace("T", " ");
}

export function TruncatedNameCell({ value }: { value: string }) {
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const checkTruncation = () => {
      const el = textRef.current;
      if (!el) return;
      setIsTruncated(el.scrollWidth > el.clientWidth);
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [value]);

  return (
    <Tooltip label={value} withArrow disabled={!isTruncated}>
      <Text ref={textRef} truncate size="sm">
        {value}
      </Text>
    </Tooltip>
  );
}
