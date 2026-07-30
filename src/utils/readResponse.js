export async function readResponse(response, fallback = 'Сервер отклонил запрос') {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}
