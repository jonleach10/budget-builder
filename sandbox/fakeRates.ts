/** Made up, and the same for every day, so no call reaches the rates service. */
export const EUR_TO_USD = 1.08;

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const end = Date.parse(to);

  for (let day = Date.parse(from); day <= end; day += 86_400_000) {
    days.push(new Date(day).toISOString().slice(0, 10));
  }
  return days;
}

/** Answers the rates service's request with a rate for every day asked for. */
export const fakeRates: typeof fetch = async (input) => {
  const query = new URL(String(input)).searchParams;
  const base = query.get("base");
  const quote = query.get("quotes");

  return Response.json(
    daysBetween(query.get("from") ?? "", query.get("to") ?? "").map((date) => ({
      date,
      base,
      quote,
      rate: base === "EUR" ? EUR_TO_USD : 1 / EUR_TO_USD,
    })),
  );
};
