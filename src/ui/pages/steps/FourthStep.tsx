import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useManual } from "@/context/ManualContext";
import { mainColor } from "@/lib/utils";

type ListKey = "services" | "areas";

export const FourthStep = () => {
  const {
    servicesProducts: servicesProductsRaw,
    setServicesProducts,
    affectedAreas: affectedAreasRaw,
    setAffectedAreas,
  } = useManual() as {
    servicesProducts?: string[];
    setServicesProducts: (values: string[]) => void;
    affectedAreas?: string[];
    setAffectedAreas: (values: string[]) => void;
  };

  const servicesInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const areasInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [pendingFocus, setPendingFocus] = useState<{
    list: ListKey;
    index: number;
  } | null>(null);

  const servicesList =
    Array.isArray(servicesProductsRaw) && servicesProductsRaw.length > 0
      ? servicesProductsRaw
      : [""];
  const areasList =
    Array.isArray(affectedAreasRaw) && affectedAreasRaw.length > 0
      ? affectedAreasRaw
      : [""];

  useEffect(() => {
    if (!pendingFocus) return;

    const target =
      pendingFocus.list === "services"
        ? servicesInputRefs.current[pendingFocus.index]
        : areasInputRefs.current[pendingFocus.index];

    if (target) {
      target.focus();
      setPendingFocus(null);
    }
  }, [pendingFocus, servicesList.length, areasList.length]);

  function handleServiceProductChange(index: number, value: string) {
    const next = [...servicesList];
    next[index] = value;
    setServicesProducts(next);
  }

  function handleAffectedAreaChange(index: number, value: string) {
    const next = [...areasList];
    next[index] = value;
    setAffectedAreas(next);
  }

  function handleAddServiceProduct(shouldFocus = false) {
    const next = [...servicesList, ""];
    setServicesProducts(next);
    if (shouldFocus) {
      setPendingFocus({ list: "services", index: next.length - 1 });
    }
  }

  function handleAddAffectedArea(shouldFocus = false) {
    const next = [...areasList, ""];
    setAffectedAreas(next);
    if (shouldFocus) {
      setPendingFocus({ list: "areas", index: next.length - 1 });
    }
  }

  function handleAddServiceProductClick() {
    handleAddServiceProduct(false);
  }

  function handleAddAffectedAreaClick() {
    handleAddAffectedArea(false);
  }

  function handleDeleteServiceProduct(index: number) {
    const next = servicesList.filter((_, itemIndex) => itemIndex !== index);
    setServicesProducts(next.length > 0 ? next : [""]);
  }

  function handleDeleteAffectedArea(index: number) {
    const next = areasList.filter((_, itemIndex) => itemIndex !== index);
    setAffectedAreas(next.length > 0 ? next : [""]);
  }

  return (
    <>
      <Title order={2}>
        Lista de servicios/productos relacionados y áreas afectadas
      </Title>
      <Divider my="xs" />

      <Stack gap='xs'>
        <Paper withBorder p="sm" radius="sm">
          <Stack>
            <Text>
              Listar Servicios/Productos que están relacionados y que se verán
              impactados (Ejem: Pago de Tarjetas, Ingreso de Gestiones,
              Aperturas de Cuentas, etc.)
            </Text>
            <Stack gap="xs">
              {servicesList.map((value, index) => (
                <Group key={`service-product-${index}`} gap="xs" wrap="nowrap">
                  <TextInput
                    ref={(node) => {
                      servicesInputRefs.current[index] = node;
                    }}
                    value={value}
                    onChange={(event) =>
                      handleServiceProductChange(index, event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      if (!value.trim()) return;
                      event.preventDefault();
                      handleAddServiceProduct(true);
                    }}
                    placeholder={`Servicio/Producto ${index + 1}`}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => handleDeleteServiceProduct(index)}
                    aria-label={`Eliminar servicio o producto ${index + 1}`}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="filled"
                leftSection={<IconPlus size={16} />}
                onClick={handleAddServiceProductClick}
                color={mainColor}
                w="fit-content"
              >
                Añadir fila
              </Button>
            </Stack>
          </Stack>
        </Paper>
        <Paper withBorder p="sm" radius="sm">
          <Stack>
            <Text>
              Listar áreas que se verán impactadas (Caja, Operaciones, Remesas,
              Cumplimiento, etc.)
            </Text>
            <Stack gap="xs">
              {areasList.map((value, index) => (
                <Group key={`affected-area-${index}`} gap="xs" wrap="nowrap">
                  <TextInput
                    ref={(node) => {
                      areasInputRefs.current[index] = node;
                    }}
                    value={value}
                    onChange={(event) =>
                      handleAffectedAreaChange(index, event.currentTarget.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      if (!value.trim()) return;
                      event.preventDefault();
                      handleAddAffectedArea(true);
                    }}
                    placeholder={`Área afectada ${index + 1}`}
                    style={{ flex: 1 }}
                  />
                  <ActionIcon
                    color="red"
                    variant="light"
                    onClick={() => handleDeleteAffectedArea(index)}
                    aria-label={`Eliminar área afectada ${index + 1}`}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              ))}
              <Button
                variant="filled"
                color={mainColor}
                leftSection={<IconPlus size={16} />}
                onClick={handleAddAffectedAreaClick}
                w="fit-content"
              >
                Añadir fila
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    </>
  );
};
