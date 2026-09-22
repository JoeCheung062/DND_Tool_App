import { roomsApi } from "../api/resources";
import { NamedResourcePage } from "./NamedResourcePage";

export function RoomsPage() {
  return (
    <NamedResourcePage
      title="Rooms"
      subtitle="Live play rooms used by Socket.IO sessions."
      list={roomsApi.list}
      create={roomsApi.create}
      update={roomsApi.update}
      remove={roomsApi.remove}
    />
  );
}
