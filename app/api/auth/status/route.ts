export async function GET() {
  return Response.json({
    configured: Boolean(process.env.OPENROUTER_API_KEY),
  });
}
