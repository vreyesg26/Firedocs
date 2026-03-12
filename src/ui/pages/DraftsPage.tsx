import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Card,
  Container,
  Divider,
  Flex,
  Group,
  Menu,
  Modal,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconArrowsSort,
  IconEye,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useManual } from "@/context/ManualContext";
import { notifyError, notifySuccess } from "@/lib/notifications";
import { mainColor } from "@/lib/utils";
import {
  getManualProgress,
  type ManualProgressState,
} from "@/lib/manual-progress";

type DraftMeta = {
  id: string;
  fileName: string;
  filePath: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  size?: number;
  activeStep?: number;
  visibleStepKeys?: string[];
  progressState?: unknown;
};

type SortMode = "updated_desc" | "name_asc" | "created_desc" | "size_desc";

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "N/D";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDraftProgress(progressState?: ManualProgressState) {
  return getManualProgress(progressState ?? {});
}

function TruncatedDraftTitle({ title }: { title: string }) {
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
  }, [title]);

  return (
    <Tooltip label={title} withArrow disabled={!isTruncated}>
      <Text ref={textRef} fw={700} size="lg" truncate>
        {title}
      </Text>
    </Tooltip>
  );
}

export default function DraftsPage() {
  const navigate = useNavigate();
  const { loadDraftById, deleteDraftById } = useManual();
  const [drafts, setDrafts] = useState<DraftMeta[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<DraftMeta | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("updated_desc");

  async function refreshDrafts() {
    const list = await window.ipc.draftList();
    setDrafts(list ?? []);
  }

  useEffect(() => {
    void window.ipc.setWindowTitle("Borradores");
    void refreshDrafts();
  }, []);

  async function handleContinueDraft(id: string) {
    setLoadingId(id);
    try {
      const ok = await loadDraftById(id);
      if (!ok) {
        notifyError({
          title: "No se pudo cargar el borrador",
          message: "Intenta nuevamente",
        });
        return;
      }
      navigate("/import");
    } finally {
      setLoadingId(null);
    }
  }

  function handleOpenDeleteModal(draft: DraftMeta) {
    setDraftToDelete(draft);
    setDeleteModalOpen(true);
  }

  function handleCloseDeleteModal() {
    setDeleteModalOpen(false);
    setDraftToDelete(null);
  }

  async function handleDeleteDraft() {
    if (!draftToDelete) return;
    const draftName = draftToDelete.name || "Sin título";
    const ok = await deleteDraftById(draftToDelete.id);
    if (!ok) {
      notifyError({
        title: "No se pudo eliminar el borrador",
        message: "Intenta nuevamente",
      });
      return;
    }
    handleCloseDeleteModal();
    await refreshDrafts();
    notifySuccess({
      title: "Borrador eliminado",
      message: `El borrador "${draftName}" se eliminó correctamente`,
    });
  }

  const sortedDrafts = useMemo(() => {
    const next = [...drafts];

    if (sortMode === "name_asc") {
      next.sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      );
      return next;
    }

    if (sortMode === "created_desc") {
      next.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return next;
    }

    if (sortMode === "size_desc") {
      next.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
      return next;
    }

    next.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return next;
  }, [drafts, sortMode]);

  return (
    <Container fluid px={3} py={3}>
      <Flex justify="space-between" align="center" mb="md">
        <Title order={2}>Borradores</Title>
        <Group gap="xs">
          {drafts.length > 0 && (
            <Menu withinPortal position="bottom-end" shadow="sm">
              <Menu.Target>
                <Button
                  variant="filled"
                  color={mainColor}
                  leftSection={<IconArrowsSort size={16} />}
                >
                  Ordenar
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => setSortMode("updated_desc")}>
                  Fecha de actualización
                </Menu.Item>
                <Menu.Item onClick={() => setSortMode("created_desc")}>
                  Fecha de creación
                </Menu.Item>
                <Menu.Item onClick={() => setSortMode("name_asc")}>
                  Nombre (A-Z)
                </Menu.Item>
                <Menu.Item onClick={() => setSortMode("size_desc")}>
                  Tamaño (mayor a menor)
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
          <Button
            variant="default"
            leftSection={<IconArrowLeft size={16} />}
            color="gray"
            onClick={() => navigate("/")}
          >
            Volver al inicio
          </Button>
        </Group>
      </Flex>

      <Divider my="md" />

      {drafts.length === 0 ? (
        <Flex
          mt="md"
          mih="60vh"
          align="center"
          justify="center"
          style={{ width: "100%" }}
        >
          <Text c="dimmed" ta="center" size="md">
            No hay borradores guardados.
          </Text>
        </Flex>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="xs">
          {sortedDrafts.map((draft) => {
            const progress = getDraftProgress(
              draft.progressState as ManualProgressState | undefined,
            );
            return (
              <Card key={draft.id} withBorder radius="sm" p={0}>
                <Stack p="md" gap="lg">
                  <Stack gap={4}>
                    <TruncatedDraftTitle title={draft.name || "Sin título"} />
                  </Stack>

                  <Stack gap={4}>
                    <Group justify="space-between" align="center">
                      <Text size="sm" c="dimmed" fw={600}>
                        {progress.completed ? "Completado" : "En progreso"}
                      </Text>
                      <Text size="sm" c="dimmed" fw={700}>
                        {progress.percent}%
                      </Text>
                    </Group>
                    <Progress
                      value={progress.percent}
                      color={progress.completed ? "green" : mainColor}
                      size="sm"
                      radius="sm"
                    />
                  </Stack>

                  <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                      Creado: {new Date(draft.createdAt).toLocaleString()}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Actualizado: {new Date(draft.updatedAt).toLocaleString()}
                    </Text>
                    <Text size="sm" c="dimmed">
                      Tamaño: {formatBytes(draft.size)}
                    </Text>
                  </Stack>

                  <Group gap={5} wrap="nowrap">
                    <Button
                      leftSection={progress.completed ? <IconEye size={16} /> : <IconPencil size={14} />}
                      color={mainColor}
                      onClick={() => handleContinueDraft(draft.id)}
                      loading={loadingId === draft.id}
                      style={{ flex: 1 }}
                    >
                      {progress.completed ? "Ver detalles" : "Seguir editando"}
                    </Button>
                    <ActionIcon
                      color="red"
                      size="lg"
                      onClick={() => handleOpenDeleteModal(draft)}
                      aria-label="Eliminar borrador"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      <Modal
        opened={deleteModalOpen}
        onClose={handleCloseDeleteModal}
        title="Eliminar borrador"
        centered
        radius="md"
        size="sm"
        withinPortal={false}
      >
        <Stack>
          <Text>
            ¿Estás seguro de que deseas eliminar el borrador{" "}
            <Text span fw={700}>
              &quot;{draftToDelete?.name || "Sin título"}&quot;
            </Text>
            ? Esta acción no se puede deshacer.
          </Text>
          <Flex justify="flex-end" gap="xs">
            <Button variant="default" onClick={handleCloseDeleteModal}>
              Cancelar
            </Button>
            <Button color="red" onClick={handleDeleteDraft}>
              Eliminar
            </Button>
          </Flex>
        </Stack>
      </Modal>
    </Container>
  );
}
