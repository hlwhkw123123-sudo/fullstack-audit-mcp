export const save = (input: { userId: string }) =>
  fetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ userId: input.userId }),
  });
