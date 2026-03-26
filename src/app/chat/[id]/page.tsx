import { AppShell } from "@/components/app/app-shell";
import { ThreadView } from "@/components/chat/thread-view";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell>
      <ThreadView threadId={id} />
    </AppShell>
  );
}
