import { tagsApi } from "../api/resources";
import { NamedResourcePage } from "./NamedResourcePage";

export function TagsPage() {
  return (
    <NamedResourcePage
      title="Tags"
      subtitle="Labels attached to material slides."
      list={tagsApi.list}
      create={tagsApi.create}
      update={tagsApi.update}
      remove={tagsApi.remove}
      extraColumns={[
        {
          key: "materials",
          header: "Materials",
          render: (r) => r._count?.materials ?? "—",
        },
      ]}
    />
  );
}
