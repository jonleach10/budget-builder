import { requireSession } from "@/features/auth/requireSession";
import { loadReviewInbox } from "@/features/review/loadReviewInbox";
import { ReviewScreen } from "@/features/review/ReviewScreen";
import { readReviewSection } from "@/features/review/sections";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReviewPage({ searchParams }: PageProps) {
  await requireSession();

  return (
    <ReviewScreen
      inbox={await loadReviewInbox()}
      section={readReviewSection(await searchParams)}
    />
  );
}
