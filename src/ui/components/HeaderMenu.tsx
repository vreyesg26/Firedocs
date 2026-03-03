import {
  ActionIcon,
  Flex,
  Group,
  Image,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import logo from "@/ui/assets/firedocs-logo.png";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";

export function HeaderMenu() {
  const { setColorScheme, colorScheme } = useMantineColorScheme();
  const navigate = useNavigate();

  return (
    <Flex
      h="100%"
      justify="space-between"
      align="center"
      px={32}
    >
      <Group
        gap={4}
        align="center"
        onClick={() => navigate("/")}
        style={{ cursor: "pointer" }}
      >
        <Image src={logo} w={35} />
        <Title order={5}>FireDocs</Title>
      </Group>

      <Group gap={10} align="center">
        <Title order={5}>Banco Ficohsa</Title>
        <ActionIcon
          variant="default"
          size="lg"
          onClick={() =>
            setColorScheme(colorScheme === "dark" ? "light" : "dark")
          }
        >
          {colorScheme === "dark" ? (
            <IconSun size={20} stroke={1.5} />
          ) : (
            <IconMoon size={20} stroke={1.5} />
          )}
        </ActionIcon>
      </Group>
    </Flex>
  );
}
