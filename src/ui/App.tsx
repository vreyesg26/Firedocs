import { AppShell } from "@mantine/core";
import { HeaderMenu } from "./components/HeaderMenu";
import { Outlet } from "react-router-dom";

const App = () => {

  return (
    <AppShell
      padding="md"
      header={{ height: 60 }}
    >
      <AppShell.Header>
        <HeaderMenu />
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
};

export default App;
