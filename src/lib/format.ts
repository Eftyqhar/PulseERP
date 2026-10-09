export const currency = (n: number | undefined | null) => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(v);
};

export const compactNumber = (n: number | undefined | null) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(n ?? 0),
  );

export const number = (n: number | undefined | null) =>
  new Intl.NumberFormat("en").format(Number(n ?? 0));

export const percent = (n: number | undefined | null, digits = 1) =>
  `${Number(n ?? 0).toFixed(digits)}%`;

export const dateShort = (ts: number | undefined | null) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const dateTime = (ts: number | undefined | null) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
