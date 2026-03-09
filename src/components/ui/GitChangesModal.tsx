import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Tabs,
  Group,
  Text,
  Badge,
  Loader,
  ScrollArea,
  CopyButton,
  Tooltip,
  ActionIcon,
  Checkbox,
  TextInput,
  Button,
  Stack,
} from "@mantine/core";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import type { RepoStatus, RepoChange } from "@/types/git";
import { mainColor } from "@/lib/utils";
import { extFromFileName } from "@/ui/pages/steps/piecesStepUtils";

const COPY_ABSOLUTE = false;

function kindToLabel(kind: RepoChange["kind"]) {
  switch (kind) {
    case "modified":
      return "Modificado";
    case "added":
    case "unknown":
    case "untracked":
      return "Nuevo";
    case "deleted":
      return "Eliminado";
    case "renamed":
      return "Renombrado";
    case "copied":
      return "Copiado";
    default:
      return kind;
  }
}

function isNewChange(kind: RepoChange["kind"]) {
  return kind === "added" || kind === "unknown" || kind === "untracked";
}

function isModifiedChange(kind: RepoChange["kind"]) {
  return kind === "modified";
}

function isVisibleChange(kind: RepoChange["kind"]) {
  return isNewChange(kind) || isModifiedChange(kind);
}

function badgeColorByKind(kind: RepoChange["kind"]) {
  return isNewChange(kind) ? "green" : "orange";
}

function changeLabel(ch: RepoChange) {
  return `${kindToLabel(ch.kind)}: ${ch.path}`;
}

function typeBadgeLabel(ch: RepoChange) {
  return extFromFileName(ch.ext || ch.path || "") || "∅";
}

function joinFs(a: string, b: string) {
  if (!a) return b;
  const sep = a.includes("\\") ? "\\" : "/";
  return a.replace(/[\\/]+$/, "") + sep + b.replace(/^[\\/]+/, "");
}

type GitChangesModalProps = {
  opened: boolean;
  onClose: () => void;
  data: RepoStatus[];
  loading?: boolean;
  onCreate?: (payload: {
    repo: RepoStatus;
    changes: RepoChange[];
    groupName: string;
  }) => void;
};

type SelectedMap = Record<string, Set<number>>;

