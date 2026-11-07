import { requireSession } from "@/features/auth/requireSession";
import { currentMonth } from "@/features/budget/months";
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
      inbox={await loadReviewInbox(currentMonth(new Date()))}
      section={readReviewSection(await searchParams)}
    />
  );
}
