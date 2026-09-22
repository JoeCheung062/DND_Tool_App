import { campaignsApi } from "../api/resources";
import { NamedResourcePage } from "./NamedResourcePage";

export function CampaignsPage() {
  return (
    <NamedResourcePage
      title="Campaigns"
      subtitle="Campaigns that materials can be preset into."
      list={campaignsApi.list}
      create={campaignsApi.create}
      update={campaignsApi.update}
      remove={campaignsApi.remove}
      extraColumns={[
        {
          key: "presets",
          header: "Material presets",
          render: (r) => r._count?.materialPresets ?? "—",
        },
      ]}
    />
  );
}