export function GitChangesModal({
  opened,
  onClose,
  data,
  loading,
  onCreate,
}: GitChangesModalProps) {
  const hasRepos = Array.isArray(data) && data.length > 0;

  const [activeRepoPath, setActiveRepoPath] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<SelectedMap>({});

  useEffect(() => {
    if (!hasRepos) {
      setActiveRepoPath(null);
      setGroupName("");
      setSelected({});
      return;
    }

    const first = data[0];
    setActiveRepoPath(first.repoPath);
    setGroupName(first.repoName || "");

    const initial: SelectedMap = {};
    for (const repo of data) {
      const set = new Set<number>();
      repo.changes.forEach((ch, idx) => {
        if (isVisibleChange(ch.kind)) {
          set.add(idx);
        }
      });
      initial[repo.repoPath] = set;
    }
    setSelected(initial);
  }, [opened, hasRepos, data]);

  const activeRepo = useMemo(
    () => data.find((r) => r.repoPath === activeRepoPath) || null,
    [data, activeRepoPath]
  );

  function toggleChange(repoPath: string, index: number, checked: boolean) {
    setSelected((prev) => {
      const current = new Set(prev[repoPath] ?? []);
      if (checked) current.add(index);
      else current.delete(index);
      return { ...prev, [repoPath]: current };
    });
  }

  function handleCreate() {
    if (!onCreate || !activeRepo) {
      onClose();
      return;
    }

    const indices = selected[activeRepo.repoPath] ?? new Set<number>();
    const chosen = activeRepo.changes.filter(
      (ch, i) => indices.has(i) && isVisibleChange(ch.kind)
    );
    if (chosen.length === 0) {
      onClose();
      return;
    }

    const name = groupName.trim() || activeRepo.repoName || "Piezas detalladas";

    onCreate({
      repo: activeRepo,
      changes: chosen.map((ch) => ({
        ...ch,
        kind:
          ch.kind === "unknown" || ch.kind === "untracked" ? "added" : ch.kind,
      })),
      groupName: name,
    });

    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Listado de fuentes afectados"
      size="xl"
      radius="md"
      centered
      withinPortal={false}
      zIndex={10000}
      overlayProps={{ opacity: 0.55, blur: 3 }}
      withCloseButton
      returnFocus
      trapFocus
      color={mainColor}
    >
      {loading ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : !hasRepos ? (
        <Group justify="center" p="xl">
          <Text c="dimmed">
            No se encontraron repositorios o no hay cambios para mostrar.
          </Text>
        </Group>
      ) : (
        <Stack gap="md">
          <Tabs
            value={activeRepoPath ?? data[0].repoPath}
            onChange={(val) => setActiveRepoPath(val)}
            color={mainColor}
          >
            <Tabs.List>
              {data.map((repo) => {
                const visibleCount = repo.changes.filter((ch) =>
                  isVisibleChange(ch.kind)
                ).length;

                return (
                  <Tabs.Tab key={repo.repoPath} value={repo.repoPath}>
                    <Group gap="xs">
                      <Text fw={600}>{repo.repoName}</Text>
                      {repo.branch && (
                        <Badge variant="light" color={mainColor}>
                          {repo.branch}
                        </Badge>
                      )}
                      {repo.ahead || repo.behind ? (
                        <Badge variant="outline" color={mainColor}>
                          ↑{repo.ahead ?? 0} ↓{repo.behind ?? 0}
                        </Badge>
                      ) : null}
                      <Badge color={visibleCount ? mainColor : "gray"}>
                        {visibleCount}
                      </Badge>
                    </Group>
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>

            {data.map((repo) => {
              const visibleChanges = repo.changes
                .map((ch, i) => ({ change: ch, index: i }))
                .filter(({ change }) => isVisibleChange(change.kind));

              const selectedSet = selected[repo.repoPath] ?? new Set<number>();

              return (
                <Tabs.Panel key={repo.repoPath} value={repo.repoPath} pt="md">
                  <ScrollArea h={340} type="hover">
                    {visibleChanges.length === 0 ? (
                      <Text c="dimmed">
                        No hay archivos nuevos o modificados para mostrar.
                      </Text>
                    ) : (
                      visibleChanges.map(({ change: ch, index: i }) => {
                        const pathToCopy = COPY_ABSOLUTE
                          ? joinFs(repo.repoPath, ch.path)
                          : ch.path;

                        const checked = selectedSet.has(i);

                        return (
                          <Group
                            key={i}
                            justify="space-between"
                            py={6}
                            align="center"
                            wrap="nowrap"
                          >
                            <Group
                              gap="xs"
                              align="center"
                              wrap="nowrap"
                              style={{ minWidth: 0, flex: 1 }}
                            >
                              <Checkbox
                                checked={checked}
                                onChange={(e) =>
                                  toggleChange(
                                    repo.repoPath,
                                    i,
                                    e.currentTarget.checked
                                  )
                                }
                                color={mainColor}
                              />
                              <Badge variant="dot" color={badgeColorByKind(ch.kind)}>
                                {typeBadgeLabel(ch)}
                              </Badge>
                              <Text truncate>{changeLabel(ch)}</Text>
                              {ch.conflicted && <Badge color="red">conflicto</Badge>}
                            </Group>

                            <CopyButton value={pathToCopy} timeout={2000}>
                              {({ copied, copy }) => (
                                <Tooltip
                                  label={copied ? "Copiado" : "Copiar ruta"}
                                  withArrow
                                  position="left"
                                >
                                  <ActionIcon
                                    color={copied ? "teal" : "gray"}
                                    variant="subtle"
                                    onClick={copy}
                                  >
                                    {copied ? (
                                      <IconCheck size={16} />
                                    ) : (
                                      <IconCopy size={16} />
                                    )}
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </CopyButton>
                          </Group>
                        );
                      })
                    )}
                  </ScrollArea>
                </Tabs.Panel>
              );
            })}
          </Tabs>

          <Group justify="space-between" mt="sm" gap="xs" align="center">
            <TextInput
              placeholder="Nombre de la tabla"
              value={groupName}
              onChange={(e) => setGroupName(e.currentTarget.value)}
              style={{ flexGrow: 1 }}
            />
            <Button
              onClick={handleCreate}
              disabled={!activeRepo}
              color={mainColor}
            >
              Crear tabla
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
