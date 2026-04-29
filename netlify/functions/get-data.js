import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const store = getStore("charges-data");
  const key = new URL(req.url).searchParams.get("key");

  try {
    const data = await store.get(key);
    return new Response(JSON.stringify({ success: true, value: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/get-data" };
